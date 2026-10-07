"""Paso 7: entrena y compara los modelos de riesgo, y explica el mejor con SHAP.

Validación con corte temporal: se entrena con 2019-2023 y se evalúa con 2024-2025. Mezclar
años al azar dejaría que el modelo "vea el futuro" (por ejemplo, la tendencia de una esquina
que empeora) e inflaría las métricas.

Modelos:
- Poisson (GLM): base interpretable; sus coeficientes son razones de tasas.
- Random Forest: referencia no lineal clásica.
- LightGBM con objetivo Poisson: gradient boosting, suele rendir mejor con muchos datos.
Y dos líneas de base sin modelo, para saber cuánto aporta cada cosa:
- historial de la celda (el "mapa de puntos calientes" de siempre),
- historial de la celda × perfil de hora y día de la semana.
"""
import json
import time

import lightgbm as lgb
import matplotlib
import numpy as np
import pandas as pd
import shap
from sklearn.compose import ColumnTransformer
from sklearn.ensemble import RandomForestRegressor
from sklearn.linear_model import PoissonRegressor
from sklearn.metrics import average_precision_score, mean_poisson_deviance, roc_auc_score
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import OneHotEncoder

from config import ANIO_VALIDACION, ANIOS_TEST, DATASET_MODELO, MODELOS, REPORTES, SEMILLA, WEB_DATA

matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402

GRUPOS = {
    "Zona": ["hist_celda", "hist_vecinos", "km_autopista", "km_avenida", "km_terciaria", "n_vias_principales", "comuna", "lat", "lon"],
    "Momento": ["hora", "dia_semana", "mes", "feriado", "cuarentena"],
    "Clima": ["precipitation", "lluvia_3h", "temperature_2m", "relative_humidity_2m", "wind_speed_10m", "wind_gusts_10m", "cloud_cover", "niebla"],
}
FEATURES = [f for fs in GRUPOS.values() for f in fs]
ETIQUETAS = {
    "hist_celda": "Siniestros históricos de la celda",
    "hist_vecinos": "Siniestros históricos de las celdas vecinas",
    "km_autopista": "Km de autopista",
    "km_avenida": "Km de avenida",
    "km_terciaria": "Km de calle terciaria",
    "n_vias_principales": "Vías principales que se cruzan",
    "comuna": "Comuna",
    "lat": "Latitud",
    "lon": "Longitud",
    "hora": "Hora del día",
    "dia_semana": "Día de la semana",
    "mes": "Mes",
    "feriado": "Feriado",
    "cuarentena": "Cuarentena 2020",
    "precipitation": "Lluvia en la hora (mm)",
    "lluvia_3h": "Lluvia de las 3 h previas (mm)",
    "temperature_2m": "Temperatura",
    "relative_humidity_2m": "Humedad relativa",
    "wind_speed_10m": "Viento",
    "wind_gusts_10m": "Ráfagas",
    "cloud_cover": "Nubosidad",
    "niebla": "Niebla",
}
PARAMS_LGBM = {
    "objective": "poisson",
    "learning_rate": 0.03,
    "num_leaves": 63,
    "min_data_in_leaf": 300,
    "feature_fraction": 0.8,
    "bagging_fraction": 0.8,
    "bagging_freq": 1,
    "lambda_l2": 1.0,
    "verbose": -1,
    "seed": SEMILLA,
}
CORTES_CAPTURA = np.round(np.arange(0, 0.5001, 0.005), 3)


# ---------- métricas ----------

def captura(y, w, pred) -> np.ndarray:
    """Qué fracción de los siniestros cae en el x % de celda-horas de mayor riesgo previsto."""
    orden = np.argsort(-pred, kind="stable")
    cw = np.cumsum(w[orden]) / w.sum()
    cy = np.cumsum(y[orden]) / y.sum()
    return np.interp(CORTES_CAPTURA, np.r_[0, cw], np.r_[0, cy])


