import { useEffect, useMemo, useState } from 'react'
import DeckGL from '@deck.gl/react'
import { HeatmapLayer, HexagonLayer } from '@deck.gl/aggregation-layers'
import { Map } from 'react-map-gl/maplibre'
import maplibregl from 'maplibre-gl'
import maplibreWorker from 'maplibre-gl/dist/maplibre-gl-csp-worker.js?raw'
import 'maplibre-gl/dist/maplibre-gl.css'

import { cargarDatos, ETIQUETA_CONDICION, filtrar, PESO_GRAVEDAD, type Filtros, type Siniestros, type Stats } from './data'
import { RiskChart } from './components/RiskChart'
import { HourChart } from './components/HourChart'

// El worker de MapLibre se incrusta como blob para que funcione dentro del index.html único (incluso con file://).
maplibregl.setWorkerUrl(URL.createObjectURL(new Blob([maplibreWorker], { type: 'text/javascript' })))

const ESTILO_MAPA = 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json'
const VISTA_INICIAL = { longitude: -58.445, latitude: -34.615, zoom: 11.3, pitch: 0, bearing: 0 }

// Rampa secuencial de un solo tono (naranja), de oscuro (poca densidad, se funde con el mapa) a claro.
const RAMPA: [number, number, number][] = [
  [59, 20, 8],
  [110, 38, 15],
  [166, 58, 20],
  [217, 89, 38],
  [240, 138, 93],
  [255, 201, 173],
]

type Vista = 'calor' | 'hexagonos'

