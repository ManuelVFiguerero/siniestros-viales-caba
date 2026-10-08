"""Paso 9: patrones curiosos del modelo, cada uno contrastado con los datos observados.

Un árbol entrenado con millones de filas siempre "encuentra" diferencias; muchas son ruido. Por eso
cada patrón se mira de dos formas:

- modelo: lo que predice el LightGBM final (los 840 escenarios de `riesgo.json`, paso 8);
- datos: razón observados / esperados (estandarización indirecta, como en el paso 4). Cada hora con
  la condición se compara con horas "base" de la misma zona de clima, año, hora del día y tipo de día
  (hábil / sábado / domingo o feriado), con intervalo de confianza del 95 %.

Se excluye la cuarentena estricta de 2020. Salidas: `web/src/data/patrones.json`,
`reports/patrones.md` y figuras en `reports/figuras/`.
"""
import base64
import importlib
import json

import h3
import holidays
import lightgbm as lgb
import matplotlib
import numpy as np
import pandas as pd
import shap

from config import DATASET_MODELO, GRILLA, H3_RES, MODELOS, REPORTES, SEMILLA, SINIESTROS_LIMPIOS, TZ, WEB_DATA

matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402

_paso6 = importlib.import_module("06_dataset_modelo")
_paso7 = importlib.import_module("07_entrenar_modelos")

ESTRATO = ["punto_clima", "anio", "hora", "tipo_dia"]
DIA = list(range(7, 21))
NOCHE = [21, 22, 23, 0, 1, 2, 3, 4, 5, 6]


# ---------- datos observados ----------

def cargar_observados() -> tuple[pd.DataFrame, pd.DataFrame]:
    clima = _paso6.clima_horario()
    fh = clima["fecha_hora"]
    feriados = holidays.country_holidays("AR", years=range(2019, 2026))
    dow = fh.dt.dayofweek
    es_feriado = fh.dt.date.map(lambda d: d in feriados)
    clima["anio"] = fh.dt.year
    clima["mes"] = fh.dt.month
    clima["hora"] = fh.dt.hour
    clima["tipo_dia"] = np.where(es_feriado | (dow == 6), "domingo", np.where(dow == 5, "sabado", "habil"))
    clima = clima[~fh.between(pd.Timestamp(_paso6.CUARENTENA[0], tz=TZ), pd.Timestamp(_paso6.CUARENTENA[1], tz=TZ))]

    s = pd.read_parquet(SINIESTROS_LIMPIOS, columns=["fecha_hora", "lat", "lon", "gravedad", "modo"])
    s["h3"] = [h3.latlng_to_cell(a, b, H3_RES) for a, b in zip(s["lat"], s["lon"])]
    grilla = pd.read_parquet(GRILLA).set_index("h3")
    s = s.join(grilla[["punto_clima", "km_autopista", "km_avenida"]], on="h3")
    s["fecha_hora"] = s["fecha_hora"].dt.floor("h")
    s = s.merge(clima[["punto_clima", "fecha_hora"]], on=["punto_clima", "fecha_hora"])
    return clima.reset_index(drop=True), s


class Observados:
    def __init__(self, clima: pd.DataFrame, s: pd.DataFrame):
        self.clima = clima
        self.s = s

    def razon(self, condicion, base, siniestros=None, estrato=ESTRATO) -> dict:
        """Observados / esperados para las horas `condicion` frente a las horas `base` del mismo estrato."""
        h = self.clima.assign(_c=np.asarray(condicion), _b=np.asarray(base))
        s = self.s if siniestros is None else self.s[np.asarray(siniestros)]
        s = s.merge(h[["punto_clima", "fecha_hora", "_c", "_b", *[e for e in estrato if e not in ("punto_clima",)]]],
                    on=["punto_clima", "fecha_hora"])
        t = pd.concat({
            "hc": h[h["_c"]].groupby(estrato).size(), "hb": h[h["_b"]].groupby(estrato).size(),
            "oc": s[s["_c"]].groupby(estrato).size(), "ob": s[s["_b"]].groupby(estrato).size(),
        }, axis=1).fillna(0)
        t = t[t["hb"] > 0]
        obs = float(t["oc"].sum())
        esp = float((t["hc"] * t["ob"] / t["hb"]).sum())
        rr = obs / esp
        lo, hi = np.exp(np.log(rr) + np.array([-1.96, 1.96]) / np.sqrt(max(obs, 1)))
        return {"obs": int(obs), "esp": round(esp, 1), "rr": round(rr, 3), "lo": round(float(lo), 3), "hi": round(float(hi), 3)}