def evaluar(nombre, y, w, pred, tasa_nula, segundos=None) -> dict:
    # El Random Forest puede predecir 0 exacto en hojas sin siniestros; la deviance de Poisson exige > 0.
    pred = np.clip(pred, 1e-7, None)
    dev = mean_poisson_deviance(y, pred, sample_weight=w)
    dev_nula = mean_poisson_deviance(y, np.full_like(pred, tasa_nula), sample_weight=w)
    curva = captura(y, w, pred)
    return {
        "modelo": nombre,
        "d2": round(1 - dev / dev_nula, 4),
        "auc": round(roc_auc_score(y > 0, pred, sample_weight=w), 4),
        "ap": round(average_precision_score(y > 0, pred, sample_weight=w), 5),
        "captura_1": round(float(np.interp(0.01, CORTES_CAPTURA, curva)), 4),
        "captura_5": round(float(np.interp(0.05, CORTES_CAPTURA, curva)), 4),
        "captura_10": round(float(np.interp(0.10, CORTES_CAPTURA, curva)), 4),
        "calibracion": round(float((w * pred).sum() / y.sum()), 3),
        "segundos": None if segundos is None else round(segundos, 1),
        "_curva": curva,
    }


# ---------- modelos ----------

def tipo_dia(df):
    return np.where(df["feriado"] == 1, 2, np.where(df["dia_semana"] == 6, 2, np.where(df["dia_semana"] == 5, 1, 0)))


def preparar_glm(df: pd.DataFrame) -> pd.DataFrame:
    x = pd.DataFrame(index=df.index)
    # La forma del día cambia entre hábiles y fines de semana: hora × tipo de día.
    x["hora_tipo"] = (df["hora"].astype(int) + 24 * tipo_dia(df)).astype(str)
    x["dia_semana"] = df["dia_semana"].astype(str)
    x["mes"] = df["mes"].astype(str)
    x["comuna"] = df["comuna"].astype(str)
    x["condicion"] = df["condicion"].astype(str)
    for c in ["hist_celda", "hist_vecinos", "km_autopista", "km_avenida", "km_terciaria", "lluvia_3h"]:
        x[f"log_{c}"] = np.log1p(df[c])
    for c in ["n_vias_principales", "cuarentena", "temperature_2m", "wind_gusts_10m"]:
        x[c] = df[c]
    return x


def entrenar_glm(xtr, ytr, wtr):
    categoricas = ["hora_tipo", "dia_semana", "mes", "comuna", "condicion"]
    referencia = ["8", "0", "1", "1", "despejado"]  # hábil 8 h, lunes, enero, comuna 1, despejado
    pre = ColumnTransformer(
        [("cat", OneHotEncoder(drop=referencia, sparse_output=False, handle_unknown="ignore"), categoricas)],
        remainder="passthrough",
        verbose_feature_names_out=False,
    )
    modelo = make_pipeline(pre, PoissonRegressor(alpha=1e-6, solver="newton-cholesky", max_iter=300))
    modelo.fit(xtr, ytr, poissonregressor__sample_weight=wtr)
    return modelo


def razones_de_tasas(glm) -> list[dict]:
    nombres = glm[0].get_feature_names_out()
    coef = pd.Series(glm[-1].coef_, index=nombres)
    filas = [
        ("condicion_nublado", "Nublado (vs. despejado)", 1),
        ("condicion_lluvia", "Lluvia (vs. despejado)", 1),
        ("condicion_tormenta", "Tormenta (vs. despejado)", 1),
        ("condicion_niebla", "Niebla (vs. despejado)", 1),
        ("log_lluvia_3h", "Lluvia previa: 3 h con 2 mm (vs. seco)", np.log1p(2)),
        ("temperature_2m", "Temperatura +5 °C", 5),
        ("wind_gusts_10m", "Ráfagas +20 km/h", 20),
        ("dia_semana_4", "Viernes (vs. lunes)", 1),
        ("dia_semana_6", "Domingo (vs. lunes)", 1),
        ("cuarentena", "Cuarentena estricta 2020", 1),
        ("log_hist_celda", "Celda con el doble de historial", None),
        ("log_km_avenida", "Celda atravesada por 300 m de avenida", np.log1p(0.3)),
        ("log_km_autopista", "Celda atravesada por 300 m de autopista", np.log1p(0.3)),
    ]
    out = []
    for var, etiqueta, delta in filas:
        if var not in coef:
            continue
        # log1p(2h) - log1p(h) ≈ log 2 para celdas con historial alto.
        efecto = coef[var] * (np.log(2) if delta is None else delta)
        out.append({"variable": var, "etiqueta": etiqueta, "irr": round(float(np.exp(efecto)), 3)})
    return out


