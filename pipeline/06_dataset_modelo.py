"""Paso 6: arma la tabla celda × hora (2019-2025) para entrenar los modelos.

Hay ~2.900 celdas × ~61.000 horas = ~175 M celda-horas y solo ~60 mil con siniestro. Se usan
todas las celda-horas con siniestro y una muestra aleatoria de las que no tuvieron; cada cero
muestreado pesa 1/tasa de muestreo, así las sumas ponderadas reproducen la ciudad completa
(el diseño caso-control clásico, sin sesgar las tasas que estima el modelo).

Variables:
- objetivo: y = cantidad de siniestros en la celda en esa hora.
- momento: hora, día de la semana, mes, feriado, período de cuarentena estricta 2020.
- clima: precipitación (de la hora y acumulada 3 h previas), temperatura, humedad, viento,
  ráfagas, nubosidad y niebla.
- zona: siniestros históricos de la celda y sus vecinas, km de autopista/avenida/terciaria,
  vías principales que la cruzan, comuna y coordenadas.

Los siniestros históricos son la variable más delicada: si se calculan con todos los años, el
modelo "ve" el objetivo. Se calcula dejando afuera el año de cada fila (leave-one-year-out) y,
para el período de test, usando solo los años de entrenamiento.
"""
import h3
import holidays
import numpy as np
import pandas as pd

from clima import clasificar_condicion
from config import (
    ANIOS_TEST, ANIOS_TRAIN, CEROS_MUESTREADOS, CLIMA_HORARIO, DATASET_MODELO, GRILLA, H3_RES, SEMILLA,
    SINIESTROS_LIMPIOS, TZ,
)

VARIABLES_CLIMA = [
    "precipitation", "lluvia_3h", "temperature_2m", "relative_humidity_2m", "wind_speed_10m", "wind_gusts_10m",
    "cloud_cover", "niebla",
]
# Aislamiento estricto (ASPO) en el AMBA: el tránsito cayó a una fracción del normal.
CUARENTENA = ("2020-03-20", "2020-11-08")


def clima_horario() -> pd.DataFrame:
    clima = pd.read_parquet(CLIMA_HORARIO).sort_values(["punto_clima", "fecha_hora"])
    clima["condicion"] = clasificar_condicion(clima)
    clima["niebla"] = (clima["condicion"] == "niebla").astype("int8")
    # Calzada mojada: la lluvia de las 3 horas anteriores también cuenta.
    clima["lluvia_3h"] = clima.groupby("punto_clima")["precipitation"].transform(
        lambda s: s.shift(1).rolling(3, min_periods=1).sum()
    ).fillna(0)
    return clima[["punto_clima", "fecha_hora", "condicion", *VARIABLES_CLIMA]]


def variables_momento(fh: pd.Series) -> pd.DataFrame:
    feriados = holidays.country_holidays("AR", years=range(fh.dt.year.min(), fh.dt.year.max() + 1))
    fecha = fh.dt.date
    return pd.DataFrame({
        "anio": fh.dt.year.astype("int16"),
        "hora": fh.dt.hour.astype("int8"),
        "dia_semana": fh.dt.dayofweek.astype("int8"),
        "mes": fh.dt.month.astype("int8"),
        "feriado": fecha.map(lambda d: d in feriados).astype("int8"),
        "cuarentena": fh.between(pd.Timestamp(CUARENTENA[0], tz=TZ), pd.Timestamp(CUARENTENA[1], tz=TZ)).astype("int8"),
    }, index=fh.index)


