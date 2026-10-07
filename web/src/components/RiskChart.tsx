import { ETIQUETA_CONDICION, type StatCondicion } from '../data'

// Barras horizontales de riesgo relativo con la línea de referencia en 1.0 (= día despejado).
export function RiskChart({ datos }: { datos: StatCondicion[] }) {
  const max = Math.max(1.3, ...datos.map((d) => d.riesgo_relativo))
  const pct = (v: number) => `${(v / max) * 100}%`

  return (
    <div className="risk">
      {datos.map((d) => {
        const e = ETIQUETA_CONDICION[d.condicion]
        const delta = Math.round((d.riesgo_relativo - 1) * 100)
        return (
          <div
            className="risk-row"
            key={d.condicion}
            title={`${d.siniestros.toLocaleString('es-AR')} siniestros en ${d.horas.toLocaleString('es-AR')} h · esperados ${Math.round(d.esperados).toLocaleString('es-AR')}`}
          >
            <span className="risk-label">
              {e.icon} {e.label}
            </span>
            <div className="risk-track">
              <div className="risk-bar" style={{ width: pct(d.riesgo_relativo) }} />
              <div className="risk-ref" style={{ left: pct(1) }} />
            </div>
            <span className="risk-value">
              {d.condicion === 'despejado' ? 'base' : `${delta > 0 ? '+' : ''}${delta}%`}
            </span>
          </div>
        )
      })}
      <p className="note">
        Siniestros por hora frente a horas despejadas de la misma zona, año, hora del día y tipo de día.
      </p>
    </div>
  )
}
