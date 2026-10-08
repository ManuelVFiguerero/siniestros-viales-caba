import { useState } from 'react'
import type { Razon } from '../data'
import { fmtNum } from '../riesgo'

const LLUVIA = '#3987e5'
const TORMENTA = '#e66767'
const DIA = '#c98500'
const NOCHE = '#9085e9'

const efecto = (rr: number) => `${rr >= 1 ? '+' : '−'}${fmtNum(Math.abs(rr - 1) * 100, 0)} %`

// ---------- efecto del clima según la hora: líneas del modelo + puntos observados con IC ----------

interface CurvaProps {
  modelo: { lluvia: number[]; tormenta: number[] }
  observado: { franja: string; desde: number; hasta: number; lluvia: Razon; tormenta: Razon }[]
}

export function CurvaHoraClima({ modelo, observado }: CurvaProps) {
  const [hi, setHi] = useState<number | null>(null)
  const W = 640
  const H = 300
  const m = { t: 14, r: 14, b: 34, l: 46 }
  const ymin = 0.4
  const ymax = 2.2
  const px = (h: number) => m.l + (h / 23) * (W - m.l - m.r)
  const py = (v: number) => H - m.b - ((Math.min(ymax, Math.max(ymin, v)) - ymin) / (ymax - ymin)) * (H - m.t - m.b)
  const linea = (vals: number[]) => vals.map((v, h) => `${px(h)},${py(v)}`).join(' ')

  const mover = (e: React.MouseEvent<SVGRectElement>) => {
    const r = e.currentTarget.getBoundingClientRect()
    setHi(Math.max(0, Math.min(23, Math.round(((e.clientX - r.left) / r.width) * 23))))
  }

  return (
    <div className="chart">
      <div className="chart-legend">
        <span><i style={{ background: LLUVIA }} />Lluvia</span>
        <span><i style={{ background: TORMENTA }} />Tormenta</span>
        <span className="legend-note">líneas: modelo · puntos con barras: datos observados (IC 95 %)</span>
      </div>
      <div className="chart-box">
        <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Efecto de la lluvia y la tormenta según la hora del día">
          {[0.5, 1, 1.5, 2].map((v) => (
            <g key={v}>
              <line x1={m.l} x2={W - m.r} y1={py(v)} y2={py(v)} className={v === 1 ? 'ref-solid' : 'grid'} />
              <text x={m.l - 8} y={py(v)} className="tick" textAnchor="end" dominantBaseline="middle">{fmtNum(v, 1)}×</text>
            </g>
          ))}
          {[0, 3, 6, 9, 12, 15, 18, 21].map((h) => (
            <text key={h} x={px(h)} y={H - m.b + 18} className="tick" textAnchor="middle">{String(h).padStart(2, '0')}</text>
          ))}
          <polyline points={linea(modelo.lluvia)} fill="none" stroke={LLUVIA} strokeWidth={2} strokeLinejoin="round" />
          <polyline points={linea(modelo.tormenta)} fill="none" stroke={TORMENTA} strokeWidth={2} strokeLinejoin="round" />
          {observado.map((f) =>
            ([['lluvia', LLUVIA, -5], ['tormenta', TORMENTA, 5]] as const).map(([k, c, dx]) => {
              const r = f[k]
              const x = px((f.desde + f.hasta) / 2) + dx
              return (
                <g key={f.franja + k}>
                  <line x1={x} x2={x} y1={py(r.lo)} y2={py(r.hi)} stroke={c} strokeWidth={1.5} />
                  <circle cx={x} cy={py(r.rr)} r={4.5} fill="var(--panel)" stroke={c} strokeWidth={2} />
                </g>
              )
            }),
          )}
          {hi !== null && <line x1={px(hi)} x2={px(hi)} y1={m.t} y2={H - m.b} className="crosshair" />}
          <rect x={m.l} y={m.t} width={W - m.l - m.r} height={H - m.t - m.b} fill="transparent" onMouseMove={mover} onMouseLeave={() => setHi(null)} />
        </svg>
        {hi !== null && (
          <div className="chart-tip" style={{ left: `${(px(hi) / W) * 100}%` }}>
            <p>{String(hi).padStart(2, '0')}:00 · día hábil · modelo</p>
            <p><i style={{ background: LLUVIA }} /><span>Lluvia</span><b>{efecto(modelo.lluvia[hi])}</b></p>
            <p><i style={{ background: TORMENTA }} /><span>Tormenta</span><b>{efecto(modelo.tormenta[hi])}</b></p>
            {observado
              .filter((f) => hi >= f.desde && hi <= f.hasta)
              .map((f) => (
                <p key={f.franja} className="tip-obs">
                  Datos {f.franja}: lluvia {efecto(f.lluvia.rr)}, tormenta {efecto(f.tormenta.rr)}
                </p>
              ))}
          </div>
        )}
      </div>
      <p className="axis-note">Siniestros frente a una hora despejada comparable · 1× = sin efecto</p>
    </div>
  )
}

