import { useEffect, useState } from 'react'

import { cargarDatos, cargarModelo, type Modelo, type Patrones as PatronesData, type Siniestros, type Stats } from './data'
import { decodificar, type Riesgo } from './riesgo'
import { RiesgoPrevisto } from './vistas/RiesgoPrevisto'
import { Historico } from './vistas/Historico'
import { ModeloInforme } from './vistas/ModeloInforme'
import { Patrones, type DestinoMapa } from './vistas/Patrones'

type Pestania = 'riesgo' | 'patrones' | 'historico' | 'modelo'

const PESTANIAS: { k: Pestania; t: string }[] = [
  { k: 'riesgo', t: 'Riesgo' },
  { k: 'patrones', t: 'Patrones' },
  { k: 'historico', t: 'Histórico' },
  { k: 'modelo', t: 'Modelo' },
]

interface Datos {
  riesgo: Riesgo
  modelo: Modelo
  patrones: PatronesData
  siniestros: Siniestros
  stats: Stats
}

function pestaniaInicial(): Pestania {
  const h = window.location.hash.slice(1)
  return h === 'historico' || h === 'modelo' || h === 'patrones' ? h : 'riesgo'
}

export default function App() {
  const [datos, setDatos] = useState<Datos | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pestania, setPestania] = useState<Pestania>(pestaniaInicial)
  // Escenario al que saltar desde un patrón; la clave fuerza a la vista de riesgo a arrancar en ese momento.
  const [destino, setDestino] = useState<{ d: DestinoMapa; clave: number } | null>(null)

  useEffect(() => {
    Promise.all([cargarModelo(), cargarDatos()])
      .then(([m, h]) => setDatos({ riesgo: decodificar(m.riesgo), modelo: m.modelo, patrones: m.patrones, ...h }))
      .catch((e) => setError(String(e)))
  }, [])

  const ir = (p: Pestania) => {
    if (p === 'riesgo') setDestino(null)
    setPestania(p)
    history.replaceState(null, '', p === 'riesgo' ? ' ' : `#${p}`)
  }

  if (error) return <div className="loading">No se pudieron cargar los datos: {error}</div>
  if (!datos) return <div className="loading">Cargando…</div>

  const cabecera = (
    <header className="brand">
      <div className="brand-row">
        <svg className="brand-mark" viewBox="0 0 24 24" aria-hidden>
          <path d="M12 2.5 20.2 7.25v9.5L12 21.5 3.8 16.75v-9.5Z" fill="none" stroke="currentColor" strokeWidth="1.6" />
          <path d="M12 7.6 16.2 10v4.8L12 17.2 7.8 14.8V10Z" fill="#d73027" />
        </svg>
        <div>
          <p className="brand-name">Riesgo vial CABA</p>
          <p className="brand-sub">Siniestros con víctimas × clima · 2019–2025</p>
        </div>
      </div>
      <nav className="tabs" role="tablist">
        {PESTANIAS.map(({ k, t }) => (
          <button key={k} role="tab" aria-selected={pestania === k} className={pestania === k ? 'on' : ''} onClick={() => ir(k)}>
            {t}
          </button>
        ))}
      </nav>
    </header>
  )

  return (
    <div className={`shell tab-${pestania}`}>
      {pestania === 'riesgo' && <RiesgoPrevisto key={destino?.clave ?? 0} riesgo={datos.riesgo} cabecera={cabecera} inicial={destino?.d} />}
      {pestania === 'patrones' && (
        <Patrones
          datos={datos.patrones}
          cabecera={cabecera}
          onMapa={(d) => {
            setDestino({ d, clave: Date.now() })
            setPestania('riesgo')
            history.replaceState(null, '', ' ')
          }}
        />
      )}
      {pestania === 'historico' && <Historico siniestros={datos.siniestros} stats={datos.stats} cabecera={cabecera} />}
      {pestania === 'modelo' && <ModeloInforme modelo={datos.modelo} cabecera={cabecera} />}
    </div>
  )
}
