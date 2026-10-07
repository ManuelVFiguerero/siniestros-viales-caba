"""Clasificación de cada hora de clima en una condición legible."""
import numpy as np
import pandas as pd


def clasificar_condicion(clima: pd.DataFrame) -> pd.Series:
    """Códigos WMO: https://open-meteo.com/en/docs#weather_variable_documentation

    ERA5 (la fuente del archivo de Open-Meteo) no emite códigos de tormenta (95-99) ni
    de niebla (45/48), así que ambas condiciones se aproximan con variables físicas:
    - tormenta: lluvia intensa (>= 4 mm/h) o lluvia con ráfagas fuertes (>= 55 km/h).
    - niebla: humedad >= 97 %, viento calmo y sin precipitación.
    """
    code = clima["weather_code"]
    pp = clima["precipitation"]
    tormenta = code.between(95, 99) | (pp >= 4) | ((pp >= 1) & (clima["wind_gusts_10m"] >= 55))
    lluvia = code.between(51, 67) | code.between(80, 82) | (pp >= 0.5)
    niebla = code.isin([45, 48]) | (
        (clima["relative_humidity_2m"] >= 97) & (clima["wind_speed_10m"] < 8) & (pp == 0)
    )
    nublado = (code == 3) | (clima["cloud_cover"] >= 70)
    return pd.Series(
        np.select([tormenta, lluvia, niebla, nublado], ["tormenta", "lluvia", "niebla", "nublado"], "despejado"),
        index=clima.index,
    )