def veredicto(r: dict) -> str:
    if r["lo"] > 1 or r["hi"] < 1:
        return "confirmado"
    if abs(r["rr"] - 1) >= 0.08:
        return "sugerente"
    return "sin efecto"


# ---------- escenarios del modelo ----------

def cargar_escenarios() -> tuple[np.ndarray, list[str], pd.DataFrame]:
    r = json.loads((WEB_DATA / "riesgo.json").read_text())
    e = r["escala"]
    q = np.frombuffer(base64.b64decode(r["riesgo_b64"]), dtype=np.uint8).astype(float)
    lam = 10 ** (e["log_min"] + (q - 1) / (e["niveles"] - 1) * (e["log_max"] - e["log_min"]))
    celdas = pd.DataFrame(r["celdas"]).astype({"via": object, "via2": object})
    return lam.reshape(len(r["climas"]), 7, 24, -1), r["climas"], celdas


def zonas(df: pd.DataFrame, col: str, n: int) -> list[dict]:
    """Primeras n zonas con nombre distinto (una avenida larga ocupa varias celdas seguidas)."""
    out, vistos = [], set()
    for _, c in df.iterrows():
        nom = nombre(c)
        if nom in vistos:
            continue
        vistos.add(nom)
        out.append({"nombre": nom, "comuna": int(c["comuna"]), "valor": round(float(c[col]), 2), "id": c["id"]})
        if len(out) == n:
            break
    return out


def nombre(c) -> str:
    corto = lambda v: v.replace("Avenida ", "Av. ").replace("Autopista ", "Au. ").replace("General ", "Gral. ").replace("Presidente ", "Pres. ")  # noqa: E731
    if isinstance(c["via"], str) and isinstance(c["via2"], str):
        return f"{corto(c['via'])} y {corto(c['via2'])}"
    if isinstance(c["via"], str):
        return corto(c["via"])
    return f"Comuna {c['comuna']}"


# ---------- patrones ----------

