// El mapa base sigue la hora: de noche queda como el estilo oscuro original; de día los fondos, el agua
// y las calles se aclaran un poco (sin perder contraste con la escala de riesgo) y al atardecer toman un tono cálido.
import type maplibregl from 'maplibre-gl'

type Rgba = [number, number, number, number]

const ctx = typeof document !== 'undefined' ? document.createElement('canvas').getContext('2d') : null

/** Cualquier color CSS → [r, g, b, a]. El canvas normaliza hsl(), nombres, etc. */
function parsear(c: string): Rgba | null {
  if (!ctx) return null
  ctx.fillStyle = '#000'
  ctx.fillStyle = c
  const s = ctx.fillStyle as string
  if (s.startsWith('#')) return [parseInt(s.slice(1, 3), 16), parseInt(s.slice(3, 5), 16), parseInt(s.slice(5, 7), 16), 1]
  const m = s.match(/rgba?\(([^)]+)\)/)
  if (!m) return null
  const [r, g, b, a = '1'] = m[1].split(',').map((x) => x.trim())
  return [+r, +g, +b, +a]
}

const mezclar = (a: Rgba, b: [number, number, number], t: number): string =>
  `rgba(${Math.round(a[0] + (b[0] - a[0]) * t)}, ${Math.round(a[1] + (b[1] - a[1]) * t)}, ${Math.round(a[2] + (b[2] - a[2]) * t)}, ${a[3]})`

const PROPIEDAD: Record<string, string> = { background: 'background-color', fill: 'fill-color', line: 'line-color' }

interface Original {
  id: string
  prop: string
  color: Rgba
  tipo: string
  agua: boolean
}

const originales = new WeakMap<maplibregl.Map, Original[]>()

function leerOriginales(map: maplibregl.Map): Original[] {
  const ya = originales.get(map)
  if (ya) return ya
  const lista: Original[] = []
  for (const capa of map.getStyle().layers ?? []) {
    const prop = PROPIEDAD[capa.type]
    if (!prop) continue
    const v = map.getPaintProperty(capa.id, prop)
    if (typeof v !== 'string') continue // colores con expresiones por zoom: se dejan como están
    const color = parsear(v)
    if (color) lista.push({ id: capa.id, prop, color, tipo: capa.type, agua: /water|river|ocean/i.test(capa.id) })
  }
  originales.set(map, lista)
  return lista
}

const DIA_FONDO: [number, number, number] = [74, 86, 100]
const DIA_AGUA: [number, number, number] = [52, 92, 128]
const DIA_CALLE: [number, number, number] = [128, 138, 150]
const DORADO: [number, number, number] = [150, 92, 62]

/** dia y dorado entre 0 y 1 (ver luzDelDia). Se puede llamar en cada cambio de hora: solo toca ~40 capas. */
export function aplicarLuz(map: maplibregl.Map, dia: number, dorado: number) {
  if (!map.isStyleLoaded()) return
  for (const o of leerOriginales(map)) {
    const destino = o.agua ? DIA_AGUA : o.tipo === 'line' ? DIA_CALLE : DIA_FONDO
    const fuerza = (o.tipo === 'line' ? 0.28 : 0.42) * dia
    const tinte = parsear(mezclar(o.color, destino, fuerza))!
    map.setPaintProperty(o.id, o.prop, mezclar(tinte, DORADO, 0.14 * dorado))
  }
  try {
    const noche: [number, number, number] = [9, 12, 22]
    const cielo: [number, number, number] = [96, 150, 205]
    const sky = parsear(mezclar([...noche, 1], cielo, dia))!
    const horizonte = parsear(mezclar([20, 24, 38, 1], [190, 210, 230], dia))!
    map.setSky({
      'sky-color': mezclar(sky, DORADO, 0.15 * dorado),
      'horizon-color': mezclar(horizonte, [235, 140, 80], 0.6 * dorado),
      'sky-horizon-blend': 0.7,
      'horizon-fog-blend': 0.6,
      'atmosphere-blend': 0,
    })
  } catch {
    // cielo no soportado: no pasa nada
  }
}

/** Edificios 3D del mapa base (OpenMapTiles: capa "building", altura en render_height). */
export function agregarEdificios(map: maplibregl.Map, antesDe?: string) {
  if (map.getLayer('edificios-3d')) return
  const capaEdificios = (map.getStyle().layers ?? []).find((l) => 'source-layer' in l && l['source-layer'] === 'building') as
    | { source: string }
    | undefined
  if (!capaEdificios) return
  map.addLayer(
    {
      id: 'edificios-3d',
      type: 'fill-extrusion',
      source: capaEdificios.source,
      'source-layer': 'building',
      minzoom: 13,
      paint: {
        'fill-extrusion-color': '#1d2329',
        'fill-extrusion-opacity': 0.85,
        'fill-extrusion-height': ['interpolate', ['linear'], ['zoom'], 13, 0, 15.5, ['coalesce', ['get', 'render_height'], 8]],
        'fill-extrusion-base': ['coalesce', ['get', 'render_min_height'], 0],
      },
    },
    antesDe,
  )
}
