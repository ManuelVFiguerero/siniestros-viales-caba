// Riesgo previsto: decodifica los 840 escenarios generados por pipeline/08_exportar_riesgo_web.py
// y define la escala de color.

export interface Celda {
  id: string
  p: [number, number][] // contorno del hexágono [lon, lat]
  c: [number, number] // centro
  comuna: number
  via: string | null
  via2: string | null
  km_av: number
  km_au: number
  sin: number // siniestros 2019-2025
  graves: number // graves + mortales 2019-2025
}

export interface RiesgoJSON {
  climas: string[]
  meses_promediados: number[]
  n_celdas: number
  anios_historial: number
  escala: { log_min: number; log_max: number; niveles: number }
  cuantiles: Record<string, number>
  clima_tipico: Record<string, { precipitacion: number; temperatura: number; rafagas: number; humedad: number }>
  celdas: Celda[]
  riesgo_b64: string
}

export interface Riesgo extends Omit<RiesgoJSON, 'riesgo_b64'> {
  /** Siniestros esperados por hora, orden [clima][día][hora][celda]. */
  lambda: Float32Array
  /** Promedio de lambda sobre todas las celdas y escenarios: el "1×" del índice. */
  media: number
}

export const DIAS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo']
export const DIAS_CORTO = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']
export const NOMBRE_CLIMA: Record<string, string> = {
  despejado: 'Despejado',
  nublado: 'Nublado',
  lluvia: 'Lluvia',
  tormenta: 'Tormenta',
  niebla: 'Niebla',
}

export function decodificar(r: RiesgoJSON): Riesgo {
  const bin = atob(r.riesgo_b64)
  const lambda = new Float32Array(bin.length)
  const { log_min, log_max, niveles } = r.escala
  const tabla = new Float32Array(niveles + 1)
  for (let q = 1; q <= niveles; q++) tabla[q] = 10 ** (log_min + ((q - 1) / (niveles - 1)) * (log_max - log_min))
  let suma = 0
  for (let i = 0; i < bin.length; i++) {
    const v = tabla[bin.charCodeAt(i)]
    lambda[i] = v
    suma += v
  }
  const { riesgo_b64: _, ...resto } = r
  return { ...resto, lambda, media: suma / lambda.length }
}

/** Vista (sin copiar) de las tasas de las N celdas para un escenario. */
export function escenario(r: Riesgo, clima: number, dia: number, hora: number): Float32Array {
  const n = r.n_celdas
  const off = ((clima * 7 + dia) * 24 + hora) * n
  return r.lambda.subarray(off, off + n)
}

export function totalCiudad(r: Riesgo, clima: number, dia: number, hora: number): number {
  const v = escenario(r, clima, dia, hora)
  let s = 0
  for (let i = 0; i < v.length; i++) s += v[i]
  return s
}

export function cuantil(valores: ArrayLike<number>, p: number): number {
  const a = Float32Array.from(valores).sort()
  const i = Math.min(a.length - 1, Math.max(0, Math.round(p * (a.length - 1))))
  return a[i]
}

// ---------- escala de color ----------

// ColorBrewer RdYlBu invertida (11 pasos): la escala clásica azul → amarillo → rojo.
export const RAMPA_HEX = ['#313695', '#4575b4', '#74add1', '#abd9e9', '#e0f3f8', '#ffffbf', '#fee090', '#fdae61', '#f46d43', '#d73027', '#a50026']
const RAMPA = RAMPA_HEX.map((h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)) as [number, number, number])

export function colorEn(t: number): [number, number, number] {
  const x = Math.min(1, Math.max(0, t)) * (RAMPA.length - 1)
  const i = Math.min(RAMPA.length - 2, Math.floor(x))
  const f = x - i
  const a = RAMPA[i]
  const b = RAMPA[i + 1]
  return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f]
}

export function colorCss(t: number): string {
  const [r, g, b] = colorEn(t)
  return `rgb(${Math.round(r)} ${Math.round(g)} ${Math.round(b)})`
}

export const GRADIENTE_CSS = `linear-gradient(90deg, ${RAMPA_HEX.join(', ')})`

/** Dominio logarítmico de la escala, en unidades de lambda. */
export interface Dominio {
  lo: number
  hi: number
}

export function posicion(lambda: number, d: Dominio): number {
  return (Math.log10(lambda) - Math.log10(d.lo)) / (Math.log10(d.hi) - Math.log10(d.lo))
}

// ---------- formato ----------

const nf = (dec: number) => new Intl.NumberFormat('es-AR', { minimumFractionDigits: dec, maximumFractionDigits: dec })

export function fmtNum(v: number, dec = 0): string {
  return nf(dec).format(v)
}

/** Índice relativo al promedio de la ciudad: "×3,4", "×0,25". */
export function fmtIndice(v: number): string {
  if (v >= 10) return `×${nf(0).format(v)}`
  if (v >= 1) return `×${nf(1).format(v)}`
  return `×${nf(2).format(v)}`
}

/** Siniestros esperados por hora → "1 cada N h" legible. */
export function fmtCadaHoras(lambda: number): string {
  const h = 1 / lambda
  if (h < 48) return `1 cada ${nf(0).format(h)} h`
  const dias = h / 24
  if (dias < 60) return `1 cada ${nf(0).format(dias)} días`
  return `1 cada ${nf(1).format(dias / 30.4)} meses`
}

export function fmtPct(v: number, dec = 1): string {
  return `${nf(dec).format(v * 100)} %`
}

export function hhmm(h: number): string {
  return `${String(h).padStart(2, '0')}:00`
}

export function nombreCelda(c: Celda): string {
  const corto = (s: string) =>
    s
      .replace(/^Avenida /, 'Av. ')
      .replace(/^Autopista /, 'Au. ')
      .replace(/General /, 'Gral. ')
      .replace(/Presidente /, 'Pres. ')
  if (c.via && c.via2) return `${corto(c.via)} y ${corto(c.via2)}`
  if (c.via) return corto(c.via)
  return `Comuna ${c.comuna}`
}