// ---------- filas con punto e intervalo, escala log centrada en 1 ----------

interface Fila {
  etiqueta: string
  series: { nombre?: string; color: string; r: Razon }[]
}

export function FilasRazon({ filas, leyenda }: { filas: Fila[]; leyenda?: { nombre: string; color: string }[] }) {
  const todos = filas.flatMap((f) => f.series.flatMap((s) => [s.r.lo, s.r.hi]))
  const lim = Math.log(Math.max(1.6, ...todos.map((v) => Math.max(v, 1 / v))) * 1.05)
  const x = (v: number) => 50 + (Math.log(v) / lim) * 50
  const marcas = [0.5, 0.75, 1, 1.5, 2].filter((v) => Math.abs(Math.log(v)) <= lim)

  return (
    <div className="rr-rows">
      {leyenda && (
        <div className="chart-legend">
          {leyenda.map((l) => (
            <span key={l.nombre}><i style={{ background: l.color, height: 8, width: 8, borderRadius: 4 }} />{l.nombre}</span>
          ))}
        </div>
      )}
      <div className="rr-row rr-axis">
        <span />
        <span className="rr-track">
          {marcas.map((v) => (
            <em key={v} style={{ left: `${x(v)}%` }}>{fmtNum(v, v === 1 || v === 2 ? 0 : 2)}×</em>
          ))}
        </span>
        <span />
      </div>
      {filas.map((f) => (
        <div key={f.etiqueta} className="rr-row" style={{ minHeight: 10 + 14 * f.series.length }}>
          <span className="rr-label">{f.etiqueta}</span>
          <span className="rr-track">
            <span className="rr-ref" />
            {f.series.map((s, k) => {
              const y = f.series.length === 1 ? 50 : 25 + (k * 50) / (f.series.length - 1)
              return (
                <span key={k} title={`${s.nombre ? s.nombre + ': ' : ''}${efecto(s.r.rr)} · ${s.r.obs} observados, ${fmtNum(s.r.esp)} esperados`}>
                  <span className="rr-ci" style={{ left: `${x(s.r.lo)}%`, width: `${x(s.r.hi) - x(s.r.lo)}%`, top: `${y}%`, background: s.color }} />
                  <span className="rr-dot" style={{ left: `${x(s.r.rr)}%`, top: `${y}%`, background: s.color }} />
                </span>
              )
            })}
          </span>
          <span className="rr-vals">
            {f.series.map((s, k) => (
              <span key={k} style={{ color: f.series.length > 1 ? s.color : undefined }}>{efecto(s.r.rr)}</span>
            ))}
          </span>
        </div>
      ))}
    </div>
  )
}

export const COLOR_DIA = DIA
export const COLOR_NOCHE = NOCHE

// ---------- interacciones del árbol ----------

export function Interacciones({ filas }: { filas: { a: string; b: string; valor: number; clima: boolean }[] }) {
  const max = Math.max(...filas.map((f) => f.valor))
  return (
    <div className="hbars">
      {filas.map((f) => (
        <div key={f.a + f.b} className="hbar-row inter">
          <span className="hbar-label" title={`${f.a} × ${f.b}`}>{f.a} <em>×</em> {f.b}</span>
          <span className="hbar-track">
            <span className="hbar" style={{ width: `${(f.valor / max) * 100}%`, background: f.clima ? '#199e70' : '#6c737a' }} />
          </span>
          <span className="hbar-val">{fmtNum(f.valor, 3)}</span>
        </div>
      ))}
    </div>
  )
}