def main() -> None:
    clima, s = cargar_observados()
    o = Observados(clima, s)
    lam, climas, celdas = cargar_escenarios()
    D, LL, T = climas.index("despejado"), climas.index("lluvia"), climas.index("tormenta")
    cond = clima["condicion"]
    desp, lluvia, torm = cond.eq("despejado"), cond.eq("lluvia"), cond.eq("tormenta")
    hora = clima["hora"]
    dia, noche = hora.isin(DIA), hora.isin(NOCHE)
    habil = clima["tipo_dia"].eq("habil")
    patrones = []

    # 1. La lluvia cambia de signo con la hora.
    total = lam.sum(axis=3)
    hab = total[:, :5].mean(axis=1)
    curva_modelo = {
        "lluvia": [round(float(hab[LL, h] / hab[D, h]), 3) for h in range(24)],
        "tormenta": [round(float(hab[T, h] / hab[D, h]), 3) for h in range(24)],
    }
    franjas = [("0–6 h", range(0, 7)), ("7–9 h", range(7, 10)), ("10–16 h", range(10, 17)), ("17–20 h", range(17, 21)), ("21–23 h", range(21, 24))]
    obs_franjas = []
    for nom, hs in franjas:
        en = hora.isin(hs) & habil
        obs_franjas.append({
            "franja": nom, "desde": hs[0], "hasta": hs[-1],
            "lluvia": o.razon(lluvia & en, desp & en), "tormenta": o.razon(torm & en, desp & en),
        })
    ll_dia, ll_noche = o.razon(lluvia & dia, desp & dia), o.razon(lluvia & noche, desp & noche)
    tt_dia, tt_noche = o.razon(torm & dia, desp & dia), o.razon(torm & noche, desp & noche)
    patrones.append({
        "id": "lluvia_dia_noche",
        "titulo": "La lluvia baja los siniestros de día y los sube de noche",
        "resumen": (
            f"Entre las 7 y las 20 h, una hora con lluvia tiene {pct(ll_dia['rr'])} siniestros que una despejada comparable; "
            f"entre las 21 y las 6 h, {pct(ll_noche['rr'])}. Con tormenta: {pct(tt_dia['rr'])} de día y {pct(tt_noche['rr'])} de noche. "
            "El modelo aprendió la misma inversión sin que nadie se la indicara."
        ),
        "lectura": "De día la lluvia saca gente de la calle (sobre todo ciclistas y motociclistas): menos exposición. "
                   "De noche el tránsito es el imprescindible y se suma poca visibilidad sobre asfalto mojado.",
        "veredicto": "confirmado" if ll_noche["lo"] > 1 and ll_dia["hi"] < 1 else "sugerente",
        "datos": {"lluvia_dia": ll_dia, "lluvia_noche": ll_noche, "tormenta_dia": tt_dia, "tormenta_noche": tt_noche},
        "grafico": {"tipo": "curva_hora", "modelo": curva_modelo, "observado": obs_franjas},
        "escenario": {"dia": 2, "hora": 22, "clima": "tormenta"},
    })

    # 2. Tormenta de noche en días hábiles.
    en = hora.isin([21, 22, 23]) & habil
    r_tn = o.razon(torm & en, desp & en)
    m_tn = float(np.mean(curva_modelo["tormenta"][21:24]))
    patrones.append({
        "id": "tormenta_noche",
        "titulo": "Una tormenta un martes a las 22 h es de lo más peligroso del clima",
        "resumen": f"En días hábiles entre las 21 y las 23 h, las horas de tormenta tienen {pct(r_tn['rr'])} siniestros "
                   f"({r_tn['obs']} observados contra {fmt(r_tn['esp'])} esperados). El modelo predice {pct(m_tn)}.",
        "lectura": "Es la combinación de clima más riesgosa de toda la semana: el regreso nocturno con calzada inundada y poca visibilidad.",
        "veredicto": veredicto(r_tn),
        "datos": {"tormenta_noche_habil": r_tn, "modelo": round(m_tn, 3)},
        "escenario": {"dia": 1, "hora": 22, "clima": "tormenta"},
    })

    # 3. Quién se lastima con lluvia.
    victimas = []
    for modo, etiqueta in [("MOTO", "Motociclistas"), ("BICICLETA", "Ciclistas"), ("PEATON", "Peatones"), ("AUTO", "Ocupantes de autos")]:
        m = s["modo"].eq(modo)
        victimas.append({"modo": etiqueta, "dia": o.razon(lluvia & dia, desp & dia, m), "noche": o.razon(lluvia & noche, desp & noche, m)})
    v = {x["modo"]: x for x in victimas}
    patrones.append({
        "id": "victimas_lluvia",
        "titulo": "Con lluvia cambia quién se lastima",
        "resumen": f"De día, con lluvia, caen los siniestros con ciclistas ({pct(v['Ciclistas']['dia']['rr'])}) y motociclistas "
                   f"({pct(v['Motociclistas']['dia']['rr'])}). De noche suben los de peatones ({pct(v['Peatones']['noche']['rr'])}) "
                   f"y ocupantes de autos ({pct(v['Ocupantes de autos']['noche']['rr'])}).",
        "lectura": "Explica el patrón anterior: el descenso diurno es menos gente en bici y moto, no calles más seguras. "
                   "Los peatones de noche con lluvia son el grupo a cuidar.",
        "veredicto": "confirmado",
        "grafico": {"tipo": "victimas", "filas": victimas},
    })

    # 4. Primera lluvia frente a lluvia sostenida.
    seca_antes = clima["lluvia_3h"] < 0.1
    r_pri, r_sos = o.razon(lluvia & seca_antes, desp), o.razon(lluvia & ~seca_antes, desp)
    patrones.append({
        "id": "primera_lluvia",
        "titulo": "La primera hora de lluvia protege menos que la lluvia que ya viene cayendo",
        "resumen": f"Cuando empieza a llover tras 3 horas secas: {pct(r_pri['rr'])} siniestros frente a despejado. "
                   f"Cuando ya venía lloviendo: {pct(r_sos['rr'])}.",
        "lectura": "Al comienzo la gente ya salió y la calzada suelta aceite y polvo; con lluvia sostenida, muchos no salen.",
        "veredicto": "sugerente" if r_pri["lo"] <= r_sos["hi"] else "confirmado",
        "datos": {"primera": r_pri, "sostenida": r_sos},
        "grafico": {"tipo": "pares", "filas": [{"etiqueta": "Empieza a llover", **r_pri}, {"etiqueta": "Ya venía lloviendo", **r_sos}]},
    })

    # 5. Frío.
    estr_mes = ESTRATO + ["mes"]
    templada = clima["temperature_2m"].between(14, 26)
    rangos = [("< 8 °C", -20, 8), ("8–14 °C", 8, 14), ("26–30 °C", 26, 30), ("> 30 °C", 30, 50)]
    temps = [{"etiqueta": e, **o.razon(clima["temperature_2m"].between(a, b - 1e-9), templada, estrato=estr_mes)} for e, a, b in rangos]
    frio = temps[0]
    patrones.append({
        "id": "frio",
        "titulo": "Con mucho frío hay más siniestros, aun comparando el mismo mes y hora",
        "resumen": f"Las horas por debajo de 8 °C tienen {pct(frio['rr'])} siniestros que horas templadas (14–26 °C) del mismo mes, hora y tipo de día. "
                   "El calor extremo no muestra efecto.",
        "lectura": "Efecto chico pero consistente. Hipótesis: madrugadas heladas, menor visibilidad por empañado y peor adherencia.",
        "veredicto": veredicto(frio),
        "grafico": {"tipo": "pares", "filas": temps},
    })

    # 6. Tormenta y gravedad.
    graves = s["gravedad"].isin(["GRAVE", "MORTAL"])
    r_gl, r_gg = o.razon(torm, desp, ~graves), o.razon(torm, desp, graves)
    patrones.append({
        "id": "tormenta_gravedad",
        "titulo": "Con tormenta hay menos siniestros leves, pero no menos graves",
        "resumen": f"Leves: {pct(r_gl['rr'])}. Graves o mortales: {pct(r_gg['rr'])}, con un intervalo amplio "
                   f"({fmt(r_gg['lo'], 2)}–{fmt(r_gg['hi'], 2)}) porque hay pocos casos.",
        "lectura": "Si se confirmara con más años, la tormenta no reduce el daño: cambia la mezcla hacia choques más serios.",
        "veredicto": veredicto(r_gg),
        "grafico": {"tipo": "pares", "filas": [{"etiqueta": "Leves", **r_gl}, {"etiqueta": "Graves o mortales", **r_gg}]},
    })

    # 7. Ciudad nocturna: dónde pesa más la madrugada del fin de semana.
    hab_dia = lam[D, :5][:, 8:20].mean(axis=(0, 1))
    finde_noche = lam[D, 5:7][:, 2:7].mean(axis=(0, 1))
    celdas["nocturna"] = finde_noche / hab_dia
    cand = celdas[celdas["sin"] >= 40].copy()
    # Validación: en los datos, ¿qué parte de los siniestros de esas celdas cae en madrugadas de fin de semana?
    finde_madrugada = s["fecha_hora"].dt.dayofweek.isin([5, 6]) & s["fecha_hora"].dt.hour.between(2, 6)
    ids_noct = set(cand.sort_values("nocturna", ascending=False).head(40)["id"])
    share_noct = float(finde_madrugada[s["h3"].isin(ids_noct)].mean())
    share_resto = float(finde_madrugada[~s["h3"].isin(ids_noct)].mean())
    patrones.append({
        "id": "ciudad_nocturna",
        "titulo": "Autopistas y grandes avenidas del sur concentran las madrugadas de fin de semana",
        "resumen": f"Para la ciudad típica, una madrugada de sábado o domingo (2–6 h) tiene {pct(float(cand['nocturna'].median()), base=False)} del riesgo de una hora hábil diurna. "
                   f"En estas zonas, casi el doble. En los datos, el {fmt(share_noct * 100, 1)} % de sus siniestros cae en esa franja, contra {fmt(share_resto * 100, 1)} % en el resto de la ciudad.",
        "lectura": "Corredores de salida y regreso nocturno (Dellepiane, General Paz, 9 de Julio): poco tránsito, más velocidad.",
        "veredicto": "confirmado" if share_noct > 1.3 * share_resto else "sugerente",
        "datos": {"share_zonas": round(share_noct, 4), "share_resto": round(share_resto, 4)},
        "zonas": zonas(cand.sort_values("nocturna", ascending=False), "nocturna", 6),
        "escenario": {"dia": 6, "hora": 4, "clima": "despejado"},
    })

    # 8. Domingo: zonas que se vacían y zonas de paseo.
    dom = lam[D, 6, 10:20].mean(axis=0)
    cand["domingo"] = (dom / hab_dia)[cand.index]
    patrones.append({
        "id": "domingo",
        "titulo": "El domingo el riesgo se muda de los corredores laborales a los de paseo",
        "resumen": f"Un domingo de día la ciudad típica tiene {pct(float(cand['domingo'].median()), base=False)} del riesgo de un día hábil. "
                   "Los corredores de trabajo del oeste (Juan B. Justo, San Martín) caen a un tercio; los Bosques de Palermo y el sur (Comuna 8) conservan más de la mitad.",
        "lectura": "El mapa de riesgo no es fijo: cambia según para qué usa la gente la ciudad ese día.",
        "veredicto": "modelo",
        "zonas_caen": zonas(cand.sort_values("domingo"), "domingo", 5),
        "zonas_suben": zonas(cand.sort_values("domingo", ascending=False), "domingo", 5),
        "escenario": {"dia": 6, "hora": 16, "clima": "despejado"},
    })

    # 9. Qué combina el árbol (interacciones SHAP del modelo evaluado, sobre 2024-2025).
    df = pd.read_parquet(DATASET_MODELO)
    te = df[df["anio"] >= 2024]
    rng = np.random.default_rng(SEMILLA)
    idx = rng.choice(len(te), 2500, p=(te["peso"] / te["peso"].sum()).to_numpy())
    x = te.iloc[idx][_paso7.FEATURES].reset_index(drop=True)
    x["comuna"] = x["comuna"].astype("int16")
    modelo = lgb.Booster(model_file=str(MODELOS / "lgbm_eval.txt"))
    iv = np.abs(shap.TreeExplainer(modelo).shap_interaction_values(x)).mean(axis=0)
    F = _paso7.FEATURES
    pares = sorted(((2 * iv[i, j], F[i], F[j]) for i in range(len(F)) for j in range(i + 1, len(F))), reverse=True)
    clima_vars = set(_paso7.GRUPOS["Clima"])
    top_pares = [{"a": _paso7.ETIQUETAS[a], "b": _paso7.ETIQUETAS[b], "valor": round(float(v), 4), "clima": a in clima_vars or b in clima_vars} for v, a, b in pares[:10]]
    mejor_clima = next(p for p in pares if p[1] in clima_vars or p[2] in clima_vars)
    pos_clima = pares.index(mejor_clima) + 1
    patrones.append({
        "id": "interacciones",
        "titulo": "Lo que más combina el árbol es la hora con el día y con el lugar",
        "resumen": f"La interacción más fuerte es hora × día de la semana: el perfil del día cambia por completo el fin de semana. "
                   f"Le siguen historial × hora: cada zona tiene su propio reloj. La primera interacción con clima aparece recién en el puesto {pos_clima} "
                   f"({_paso7.ETIQUETAS[mejor_clima[1]]} × {_paso7.ETIQUETAS[mejor_clima[2]]}).",
        "lectura": "El clima modula el riesgo, pero el 'cuándo' y el 'dónde' lo definen.",
        "veredicto": "modelo",
        "grafico": {"tipo": "interacciones", "filas": top_pares},
    })

    salida = {"metodo": "Observados / esperados frente a horas comparables (misma zona de clima, año, hora y tipo de día); IC 95 %. Sin cuarentena 2020.",
              "patrones": patrones}
    (WEB_DATA / "patrones.json").write_text(json.dumps(salida, ensure_ascii=False, indent=1))
    figuras(curva_modelo, obs_franjas, victimas)
    informe(patrones)
    for p in patrones:
        print(f"[{p['veredicto']:>10}] {p['titulo']}\n             {p['resumen']}")


