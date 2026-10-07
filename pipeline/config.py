"""Rutas y parámetros compartidos por todos los pasos del pipeline."""
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "data" / "raw"
PROCESSED = ROOT / "data" / "processed"
WEB_DATA = ROOT / "web" / "public" / "data"

SINIESTROS_XLSX = RAW / "siniestros_viales_hechos.xlsx"
SINIESTROS_LIMPIOS = PROCESSED / "siniestros.parquet"
CLIMA_HORARIO = PROCESSED / "clima_horario.parquet"
SINIESTROS_CLIMA = PROCESSED / "siniestros_clima.parquet"

TZ = "America/Argentina/Buenos_Aires"

# Bounding box de CABA (con un pequeño margen) para descartar coordenadas mal cargadas.
BBOX = {"lat_min": -34.71, "lat_max": -34.52, "lon_min": -58.54, "lon_max": -58.33}

# Puntos de muestreo del clima. ERA5 (la fuente del archivo histórico de Open-Meteo)
# tiene ~10-25 km de resolución, así que CABA entra en pocas celdas: con un punto
# por cuadrante alcanza. Cada siniestro toma el clima del punto más cercano.
PUNTOS_CLIMA = {
    "noroeste": (-34.57, -58.49),
    "noreste": (-34.58, -58.40),
    "suroeste": (-34.66, -58.48),
    "sureste": (-34.63, -58.39),
}

OPEN_METEO_ARCHIVE = "https://archive-api.open-meteo.com/v1/archive"
VARIABLES_CLIMA = [
    "weather_code",
    "precipitation",
    "temperature_2m",
    "relative_humidity_2m",
    "wind_speed_10m",
    "wind_gusts_10m",
    "cloud_cover",
]

# Orden de prioridad: si en la misma hora hay tormenta y lluvia, gana tormenta.
CONDICIONES = ["tormenta", "lluvia", "niebla", "nublado", "despejado"]
