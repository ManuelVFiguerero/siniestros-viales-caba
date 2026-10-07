import { fmtNum, GRADIENTE_CSS, posicion, type Dominio } from '../riesgo'

const MARCAS = [0.01, 0.02, 0.05, 0.1, 0.2, 0.5, 1, 2, 5, 10, 20, 50, 100]

// Barra de color con marcas en "veces el promedio de la ciudad" sobre escala logarítmica.
export function Leyenda({ dominio, media, relativa }: { dominio: Dominio; media: number; relativa: boolean }) {
  const marcas = MARCAS.map((m) => ({ m, x: posicion(m * media, dominio) })).filter((d) => d.x >= -0.001 && d.x <= 1.001)
  // Si quedan muchas marcas, se deja una de cada dos (siempre con el 1×).
  const visibles = marcas.length > 6 ? marcas.filter((d) => [0.01, 0.1, 1, 10, 100, 0.05, 0.5, 5, 50].includes(d.m)) : marcas

  return (
    <div className="legend" role="img" aria-label="Escala de riesgo relativo, de azul (bajo) a rojo (alto)">
      <div className="legend-head">
        <span>Riesgo relativo</span>
        <span className="legend-sub">{relativa ? 'escala del escenario' : 'escala fija'}</span>
      </div>
      <div className="legend-bar" style={{ background: GRADIENTE_CSS }} />
      <div className="legend-ticks">
        {visibles.map(({ m, x }) => (
          <span key={m} style={{ left: `${x * 100}%` }} className={m === 1 ? 'is-ref' : ''}>
            {m < 1 ? fmtNum(m, m < 0.1 ? 2 : 1) : fmtNum(m)}×
          </span>
        ))}
      </div>
      <p className="legend-foot">Veces el promedio de una celda en una hora cualquiera</p>
    </div>
  )
}