def entrenar_lgbm(df_tr, y, w, df_val=None, yv=None, wv=None, rondas=None):
    dtr = lgb.Dataset(df_tr[FEATURES], y, weight=w, categorical_feature=["comuna"], free_raw_data=False)
    if rondas is not None:
        return lgb.train(PARAMS_LGBM, dtr, num_boost_round=rondas)
    dval = lgb.Dataset(df_val[FEATURES], yv, weight=wv, reference=dtr)
    return lgb.train(
        PARAMS_LGBM, dtr, num_boost_round=4000, valid_sets=[dval],
        callbacks=[lgb.early_stopping(150, verbose=False), lgb.log_evaluation(250)],
    )


def submuestra_rf(df, rng, n_ceros=1_200_000):
    """Random Forest no escala a 3,6 M filas: todos los positivos + una parte de los ceros, re-ponderados."""
    pos = df.index[df["y"] > 0]
    neg = df.index[df["y"] == 0]
    elegidos = rng.choice(neg, size=min(n_ceros, len(neg)), replace=False)
    sub = df.loc[np.r_[pos, elegidos]].copy()
    sub.loc[sub["y"] == 0, "peso"] *= len(neg) / len(elegidos)
    return sub


# ---------- SHAP ----------

def explicar(modelo, test: pd.DataFrame, rng) -> tuple[dict, pd.DataFrame, np.ndarray]:
    """SHAP sobre una muestra representativa de 2024-2025 (sorteada con los pesos, así refleja la ciudad real)."""
    p = test["peso"].to_numpy() / test["peso"].sum()
    idx = rng.choice(len(test), size=25_000, replace=True, p=p)
    x = test.iloc[idx][FEATURES].reset_index(drop=True)
    valores = shap.TreeExplainer(modelo).shap_values(x)
    abs_medio = pd.Series(np.abs(valores).mean(axis=0), index=FEATURES)

    def por_grupo(mask):
        a = pd.Series(np.abs(valores[mask]).mean(axis=0), index=FEATURES)
        g = {k: float(a[v].sum()) for k, v in GRUPOS.items()}
        tot = sum(g.values())
        return [{"grupo": k, "share": round(v / tot, 4)} for k, v in g.items()]

    con_lluvia = (x["precipitation"] >= 0.5).to_numpy()
    sv = pd.DataFrame(valores, columns=FEATURES)
    dep_hora = sv.groupby(x["hora"])["hora"].mean()
    bins = [-0.01, 0.05, 0.5, 1, 2, 4, 100]
    etiquetas_pp = ["0", "0,1–0,5", "0,5–1", "1–2", "2–4", "4+"]
    pp = pd.cut(x["precipitation"], bins=bins, labels=etiquetas_pp)
    dep_pp = sv.groupby(pp, observed=False)["precipitation"].agg(["mean", "size"])
    dep_lluvia3 = sv.groupby(pd.cut(x["lluvia_3h"], bins=bins, labels=etiquetas_pp), observed=False)["lluvia_3h"].agg(["mean", "size"])
    dep_dia = sv.groupby(x["dia_semana"])["dia_semana"].mean()

    resumen = {
        "grupos": por_grupo(np.ones(len(x), bool)),
        "grupos_lluvia": por_grupo(con_lluvia),
        "n_muestra": len(x),
        "n_lluvia": int(con_lluvia.sum()),
        "variables": [
            {"variable": f, "etiqueta": ETIQUETAS[f], "grupo": next(g for g, fs in GRUPOS.items() if f in fs), "valor": round(float(v), 4)}
            for f, v in abs_medio.sort_values(ascending=False).items()
        ],
        # Efectos en escala de razón de tasas: exp(SHAP medio) relativo al promedio.
        "efecto_hora": [round(float(np.exp(dep_hora.get(h, 0) - dep_hora.mean())), 3) for h in range(24)],
        "efecto_dia": [round(float(np.exp(dep_dia.get(d, 0) - dep_dia.mean())), 3) for d in range(7)],
        "efecto_lluvia": [
            {"rango": k, "efecto": round(float(np.exp(r["mean"] - dep_pp["mean"].iloc[0])), 3), "n": int(r["size"])}
            for k, r in dep_pp.iterrows() if r["size"] >= 20
        ],
        "efecto_lluvia_3h": [
            {"rango": k, "efecto": round(float(np.exp(r["mean"] - dep_lluvia3["mean"].iloc[0])), 3), "n": int(r["size"])}
            for k, r in dep_lluvia3.iterrows() if r["size"] >= 20
        ],
    }
    return resumen, x, valores


