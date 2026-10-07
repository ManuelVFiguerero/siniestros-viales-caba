"""Paso 3: clasifica cada hora en una condición climática y la asigna a cada siniestro."""
import numpy as np
import pandas as pd

from clima import clasificar_condicion
from config import CLIMA_HORARIO, PUNTOS_CLIMA, SINIESTROS_CLIMA, SINIESTROS_LIMPIOS


def punto_mas_cercano(lat: pd.Series, lon: pd.Series) -> pd.Series:
    nombres = list(PUNTOS_CLIMA)
    coords = np.array(list(PUNTOS_CLIMA.values()))
    # Distancia euclídea en grados: a esta escala alcanza para elegir el punto más cercano.
    d = (lat.to_numpy()[:, None] - coords[:, 0]) ** 2 + (lon.to_numpy()[:, None] - coords[:, 1]) ** 2
    return pd.Series(np.array(nombres)[d.argmin(axis=1)], index=lat.index)


def main() -> None:
    siniestros = pd.read_parquet(SINIESTROS_LIMPIOS)
    clima = pd.read_parquet(CLIMA_HORARIO)
    clima["condicion"] = clasificar_condicion(clima)

    siniestros["punto_clima"] = punto_mas_cercano(siniestros["lat"], siniestros["lon"])
    siniestros["hora_redondeada"] = siniestros["fecha_hora"].dt.floor("h")

    df = siniestros.merge(
        clima.rename(columns={"fecha_hora": "hora_redondeada"}),
        on=["punto_clima", "hora_redondeada"],
        how="left",
    )
    sin_clima = df["condicion"].isna().sum()
    df.to_parquet(SINIESTROS_CLIMA, index=False)

    print(f"{len(df):,} siniestros cruzados ({sin_clima} sin clima) -> {SINIESTROS_CLIMA}")
    print(df["condicion"].value_counts(normalize=True).round(3).to_string())


if __name__ == "__main__":
    main()
