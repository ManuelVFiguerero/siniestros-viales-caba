import { useMemo } from 'react'
import { TiraHoraria } from './TiraHoraria'
import {
  colorCss, DIAS, escenario, fmtCadaHoras, fmtIndice, fmtNum, fmtPct, hhmm, NOMBRE_CLIMA, nombreCelda, posicion,
  type Dominio, type Riesgo,
} from '../riesgo'

interface Props {
  riesgo: Riesgo
  i: number
  clima: number
  dia: number
  hora: number
  dominio: Dominio
  onHora: (h: number) => void
  onClima: (c: number) => void
  onCerrar: () => void
}

// Ficha de una celda: riesgo en el escenario, perfil del día y sensibilidad al clima.
export function FichaCelda({ riesgo, i, clima, dia, hora, dominio, onHora, onClima, onCerrar }: Props) {
  const c = riesgo.celdas[i]
  const lam = escenario(riesgo, clima, dia, hora)[i]
  const perfil = useMemo(() => Array.from({ length: 24 }, (_, h) => escenario(riesgo, clima, dia, h)[i]), [riesgo, clima, dia, i])
  const porClima = riesgo.climas.map((_, k) => escenario(riesgo, k, dia, hora)[i])
  const maxClima = Math.max(...porClima)
  // Posición de la celda entre todas las de la ciudad en este escenario.
  const valores = escenario(riesgo, clima, dia, hora)
  let superadas = 0
  for (let k = 0; k < valores.length; k++) if (valores[k] < lam) superadas++
  const percentil = superadas / valores.length

  return (
    <section className="card" aria-label="Detalle de la celda">
      <header className="card-head">
        <div>
          <p className="kicker">Comuna {c.comuna} · celda {c.id.slice(0, 9)}</p>
          <h2>{nombreCelda(c)}</h2>
        </div>
        <button className="close" onClick={onCerrar} aria-label="Cerrar">
          <svg viewBox="0 0 12 12" width="12" height="12"><path d="M2 2 L10 10 M10 2 L2 10" stroke="currentColor" strokeWidth="1.5" /></svg>
        </button>
      </header>

      <div className="card-hero">
        <span className="swatch" style={{ background: colorCss(posicion(lam, dominio)) }} />
        <div>
          <strong>{fmtIndice(lam / riesgo.media)}</strong>
          <span>el promedio de la ciudad</span>
        </div>
        <div>
          <strong>{fmtCadaHoras(lam)}</strong>
          <span>siniestros con víctimas a este ritmo</span>
        </div>
      </div>
      <p className="card-line">
        Probabilidad de al menos un siniestro en esa hora: <b>{fmtPct(1 - Math.exp(-lam), 2)}</b>. Más riesgosa que el{' '}
        <b>{fmtNum(percentil * 100, 0)} %</b> de las celdas.
      </p>

      <p className="kicker">{DIAS[dia]} con {NOMBRE_CLIMA[riesgo.climas[clima]].toLowerCase()}, hora por hora</p>
      <TiraHoraria
        valores={perfil.map((v) => v / riesgo.media)}
        hora={hora}
        onHora={onHora}
        unidad="× el promedio"
        colores={perfil.map((v) => colorCss(posicion(v, dominio)))}
        alto={52}
        decimales={1}
      />

      <p className="kicker">A las {hhmm(hora)}, según el clima</p>
      <div className="by-weather">
        {riesgo.climas.map((k, j) => (
          <button key={k} className={j === clima ? 'on' : ''} onClick={() => onClima(j)}>
            <span>{NOMBRE_CLIMA[k]}</span>
            <span className="bw-track">
              <span className="bw-bar" style={{ width: `${(porClima[j] / maxClima) * 100}%`, background: colorCss(posicion(porClima[j], dominio)) }} />
            </span>
            <span className="bw-val">{fmtIndice(porClima[j] / riesgo.media)}</span>
          </button>
        ))}
      </div>

      <dl className="facts">
        <div>
          <dt>Siniestros 2019–2025</dt>
          <dd>{fmtNum(c.sin)}</dd>
        </div>
        <div>
          <dt>Graves o mortales</dt>
          <dd>{fmtNum(c.graves)}</dd>
        </div>
        <div>
          <dt>Avenida / autopista (m)</dt>
          <dd>
            {fmtNum(c.km_av * 1000)} / {fmtNum(c.km_au * 1000)}
          </dd>
        </div>
      </dl>
    </section>
  )
}