def historial_por_celda(conteos: pd.DataFrame, grilla: pd.DataFrame, anios_base: list[int]) -> dict[int, pd.DataFrame]:
    """Para cada año devuelve, por celda, los siniestros anuales promedio de los años base sin contar ese año.

    `hist_vecinos` promedia las 6 celdas lindantes: suaviza celdas con pocos casos y captura
    corredores (una avenida que sigue en la celda de al lado).
    """
    vecinos = {c: [v for v in h3.grid_disk(c, 1) if v != c and v in grilla.index] for c in grilla.index}
    out = {}
    for anio in sorted(conteos.columns):
        base = [a for a in anios_base if a != anio]
        hist = conteos[base].mean(axis=1).reindex(grilla.index, fill_value=0)
        vec = pd.Series({c: hist.loc[v].mean() if v else 0.0 for c, v in vecinos.items()})
        out[anio] = pd.DataFrame({"hist_celda": hist, "hist_vecinos": vec})
    return out


def main() -> None:
    rng = np.random.default_rng(SEMILLA)
    grilla = pd.read_parquet(GRILLA).set_index("h3")
    s = pd.read_parquet(SINIESTROS_LIMPIOS, columns=["fecha_hora", "lat", "lon"])
    s["h3"] = [h3.latlng_to_cell(la, lo, H3_RES) for la, lo in zip(s["lat"], s["lon"])]
    s["fecha_hora"] = s["fecha_hora"].dt.floor("h")

    horas = pd.date_range("2019-01-01 00:00", "2025-12-31 23:00", freq="h", tz=TZ)
    celdas = grilla.index.to_numpy()
    total = len(celdas) * len(horas)

    # Positivos: todas las celda-horas con al menos un siniestro.
    pos = s.groupby(["h3", "fecha_hora"]).size().rename("y").reset_index()
    pos["peso"] = 1.0

    # Ceros: muestra uniforme de celda-horas; se descartan las que resultaron positivas.
    idx = rng.choice(total, size=CEROS_MUESTREADOS, replace=False)
    neg = pd.DataFrame({"h3": celdas[idx % len(celdas)], "fecha_hora": horas[idx // len(celdas)]})
    claves_pos = set(zip(pos["h3"], pos["fecha_hora"]))
    neg = neg[[k not in claves_pos for k in zip(neg["h3"], neg["fecha_hora"])]]
    ceros_totales = total - len(pos)
    neg["y"] = 0
    neg["peso"] = ceros_totales / len(neg)

    df = pd.concat([pos, neg], ignore_index=True)
    df = df.join(variables_momento(df["fecha_hora"]))
    df = df.join(grilla.drop(columns=["via_principal", "via_secundaria"]), on="h3")
    df = df.merge(clima_horario(), on=["punto_clima", "fecha_hora"], how="left")
    df = df.dropna(subset=["precipitation"])

    # Historial de la celda: versión "eval" (solo años de train) y "final" (todos los años).
    s["anio"] = s["fecha_hora"].dt.year
    conteos = s.groupby(["h3", "anio"]).size().unstack(fill_value=0)
    for col in range(2019, 2026):
        if col not in conteos.columns:
            conteos[col] = 0
    for sufijo, anios_base in [("", ANIOS_TRAIN), ("_final", ANIOS_TRAIN + ANIOS_TEST)]:
        hist = historial_por_celda(conteos, grilla, anios_base)
        partes = [h.assign(anio=a) for a, h in hist.items()]
        tabla = pd.concat(partes).rename_axis("h3").reset_index()
        tabla = tabla.rename(columns={"hist_celda": f"hist_celda{sufijo}", "hist_vecinos": f"hist_vecinos{sufijo}"})
        df = df.merge(tabla, on=["h3", "anio"], how="left")

    for c in df.select_dtypes("float64").columns:
        if c != "peso":
            df[c] = df[c].astype("float32")
    df.to_parquet(DATASET_MODELO, index=False)

    print(f"{len(df):,} filas ({len(pos):,} celda-horas con siniestro, {len(neg):,} ceros muestreados, peso {neg['peso'].iat[0]:.1f})")
    print(f"Siniestros totales: {df['y'].sum():,} · celda-horas representadas: {df['peso'].sum():,.0f} de {total:,}")
    print(df.groupby(df["anio"].isin(ANIOS_TEST).map({False: "train", True: "test"}))["y"].agg(["sum", "count"]))


if __name__ == "__main__":
    main()