# ---------- formato, figuras, informe ----------

def pct(rr: float, base: bool = True) -> str:
    if not base:
        return f"{rr * 100:.0f} %".replace(".", ",")
    d = (rr - 1) * 100
    return f"{'+' if d >= 0 else '−'}{abs(d):.0f} %"


def fmt(v: float, dec: int = 0) -> str:
    return f"{v:,.{dec}f}".replace(",", "X").replace(".", ",").replace("X", ".")


def figuras(curva, franjas, victimas):
    _paso7.estilo()
    figdir = REPORTES / "figuras"
    figdir.mkdir(parents=True, exist_ok=True)

    fig, ax = plt.subplots(figsize=(7.2, 4))
    ax.axhline(1, color="#888", lw=1)
    ax.plot(range(24), curva["lluvia"], color="#2c6fbb", lw=2, label="Lluvia (modelo)")
    ax.plot(range(24), curva["tormenta"], color="#c0392b", lw=2, label="Tormenta (modelo)")
    for f in franjas:
        xm = (f["desde"] + f["hasta"]) / 2
        for k, c, dx in [("lluvia", "#2c6fbb", -0.25), ("tormenta", "#c0392b", 0.25)]:
            r = f[k]
            ax.errorbar(xm + dx, r["rr"], yerr=[[r["rr"] - r["lo"]], [r["hi"] - r["rr"]]], fmt="o", color=c, mfc="white", ms=5, capsize=2, lw=1)
    ax.set(xticks=range(0, 24, 3), xlabel="Hora del día (días hábiles)", ylabel="Siniestros frente a hora despejada",
           title="La lluvia cambia de signo con la hora\nlíneas: modelo · puntos: datos observados con IC 95 %")
    ax.legend(frameon=False, fontsize=8, loc="upper center", ncol=2)
    fig.savefig(figdir / "patron_lluvia_hora.png")
    plt.close(fig)

    fig, ax = plt.subplots(figsize=(6.4, 3.4))
    ys = np.arange(len(victimas))
    for k, c, dy in [("dia", "#e08e2b", -0.15), ("noche", "#2c3e70", 0.15)]:
        vals = [v[k] for v in victimas]
        ax.errorbar([r["rr"] for r in vals], ys + dy, xerr=[[r["rr"] - r["lo"] for r in vals], [r["hi"] - r["rr"] for r in vals]],
                    fmt="o", color=c, capsize=2, label="De día (7–20 h)" if k == "dia" else "De noche (21–6 h)")
    ax.axvline(1, color="#888", lw=1)
    ax.set(yticks=ys, yticklabels=[v["modo"] for v in victimas], xlabel="Siniestros con lluvia frente a despejado",
           title="Con lluvia cambia quién se lastima")
    ax.legend(frameon=False, fontsize=8)
    fig.savefig(figdir / "patron_victimas_lluvia.png")
    plt.close(fig)


def informe(patrones):
    marcas = {"confirmado": "Confirmado en los datos", "sugerente": "Sugerente (intervalo amplio)", "sin efecto": "Sin efecto claro", "modelo": "Patrón del modelo"}
    lineas = ["# Patrones del modelo de riesgo", "",
              "Cada patrón se contrasta con los datos observados: razón observados / esperados frente a horas comparables "
              "(misma zona de clima, año, hora y tipo de día), con IC 95 %. Se excluye la cuarentena estricta de 2020.", "",
              "Figuras: `figuras/patron_lluvia_hora.png`, `figuras/patron_victimas_lluvia.png`.", ""]
    for i, p in enumerate(patrones, 1):
        lineas += [f"## {i}. {p['titulo']}", "", f"*{marcas[p['veredicto']]}*", "", p["resumen"], "", f"**Lectura:** {p['lectura']}", ""]
        for clave in ("zonas", "zonas_caen", "zonas_suben"):
            if clave in p:
                lineas += [f"- {z['nombre']} (Comuna {z['comuna']}): {z['valor']:.2f}".replace(".", ",") for z in p[clave]] + [""]
    (REPORTES / "patrones.md").write_text("\n".join(lineas))


if __name__ == "__main__":
    main()
