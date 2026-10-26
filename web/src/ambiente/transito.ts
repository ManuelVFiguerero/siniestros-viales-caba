// Tránsito animado: luces de autos que recorren avenidas y autopistas (recorridos de pipeline/10_avenidas_web.py).
// Es ilustrativo: la cantidad sigue el perfil horario del modelo y el clima la reduce y la frena.
import { TripsLayer } from '@deck.gl/geo-layers'
import avenidas from '../data/avenidas.json'

interface Avenida {
  via: string
  autopista: boolean
  largo_m: number
  p: [number, number][]
}

export interface Viaje {
  path: [number, number][]
  timestamps: number[]
  ida: boolean
}

/** Duración del bucle en "segundos de simulación"; cada viaje se repite desfasado para que no haya saltos. */
export const BUCLE = 240
const MAX_VEHICULOS = 1400
const M_LAT = 111_320
const M_LON = 111_320 * Math.cos((-34.6 * Math.PI) / 180)

let cache: Viaje[] | null = null

/** Pool de viajes en orden aleatorio: para mostrar menos autos se toma un prefijo. */
export function viajes(): Viaje[] {
  if (cache) return cache
  const avs = avenidas as Avenida[]
  const largoTotal = avs.reduce((s, a) => s + a.largo_m, 0)
  const lista: Viaje[] = []
  let semilla = 7
  const azar = () => ((semilla = (semilla * 16807) % 2147483647) / 2147483647)
  for (const a of avs) {
    const cupo = Math.max(1, Math.round((MAX_VEHICULOS * a.largo_m) / largoTotal))
    const velocidad = a.autopista ? 22 : 12 // m por segundo de simulación
    // Distancias acumuladas a lo largo del recorrido.
    const acum = [0]
    for (let k = 1; k < a.p.length; k++) {
      const [x0, y0] = a.p[k - 1]
      const [x1, y1] = a.p[k]
      acum.push(acum[k - 1] + Math.hypot((x1 - x0) * M_LON, (y1 - y0) * M_LAT))
    }
    for (let v = 0; v < cupo; v++) {
      const ida = v % 2 === 0
      const path = ida ? a.p : [...a.p].reverse()
      const dist = ida ? acum : acum.map((d) => acum[acum.length - 1] - d).reverse()
      const vel = velocidad * (0.75 + azar() * 0.5)
      const inicio = azar() * BUCLE
      const ts = dist.map((d) => inicio + d / vel)
      // Una copia un bucle antes: así al reiniciar el reloj el auto ya está en camino.
      lista.push({ path, timestamps: ts, ida }, { path, timestamps: ts.map((t) => t - BUCLE), ida })
    }
  }
  // Mezcla determinística para que los prefijos se repartan por toda la ciudad.
  for (let i = lista.length - 1; i > 0; i--) {
    const j = Math.floor(azar() * (i + 1))
    ;[lista[i], lista[j]] = [lista[j], lista[i]]
  }
  cache = lista
  return lista
}

const FAROS: [number, number, number] = [255, 236, 190]
const LUCES_TRASERAS: [number, number, number] = [255, 70, 50]

/**
 * densidad 0–1 (proporción del pool), tiempo en segundos de simulación.
 * Los datos se recortan solo cuando cambia la densidad (cambio de acto u hora), no en cada cuadro.
 */
export function capaTransito(datos: Viaje[], tiempo: number, opacidad = 1) {
  return new TripsLayer<Viaje>({
    id: 'transito',
    data: datos,
    getPath: (d) => d.path,
    getTimestamps: (d) => d.timestamps,
    getColor: (d) => (d.ida ? FAROS : LUCES_TRASERAS),
    opacity: 0.85 * opacidad,
    widthMinPixels: 3,
    widthMaxPixels: 5,
    getWidth: 6,
    capRounded: true,
    jointRounded: true,
    fadeTrail: true,
    trailLength: 14,
    currentTime: tiempo % BUCLE,
  })
}

/** Factor de tránsito según el clima: con lluvia sale menos gente; con tormenta, menos aún. */
export function factorClima(clima: string, hora: number): { cantidad: number; velocidad: number } {
  const dia = hora >= 7 && hora <= 20
  switch (clima) {
    case 'lluvia':
      return { cantidad: dia ? 0.72 : 0.9, velocidad: 0.7 }
    case 'tormenta':
      return { cantidad: dia ? 0.6 : 0.8, velocidad: 0.55 }
    case 'niebla':
      return { cantidad: 0.85, velocidad: 0.6 }
    default:
      return { cantidad: 1, velocidad: 1 }
  }
}
