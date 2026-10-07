"""Paso 1: lee el Excel de BA Data, normaliza tipos y descarta registros sin ubicación."""
import pandas as pd

from config import BBOX, PROCESSED, SINIESTROS_LIMPIOS, SINIESTROS_XLSX, TZ


def a_numero(serie: pd.Series) -> pd.Series:
    # El dataset usa "SD"/"sd" (sin dato) mezclado con números.
    return pd.to_numeric(serie, errors="coerce")


def main() -> None:
    df = pd.read_excel(SINIESTROS_XLSX)
    n_original = len(df)

    df["lat"] = a_numero(df["latitud_siniestro"])
    df["lon"] = a_numero(df["longitud_siniestro"])
    df["victimas"] = a_numero(df["numero_total_de_victimas"]).astype("Int64")

    # Las fechas vienen en formatos mezclados ("2019-01-01" y "2025-9-9").
    fecha = pd.to_datetime(df["fecha_siniestro"], format="mixed", errors="coerce")
    hora = pd.to_timedelta(df["hora_siniestro"].astype(str), errors="coerce")
    df["fecha_hora"] = (fecha + hora).dt.tz_localize(TZ, ambiguous="NaT", nonexistent="NaT")

    en_caba = df["lat"].between(BBOX["lat_min"], BBOX["lat_max"]) & df["lon"].between(
        BBOX["lon_min"], BBOX["lon_max"]
    )
    df = df[en_caba & df["fecha_hora"].notna()].copy()

    df["hora"] = df["fecha_hora"].dt.hour
    df["dia_semana"] = df["fecha_hora"].dt.dayofweek  # 0 = lunes
    df["anio"] = df["fecha_hora"].dt.year
    df["comuna"] = df["comuna_siniestro"].astype(str).str.extract(r"(\d+)")[0].astype("Int64")
    df["gravedad"] = df["gravedad_siniestro"].str.upper().str.strip()
    df["modo"] = df["modo_desplazamiento_victima"].str.upper().str.strip().replace({"SD": "SIN DATO"})
    df["tipo_via"] = df["tipo_de_via_siniestro"].fillna("SD").str.upper().str.strip()

    columnas = [
        "id_siniestro", "fecha_hora", "anio", "hora", "dia_semana", "lat", "lon", "comuna",
        "tipo_via", "gravedad", "modo", "contraparte_siniestro", "participantes_siniestro",
        "victimas", "numero_victimas_grave_siniestro", "numero_victimas_mortal_siniestro",
    ]
    PROCESSED.mkdir(parents=True, exist_ok=True)
    df[columnas].to_parquet(SINIESTROS_LIMPIOS, index=False)
    print(f"{len(df):,} de {n_original:,} siniestros con ubicación y hora válidas -> {SINIESTROS_LIMPIOS}")


if __name__ == "__main__":
    main()
