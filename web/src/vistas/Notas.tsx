// Ventana de notas del orador (tecla N en la historia). Se abre aparte para tenerla en la notebook
// mientras el proyector muestra la historia; las dos ventanas se hablan con postMessage.
import { useEffect, useState } from 'react'
import { GUION } from './guion'

export const CANAL = 'rvcaba-notas'

export interface MensajeNotas {
  canal: typeof CANAL
  tipo: 'estado' | 'ir' | 'hola'
  acto?: number
  /** ms (Date.now()) en que empezó la presentación y en que se entró al acto actual. */
  inicio?: number
  entrada?: number
}

const mmss = (ms: number) => {
  const s = Math.max(0, Math.floor(ms / 1000))
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
}

export function Notas() {
  const [estado, setEstado] = useState<{ acto: number; inicio?: number; entrada?: number } | null>(null)
  const [ahora, setAhora] = useState(() => Date.now())
  const principal = window.opener as Window | null

  useEffect(() => {
    document.title = 'Notas · Riesgo vial CABA'
    const alMensaje = (e: MessageEvent<MensajeNotas>) => {
      if (e.data?.canal !== CANAL || e.data.tipo !== 'estado') return
      setEstado({ acto: e.data.acto ?? 0, inicio: e.data.inicio, entrada: e.data.entrada })
    }
    window.addEventListener('message', alMensaje)
    principal?.postMessage({ canal: CANAL, tipo: 'hola' } satisfies MensajeNotas, '*')
    const t = setInterval(() => setAhora(Date.now()), 500)
    return () => {
      window.removeEventListener('message', alMensaje)
      clearInterval(t)
    }
  }, [principal])

  const ir = (acto: number) => principal?.postMessage({ canal: CANAL, tipo: 'ir', acto } satisfies MensajeNotas, '*')

  useEffect(() => {
    const alTeclear = (e: KeyboardEvent) => {
      if (!estado) return
      if (['ArrowRight', 'ArrowDown', 'PageDown', ' '].includes(e.key)) {
        e.preventDefault()
        ir(estado.acto + 1)
      } else if (['ArrowLeft', 'ArrowUp', 'PageUp'].includes(e.key)) {
        e.preventDefault()
        ir(estado.acto - 1)
      }
    }
    window.addEventListener('keydown', alTeclear)
    return () => window.removeEventListener('keydown', alTeclear)
  })

  if (!principal) {
    return <div className="loading">Abrí esta ventana con la tecla N desde la historia.</div>
  }
  if (!estado) return <div className="loading">Conectando con la presentación…</div>

  const g = GUION[estado.acto]
  const sig = GUION[estado.acto + 1]
  const enActo = estado.entrada ? ahora - estado.entrada : 0
  const pasado = enActo > g.segundos * 1000
  const objetivoTotal = GUION.reduce((s, x) => s + x.segundos, 0)

  return (
    <div className="notas">
      <header className="notas-cab">
        <div>
          <p className="kicker">Acto {estado.acto} de {GUION.length - 1}</p>
          <h1>{g.nombre}</h1>
        </div>
        <div className="notas-relojes">
          <div>
            <span>Total</span>
            <strong>{estado.inicio ? mmss(ahora - estado.inicio) : '00:00'}</strong>
            <small>objetivo {mmss(objetivoTotal * 1000)}</small>
          </div>
          <div className={pasado ? 'pasado' : ''}>
            <span>Este acto</span>
            <strong>{mmss(enActo)}</strong>
            <small>sugerido {mmss(g.segundos * 1000)}</small>
          </div>
          <div>
            <span>Hora</span>
            <strong>{new Date(ahora).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })}</strong>
          </div>
        </div>
      </header>
      {/* Los actos técnicos tienen muchas notas: letra más chica para que entren sin tanto scroll. */}
      <ul className={`notas-lista${g.notas.length > 6 ? ' densa' : ''}`}>
        {g.notas.map((n) => (
          <li key={n}>{n}</li>
        ))}
      </ul>
      <footer className="notas-pie">
        <button onClick={() => ir(estado.acto - 1)} disabled={estado.acto === 0}>← Anterior</button>
        <p>{sig ? <>Sigue: <b>{sig.nombre}</b></> : 'Último acto'}</p>
        <button onClick={() => ir(estado.acto + 1)} disabled={!sig}>Siguiente →</button>
      </footer>
      <ol className="notas-mapa">
        {GUION.slice(1).map((x, k) => (
          <li key={x.id} className={k + 1 === estado.acto ? 'on' : k + 1 < estado.acto ? 'visto' : ''}>
            <button onClick={() => ir(k + 1)}>{k + 1}. {x.nombre}</button>
          </li>
        ))}
      </ol>
    </div>
  )
}
