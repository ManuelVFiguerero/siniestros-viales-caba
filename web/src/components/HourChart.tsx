import { useMemo, useState } from 'react'

// Distribución por hora del día de los siniestros filtrados, con tooltip por barra.
export function HourChart({ horas, indices }: { horas: number[]; indices: number[] }) {
  const [hover, setHover] = useState<number | null>(null)
  const conteo = useMemo(() => {
    const c = new Array(24).fill(0)
    for (const i of indices) c[horas[i]]++
    return c
  }, [horas, indices])
  const max = Math.max(1, ...conteo)

  return (
    <div className="hours">
      <div className="hours-plot" onMouseLeave={() => setHover(null)}>
        {conteo.map((n, h) => (
          <div key={h} className="hours-hit" onMouseEnter={() => setHover(h)}>
            <div className={`hours-bar${hover === h ? ' active' : ''}`} style={{ height: `${(n / max) * 100}%` }} />
          </div>
        ))}
        {hover !== null && (
          <div className="tooltip" style={{ left: `${((hover + 0.5) / 24) * 100}%` }}>
            <strong>{conteo[hover].toLocaleString('es-AR')}</strong> siniestros
            <span>
              {String(hover).padStart(2, '0')}:00 – {String(hover).padStart(2, '0')}:59
            </span>
          </div>
        )}
      </div>
      <div className="hours-axis">
        <span>0 h</span>
        <span>6 h</span>
        <span>12 h</span>
        <span>18 h</span>
        <span>23 h</span>
      </div>
    </div>
  )
}