export default function App() {
  const [datos, setDatos] = useState<{ siniestros: Siniestros; stats: Stats } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [vista, setVista] = useState<Vista>('calor')
  const [ponderar, setPonderar] = useState(false)
  const [filtros, setFiltros] = useState<Filtros>({
    condiciones: new Set([0, 1, 2, 3, 4]),
    gravedades: new Set([0, 1, 2]),
    horaDesde: 0,
    horaHasta: 23,
    anio: null,
    modo: null,
  })

  useEffect(() => {
    cargarDatos().then(setDatos).catch((e) => setError(String(e)))
  }, [])

  const indices = useMemo(() => (datos ? filtrar(datos.siniestros, filtros) : []), [datos, filtros])

  if (error) return <div className="loading">No se pudieron cargar los datos: {error}</div>
  if (!datos) return <div className="loading">Cargando siniestros…</div>

  const { siniestros: s, stats } = datos
  const pos = (i: number): [number, number] => [s.lon[i], s.lat[i]]
  const peso = (i: number) => (ponderar ? PESO_GRAVEDAD[s.gravedad[i]] : 1)

  const layers =
    vista === 'calor'
      ? [
          new HeatmapLayer<number>({
            id: 'calor',
            data: indices,
            getPosition: pos,
            getWeight: peso,
            radiusPixels: 22,
            intensity: 0.9,
            threshold: 0.08,
            opacity: 0.9,
            colorRange: RAMPA,
            updateTriggers: { getWeight: ponderar },
          }),
        ]
      : [
          new HexagonLayer<number>({
            id: 'hexagonos',
            data: indices,
            getPosition: pos,
            getColorWeight: peso,
            getElevationWeight: peso,
            colorAggregation: 'SUM',
            elevationAggregation: 'SUM',
            radius: 180,
            extruded: true,
            elevationScale: 6,
            coverage: 0.88,
            colorRange: RAMPA,
            pickable: true,
            gpuAggregation: false,
            material: { ambient: 0.6, diffuse: 0.6, shininess: 20 },
            updateTriggers: { getColorWeight: ponderar, getElevationWeight: ponderar },
          }),
        ]

  const toggle = (key: 'condiciones' | 'gravedades', v: number) =>
    setFiltros((f) => {
      const next = new Set(f[key])
      if (next.has(v)) next.delete(v)
      else next.add(v)
      return { ...f, [key]: next }
    })

  const anios = [...new Set(s.anio)].sort()
  const mortales = indices.reduce((n, i) => n + (s.gravedad[i] === 2 ? 1 : 0), 0)

  return (
    <div className="app">
      <DeckGL
        initialViewState={vista === 'hexagonos' ? { ...VISTA_INICIAL, pitch: 50, bearing: -20 } : VISTA_INICIAL}
        controller
        layers={layers}
        getTooltip={({ object }) =>
          object && vista === 'hexagonos'
            ? {
                html: `<strong>${(object.colorValue ?? object.count ?? 0).toLocaleString('es-AR')}</strong> ${ponderar ? 'puntos de gravedad' : 'siniestros'}`,
                className: 'deck-tooltip',
              }
            : null
        }
      >
        {/* mapLib explícito: el import dinámico por defecto no funciona en el bundle de un solo archivo */}
        <Map mapLib={maplibregl} mapStyle={ESTILO_MAPA} attributionControl={{ compact: true }} />
      </DeckGL>

      <aside className="panel panel-left">
        <header>
          <p className="eyebrow">Ciudad de Buenos Aires · {stats.desde.slice(0, 4)}–{stats.hasta.slice(0, 4)}</p>
          <h1>¿Dónde y con qué clima ocurren los siniestros viales?</h1>
        </header>

        <div className="hero">
          <span className="hero-value">{indices.length.toLocaleString('es-AR')}</span>
          <span className="hero-label">
            siniestros con los filtros actuales · {mortales.toLocaleString('es-AR')} mortales
          </span>
        </div>

        <section>
          <h2>Vista</h2>
          <div className="segmented">
            <button className={vista === 'calor' ? 'on' : ''} onClick={() => setVista('calor')}>
              Mapa de calor
            </button>
            <button className={vista === 'hexagonos' ? 'on' : ''} onClick={() => setVista('hexagonos')}>
              Hexágonos 3D
            </button>
          </div>
          <label className="check">
            <input type="checkbox" checked={ponderar} onChange={(e) => setPonderar(e.target.checked)} />
            Ponderar por gravedad (grave ×4, mortal ×12)
          </label>
        </section>

        <section>
          <h2>Clima</h2>
          <div className="chips">
            {s.dicts.condicion.map((c, i) => (
              <button key={c} className={`chip${filtros.condiciones.has(i) ? ' on' : ''}`} onClick={() => toggle('condiciones', i)}>
                {ETIQUETA_CONDICION[c].icon} {ETIQUETA_CONDICION[c].label}
              </button>
            ))}
          </div>
        </section>

        <section>
          <h2>Gravedad</h2>
          <div className="chips">
            {s.dicts.gravedad.map((g, i) => (
              <button key={g} className={`chip${filtros.gravedades.has(i) ? ' on' : ''}`} onClick={() => toggle('gravedades', i)}>
                {g.charAt(0) + g.slice(1).toLowerCase()}
              </button>
            ))}
          </div>
        </section>

        <section>
          <h2>
            Franja horaria <span className="muted">{String(filtros.horaDesde).padStart(2, '0')}:00 – {String(filtros.horaHasta).padStart(2, '0')}:59</span>
          </h2>
          <div className="range">
            <input type="range" min={0} max={23} value={filtros.horaDesde} onChange={(e) => setFiltros((f) => ({ ...f, horaDesde: +e.target.value }))} aria-label="Hora desde" />
            <input type="range" min={0} max={23} value={filtros.horaHasta} onChange={(e) => setFiltros((f) => ({ ...f, horaHasta: +e.target.value }))} aria-label="Hora hasta" />
          </div>
        </section>

        <section className="selects">
          <label>
            Año
            <select value={filtros.anio ?? ''} onChange={(e) => setFiltros((f) => ({ ...f, anio: e.target.value ? +e.target.value : null }))}>
              <option value="">Todos</option>
              {anios.map((a) => (
                <option key={a}>{a}</option>
              ))}
            </select>
          </label>
          <label>
            Víctima
            <select value={filtros.modo ?? ''} onChange={(e) => setFiltros((f) => ({ ...f, modo: e.target.value ? +e.target.value : null }))}>
              <option value="">Todas</option>
              {s.dicts.modo.map((m, i) => (
                <option key={m} value={i}>
                  {m.charAt(0) + m.slice(1).toLowerCase()}
                </option>
              ))}
            </select>
          </label>
        </section>
      </aside>

      <aside className="panel panel-right">
        <section>
          <h2>Riesgo relativo según el clima</h2>
          <RiskChart datos={stats.por_condicion} />
        </section>
        <section>
          <h2>Siniestros por hora del día</h2>
          <HourChart horas={s.hora} indices={indices} />
        </section>
        <footer>
          Datos: <a href="https://data.buenosaires.gob.ar/dataset/victimas-siniestros-viales" target="_blank" rel="noreferrer">BA Data</a> ·
          Clima: <a href="https://open-meteo.com/" target="_blank" rel="noreferrer">Open-Meteo</a> (ERA5)
        </footer>
      </aside>
    </div>
  )
}