# ---------- figuras para la presentación ----------

def estilo():
    plt.rcParams.update({
        "font.family": "sans-serif", "font.size": 10, "axes.spines.top": False, "axes.spines.right": False,
        "axes.edgecolor": "#9a9a9a", "axes.labelcolor": "#333", "xtick.color": "#555", "ytick.color": "#555",
        "axes.grid": True, "grid.color": "#e6e6e6", "grid.linewidth": 0.6, "figure.dpi": 150, "savefig.bbox": "tight",
    })


def figuras(metricas, shap_resumen, x_shap, valores, irr):
    estilo()
    figdir = REPORTES / "figuras"
    figdir.mkdir(parents=True, exist_ok=True)
    colores = {"LightGBM": "#c0392b", "Random Forest": "#e08e2b", "Poisson (GLM)": "#2c6fbb",
               "Historial × perfil horario": "#7f7f7f", "Historial de la celda": "#b5b5b5"}

    fig, ax = plt.subplots(figsize=(6.4, 4.2))
    for m in metricas:
        ax.plot(CORTES_CAPTURA * 100, m["_curva"] * 100, label=f'{m["modelo"]} ({m["captura_10"]:.0%} en 10 %)',
                color=colores.get(m["modelo"], "#444"), lw=2 if m["modelo"] == "LightGBM" else 1.4)
    ax.plot([0, 50], [0, 50], color="#bbb", lw=1, ls="--", label="Al azar")
    ax.set(xlim=(0, 30), ylim=(0, 100), xlabel="% de celda-horas marcadas como de mayor riesgo",
           ylabel="% de siniestros 2024–2025 capturados", title="Curva de captura (test 2024–2025)")
    ax.legend(frameon=False, fontsize=8, loc="lower right")
    fig.savefig(figdir / "curva_captura.png")
    plt.close(fig)

    fig, ax = plt.subplots(figsize=(5.6, 2.4))
    g = shap_resumen["grupos"]
    ax.barh([x["grupo"] for x in g][::-1], [x["share"] * 100 for x in g][::-1], color=["#2c6fbb", "#e08e2b", "#c0392b"][::-1])
    for i, x in enumerate(g[::-1]):
        ax.text(x["share"] * 100 + 1, i, f'{x["share"]:.0%}', va="center")
    ax.set(xlabel="% del |SHAP| medio", title="¿Qué pesa más en el riesgo previsto?", xlim=(0, 100))
    ax.grid(axis="y", visible=False)
    fig.savefig(figdir / "shap_grupos.png")
    plt.close(fig)

    plt.figure()
    shap.summary_plot(valores, x_shap.rename(columns=ETIQUETAS), show=False, max_display=15, plot_size=(7.5, 6))
    plt.title("SHAP · LightGBM (contribución al log de la tasa)")
    plt.savefig(figdir / "shap_resumen.png")
    plt.close("all")

    fig, ax = plt.subplots(figsize=(6.4, 4.2))
    etiquetas = [r["etiqueta"] for r in irr][::-1]
    vals = [r["irr"] for r in irr][::-1]
    ax.scatter(vals, etiquetas, color=["#c0392b" if v > 1 else "#2c6fbb" for v in vals], zorder=3)
    ax.axvline(1, color="#888", lw=1)
    ax.set_xscale("log")
    ax.set(xlabel="Razón de tasas (escala log)", title="Regresión de Poisson: efecto de cada factor")
    fig.savefig(figdir / "poisson_razones.png")
    plt.close(fig)


