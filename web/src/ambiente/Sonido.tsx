import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { paisaje, type EstadoSonoro } from './paisajeSonoro'

interface Ctx {
  activo: boolean
  encender: () => Promise<void>
  apagar: () => void
}

const SonidoCtx = createContext<Ctx>({ activo: false, encender: async () => {}, apagar: () => {} })

export function SonidoProvider({ children }: { children: ReactNode }) {
  const [activo, setActivo] = useState(false)
  const encender = useCallback(async () => {
    await paisaje.iniciar()
    paisaje.setMute(false)
    setActivo(true)
  }, [])
  const apagar = useCallback(() => {
    paisaje.setMute(true)
    setActivo(false)
  }, [])
  const valor = useMemo(() => ({ activo, encender, apagar }), [activo, encender, apagar])
  return <SonidoCtx.Provider value={valor}>{children}</SonidoCtx.Provider>
}

export const useSonido = () => useContext(SonidoCtx)

/** Hace sonar el ambiente que corresponde a la vista (clima, hora, tránsito). */
export function useAmbienteSonoro(estado: EstadoSonoro) {
  const { clima, hora, transito, lluvia, sirena } = estado
  useEffect(() => {
    paisaje.set({ clima, hora, transito, lluvia, sirena })
  }, [clima, hora, transito, lluvia, sirena])
}

export const trueno = (cercania: number) => paisaje.trueno(cercania)

export function BotonSonido({ className = '' }: { className?: string }) {
  const { activo, encender, apagar } = useSonido()
  return (
    <button
      className={`sound-btn${activo ? ' on' : ''} ${className}`}
      onClick={() => (activo ? apagar() : void encender())}
      aria-pressed={activo}
      aria-label={activo ? 'Silenciar el sonido ambiente' : 'Activar el sonido ambiente'}
      title={activo ? 'Silenciar (M)' : 'Activar sonido (M)'}
    >
      <svg viewBox="0 0 20 20" width="16" height="16" aria-hidden>
        <path d="M3 7.5h3l4-3.5v12l-4-3.5H3z" fill="currentColor" />
        {activo ? (
          <>
            <path d="M13 7a4 4 0 0 1 0 6" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            <path d="M15.2 5a7 7 0 0 1 0 10" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </>
        ) : (
          <path d="M13 8l4 4m0-4l-4 4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        )}
      </svg>
      <span>{activo ? 'Sonido' : 'Sin sonido'}</span>
    </button>
  )
}
