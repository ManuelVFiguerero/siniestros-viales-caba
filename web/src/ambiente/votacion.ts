// Votación en vivo del público: cada celular abre votar.html (por QR) y publica su voto en ntfy.sh,
// un servicio público de mensajes sin cuenta ni servidor propio. La presentación escucha el mismo
// "tema" por Server-Sent Events y cuenta en tiempo real. Un voto por celular (se puede cambiar).
import { useCallback, useEffect, useState } from 'react'

const SERVIDOR = 'https://ntfy.sh'
/** Donde está publicada la web (GitHub Pages). Si la presentación ya corre ahí, se usa su propia dirección. */
const WEB_PUBLICA = 'https://manuelvfiguerero.github.io/siniestros-viales-caba/'
const CLAVE = 'rvcaba-votacion'

export type Voto = 'mas' | 'menos'

interface Sesion {
  tema: string
  desde: number // segundos unix: votos anteriores no cuentan
}

function nuevaSesion(): Sesion {
  const azar = Array.from(crypto.getRandomValues(new Uint8Array(8)), (b) => (b % 36).toString(36)).join('')
  return { tema: `rvcaba-${azar}`, desde: Math.floor(Date.now() / 1000) - 5 }
}

function leerSesion(): Sesion {
  try {
    const s = JSON.parse(localStorage.getItem(CLAVE) ?? 'null') as Sesion | null
    // Una sesión dura 12 h: alcanza para la presentación y evita votos viejos.
    if (s && Date.now() / 1000 - s.desde < 12 * 3600) return s
  } catch {
    // almacenamiento no disponible: sesión solo en memoria
  }
  const s = nuevaSesion()
  guardar(s)
  return s
}

function guardar(s: Sesion) {
  try {
    localStorage.setItem(CLAVE, JSON.stringify(s))
  } catch {
    // sin almacenamiento: no pasa nada
  }
}

/**
 * La página de voto tiene que poder abrirse desde un celular. Si la presentación corre en una dirección
 * pública o de la red local (npm run dev -- --host), se usa esa; si corre en localhost o con doble clic
 * (file://), el QR apunta a la copia publicada en GitHub Pages.
 */
export function urlDeVoto(tema: string): string {
  const local = /^(localhost|127\.|\[?::1\]?$|0\.0\.0\.0)/.test(location.hostname)
  const base = location.protocol.startsWith('http') && !local ? new URL('./', location.href).href : WEB_PUBLICA
  return `${base}votar.html#${tema}`
}

export interface EstadoVotacion {
  tema: string
  url: string
  mas: number
  menos: number
  total: number
  conexion: 'conectando' | 'ok' | 'error'
  reiniciar: () => void
}

/** activo = false: no abre la conexión (se usa solo en el acto de la votación y el de la revelación). */
export function useVotacion(activo: boolean): EstadoVotacion {
  const [sesion, setSesion] = useState<Sesion>(leerSesion)
  const [votos, setVotos] = useState<Map<string, Voto>>(() => new Map())
  const [conexion, setConexion] = useState<EstadoVotacion['conexion']>('conectando')

  useEffect(() => {
    if (!activo) return
    setConexion('conectando')
    const fuente = new EventSource(`${SERVIDOR}/${sesion.tema}/sse?since=${sesion.desde}`)
    fuente.onopen = () => setConexion('ok')
    fuente.onerror = () => setConexion((c) => (c === 'ok' ? 'conectando' : 'error'))
    fuente.onmessage = (e) => {
      try {
        const m = JSON.parse(e.data) as { event?: string; message?: string }
        if (m.event !== 'message' || !m.message) return
        const { v, id } = JSON.parse(m.message) as { v?: string; id?: string }
        if ((v !== 'mas' && v !== 'menos') || !id) return
        setVotos((prev) => {
          if (prev.get(id) === v) return prev
          const sig = new Map(prev)
          sig.set(id, v)
          return sig
        })
        setConexion('ok')
      } catch {
        // mensaje ajeno al formato: se ignora
      }
    }
    return () => fuente.close()
  }, [activo, sesion])

  const reiniciar = useCallback(() => {
    const s = nuevaSesion()
    guardar(s)
    setVotos(new Map())
    setSesion(s)
  }, [])

  let mas = 0
  let menos = 0
  for (const v of votos.values()) {
    if (v === 'mas') mas++
    else menos++
  }
  return { tema: sesion.tema, url: urlDeVoto(sesion.tema), mas, menos, total: mas + menos, conexion, reiniciar }
}
