// Modo en vivo: hora actual de Buenos Aires y clima pronosticado por Open-Meteo para cada hora.
import { useEffect, useState } from 'react'

const TZ = 'America/Argentina/Buenos_Aires'
// Mismas variables que el entrenamiento (pipeline/config.py), del centro geográfico de CABA.
const URL_PRONOSTICO =
  'https://api.open-meteo.com/v1/forecast?latitude=-34.615&longitude=-58.445' +
  '&hourly=weather_code,precipitation,temperature_2m,relative_humidity_2m,wind_speed_10m,wind_gusts_10m,cloud_cover' +
  `&timezone=${encodeURIComponent(TZ)}&forecast_days=2`

export interface Ahora {
  dia: number // 0 = lunes
  hora: number
  minuto: number
  /** "YYYY-MM-DDTHH:00" en hora local, el mismo formato que devuelve Open-Meteo. */
  claveHora: string
}

const DIAS_EN = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

export function ahoraBA(fecha = new Date()): Ahora {
  const partes = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone: TZ, weekday: 'short', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
    })
      .formatToParts(fecha)
      .map((p) => [p.type, p.value]),
  )
  const hora = Number(partes.hour) % 24
  return {
    dia: DIAS_EN.indexOf(partes.weekday),
    hora,
    minuto: Number(partes.minute),
    claveHora: `${partes.year}-${partes.month}-${partes.day}T${String(hora).padStart(2, '0')}:00`,
  }
}

/** Reloj de Buenos Aires que se actualiza cada 20 s (alcanza para cambiar de hora a tiempo). */
export function useAhoraBA(): Ahora {
  const [ahora, setAhora] = useState(() => ahoraBA())
  useEffect(() => {
    const t = setInterval(() => {
      const n = ahoraBA()
      setAhora((a) => (a.claveHora === n.claveHora && a.minuto === n.minuto ? a : n))
    }, 20_000)
    return () => clearInterval(t)
  }, [])
  return ahora
}

export interface HoraPronostico {
  clave: string
  dia: number
  hora: number
  condicion: string
  precipitacion: number
  temperatura: number
  rafagas: number
}

export type EstadoPronostico =
  | { estado: 'cargando' }
  | { estado: 'error' }
  | { estado: 'ok'; horas: HoraPronostico[]; actualizado: Date }

/** Misma clasificación que pipeline/clima.py, para que "lluvia" signifique lo mismo que en el entrenamiento. */
export function clasificar(code: number, pp: number, hum: number, viento: number, rafagas: number, nubes: number): string {
  if ((code >= 95 && code <= 99) || pp >= 4 || (pp >= 1 && rafagas >= 55)) return 'tormenta'
  if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82) || pp >= 0.5) return 'lluvia'
  if (code === 45 || code === 48 || (hum >= 97 && viento < 8 && pp === 0)) return 'niebla'
  if (code === 3 || nubes >= 70) return 'nublado'
  return 'despejado'
}

interface RespuestaOpenMeteo {
  hourly: {
    time: string[]
    weather_code: number[]
    precipitation: number[]
    temperature_2m: number[]
    relative_humidity_2m: number[]
    wind_speed_10m: number[]
    wind_gusts_10m: number[]
    cloud_cover: number[]
  }
}

async function descargarPronostico(): Promise<HoraPronostico[]> {
  const resp = await fetch(URL_PRONOSTICO)
  if (!resp.ok) throw new Error(`Open-Meteo ${resp.status}`)
  const { hourly: h } = (await resp.json()) as RespuestaOpenMeteo
  return h.time.map((clave, i) => {
    // La fecha local ya viene en hora de Buenos Aires: el día de la semana sale de la fecha calendario.
    const [y, m, d] = clave.slice(0, 10).split('-').map(Number)
    const dow = (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7
    return {
      clave,
      dia: dow,
      hora: Number(clave.slice(11, 13)),
      condicion: clasificar(
        h.weather_code[i], h.precipitation[i] ?? 0, h.relative_humidity_2m[i], h.wind_speed_10m[i], h.wind_gusts_10m[i], h.cloud_cover[i],
      ),
      precipitacion: h.precipitation[i] ?? 0,
      temperatura: h.temperature_2m[i],
      rafagas: h.wind_gusts_10m[i],
    }
  })
}

/** Pronóstico horario, renovado cada 15 minutos. Si falla, se reintenta en la próxima vuelta. */
export function usePronostico(): EstadoPronostico {
  const [estado, setEstado] = useState<EstadoPronostico>({ estado: 'cargando' })
  useEffect(() => {
    let vivo = true
    const cargar = () =>
      descargarPronostico()
        .then((horas) => vivo && setEstado({ estado: 'ok', horas, actualizado: new Date() }))
        .catch(() => vivo && setEstado((e) => (e.estado === 'ok' ? e : { estado: 'error' })))
    cargar()
    const t = setInterval(cargar, 15 * 60_000)
    return () => {
      vivo = false
      clearInterval(t)
    }
  }, [])
  return estado
}
