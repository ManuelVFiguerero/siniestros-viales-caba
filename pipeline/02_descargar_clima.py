"""Paso 2: descarga el clima horario histórico de Open-Meteo para cada punto de CABA."""
import time

import pandas as pd
import requests

from config import (
    CLIMA_HORARIO, OPEN_METEO_ARCHIVE, PUNTOS_CLIMA, SINIESTROS_LIMPIOS, TZ, VARIABLES_CLIMA,
)


def descargar_punto(nombre: str, lat: float, lon: float, inicio: str, fin: str) -> pd.DataFrame:
    params = {
        "latitude": lat,
        "longitude": lon,
        "start_date": inicio,
        "end_date": fin,
        "hourly": ",".join(VARIABLES_CLIMA),
        "timezone": TZ,
    }
    for intento in range(4):
        resp = requests.get(OPEN_METEO_ARCHIVE, params=params, timeout=120)
        if resp.ok:
            break
        time.sleep(2 ** intento * 5)
    resp.raise_for_status()

    hourly = resp.json()["hourly"]
    df = pd.DataFrame(hourly)
    # Open-Meteo devuelve hora local sin offset; las horas ambiguas del cambio de horario se descartan.
    df["fecha_hora"] = pd.to_datetime(df.pop("time")).dt.tz_localize(TZ, ambiguous="NaT", nonexistent="NaT")
    df["punto_clima"] = nombre
    return df.dropna(subset=["fecha_hora"])


def main() -> None:
    siniestros = pd.read_parquet(SINIESTROS_LIMPIOS, columns=["fecha_hora"])
    inicio = siniestros["fecha_hora"].min().strftime("%Y-%m-%d")
    fin = siniestros["fecha_hora"].max().strftime("%Y-%m-%d")

    partes = []
    for nombre, (lat, lon) in PUNTOS_CLIMA.items():
        print(f"Descargando {nombre} {inicio} -> {fin} ...")
        partes.append(descargar_punto(nombre, lat, lon, inicio, fin))

    clima = pd.concat(partes, ignore_index=True)
    clima.to_parquet(CLIMA_HORARIO, index=False)
    print(f"{len(clima):,} filas horarias -> {CLIMA_HORARIO}")


if __name__ == "__main__":
    main()
