import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { BitmapLayer, PolygonLayer } from '@deck.gl/layers'
import type { PickingInfo } from '@deck.gl/core'
import type { MapRef } from 'react-map-gl/maplibre'

import { debajoDe, MapaBase } from '../components/MapaBase'
import { Leyenda } from '../components/Leyenda'
import { FichaCelda } from '../components/FichaCelda'
import { TiraHoraria } from '../components/TiraHoraria'
import {
  colorCss, colorEn, cuantil, DIAS, DIAS_CORTO, escenario, fmtCadaHoras, fmtIndice, fmtNum, hhmm, NOMBRE_CLIMA,
  nombreCelda, posicion, totalCiudad, type Celda, type Dominio, type Riesgo,
} from '../riesgo'
import { interpolar, LIMITES } from '../superficie'

type Representacion = 'hex' | 'continuo' | '3d'
type Escala = 'fija' | 'relativa'

interface Props {
  riesgo: Riesgo
  cabecera: ReactNode
}

export function RiesgoPrevisto({ riesgo, cabecera }: Props) {
  // Escenario inicial: el ejemplo típico de la presentación, viernes 19 h con lluvia.
  const [clima, setClima] = useState(riesgo.climas.indexOf('lluvia'))
  const [dia, setDia] = useState(4)
  const [hora, setHora] = useState(19)
  const [rep, setRep] = useState<Representacion>('hex')
  const [escala, setEscala] = useState<Escala>('fija')
  const [seleccion, setSeleccion] = useState<number | null>(null)
  const [hover, setHover] = useState<{ i: number; x: number; y: number } | null>(null)
  const [reproduciendo, setReproduciendo] = useState(false)
  const mapRef = useRef<MapRef>(null)

  useEffect(() => {
    if (!reproduciendo) return
    const t = setInterval(() => setHora((h) => (h + 1) % 24), 850)
    return () => clearInterval(t)
  }, [reproduciendo])

  const valores = escenario(riesgo, clima, dia, hora)

  // Escala fija: la misma para los 840 escenarios, así se comparan entre sí (la madrugada se ve azul).
  // Escala relativa: se estira a cada escenario para ver el patrón espacial aunque el nivel sea bajo.
  const dominioFijo = useMemo<Dominio>(() => ({ lo: riesgo.cuantiles['25'], hi: riesgo.cuantiles['99.9'] }), [riesgo])
  const dominio = useMemo<Dominio>(
    () => (escala === 'fija' ? dominioFijo : { lo: cuantil(valores, 0.25), hi: cuantil(valores, 0.995) }),
    [escala, dominioFijo, valores],
  )

  const porHora = useMemo(() => Array.from({ length: 24 }, (_, h) => totalCiudad(riesgo, clima, dia, h)), [riesgo, clima, dia])
  const porClima = useMemo(() => riesgo.climas.map((_, c) => totalCiudad(riesgo, c, dia, hora)), [riesgo, dia, hora])
  const totalActual = porClima[clima]
  const vsDespejado = totalActual / porClima[riesgo.climas.indexOf('despejado')] - 1

  const top = useMemo(() => {
    const idx = Array.from(valores.keys())
    idx.sort((a, b) => valores[b] - valores[a])
    return idx.slice(0, 8)
  }, [valores])
  const umbralAlto = 5 * riesgo.media
  const celdasAltas = useMemo(() => valores.reduce((n, v) => n + (v >= umbralAlto ? 1 : 0), 0), [valores, umbralAlto])

  const t = (i: number) => posicion(valores[i], dominio)

  // Superficie continua: solo se calcula cuando está activa esa representación.
  const superficie = useMemo(
    () => (rep === 'continuo' ? interpolar(riesgo.n_celdas, (i) => riesgo.celdas[i].c[0], (i) => riesgo.celdas[i].c[1], (i) => Math.min(1, Math.max(0, posicion(valores[i], dominio)))) : null),
    [rep, riesgo, valores, dominio],
  )
  const disparador = [clima, dia, hora, dominio.lo, dominio.hi]

  const capas = (antesDe: string | undefined) => {
    if (rep === 'continuo') {
      return [
        new BitmapLayer({
          id: 'riesgo-continuo',
          image: superficie,
          bounds: LIMITES,
          ...debajoDe(antesDe),
        }),
      ]
    }
    const es3d = rep === '3d'
    return [
      new PolygonLayer<Celda>({
        id: 'riesgo-hex',
        data: riesgo.celdas,
        getPolygon: (c) => c.p,
        getFillColor: (_, { index }) => {
          const x = t(index)
          // Lo poco riesgoso se funde con el mapa; lo riesgoso queda opaco.
          return [...colorEn(x), es3d ? 235 : Math.round(110 + 115 * Math.min(1, Math.max(0, x)))]
        },
        getElevation: (_, { index }) => Math.max(0, t(index)) ** 2 * 1400,
        extruded: es3d,
        wireframe: false,
        stroked: !es3d,
        getLineColor: [10, 12, 14, 120],
        lineWidthMinPixels: 0.5,
        pickable: true,
        material: { ambient: 0.55, diffuse: 0.6, shininess: 24 },
        ...debajoDe(es3d ? undefined : antesDe),
        updateTriggers: { getFillColor: [...disparador, es3d], getElevation: disparador },
      }),
      new PolygonLayer<Celda>({
        id: 'seleccion',
        data: seleccion === null ? [] : [riesgo.celdas[seleccion]],
        getPolygon: (c) => c.p,
        filled: false,
        stroked: true,
        getLineColor: [255, 255, 255, 255],
        lineWidthMinPixels: 2.5,
        ...debajoDe(antesDe),
      }),
    ]
  }

  useEffect(() => {
    const m = mapRef.current
    if (!m) return
    m.easeTo(rep === '3d' ? { pitch: 52, bearing: -18, duration: 900 } : { pitch: 0, bearing: 0, duration: 700 })
  }, [rep])

  const irA = (i: number) => {
    setSeleccion(i)
    const [lon, lat] = riesgo.celdas[i].c
    mapRef.current?.flyTo({ center: [lon, lat], zoom: Math.max(14, mapRef.current.getZoom()), duration: 900 })
  }

  // deck.gl vuelve a disparar onHover cada vez que cambian las capas: solo se actualiza el estado si
  // de verdad cambió, si no el mapa y la vista se re-renderizan en bucle.
  const alPasar = (info: PickingInfo) => {
    const n = info.layer?.id === 'riesgo-hex' && info.index >= 0 ? { i: info.index, x: info.x, y: info.y } : null
    setHover((h) => (h === n || (h && n && h.i === n.i && h.x === n.x && h.y === n.y) ? h : n))
  }
  const alClic = (info: PickingInfo) => setSeleccion(info.layer?.id === 'riesgo-hex' && info.index >= 0 ? info.index : null)

  const ct = riesgo.clima_tipico

  return (
    <>
      <aside className="side">
        {cabecera}
        <div className="side-body">
          <section className="block">
            <p className="kicker">Escenario</p>
            <p className="scenario">
              {DIAS[dia]}, {hhmm(hora)} <span className="scenario-sep">·</span> {NOMBRE_CLIMA[riesgo.climas[clima]]}
            </p>
            <dl className="kpis">
              <div>
                <dt>Siniestros esperados en la ciudad</dt>
                <dd>{fmtNum(totalActual, 2)}</dd>
                <span className="kpi-note">en esa hora</span>
              </div>
              <div>
                <dt>Frente a despejado</dt>
                <dd className={vsDespejado > 0.005 ? 'up' : vsDespejado < -0.005 ? 'down' : ''}>
                  {riesgo.climas[clima] === 'despejado' ? '—' : `${vsDespejado > 0 ? '+' : ''}${fmtNum(vsDespejado * 100, 0)} %`}
                </dd>
                <span className="kpi-note">mismo día y hora</span>
              </div>
              <div>
                <dt>Celdas en riesgo alto</dt>
                <dd>{fmtNum(celdasAltas)}</dd>
                <span className="kpi-note">más de ×5 el promedio</span>
              </div>
            </dl>
          </section>

          <section className="block">
            <p className="kicker">Día de la semana</p>
            <div className="seg seg-7" role="radiogroup" aria-label="Día de la semana">
              {DIAS_CORTO.map((d, i) => (
                <button key={d} role="radio" aria-checked={dia === i} className={dia === i ? 'on' : ''} onClick={() => setDia(i)}>
                  {d}
                </button>
              ))}
            </div>
          </section>

          <section className="block">
            <div className="kicker-row">
              <p className="kicker">Hora</p>
              <button className={`play${reproduciendo ? ' on' : ''}`} onClick={() => setReproduciendo((r) => !r)} aria-label={reproduciendo ? 'Pausar' : 'Recorrer las 24 horas'}>
                {reproduciendo ? (
                  <svg viewBox="0 0 12 12" width="10" height="10"><rect x="2" y="1.5" width="2.6" height="9" fill="currentColor" /><rect x="7.4" y="1.5" width="2.6" height="9" fill="currentColor" /></svg>
                ) : (
                  <svg viewBox="0 0 12 12" width="10" height="10"><path d="M2.5 1.5 L10.5 6 L2.5 10.5 Z" fill="currentColor" /></svg>
                )}
                {reproduciendo ? 'Pausar' : 'Recorrer el día'}
              </button>
            </div>
            <TiraHoraria valores={porHora} hora={hora} onHora={(h) => { setReproduciendo(false); setHora(h) }} unidad="siniestros esperados" />
          </section>

          <section className="block">
            <p className="kicker">Clima</p>
            <div className="weather" role="radiogroup" aria-label="Clima">
              {riesgo.climas.map((c, i) => {
                const rel = porClima[i] / porClima[riesgo.climas.indexOf('despejado')] - 1
                return (
                  <button key={c} role="radio" aria-checked={clima === i} className={clima === i ? 'on' : ''} onClick={() => setClima(i)}>
                    <span className="w-name">{NOMBRE_CLIMA[c]}</span>
                    <span className="w-desc">
                      {c === 'despejado' || c === 'nublado' || c === 'niebla'
                        ? `${fmtNum(ct[c].temperatura, 0)} °C · ${fmtNum(ct[c].humedad, 0)} % hum.`
                        : `${fmtNum(ct[c].precipitacion, 1)} mm/h · ráfagas ${fmtNum(ct[c].rafagas, 0)} km/h`}
                    </span>
                    <span className={`w-rel${rel > 0.005 ? ' up' : rel < -0.005 ? ' down' : ''}`}>
                      {c === 'despejado' ? 'base' : `${rel > 0 ? '+' : ''}${fmtNum(rel * 100, 0)} %`}
                    </span>
                  </button>
                )
              })}
            </div>
          </section>

          <section className="block">
            <p className="kicker">Representación</p>
            <div className="seg seg-3">
              {([['hex', 'Hexágonos'], ['continuo', 'Continuo'], ['3d', 'Relieve 3D']] as const).map(([k, l]) => (
                <button key={k} className={rep === k ? 'on' : ''} onClick={() => setRep(k)}>
                  {l}
                </button>
              ))}
            </div>
            <div className="seg seg-2 mt">
              <button className={escala === 'fija' ? 'on' : ''} onClick={() => setEscala('fija')}>Escala fija</button>
              <button className={escala === 'relativa' ? 'on' : ''} onClick={() => setEscala('relativa')}>Relativa al escenario</button>
            </div>
            <p className="hint">
              {escala === 'fija'
                ? 'Los colores significan lo mismo en todos los escenarios: sirve para comparar horas, días y climas.'
                : 'Los colores se reparten dentro del escenario elegido: resalta dónde se concentra el riesgo aunque el nivel general sea bajo.'}
            </p>
          </section>

          <section className="block">
            <p className="kicker">Zonas de mayor riesgo en este escenario</p>
            <ol className="ranking">
              {top.map((i, k) => {
                const c = riesgo.celdas[i]
                return (
                  <li key={c.id}>
                    <button className={seleccion === i ? 'on' : ''} onClick={() => irA(i)}>
                      <span className="r-pos">{k + 1}</span>
                      <span className="r-name">
                        {nombreCelda(c)}
                        <small>Comuna {c.comuna} · {fmtCadaHoras(valores[i])}</small>
                      </span>
                      <span className="r-val">
                        <i style={{ background: colorCss(t(i)) }} />
                        {fmtIndice(valores[i] / riesgo.media)}
                      </span>
                    </button>
                  </li>
                )
              })}
            </ol>
          </section>
        </div>
        <footer className="side-foot">
          Modelo LightGBM (Poisson) sobre {fmtNum(riesgo.n_celdas)} celdas H3 de ~350 m. Valores promediados en enero, abril, julio y octubre; día no feriado.
        </footer>
      </aside>

      <main className="stage">
        <MapaBase mapRef={mapRef} layers={capas} onHover={alPasar} onClick={alClic} />
        <div className="stamp" aria-hidden>
          <span>{DIAS_CORTO[dia]}</span>
          <strong>{hhmm(hora)}</strong>
          <span>{NOMBRE_CLIMA[riesgo.climas[clima]]}</span>
        </div>
        <Leyenda dominio={dominio} media={riesgo.media} relativa={escala === 'relativa'} />
        {hover && hover.i !== seleccion && (
          <div className="map-tip" style={{ left: hover.x, top: hover.y }}>
            <strong>{nombreCelda(riesgo.celdas[hover.i])}</strong>
            <span>
              <i style={{ background: colorCss(t(hover.i)) }} />
              {fmtIndice(valores[hover.i] / riesgo.media)} el promedio · {fmtCadaHoras(valores[hover.i])}
            </span>
          </div>
        )}
        {seleccion !== null && (
          <FichaCelda
            riesgo={riesgo}
            i={seleccion}
            clima={clima}
            dia={dia}
            hora={hora}
            dominio={dominio}
            onHora={setHora}
            onClima={setClima}
            onCerrar={() => setSeleccion(null)}
          />
        )}
      </main>
    </>
  )
}
