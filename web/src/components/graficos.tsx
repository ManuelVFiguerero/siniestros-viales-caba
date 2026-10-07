import { useState } from 'react'
import { fmtNum } from '../riesgo'

// Colores categóricos (validados para daltonismo en fondo oscuro) y grises para las líneas de base.
export const COLOR_MODELO: Record<string, string> = {
  LightGBM: '#3987e5',
  'Random Forest': '#d95926',
  'Poisson (GLM)': '#199e70',
  'Historial × perfil horario': '#8d9196',
  'Historial de la celda': '#5c6064',
}
export const COLOR_GRUPO: Record<string, string> = { Zona: '#3987e5', Momento: '#d95926', Clima: '#199e70' }
const SUBE = '#d73027'
const BAJA = '#4575b4'

// ---------- curva de captura ----------

export function CurvaCaptura({ x, series }: { x: number[]; series: Record<string, number[]> }) {
  const [hi, setHi] = useState<number | null>(null)
  const W = 640
  const H = 340
  const m = { t: 12, r: 16, b: 40, l: 44 }
  const xmax = 0.3
  const nx = x.findIndex((v) => v > xmax + 1e-9)
  const n = nx < 0 ? x.length : nx
  const px = (v: number) => m.l + (v / xmax) * (W - m.l - m.r)
  const py = (v: number) => H - m.b - v * (H - m.t - m.b)
  const nombres = Object.keys(COLOR_MODELO).filter((k) => series[k])

  const mover = (e: React.MouseEvent<SVGRectElement>) => {
    const r = e.currentTarget.getBoundingClientRect()
    const v = ((e.clientX - r.left) / r.width) * xmax
    setHi(Math.max(1, Math.min(n - 1, Math.round(v / (x[1] - x[0])))))
  }

  return (
    <div className="chart">
      <div className="chart-legend">
        {nombres.map((k) => (
          <span key={k}>
            <i style={{ background: COLOR_MODELO[k], height: k.startsWith('Historial') ? 2 : 3 }} />
            {k}
          </span>
        ))}
      </div>
      <div className="chart-box">
        <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Curva de captura de siniestros por modelo">
          {[0, 0.25, 0.5, 0.75, 1].map((v) => (
            <g key={v}>
              <line x1={m.l} x2={W - m.r} y1={py(v)} y2={py(v)} className="grid" />
              <text x={m.l - 8} y={py(v)} className="tick" textAnchor="end" dominantBaseline="middle">{v * 100}%</text>
            </g>
          ))}
          {[0, 0.05, 0.1, 0.15, 0.2, 0.25, 0.3].map((v) => (
            <text key={v} x={px(v)} y={H - m.b + 18} className="tick" textAnchor="middle">{Math.round(v * 100)}%</text>
          ))}
          <text x={(m.l + W - m.r) / 2} y={H - 4} className="axis-title" textAnchor="middle">
            Celda-horas marcadas como de mayor riesgo
          </text>
          <line x1={px(0)} y1={py(0)} x2={px(xmax)} y2={py(xmax)} className="ref-line" />
          <text x={px(xmax) - 4} y={py(xmax) - 6} className="tick" textAnchor="end">al azar</text>
          {nombres
            .slice()
            .reverse()
            .map((k) => (
              <polyline
                key={k}
                fill="none"
                stroke={COLOR_MODELO[k]}
                strokeWidth={k === 'LightGBM' ? 2.5 : 2}
                strokeDasharray={k === 'Historial de la celda' ? '2 4' : k.startsWith('Historial') ? '6 4' : undefined}
                strokeLinejoin="round"
                points={series[k].slice(0, n).map((v, i) => `${px(x[i])},${py(v)}`).join(' ')}
              />
            ))}
          {hi !== null && (
            <g>
              <line x1={px(x[hi])} x2={px(x[hi])} y1={m.t} y2={H - m.b} className="crosshair" />
              {nombres.map((k) => (
                <circle key={k} cx={px(x[hi])} cy={py(series[k][hi])} r={4} fill={COLOR_MODELO[k]} stroke="var(--panel)" strokeWidth={2} />
              ))}
            </g>
          )}
          <rect x={m.l} y={m.t} width={W - m.l - m.r} height={H - m.t - m.b} fill="transparent" onMouseMove={mover} onMouseLeave={() => setHi(null)} />
        </svg>
        {hi !== null && (
          <div className="chart-tip" style={{ left: `${(px(x[hi]) / W) * 100}%` }}>
            <p>Top {fmtNum(x[hi] * 100, 1)} % de celda-horas</p>
            {nombres.map((k) => (
              <p key={k}>
                <i style={{ background: COLOR_MODELO[k] }} />
                <span>{k}</span>
                <b>{fmtNum(series[k][hi] * 100, 1)} %</b>
              </p>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ---------- barras 100 % apiladas por grupo ----------

export function BarrasGrupos({ filas }: { filas: { etiqueta: string; grupos: { grupo: string; share: number }[] }[] }) {
  const grupos = filas[0].grupos.map((g) => g.grupo)
  return (
    <div className="chart">
      <div className="chart-legend">
        {grupos.map((g) => (
          <span key={g}>
            <i style={{ background: COLOR_GRUPO[g] }} />
            {g}
          </span>
        ))}
      </div>
      {filas.map((f) => (
        <div key={f.etiqueta} className="stack-row">
          <span className="stack-label">{f.etiqueta}</span>
          <div className="stack">
            {f.grupos.map((g) => (
              <div key={g.grupo} className="stack-seg" style={{ flexBasis: `${g.share * 100}%`, background: COLOR_GRUPO[g.grupo] }} title={`${g.grupo}: ${fmtNum(g.share * 100, 1)} %`}>
                {g.share >= 0.07 && <span>{fmtNum(g.share * 100, 0)} %</span>}
              </div>
            ))}
          </div>
          {/* Los segmentos angostos no tienen lugar para su número: se rotulan al final de la barra. */}
          <span className="stack-out">
            {f.grupos
              .filter((g) => g.share < 0.07)
              .map((g) => `${g.grupo} ${fmtNum(g.share * 100, 0)} %`)
              .join(' · ')}
          </span>
        </div>
      ))}
    </div>
  )
}

// ---------- barras horizontales simples ----------

export function BarrasHorizontales({ datos }: { datos: { etiqueta: string; valor: number; color: string; nota?: string }[] }) {
  const max = Math.max(...datos.map((d) => d.valor))
  return (
    <div className="hbars">
      {datos.map((d) => (
        <div key={d.etiqueta} className="hbar-row" title={d.nota}>
          <span className="hbar-label">{d.etiqueta}</span>
          <span className="hbar-track">
            <span className="hbar" style={{ width: `${(d.valor / max) * 100}%`, background: d.color }} />
          </span>
          <span className="hbar-val">{fmtNum(d.valor, 3)}</span>
        </div>
      ))}
    </div>
  )
}

// ---------- razones de tasas alrededor de 1 (escala log) ----------

/** Barras divergentes desde 1×: arriba del 1 en rojo (más riesgo), abajo en azul. */
export function BarrasEfecto({ etiquetas, valores, alto = 150, rotulos }: { etiquetas: string[]; valores: number[]; alto?: number; rotulos?: (i: number) => boolean }) {
  const [hi, setHi] = useState<number | null>(null)
  const lim = Math.max(...valores.map((v) => Math.abs(Math.log(v))), Math.log(1.25))
  const centro = alto / 2
  const y = (v: number) => centro - (Math.log(v) / lim) * (alto / 2 - 4)
  return (
    <div className="effect" onMouseLeave={() => setHi(null)}>
      <div className="effect-plot" style={{ height: alto }}>
        <span className="effect-ref" style={{ top: centro }}><em>1×</em></span>
        {valores.map((v, i) => (
          <div key={i} className={`effect-col${hi === i ? ' on' : ''}`} onMouseEnter={() => setHi(i)}>
            <span
              className="effect-bar"
              style={{
                top: Math.min(y(v), centro),
                height: Math.max(1.5, Math.abs(y(v) - centro)),
                background: v >= 1 ? SUBE : BAJA,
                borderRadius: v >= 1 ? '3px 3px 0 0' : '0 0 3px 3px',
              }}
            />
          </div>
        ))}
        {hi !== null && (
          <div className="chart-tip small" style={{ left: `${((hi + 0.5) / valores.length) * 100}%` }}>
            <p>{etiquetas[hi]}</p>
            <p><b>{fmtNum(valores[hi], 2)}×</b>&nbsp;{valores[hi] >= 1 ? `+${fmtNum((valores[hi] - 1) * 100, 0)} %` : `−${fmtNum((1 - valores[hi]) * 100, 0)} %`}</p>
          </div>
        )}
      </div>
      <div className="effect-axis">
        {etiquetas.map((e, i) => (
          <span key={i}>{!rotulos || rotulos(i) ? e : ''}</span>
        ))}
      </div>
    </div>
  )
}

/** Gráfico de puntos para razones de tasas del GLM, escala log centrada en 1. */
export function PuntosRazon({ datos }: { datos: { etiqueta: string; irr: number }[] }) {
  const lim = Math.log(Math.max(2, ...datos.map((d) => Math.max(d.irr, 1 / d.irr))) * 1.1)
  const x = (v: number) => 50 + (Math.log(v) / lim) * 50
  const marcas = [0.25, 0.5, 1, 2, 4].filter((v) => Math.abs(Math.log(v)) <= lim)
  return (
    <div className="dots">
      <div className="dots-row dots-axis">
        <span />
        <span className="dots-track">
          {marcas.map((v) => (
            <em key={v} style={{ left: `${x(v)}%` }}>{fmtNum(v, v < 1 ? 2 : 0)}×</em>
          ))}
        </span>
        <span />
      </div>
      {datos.map((d) => (
        <div key={d.etiqueta} className="dots-row">
          <span className="dots-label">{d.etiqueta}</span>
          <span className="dots-track">
            <span className="dots-ref" style={{ left: '50%' }} />
            <span className="dots-stem" style={{ left: `${Math.min(50, x(d.irr))}%`, width: `${Math.abs(x(d.irr) - 50)}%`, background: d.irr >= 1 ? SUBE : BAJA }} />
            <span className="dots-dot" style={{ left: `${x(d.irr)}%`, background: d.irr >= 1 ? SUBE : BAJA }} />
          </span>
          <span className="dots-val">
            {d.irr >= 1 ? '+' : '−'}
            {fmtNum(Math.abs(d.irr - 1) * 100, 0)} %
          </span>
        </div>
      ))}
    </div>
  )
}
