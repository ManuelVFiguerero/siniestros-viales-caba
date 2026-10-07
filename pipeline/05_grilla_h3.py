"""Paso 5: cuadricula CABA en hexágonos H3 (~300 m) y calcula las variables fijas de cada celda.

Variables de zona que no dependen de los siniestros (para no filtrar el objetivo):
- comuna (polígonos oficiales de BA Data),
- km de autopista, avenida y calle terciaria dentro de la celda (OpenStreetMap),
- cantidad de vías principales distintas que la cruzan (aproxima cruces de avenidas),
- punto de clima más cercano.
"""
import json
import math
from collections import defaultdict

import h3
import numpy as np
import pandas as pd
import requests
from shapely.geometry import Point, shape

from config import (
    BBOX, COMUNAS_GEOJSON, COMUNAS_URL, GRILLA, H3_RES, OSM_VIAS, OVERPASS_URL, PROCESSED, PUNTOS_CLIMA,
    SINIESTROS_LIMPIOS,
)

# Clases de OSM agrupadas como se habla en la ciudad.
CLASE_VIA = {
    "motorway": "autopista", "motorway_link": "autopista", "trunk": "autopista", "trunk_link": "autopista",
    "primary": "avenida", "primary_link": "avenida", "secondary": "avenida",
    "tertiary": "terciaria",
}
PASO_M = 15  # cada tramo de vía se parte en pedazos de 15 m para repartirlo entre celdas


def descargar_insumos() -> None:
    if not COMUNAS_GEOJSON.exists():
        print("Descargando comunas de BA Data ...")
        resp = requests.get(COMUNAS_URL, timeout=120)
        resp.raise_for_status()
        COMUNAS_GEOJSON.write_bytes(resp.content)
    if not OSM_VIAS.exists():
        print("Descargando red vial principal de OpenStreetMap (Overpass) ...")
        bbox = f'{BBOX["lat_min"]},{BBOX["lon_min"]},{BBOX["lat_max"]},{BBOX["lon_max"]}'
        clases = "|".join(CLASE_VIA)
        query = f'[out:json][timeout:180];way["highway"~"^({clases})$"]({bbox});out tags geom;'
        resp = requests.post(OVERPASS_URL, data={"data": query}, headers={"User-Agent": "siniestros-viales-caba"}, timeout=300)
        resp.raise_for_status()
        PROCESSED.mkdir(parents=True, exist_ok=True)
        OSM_VIAS.write_bytes(resp.content)


def metros(lat1, lon1, lat2, lon2) -> float:
    # Equirectangular: error despreciable en distancias de decenas de metros.
    x = math.radians(lon2 - lon1) * math.cos(math.radians((lat1 + lat2) / 2))
    y = math.radians(lat2 - lat1)
    return 6_371_000 * math.hypot(x, y)


def largo_vias_por_celda(celdas: set[str]) -> pd.DataFrame:
    ways = json.loads(OSM_VIAS.read_text())["elements"]
    largo = defaultdict(float)  # (celda, clase) -> metros
    por_nombre = defaultdict(float)  # (celda, nombre) -> metros, solo autopistas y avenidas
    for w in ways:
        clase = CLASE_VIA.get(w.get("tags", {}).get("highway"))
        nombre = w.get("tags", {}).get("name")
        geom = w.get("geometry") or []
        for a, b in zip(geom, geom[1:]):
            d = metros(a["lat"], a["lon"], b["lat"], b["lon"])
            n = max(1, math.ceil(d / PASO_M))
            for k in range(n):
                t = (k + 0.5) / n
                c = h3.latlng_to_cell(a["lat"] + t * (b["lat"] - a["lat"]), a["lon"] + t * (b["lon"] - a["lon"]), H3_RES)
                if c not in celdas:
                    continue
                largo[(c, clase)] += d / n
                if nombre and clase in ("autopista", "avenida"):
                    por_nombre[(c, nombre)] += d / n

    km = pd.Series(largo).rename("m").rename_axis(["h3", "clase"]).reset_index()
    km = km.pivot_table(index="h3", columns="clase", values="m", aggfunc="sum").fillna(0) / 1000
    km = km.reindex(columns=["autopista", "avenida", "terciaria"], fill_value=0).add_prefix("km_")

    nombres = pd.Series(por_nombre).rename("m").rename_axis(["h3", "nombre"]).reset_index()
    nombres = nombres[nombres["m"] >= 60]  # una vía que apenas roza la celda no cuenta
    vias = nombres.sort_values("m", ascending=False).groupby("h3").agg(
        via_principal=("nombre", "first"),
        via_secundaria=("nombre", lambda s: s.iloc[1] if len(s) > 1 else None),
        n_vias_principales=("nombre", "nunique"),
    )
    return km.join(vias, how="outer")


def main() -> None:
    descargar_insumos()
    comunas = json.loads(COMUNAS_GEOJSON.read_text())["features"]
    poligonos = [(int(f["properties"]["comuna"]), shape(f["geometry"])) for f in comunas]

    celdas: set[str] = set()
    for _, geom in poligonos:
        celdas |= set(h3.geo_to_cells(geom.__geo_interface__, H3_RES))
    # Celdas de borde (General Paz, Riachuelo) cuyo centro cae afuera pero tienen siniestros adentro.
    s = pd.read_parquet(SINIESTROS_LIMPIOS, columns=["lat", "lon"])
    celdas |= {h3.latlng_to_cell(la, lo, H3_RES) for la, lo in zip(s["lat"], s["lon"])}

    filas = []
    for c in sorted(celdas):
        lat, lon = h3.cell_to_latlng(c)
        p = Point(lon, lat)
        comuna = next((n for n, g in poligonos if g.contains(p)), None)
        if comuna is None:
            comuna = min(poligonos, key=lambda ng: ng[1].distance(p))[0]
        filas.append({"h3": c, "lat": lat, "lon": lon, "comuna": comuna})
    grilla = pd.DataFrame(filas).set_index("h3")

    grilla = grilla.join(largo_vias_por_celda(celdas))
    for col in ["km_autopista", "km_avenida", "km_terciaria", "n_vias_principales"]:
        grilla[col] = grilla[col].fillna(0)

    coords = np.array(list(PUNTOS_CLIMA.values()))
    d = (grilla["lat"].to_numpy()[:, None] - coords[:, 0]) ** 2 + (grilla["lon"].to_numpy()[:, None] - coords[:, 1]) ** 2
    grilla["punto_clima"] = np.array(list(PUNTOS_CLIMA))[d.argmin(axis=1)]

    grilla.reset_index().to_parquet(GRILLA, index=False)
    print(f"{len(grilla):,} celdas H3 res {H3_RES} -> {GRILLA}")
    print(grilla[["km_autopista", "km_avenida", "km_terciaria", "n_vias_principales"]].describe().round(2).to_string())


if __name__ == "__main__":
    main()
