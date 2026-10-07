"""Rutas y parámetros compartidos por todos los pasos del pipeline."""
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "data" / "raw"
PROCESSED = ROOT / "data" / "processed"
WEB_DATA = ROOT / "web" / "src" / "data"

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

# --- Modelo de riesgo (pasos 05-08) ---
COMUNAS_GEOJSON = RAW / "comunas.geojson"
COMUNAS_URL = "https://cdn.buenosaires.gob.ar/datosabiertos/datasets/ministerio-de-educacion/comunas/comunas.geojson"
OSM_VIAS = PROCESSED / "osm_vias.json"
OVERPASS_URL = "https://overpass-api.de/api/interpreter"
GRILLA = PROCESSED / "grilla_h3.parquet"
DATASET_MODELO = PROCESSED / "dataset_modelo.parquet"
MODELOS = PROCESSED / "modelos"
REPORTES = ROOT / "reports"

# Resolución 9: hexágonos de ~174 m de lado (~350 m de punta a punta, ~0,1 km²).
H3_RES = 9

# Validación con corte temporal: el modelo nunca ve el período que se evalúa.
ANIOS_TRAIN = [2019, 2020, 2021, 2022, 2023]
ANIOS_TEST = [2024, 2025]
# Dentro del entrenamiento, 2023 se usa para el early stopping de LightGBM.
ANIO_VALIDACION = 2023

# Celda-horas sin siniestro que se muestrean (de ~120 M posibles). Cada una pesa 1/tasa de muestreo.
CEROS_MUESTREADOS = 5_000_000
SEMILLA = 42
