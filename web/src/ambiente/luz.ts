// Luz del día según la hora: alimenta el cielo de los efectos, los colores del mapa base y el sonido.

/** Factor de día (0 = noche cerrada, 1 = pleno día) y de luz dorada (amanecer / atardecer) para una hora 0–24. */
export function luzDelDia(hora: number): { dia: number; dorado: number } {
  const h = ((hora % 24) + 24) % 24
  const suave = (a: number, b: number, x: number) => {
    const t = Math.min(1, Math.max(0, (x - a) / (b - a)))
    return t * t * (3 - 2 * t)
  }
  // Buenos Aires promedio anual: amanece ~6:30, anochece ~19:30.
  const dia = suave(5.5, 8, h) * (1 - suave(18.5, 21, h))
  const campana = (centro: number, ancho: number) => Math.max(0, 1 - Math.abs(h - centro) / ancho)
  const dorado = Math.max(campana(7, 1.6), campana(19.6, 1.8))
  return { dia, dorado }
}

/** Clima → niveles objetivo de cada efecto (0–1). */
export interface Niveles {
  lluvia: number
  nubes: number
  niebla: number
  sol: number
  tormenta: number
}

export function nivelesDe(clima: string, intensidad?: number): Niveles {
  const base: Record<string, Niveles> = {
    despejado: { lluvia: 0, nubes: 0, niebla: 0, sol: 1, tormenta: 0 },
    nublado: { lluvia: 0, nubes: 0.75, niebla: 0, sol: 0.12, tormenta: 0 },
    lluvia: { lluvia: 0.55, nubes: 0.55, niebla: 0.1, sol: 0, tormenta: 0 },
    tormenta: { lluvia: 1, nubes: 0.9, niebla: 0.12, sol: 0, tormenta: 1 },
    niebla: { lluvia: 0, nubes: 0.2, niebla: 1, sol: 0, tormenta: 0 },
  }
  const n = { ...(base[clima] ?? base.despejado) }
  // Con un dato real de precipitación (mm/h) la lluvia toma esa intensidad.
  if (intensidad !== undefined && n.lluvia > 0) n.lluvia = Math.min(1.1, Math.max(0.25, intensidad))
  return n
}

/** mm/h → intensidad visual: 0,5 mm/h ya se ve, 4 mm/h o más es diluvio. */
export const intensidadDeLluvia = (mm: number) => Math.min(1.1, 0.25 + Math.sqrt(Math.max(0, mm) / 4) * 0.8)

export const prefiereMenosMovimiento = () =>
  typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
