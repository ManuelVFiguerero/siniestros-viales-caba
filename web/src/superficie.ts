// Superficies continuas (mapa de calor) calculadas en la CPU y dibujadas como imagen.
// HeatmapLayer de deck.gl usa framebuffers propios y congela el mapa en modo intercalado con
// MapLibre; una grilla de 40 m desenfocada es igual de rápida para ~60 mil puntos y además tiene
// un radio fijo en metros (no cambia al hacer zoom).
import { colorEn } from './riesgo'

const OESTE = -58.545
const ESTE = -58.325
const SUR = -34.715
const NORTE = -34.515
const M_POR_GRADO_LAT = 111_000
const M_POR_GRADO_LON = 111_320 * Math.cos((34.615 * Math.PI) / 180)
const PIXEL_M = 40

export const ANCHO = Math.round(((ESTE - OESTE) * M_POR_GRADO_LON) / PIXEL_M)
export const ALTO = Math.round(((NORTE - SUR) * M_POR_GRADO_LAT) / PIXEL_M)
export const LIMITES: [number, number, number, number] = [OESTE, SUR, ESTE, NORTE]

function indice(lon: number, lat: number): number {
  const x = Math.floor(((lon - OESTE) / (ESTE - OESTE)) * ANCHO)
  const y = Math.floor(((NORTE - lat) / (NORTE - SUR)) * ALTO)
  return x < 0 || y < 0 || x >= ANCHO || y >= ALTO ? -1 : y * ANCHO + x
}

/** Suma de pesos por píxel. */
export function acumular(n: number, lon: (i: number) => number, lat: (i: number) => number, peso: (i: number) => number): Float32Array {
  const g = new Float32Array(ANCHO * ALTO)
  for (let i = 0; i < n; i++) {
    const k = indice(lon(i), lat(i))
    if (k >= 0) g[k] += peso(i)
  }
  return g
}

function cajaHorizontal(src: Float32Array, dst: Float32Array, r: number) {
  const norm = 1 / (2 * r + 1)
  for (let y = 0; y < ALTO; y++) {
    const fila = y * ANCHO
    let s = 0
    for (let x = -r; x <= r; x++) s += x >= 0 && x < ANCHO ? src[fila + x] : 0
    for (let x = 0; x < ANCHO; x++) {
      dst[fila + x] = s * norm
      const sale = x - r
      const entra = x + r + 1
      if (sale >= 0) s -= src[fila + sale]
      if (entra < ANCHO) s += src[fila + entra]
    }
  }
}

function cajaVertical(src: Float32Array, dst: Float32Array, r: number) {
  const norm = 1 / (2 * r + 1)
  for (let x = 0; x < ANCHO; x++) {
    let s = 0
    for (let y = -r; y <= r; y++) s += y >= 0 && y < ALTO ? src[y * ANCHO + x] : 0
    for (let y = 0; y < ALTO; y++) {
      dst[y * ANCHO + x] = s * norm
      const sale = y - r
      const entra = y + r + 1
      if (sale >= 0) s -= src[sale * ANCHO + x]
      if (entra < ALTO) s += src[entra * ANCHO + x]
    }
  }
}

/** Tres pasadas de caja ≈ gaussiana con sigma ≈ radio × 1,15 píxeles. */
export function desenfocar(g: Float32Array, radio: number): Float32Array {
  const a = Float32Array.from(g)
  const b = new Float32Array(g.length)
  for (let p = 0; p < 3; p++) {
    cajaHorizontal(a, b, radio)
    cajaVertical(b, a, radio)
  }
  return a
}

/** Pinta una grilla de valores t ∈ [0, 1] con la escala azul–amarillo–rojo; alfa por píxel. */
export function pintar(t: Float32Array, alfa: Float32Array): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  canvas.width = ANCHO
  canvas.height = ALTO
  const ctx = canvas.getContext('2d')!
  const img = ctx.createImageData(ANCHO, ALTO)
  for (let k = 0; k < t.length; k++) {
    const a = alfa[k]
    if (a <= 0.004) continue
    const [r, g, b] = colorEn(t[k])
    img.data[k * 4] = r
    img.data[k * 4 + 1] = g
    img.data[k * 4 + 2] = b
    img.data[k * 4 + 3] = Math.round(a * 255)
  }
  ctx.putImageData(img, 0, 0)
  return canvas
}

/** Densidad de puntos (mapa de calor clásico), en escala logarítmica respecto del máximo robusto. */
export function densidad(g: Float32Array, radio = 3): HTMLCanvasElement {
  const d = desenfocar(g, radio)
  const positivos = d.filter((v) => v > 0).sort()
  const ref = positivos.length ? positivos[Math.floor(positivos.length * 0.997)] : 1
  const t = new Float32Array(d.length)
  const alfa = new Float32Array(d.length)
  const k = 6
  for (let i = 0; i < d.length; i++) {
    if (d[i] <= 0) continue
    const x = Math.log1p((k * Math.min(d[i], ref)) / ref) / Math.log1p(k)
    t[i] = x
    alfa[i] = Math.min(1, x * 2.2) * 0.85
  }
  return pintar(t, alfa)
}

/**
 * Interpolación suave de un valor por celda (promedio ponderado por un núcleo gaussiano):
 * superficie = desenfoque(valor × peso) / desenfoque(peso). Se desvanece fuera de la ciudad.
 */
export function interpolar(n: number, lon: (i: number) => number, lat: (i: number) => number, valor: (i: number) => number, radio = 5): HTMLCanvasElement {
  const num = desenfocar(acumular(n, lon, lat, valor), radio)
  const den = desenfocar(acumular(n, lon, lat, () => 1), radio)
  let max = 0
  for (let i = 0; i < den.length; i++) if (den[i] > max) max = den[i]
  const t = new Float32Array(den.length)
  const alfa = new Float32Array(den.length)
  for (let i = 0; i < den.length; i++) {
    if (den[i] < max * 0.1) continue
    t[i] = num[i] / den[i]
    alfa[i] = Math.min(1, (den[i] - max * 0.1) / (max * 0.25)) * 0.85
  }
  return pintar(t, alfa)
}
