// Tipos y carga de los JSON generados por el pipeline (pasos 04, 07 y 08).
import type { RiesgoJSON } from './riesgo'

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

export const ETIQUETA_CONDICION: Record<string, string> = {
  despejado: 'Despejado',
  nublado: 'Nublado',
  lluvia: 'Lluvia',
  tormenta: 'Tormenta',
  niebla: 'Niebla',
}

// Peso de cada gravedad cuando se pondera el mapa (leve, grave, mortal).
export const PESO_GRAVEDAD = [1, 4, 12]

// ---------- modelo (pipeline/07_entrenar_modelos.py) ----------

export interface Metrica {
  modelo: string
  d2: number
  auc: number
  ap: number
  captura_1: number
  captura_5: number
  captura_10: number
  calibracion: number
  segundos: number | null
}

export interface Modelo {
  periodo: { train: string; test: string; validacion_early_stopping: string }
  datos: { filas: number; celda_horas: number; siniestros: number; siniestros_test: number; celdas: number; peso_ceros: number }
  lgbm: { arboles: number; arboles_final: number; learning_rate: number; num_leaves: number }
  metricas: Metrica[]
  curva_captura: { x: number[]; series: Record<string, number[]> }
  shap: {
    grupos: { grupo: string; share: number }[]
    grupos_lluvia: { grupo: string; share: number }[]
    n_muestra: number
    n_lluvia: number
    variables: { variable: string; etiqueta: string; grupo: string; valor: number }[]
    efecto_hora: number[]
    efecto_dia: number[]
    efecto_lluvia: { rango: string; efecto: number; n: number }[]
    efecto_lluvia_3h: { rango: string; efecto: number; n: number }[]
  }
  poisson_irr: { variable: string; etiqueta: string; irr: number }[]
}

// Los datos se empaquetan dentro del bundle (no se hace fetch) para que el index.html
// final funcione abriéndolo con doble clic, sin servidor.
export async function cargarDatos(): Promise<{ siniestros: Siniestros; stats: Stats }> {
  const [siniestros, stats] = await Promise.all([import('./data/siniestros.json'), import('./data/stats.json')])
  return { siniestros: siniestros.default as Siniestros, stats: stats.default as Stats }
}

export async function cargarModelo(): Promise<{ riesgo: RiesgoJSON; modelo: Modelo }> {
  const [riesgo, modelo] = await Promise.all([import('./data/riesgo.json'), import('./data/modelo.json')])
  return { riesgo: riesgo.default as unknown as RiesgoJSON, modelo: modelo.default as unknown as Modelo }
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
