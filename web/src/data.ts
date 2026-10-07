// Tipos y carga de los JSON generados por pipeline/04_exportar_web.py

export interface Siniestros {
  dicts: { condicion: string[]; gravedad: string[]; modo: string[] }
  lon: number[]
  lat: number[]
  anio: number[]
  hora: number[]
  dia_semana: number[]
  condicion: number[]
  gravedad: number[]
  modo: number[]
}

export interface StatCondicion {
  condicion: string
  siniestros: number
  horas: number
  esperados: number
  riesgo_relativo: number
}

export interface Stats {
  total: number
  desde: string
  hasta: string
  por_condicion: StatCondicion[]
}

export interface Filtros {
  condiciones: Set<number>
  gravedades: Set<number>
  horaDesde: number
  horaHasta: number
  anio: number | null
  modo: number | null
}

export const ETIQUETA_CONDICION: Record<string, { label: string; icon: string }> = {
  despejado: { label: 'Despejado', icon: '☀️' },
  nublado: { label: 'Nublado', icon: '☁️' },
  lluvia: { label: 'Lluvia', icon: '🌧️' },
  tormenta: { label: 'Tormenta', icon: '⛈️' },
  niebla: { label: 'Niebla', icon: '🌫️' },
}

// Peso de cada gravedad cuando se pondera el mapa (leve, grave, mortal).
export const PESO_GRAVEDAD = [1, 4, 12]

export async function cargarDatos(): Promise<{ siniestros: Siniestros; stats: Stats }> {
  const base = import.meta.env.BASE_URL
  const [siniestros, stats] = await Promise.all([
    fetch(`${base}data/siniestros.json`).then((r) => r.json()),
    fetch(`${base}data/stats.json`).then((r) => r.json()),
  ])
  return { siniestros, stats }
}

export function filtrar(d: Siniestros, f: Filtros): number[] {
  const out: number[] = []
  for (let i = 0; i < d.lon.length; i++) {
    if (!f.condiciones.has(d.condicion[i])) continue
    if (!f.gravedades.has(d.gravedad[i])) continue
    const h = d.hora[i]
    // Rango que cruza la medianoche (ej. 22 -> 5) se interpreta como franja nocturna.
    const enFranja = f.horaDesde <= f.horaHasta ? h >= f.horaDesde && h <= f.horaHasta : h >= f.horaDesde || h <= f.horaHasta
    if (!enFranja) continue
    if (f.anio !== null && d.anio[i] !== f.anio) continue
    if (f.modo !== null && d.modo[i] !== f.modo) continue
    out.push(i)
  }
  return out
}
