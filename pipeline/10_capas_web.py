"""Capas livianas para la web de presentación (no bajan nada de internet).

1. Recorridos aproximados de avenidas y autopistas para la animación de tránsito: usa las celdas H3
   de web/src/data/riesgo.json, que ya traen la vía principal que las cruza (paso 05). Para cada vía
   une los centros de sus celdas vecinas, se queda con el camino más largo de cada tramo y lo suaviza.
   -> web/src/data/avenidas.json (~110 KB)
2. Comunas simplificadas (Douglas-Peucker, ~15 m) para el mapa base de respaldo sin internet.
   -> web/src/data/comunas.json
"""

import json
import math
from collections import defaultdict
from pathlib import Path

RAIZ = Path(__file__).resolve().parents[1]
ENTRADA = RAIZ / "web" / "src" / "data" / "riesgo.json"
SALIDA = RAIZ / "web" / "src" / "data" / "avenidas.json"
COMUNAS = RAIZ / "data" / "raw" / "comunas.geojson"
SALIDA_COMUNAS = RAIZ / "web" / "src" / "data" / "comunas.json"
TOLERANCIA_M = 15

M_LAT = 111_320
M_LON = 111_320 * math.cos(math.radians(-34.6))
VECINAS_M = 450  # los centros de hexágonos vecinos (res. 9) están a ~300 m
MIN_CELDAS = 4


def dist(a, b):
    return math.hypot((a[0] - b[0]) * M_LON, (a[1] - b[1]) * M_LAT)


def arbol_minimo(puntos):
    """Prim sobre el grafo de vecinas: devuelve la lista de adyacencia del árbol."""
    n = len(puntos)
    ady = defaultdict(list)
    en_arbol = [False] * n
    mejor = [math.inf] * n
    padre = [-1] * n
    for inicio in range(n):
        if en_arbol[inicio]:
            continue
        mejor[inicio] = 0
        while True:
            i = min((k for k in range(n) if not en_arbol[k] and mejor[k] < math.inf), key=lambda k: mejor[k], default=None)
            if i is None:
                break
            en_arbol[i] = True
            if padre[i] >= 0:
                ady[i].append(padre[i])
                ady[padre[i]].append(i)
            for k in range(n):
                if not en_arbol[k]:
                    d = dist(puntos[i], puntos[k])
                    if d <= VECINAS_M and d < mejor[k]:
                        mejor[k] = d
                        padre[k] = i
    return ady


def mas_lejano(ady, desde, n):
    previo = {desde: None}
    cola = [desde]
    for v in cola:
        for w in ady[v]:
            if w not in previo:
                previo[w] = v
                cola.append(w)
    ultimo = cola[-1]
    camino = []
    while ultimo is not None:
        camino.append(ultimo)
        ultimo = previo[ultimo]
    return camino, set(cola)


def chaikin(linea, vueltas=2):
    for _ in range(vueltas):
        nueva = [linea[0]]
        for a, b in zip(linea, linea[1:]):
            nueva.append((0.75 * a[0] + 0.25 * b[0], 0.75 * a[1] + 0.25 * b[1]))
            nueva.append((0.25 * a[0] + 0.75 * b[0], 0.25 * a[1] + 0.75 * b[1]))
        nueva.append(linea[-1])
        linea = nueva
    return linea


def simplificar(puntos, tol=TOLERANCIA_M):
    """Douglas-Peucker en metros."""
    if len(puntos) < 4:
        return puntos
    a, b = puntos[0], puntos[-1]
    ax, ay, bx, by = a[0] * M_LON, a[1] * M_LAT, b[0] * M_LON, b[1] * M_LAT
    largo = math.hypot(bx - ax, by - ay) or 1e-9
    peor, idx = 0.0, 0
    for k in range(1, len(puntos) - 1):
        px, py = puntos[k][0] * M_LON, puntos[k][1] * M_LAT
        d = abs((bx - ax) * (ay - py) - (ax - px) * (by - ay)) / largo
        if d > peor:
            peor, idx = d, k
    if peor <= tol:
        return [a, b]
    return simplificar(puntos[: idx + 1], tol)[:-1] + simplificar(puntos[idx:], tol)


def exportar_comunas():
    geo = json.loads(COMUNAS.read_text(encoding="utf-8"))
    salida = []
    for f in geo["features"]:
        g = f["geometry"]
        poligonos = g["coordinates"] if g["type"] == "MultiPolygon" else [g["coordinates"]]
        props = {k.lower(): v for k, v in f["properties"].items()}
        comuna = props.get("comuna") or props.get("id")
        for pol in poligonos:
            pts = [(round(c[0], 5), round(c[1], 5)) for c in pol[0]]
            # Anillo cerrado: se parte en el punto más lejano al inicio y se simplifica cada mitad.
            lejos = max(range(len(pts)), key=lambda k: dist(pts[0], pts[k]))
            anillo = simplificar(pts[: lejos + 1])[:-1] + simplificar(pts[lejos:])
            if len(anillo) >= 4:
                salida.append({"type": "Feature", "properties": {"comuna": comuna},
                               "geometry": {"type": "Polygon", "coordinates": [[list(p) for p in anillo]]}})
    SALIDA_COMUNAS.write_text(json.dumps({"type": "FeatureCollection", "features": salida}, separators=(",", ":")), encoding="utf-8")
    print(f"{len(salida)} polígonos de comunas -> {SALIDA_COMUNAS.relative_to(RAIZ)}")


def main():
    exportar_comunas()
    celdas = json.loads(ENTRADA.read_text(encoding="utf-8"))["celdas"]
    por_via = defaultdict(list)
    for c in celdas:
        if c["via"] and (c["km_av"] > 0 or c["km_au"] > 0):
            por_via[c["via"]].append(c)

    salida = []
    for via, cs in por_via.items():
        if len(cs) < MIN_CELDAS:
            continue
        puntos = [tuple(c["c"]) for c in cs]
        ady = arbol_minimo(puntos)
        vistos = set()
        for i in range(len(puntos)):
            if i in vistos:
                continue
            _, componente = mas_lejano(ady, i, len(puntos))
            vistos |= componente
            if len(componente) < MIN_CELDAS:
                continue
            extremo = mas_lejano(ady, i, len(puntos))[0][0]
            camino, _ = mas_lejano(ady, extremo, len(puntos))
            if len(camino) < MIN_CELDAS:
                continue
            linea = chaikin([puntos[k] for k in camino])
            largo = sum(dist(a, b) for a, b in zip(linea, linea[1:]))
            salida.append({
                "via": via,
                "autopista": via.startswith("Autopista"),
                "largo_m": round(largo),
                "p": [[round(x, 5), round(y, 5)] for x, y in linea],
            })

    salida.sort(key=lambda v: -v["largo_m"])
    SALIDA.write_text(json.dumps(salida, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"{len(salida)} tramos, {sum(v['largo_m'] for v in salida) / 1000:.0f} km -> {SALIDA.relative_to(RAIZ)}")


if __name__ == "__main__":
    main()
