import { ETIQUETA_CONDICION, type StatCondicion } from '../data'
import { fmtNum } from '../riesgo'

// Barras horizontales de riesgo relativo con la línea de referencia en 1.0 (= hora despejada).
export function RiskChart({ datos }: { datos: StatCondicion[] }) {
  const max = Math.max(1.3, ...datos.map((d) => d.riesgo_relativo))
  const pct = (v: number) => `${(v / max) * 100}%`

  return (
    <div className="risk">
      {datos.map((d) => {
        const delta = Math.round((d.riesgo_relativo - 1) * 100)
        return (
          <div
            className="risk-row"
            key={d.condicion}
            title={`${fmtNum(d.siniestros)} siniestros en ${fmtNum(d.horas)} h · esperados ${fmtNum(d.esperados)}`}
          >
            <span className="risk-label">{ETIQUETA_CONDICION[d.condicion]}</span>
            <div className="risk-track">
              <div className="risk-bar" style={{ width: pct(d.riesgo_relativo) }} />
              <div className="risk-ref" style={{ left: pct(1) }} />
            </div>
            <span className="risk-value">{d.condicion === 'despejado' ? 'base' : `${delta > 0 ? '+' : ''}${delta} %`}</span>
          </div>
        )
      })}
      <p className="hint">Siniestros por hora frente a horas despejadas de la misma zona, año, hora del día y tipo de día. No usa el modelo.</p>
    </div>
  )
}
