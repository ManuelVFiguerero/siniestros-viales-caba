import { useMemo, useRef, useState, type ReactNode } from 'react'
import { HexagonLayer } from '@deck.gl/aggregation-layers'
import { BitmapLayer } from '@deck.gl/layers'
import type { PickingInfo } from '@deck.gl/core'
import type { MapRef } from 'react-map-gl/maplibre'

import { debajoDe, MapaBase } from '../components/MapaBase'
import { RiskChart } from '../components/RiskChart'
import { TiraHoraria } from '../components/TiraHoraria'
import { ETIQUETA_CONDICION, filtrar, PESO_GRAVEDAD, type Filtros, type Siniestros, type Stats } from '../data'
import { colorEn, fmtNum, GRADIENTE_CSS } from '../riesgo'
import { acumular, densidad, LIMITES } from '../superficie'

const RAMPA = [0.05, 0.25, 0.45, 0.6, 0.75, 0.88, 1].map((x) => colorEn(x))

type Vista = 'calor' | 'hexagonos'

interface Props {
  siniestros: Siniestros
  stats: Stats
  cabecera: ReactNode
}

export function Historico({ siniestros: s, stats, cabecera }: Props) {
  const [vista, setVista] = useState<Vista>('calor')
  const mapRef = useRef<MapRef>(null)
  const [ponderar, setPonderar] = useState(false)
  const [hover, setHover] = useState<{ x: number; y: number; v: number } | null>(null)
  const [filtros, setFiltros] = useState<Filtros>({
    condiciones: new Set([0, 1, 2, 3, 4]),
    gravedades: new Set([0, 1, 2]),
    horaDesde: 0,
    horaHasta: 23,
    anio: null,
    modo: null,
  })

  const indices = useMemo(() => filtrar(s, filtros), [s, filtros])
  const porHora = useMemo(() => {
    const c = new Array(24).fill(0)
    for (const i of indices) c[s.hora[i]]++
    return c
  }, [s, indices])

  const calor = useMemo(
    () => (vista === 'calor' ? densidad(acumular(indices.length, (k) => s.lon[indices[k]], (k) => s.lat[indices[k]], (k) => (ponderar ? PESO_GRAVEDAD[s.gravedad[indices[k]]] : 1))) : null),
    [vista, indices, s, ponderar],
  )

  const pos = (i: number): [number, number] => [s.lon[i], s.lat[i]]
  const peso = (i: number) => (ponderar ? PESO_GRAVEDAD[s.gravedad[i]] : 1)

  const capas = (antesDe: string | undefined) =>
    vista === 'calor'
      ? [
          new BitmapLayer({
            id: 'calor',
            image: calor,
            bounds: LIMITES,
            ...debajoDe(antesDe),
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
            colorScaleType: 'quantile',
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

  const cambiarVista = (v: Vista) => {
    setVista(v)
    mapRef.current?.easeTo(v === 'hexagonos' ? { pitch: 50, bearing: -20, duration: 900 } : { pitch: 0, bearing: 0, duration: 700 })
  }

  const toggle = (key: 'condiciones' | 'gravedades', v: number) =>
    setFiltros((f) => {
      const next = new Set(f[key])
      if (next.has(v)) next.delete(v)
      else next.add(v)
      return { ...f, [key]: next }
    })

  const anios = [...new Set(s.anio)].sort()
  const mortales = indices.reduce((n, i) => n + (s.gravedad[i] === 2 ? 1 : 0), 0)
  const cap = (t: string) => t.charAt(0) + t.slice(1).toLowerCase()

  const alPasar = (info: PickingInfo) => {
    const o = info.object as { colorValue?: number; count?: number } | undefined
    const n = o ? { x: info.x, y: info.y, v: o.colorValue ?? o.count ?? 0 } : null
    // Igual que en el riesgo: no cambiar el estado si el hover es el mismo (evita un bucle de renders).
    setHover((h) => (h === n || (h && n && h.x === n.x && h.y === n.y && h.v === n.v) ? h : n))
  }


  return (
    <>
      <aside className="side">
        {cabecera}
        <div className="side-body">
          <section className="block">
            <p className="kicker">Siniestros registrados · {stats.desde.slice(0, 4)}–{stats.hasta.slice(0, 4)}</p>
            <p className="hero-num">{fmtNum(indices.length)}</p>
            <p className="hint flush">con los filtros actuales · {fmtNum(mortales)} mortales</p>
          </section>

          <section className="block">
            <p className="kicker">Representación</p>
            <div className="seg seg-2">
              <button className={vista === 'calor' ? 'on' : ''} onClick={() => cambiarVista('calor')}>Densidad</button>
              <button className={vista === 'hexagonos' ? 'on' : ''} onClick={() => cambiarVista('hexagonos')}>Columnas 3D</button>
            </div>
            <label className="check">
              <input type="checkbox" checked={ponderar} onChange={(e) => setPonderar(e.target.checked)} />
              Ponderar por gravedad (grave ×4, mortal ×12)
            </label>
          </section>

          <section className="block">
            <p className="kicker">Clima en la hora del hecho</p>
            <div className="chips">
              {s.dicts.condicion.map((c, i) => (
                <button key={c} className={`chip${filtros.condiciones.has(i) ? ' on' : ''}`} onClick={() => toggle('condiciones', i)} aria-pressed={filtros.condiciones.has(i)}>
                  {ETIQUETA_CONDICION[c]}
                </button>
              ))}
            </div>
          </section>

          <section className="block">
            <p className="kicker">Gravedad</p>
            <div className="chips">
              {s.dicts.gravedad.map((g, i) => (
                <button key={g} className={`chip${filtros.gravedades.has(i) ? ' on' : ''}`} onClick={() => toggle('gravedades', i)} aria-pressed={filtros.gravedades.has(i)}>
                  {cap(g)}
                </button>
              ))}
            </div>
          </section>

          <section className="block">
            <div className="kicker-row">
              <p className="kicker">Franja horaria</p>
              <span className="mono-note">
                {String(filtros.horaDesde).padStart(2, '0')}:00–{String(filtros.horaHasta).padStart(2, '0')}:59
              </span>
            </div>
            <div className="range">
              <input type="range" min={0} max={23} value={filtros.horaDesde} onChange={(e) => setFiltros((f) => ({ ...f, horaDesde: +e.target.value }))} aria-label="Hora desde" />
              <input type="range" min={0} max={23} value={filtros.horaHasta} onChange={(e) => setFiltros((f) => ({ ...f, horaHasta: +e.target.value }))} aria-label="Hora hasta" />
            </div>
          </section>

          <section className="block selects">
            <label>
              <span className="kicker">Año</span>
              <select value={filtros.anio ?? ''} onChange={(e) => setFiltros((f) => ({ ...f, anio: e.target.value ? +e.target.value : null }))}>
                <option value="">Todos</option>
                {anios.map((a) => (
                  <option key={a}>{a}</option>
                ))}
              </select>
            </label>
            <label>
              <span className="kicker">Víctima</span>
              <select value={filtros.modo ?? ''} onChange={(e) => setFiltros((f) => ({ ...f, modo: e.target.value ? +e.target.value : null }))}>
                <option value="">Todas</option>
                {s.dicts.modo.map((m, i) => (
                  <option key={m} value={i}>
                    {cap(m)}
                  </option>
                ))}
              </select>
            </label>
          </section>

          <section className="block">
            <p className="kicker">Siniestros por hora del día</p>
            <TiraHoraria valores={porHora} hora={-1} onHora={() => {}} unidad="siniestros" decimales={0} />
          </section>

          <section className="block">
            <p className="kicker">Riesgo relativo según el clima</p>
            <RiskChart datos={stats.por_condicion} />
          </section>
        </div>
        <footer className="side-foot">
          Datos: <a href="https://data.buenosaires.gob.ar/dataset/victimas-siniestros-viales" target="_blank" rel="noreferrer">BA Data</a> · Clima:{' '}
          <a href="https://open-meteo.com/" target="_blank" rel="noreferrer">Open-Meteo</a> (ERA5)
        </footer>
      </aside>

      <main className="stage">
        <MapaBase mapRef={mapRef} layers={capas} onHover={alPasar} />
        <div className="legend">
          <div className="legend-head">
            <span>{ponderar ? 'Gravedad acumulada' : 'Concentración de siniestros'}</span>
          </div>
          <div className="legend-bar" style={{ background: GRADIENTE_CSS }} />
          <div className="legend-ends">
            <span>Baja</span>
            <span>Alta</span>
          </div>
        </div>
        {hover && vista === 'hexagonos' && (
          <div className="map-tip" style={{ left: hover.x, top: hover.y }}>
            <strong>{fmtNum(hover.v)}</strong>
            <span>{ponderar ? 'puntos de gravedad' : 'siniestros'} en ~350 m</span>
          </div>
        )}
      </main>
    </>
  )
}