# ---------- main ----------

def main() -> None:
    rng = np.random.default_rng(SEMILLA)
    MODELOS.mkdir(parents=True, exist_ok=True)
    df = pd.read_parquet(DATASET_MODELO)
    df["comuna"] = df["comuna"].astype("int16")
    es_test = df["anio"].isin(ANIOS_TEST)
    train, test = df[~es_test].reset_index(drop=True), df[es_test].reset_index(drop=True)
    ytr, wtr = train["y"].to_numpy(float), train["peso"].to_numpy()
    yte, wte = test["y"].to_numpy(float), test["peso"].to_numpy()
    tasa_nula = (ytr.sum() / wtr.sum())
    print(f"train {len(train):,} filas / {ytr.sum():,.0f} siniestros · test {len(test):,} filas / {yte.sum():,.0f} siniestros")

    resultados, predicciones = [], {}

    # Líneas de base.
    h_tr = train["hist_celda"].to_numpy() + 0.1
    a = ytr.sum() / (wtr * h_tr).sum()
    predicciones["Historial de la celda"] = a * (test["hist_celda"].to_numpy() + 0.1)
    perfil = train.assign(yw=ytr).groupby(["dia_semana", "hora"]).apply(lambda g: g["yw"].sum() / g["peso"].sum(), include_groups=False)
    perfil /= tasa_nula
    f_tr = perfil.reindex(pd.MultiIndex.from_arrays([train["dia_semana"], train["hora"]])).to_numpy()
    f_te = perfil.reindex(pd.MultiIndex.from_arrays([test["dia_semana"], test["hora"]])).to_numpy()
    b = ytr.sum() / (wtr * h_tr * f_tr).sum()
    predicciones["Historial × perfil horario"] = b * (test["hist_celda"].to_numpy() + 0.1) * f_te
    for nombre in list(predicciones):
        resultados.append(evaluar(nombre, yte, wte, predicciones[nombre], tasa_nula))

    # Poisson GLM.
    t0 = time.time()
    glm = entrenar_glm(preparar_glm(train), ytr, wtr)
    seg = time.time() - t0
    predicciones["Poisson (GLM)"] = glm.predict(preparar_glm(test))
    resultados.append(evaluar("Poisson (GLM)", yte, wte, predicciones["Poisson (GLM)"], tasa_nula, seg))
    irr = razones_de_tasas(glm)
    print(f"GLM listo ({seg:.0f} s)")

    # Random Forest.
    t0 = time.time()
    sub = submuestra_rf(train, rng)
    # Hojas grandes: con hojas chicas el bosque memoriza celdas con 1 o 2 siniestros y rinde
    # peor que la línea de base (AUC 0,75 con min_samples_leaf=100 frente a 0,78 con 2.000).
    rf = RandomForestRegressor(n_estimators=200, criterion="poisson", max_depth=18, min_samples_leaf=2000,
                               max_features=0.33, n_jobs=-1, random_state=SEMILLA)
    rf.fit(sub[FEATURES], sub["y"], sample_weight=sub["peso"])
    seg = time.time() - t0
    predicciones["Random Forest"] = rf.predict(test[FEATURES])
    resultados.append(evaluar("Random Forest", yte, wte, predicciones["Random Forest"], tasa_nula, seg))
    print(f"Random Forest listo ({seg:.0f} s)")
    del rf

    # LightGBM: early stopping con 2023 (dentro del período de train), luego se reentrena con 2019-2023.
    t0 = time.time()
    es_val = train["anio"] == ANIO_VALIDACION
    m_es = entrenar_lgbm(train[~es_val], ytr[~es_val], wtr[~es_val], train[es_val], ytr[es_val], wtr[es_val])
    rondas = m_es.best_iteration
    lgbm = entrenar_lgbm(train, ytr, wtr, rondas=rondas)
    seg = time.time() - t0
    lgbm.save_model(MODELOS / "lgbm_eval.txt")
    predicciones["LightGBM"] = lgbm.predict(test[FEATURES])
    resultados.append(evaluar("LightGBM", yte, wte, predicciones["LightGBM"], tasa_nula, seg))
    print(f"LightGBM listo: {rondas} árboles ({seg:.0f} s)")

    tabla = pd.DataFrame([{k: v for k, v in r.items() if k != "_curva"} for r in resultados])
    print(tabla.to_string(index=False))

    # SHAP sobre el modelo evaluado (entrenado sin ver 2024-2025).
    shap_resumen, x_shap, valores = explicar(lgbm, test, rng)
    print(pd.DataFrame(shap_resumen["grupos"]).to_string(index=False))
    print("Con lluvia:", shap_resumen["grupos_lluvia"])

    # Modelo final para la web: mismos hiperparámetros, todos los años (2019-2025).
    final = df.drop(columns=["hist_celda", "hist_vecinos"]).rename(
        columns={"hist_celda_final": "hist_celda", "hist_vecinos_final": "hist_vecinos"}
    )
    n_anios_final = df["anio"].nunique()
    lgbm_final = entrenar_lgbm(final, final["y"].to_numpy(float), final["peso"].to_numpy(),
                               rondas=int(rondas * n_anios_final / (n_anios_final - len(ANIOS_TEST))))
    lgbm_final.save_model(MODELOS / "lgbm_final.txt")

    figuras(resultados, shap_resumen, x_shap, valores, irr)

    salida = {
        "periodo": {"train": "2019–2023", "test": "2024–2025", "validacion_early_stopping": str(ANIO_VALIDACION)},
        "datos": {
            "filas": len(df), "celda_horas": round(float(df["peso"].sum())), "siniestros": int(df["y"].sum()),
            "siniestros_test": int(yte.sum()), "celdas": int(df["h3"].nunique()), "peso_ceros": round(float(df.loc[df["y"] == 0, "peso"].iat[0]), 1),
        },
        "lgbm": {"arboles": rondas, "arboles_final": lgbm_final.num_trees(), **{k: v for k, v in PARAMS_LGBM.items() if k not in ("verbose", "seed")}},
        "metricas": [{k: v for k, v in r.items() if k != "_curva"} for r in resultados],
        "curva_captura": {"x": CORTES_CAPTURA.tolist(), "series": {r["modelo"]: np.round(r["_curva"], 4).tolist() for r in resultados}},
        "shap": shap_resumen,
        "poisson_irr": irr,
    }
    WEB_DATA.mkdir(parents=True, exist_ok=True)
    (WEB_DATA / "modelo.json").write_text(json.dumps(salida, ensure_ascii=False, indent=1))
    (REPORTES / "metricas.md").write_text(
        "# Métricas en test (2024–2025)\n\n" + tabla.to_markdown(index=False) + "\n"
    )
    print(f"Listo -> {WEB_DATA / 'modelo.json'}, {REPORTES}")


if __name__ == "__main__":
    main()
