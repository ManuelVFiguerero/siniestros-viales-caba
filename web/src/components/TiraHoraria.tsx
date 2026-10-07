import { useState } from 'react'
import { fmtNum, hhmm } from '../riesgo'

interface Props {
  valores: number[]
  hora: number
  onHora: (h: number) => void
  unidad: string
  /** Color de cada barra; por defecto, gris con la hora elegida resaltada. */
  colores?: string[]
  alto?: number
  decimales?: number
}

// 24 barras clickeables: elige la hora y muestra cómo cambia el total a lo largo del día.
export function TiraHoraria({ valores, hora, onHora, unidad, colores, alto = 64, decimales = 2 }: Props) {
  const [hover, setHover] = useState<number | null>(null)
  const max = Math.max(...valores) || 1
  const h = hover ?? hora

  return (
    <div className="strip">
      <div className="strip-plot" style={{ height: alto }} onMouseLeave={() => setHover(null)}>
        {valores.map((v, i) => (
          <button
            key={i}
            className={`strip-hit${i === hora ? ' on' : ''}`}
            onMouseEnter={() => setHover(i)}
            onClick={() => onHora(i)}
            aria-label={`${hhmm(i)}: ${fmtNum(v, decimales)} ${unidad}`}
          >
            <span className="strip-bar" style={{ height: `${Math.max(2, (v / max) * 100)}%`, background: colores?.[i] }} />
          </button>
        ))}
      </div>
      <div className="strip-axis">
        <span>00</span>
        <span>06</span>
        <span>12</span>
        <span>18</span>
        <span>23</span>
      </div>
      <p className="strip-read">
        <strong>{hhmm(h)}</strong> {fmtNum(valores[h], decimales)} {unidad}
      </p>
    </div>
  )
}
