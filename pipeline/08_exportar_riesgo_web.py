"""Paso 8: precalcula el riesgo previsto de cada celda para cada escenario que ofrece la web.

Escenario = clima (5) × día de la semana (7) × hora (24) = 840 mapas. El navegador no corre el
modelo: recibe las 840 × ~2.900 tasas ya calculadas, cuantizadas a 1 byte en escala logarítmica
(~2,4 MB), y elige qué mapa pintar.

Cómo se arma cada escenario:
- clima: valores típicos (mediana) de las horas reales con esa condición a esa hora del día,
  así "lluvia a las 19 h" usa la temperatura y el viento de las tardes lluviosas;
- mes: se promedian cuatro meses (enero, abril, julio, octubre) para no atarse a una estación;
- día no feriado, sin cuarentena;
- zona: siniestros anuales promedio de la celda en 2019-2025 y modelo final (todos los años).
"""
import base64
import json

import h3
import lightgbm as lgb
import numpy as np
import pandas as pd

from config import CONDICIONES, GRILLA, H3_RES, MODELOS, SINIESTROS_LIMPIOS, WEB_DATA

# Orden en que la web muestra el clima (de más a menos frecuente).
CLIMAS = ["despejado", "nublado", "lluvia", "tormenta", "niebla"]
MESES = [1, 4, 7, 10]
NIVELES = 255  # 0 queda reservado; 1..255 codifican log10(lambda)

import importlib  # noqa: E402

_paso6 = importlib.import_module("06_dataset_modelo")
_paso7 = importlib.import_module("07_entrenar_modelos")
FEATURES = _paso7.FEATURES
VARIABLES_CLIMA = _paso6.VARIABLES_CLIMA


def clima_tipico() -> pd.DataFrame:
    """Mediana de cada variable por condición y hora; si hay pocas horas, la mediana de la condición."""
    clima = _paso6.clima_horario()
    clima["hora"] = clima["fecha_hora"].dt.hour
    por_hora = clima.groupby(["condicion", "hora"])[VARIABLES_CLIMA].median()
    n = clima.groupby(["condicion", "hora"]).size()
    general = clima.groupby("condicion")[VARIABLES_CLIMA].median()
    filas = []
    for c in CLIMAS:
        for h in range(24):
            fila = por_hora.loc[(c, h)] if n.get((c, h), 0) >= 30 else general.loc[c]
            filas.append({"condicion": c, "hora": h, **fila.to_dict()})
    return pd.DataFrame(filas)


def main() -> None:
    modelo = lgb.Booster(model_file=str(MODELOS / "lgbm_final.txt"))
    grilla = pd.read_parquet(GRILLA).set_index("h3")

    s = pd.read_parquet(SINIESTROS_LIMPIOS, columns=["fecha_hora", "lat", "lon", "gravedad"])
    s["h3"] = [h3.latlng_to_cell(la, lo, H3_RES) for la, lo in zip(s["lat"], s["lon"])]
    n_anios = s["fecha_hora"].dt.year.nunique()
    total = s.groupby("h3").size().reindex(grilla.index, fill_value=0)
    graves = s[s["gravedad"].isin(["GRAVE", "MORTAL"])].groupby("h3").size().reindex(grilla.index, fill_value=0)
    hist = total / n_anios
    vecinos = pd.Series({
        c: np.mean([hist[v] for v in h3.grid_disk(c, 1) if v != c and v in hist.index] or [0]) for c in grilla.index
    })

    base = grilla.assign(hist_celda=hist, hist_vecinos=vecinos, feriado=0, cuarentena=0)
    base["comuna"] = base["comuna"].astype("int16")
    tipico = clima_tipico()

    n_celdas = len(grilla)
    lam = np.zeros((len(CLIMAS), 7, 24, n_celdas), dtype=np.float64)
    for ic, c in enumerate(CLIMAS):
        for d in range(7):
            filas = []
            for h in range(24):
                t = tipico[(tipico["condicion"] == c) & (tipico["hora"] == h)].iloc[0]
                for m in MESES:
                    x = base.assign(hora=h, dia_semana=d, mes=m, **{v: t[v] for v in VARIABLES_CLIMA})
                    filas.append(x)
            x = pd.concat(filas)[FEATURES]
            pred = modelo.predict(x).reshape(24, len(MESES), n_celdas).mean(axis=1)
            lam[ic, d] = pred
        print(f"{c}: {lam[ic].sum(axis=2).mean():.2f} siniestros esperados por hora en toda la ciudad")

    # Cuantización logarítmica: 255 niveles entre el percentil 0,5 y el máximo (~1,6 % de paso relativo).
    log_lam = np.log10(np.clip(lam, 1e-12, None))
    lmin, lmax = float(np.quantile(log_lam, 0.005)), float(log_lam.max())
    q = np.clip(np.rint((log_lam - lmin) / (lmax - lmin) * (NIVELES - 1)) + 1, 1, NIVELES).astype(np.uint8)
    q_flat = q.reshape(-1)  # orden: clima, día, hora, celda

    # Valores de referencia para la escala de colores (sobre todos los escenarios y celdas).
    cuantiles = {str(p): float(np.quantile(lam, p / 100)) for p in [1, 5, 10, 25, 50, 75, 90, 95, 99, 99.9]}

    celdas = []
    for c, r in grilla.iterrows():
        borde = [[round(lo, 5), round(la, 5)] for la, lo in h3.cell_to_boundary(c)]
        celdas.append({
            "id": c,
            "p": borde,
            "c": [round(r["lon"], 5), round(r["lat"], 5)],
            "comuna": int(r["comuna"]),
            "via": r["via_principal"] if isinstance(r["via_principal"], str) else None,
            "via2": r["via_secundaria"] if isinstance(r["via_secundaria"], str) else None,
            "km_av": round(float(r["km_avenida"]), 2),
            "km_au": round(float(r["km_autopista"]), 2),
            "sin": int(total[c]),
            "graves": int(graves[c]),
        })

    tip = tipico.copy()
    resumen_clima = {
        c: {
            "precipitacion": round(float(tip.loc[tip["condicion"] == c, "precipitation"].median()), 1),
            "temperatura": round(float(tip.loc[tip["condicion"] == c, "temperature_2m"].median()), 1),
            "rafagas": round(float(tip.loc[tip["condicion"] == c, "wind_gusts_10m"].median()), 0),
            "humedad": round(float(tip.loc[tip["condicion"] == c, "relative_humidity_2m"].median()), 0),
        }
        for c in CLIMAS
    }

    salida = {
        "climas": CLIMAS,
        "meses_promediados": MESES,
        "n_celdas": n_celdas,
        "anios_historial": n_anios,
        "escala": {"log_min": lmin, "log_max": lmax, "niveles": NIVELES},
        "cuantiles": cuantiles,
        "clima_tipico": resumen_clima,
        "celdas": celdas,
        "riesgo_b64": base64.b64encode(q_flat.tobytes()).decode(),
    }
    WEB_DATA.mkdir(parents=True, exist_ok=True)
    destino = WEB_DATA / "riesgo.json"
    destino.write_text(json.dumps(salida, ensure_ascii=False, separators=(",", ":")))
    print(f"{n_celdas:,} celdas × {q.size // n_celdas} escenarios -> {destino} ({destino.stat().st_size / 1e6:.1f} MB)")
    assert set(CLIMAS) == set(CONDICIONES)


if __name__ == "__main__":
    main()
