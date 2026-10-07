import type { ReactNode } from 'react'
import type { Modelo } from '../data'
import { DIAS_CORTO, fmtNum } from '../riesgo'
import { BarrasEfecto, BarrasGrupos, BarrasHorizontales, COLOR_GRUPO, COLOR_MODELO, CurvaCaptura, PuntosRazon } from '../components/graficos'

const pct = (v: number, d = 1) => `${fmtNum(v * 100, d)} %`

const COLUMNAS: { k: 'd2' | 'auc' | 'ap' | 'captura_5' | 'captura_10' | 'calibracion'; t: string; f: (v: number) => string; nota: string }[] = [
  { k: 'captura_5', t: 'Captura 5 %', f: (v) => pct(v), nota: 'Siniestros que caen en el 5 % de celda-horas con mayor riesgo previsto' },
  { k: 'captura_10', t: 'Captura 10 %', f: (v) => pct(v), nota: 'Ídem con el 10 %' },
  { k: 'auc', t: 'AUC', f: (v) => fmtNum(v, 3), nota: 'Probabilidad de que una celda-hora con siniestro reciba más riesgo que una sin siniestro' },
  { k: 'd2', t: 'Deviance explicada', f: (v) => pct(v), nota: 'Mejora de la deviance de Poisson frente a una tasa constante (D²)' },
  { k: 'ap', t: 'Precisión media', f: (v) => fmtNum(v * 100, 3), nota: 'Average precision ×100. La tasa base (celda-horas con siniestro) es ~0,035 %' },
  { k: 'calibracion', t: 'Previstos / reales', f: (v) => fmtNum(v, 2), nota: 'Siniestros previstos sobre ocurridos en 2024–2025. 1 = calibrado' },
]

export function ModeloInforme({ modelo, cabecera }: { modelo: Modelo; cabecera: ReactNode }) {
  const mejor = (k: (typeof COLUMNAS)[number]['k']) =>
    k === 'calibracion'
      ? modelo.metricas.reduce((a, b) => (Math.abs(b.calibracion - 1) < Math.abs(a.calibracion - 1) ? b : a)).modelo
      : modelo.metricas.reduce((a, b) => (b[k] > a[k] ? b : a)).modelo
  const lgbm = modelo.metricas.find((m) => m.modelo === 'LightGBM')!
  const base = modelo.metricas.find((m) => m.modelo === 'Historial de la celda')!
  const s = modelo.shap
  const clima = s.grupos.find((g) => g.grupo === 'Clima')!
  const climaLluvia = s.grupos_lluvia.find((g) => g.grupo === 'Clima')!
  const orden = ['LightGBM', 'Random Forest', 'Poisson (GLM)', 'Historial × perfil horario', 'Historial de la celda']
  const metricas = [...modelo.metricas].sort((a, b) => orden.indexOf(a.modelo) - orden.indexOf(b.modelo))

  return (
    <>
      <aside className="side">
        {cabecera}
        <div className="side-body">
          <section className="block">
            <p className="kicker">Pregunta</p>
            <p className="lede">¿Cuántos siniestros con víctimas se esperan en cada zona de ~350 m, a cada hora, según el día y el clima?</p>
          </section>
          <section className="block">
            <p className="kicker">Diseño</p>
            <dl className="spec">
              <div><dt>Unidad</dt><dd>celda H3 res. 9 × hora</dd></div>
              <div><dt>Celdas</dt><dd>{fmtNum(modelo.datos.celdas)}</dd></div>
              <div><dt>Celda-horas</dt><dd>{fmtNum(modelo.datos.celda_horas / 1e6, 1)} M</dd></div>
              <div><dt>Siniestros</dt><dd>{fmtNum(modelo.datos.siniestros)}</dd></div>
              <div><dt>Entrenamiento</dt><dd>{modelo.periodo.train}</dd></div>
              <div><dt>Evaluación</dt><dd>{modelo.periodo.test}</dd></div>
              <div><dt>Objetivo</dt><dd>conteo (Poisson)</dd></div>
            </dl>
          </section>
          <section className="block">
            <p className="kicker">Variables</p>
            <ul className="feature-list">
              <li><i style={{ background: COLOR_GRUPO.Zona }} /><b>Zona</b> siniestros históricos de la celda y vecinas, km de avenida y autopista (OpenStreetMap), cruces de vías principales, comuna.</li>
              <li><i style={{ background: COLOR_GRUPO.Momento }} /><b>Momento</b> hora, día de la semana, mes, feriado, cuarentena 2020.</li>
              <li><i style={{ background: COLOR_GRUPO.Clima }} /><b>Clima</b> lluvia en la hora y en las 3 previas, temperatura, humedad, viento, ráfagas, nubosidad, niebla.</li>
            </ul>
          </section>
          <section className="block">
            <p className="kicker">Reglas para no hacer trampa</p>
            <ul className="plain-list">
              <li>Corte temporal: el modelo nunca ve 2024–2025 al entrenar. Mezclar años al azar dejaría que "vea el futuro".</li>
              <li>El historial de cada celda se calcula sin el año que se predice.</li>
              <li>Early stopping con {modelo.periodo.validacion_early_stopping}, dentro del período de entrenamiento.</li>
              <li>De las celda-horas sin siniestro se usa una muestra; cada una pesa ×{fmtNum(modelo.datos.peso_ceros, 1)} para representar a la ciudad entera.</li>
            </ul>
          </section>
        </div>
        <footer className="side-foot">Figuras para la presentación en <code>reports/figuras/</code>.</footer>
      </aside>

      <main className="stage report">
        <article className="report-body">
          <header className="report-head">
            <p className="kicker">Evaluación fuera de muestra · {modelo.periodo.test}</p>
            <h1>
              Marcando el 10 % de celda-horas más riesgosas, el modelo anticipa {pct(lgbm.captura_10, 0)} de los siniestros
            </h1>
            <p className="lede">
              Con el mismo esfuerzo, el mapa de puntos calientes tradicional (solo el historial de la celda) captura {pct(base.captura_10, 0)}.
              Casi toda la mejora viene de saber <em>cuándo</em>: hora y día de la semana. El clima suma poco por encima de eso, y los tres modelos
              coinciden en ese diagnóstico.
            </p>
          </header>

          <section className="report-sec">
            <h2>Comparación de modelos</h2>
            <div className="table-wrap">
              <table className="metrics">
                <thead>
                  <tr>
                    <th>Modelo</th>
                    {COLUMNAS.map((c) => (
                      <th key={c.k} title={c.nota}>{c.t}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {metricas.map((m) => (
                    <tr key={m.modelo} className={m.modelo.startsWith('Historial') ? 'is-base' : ''}>
                      <td>
                        <i style={{ background: COLOR_MODELO[m.modelo] }} />
                        {m.modelo}
                        {m.modelo.startsWith('Historial') && <small>línea de base</small>}
                      </td>
                      {COLUMNAS.map((c) => (
                        <td key={c.k} className={mejor(c.k) === m.modelo ? 'best' : ''}>{c.f(m[c.k])}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="note">
              Todas las métricas en {fmtNum(modelo.datos.siniestros_test)} siniestros de {modelo.periodo.test} que ningún modelo vio. Pasá el cursor sobre cada columna para ver su definición.
            </p>
          </section>

          <section className="report-sec">
            <h2>Curva de captura</h2>
            <p className="lede small">Qué porcentaje de los siniestros reales cae dentro de las celda-horas que cada modelo marca como más riesgosas. Más arriba y más a la izquierda es mejor.</p>
            <CurvaCaptura x={modelo.curva_captura.x} series={modelo.curva_captura.series} />
          </section>

          <section className="report-sec">
            <h2>¿Cuánto pesa el clima frente a la zona y la hora?</h2>
            <p className="lede small">
              Aporte medio de cada grupo de variables a la predicción del LightGBM (valores SHAP absolutos, {fmtNum(s.n_muestra)} celda-horas de 2024–2025).
              En una hora cualquiera el clima explica {pct(clima.share, 0)} del riesgo previsto; en las horas con lluvia, {pct(climaLluvia.share, 0)}.
            </p>
            <BarrasGrupos
              filas={[
                { etiqueta: 'Todas las horas', grupos: s.grupos },
                { etiqueta: 'Horas con lluvia', grupos: s.grupos_lluvia },
              ]}
            />
          </section>

          <section className="report-sec two-col">
            <div>
              <h2>Variables más influyentes</h2>
              <BarrasHorizontales
                datos={s.variables.slice(0, 12).map((v) => ({ etiqueta: v.etiqueta, valor: v.valor, color: COLOR_GRUPO[v.grupo], nota: v.grupo }))}
              />
              <p className="note">|SHAP| medio, en escala del logaritmo de la tasa. El color indica el grupo.</p>
            </div>
            <div>
              <h2>Efecto de la hora</h2>
              <BarrasEfecto etiquetas={Array.from({ length: 24 }, (_, h) => String(h).padStart(2, '0'))} valores={s.efecto_hora} rotulos={(i) => i % 3 === 0} />
              <h2 className="mt-lg">Efecto del día</h2>
              <BarrasEfecto etiquetas={DIAS_CORTO} valores={s.efecto_dia} alto={110} />
              <p className="note">Multiplicador del riesgo respecto del promedio, con todo lo demás igual (SHAP).</p>
            </div>
          </section>

          <section className="report-sec two-col">
            <div>
              <h2>Efecto de la lluvia en la hora</h2>
              <BarrasEfecto etiquetas={s.efecto_lluvia.map((d) => `${d.rango} mm`)} valores={s.efecto_lluvia.map((d) => d.efecto)} alto={120} />
              <h2 className="mt-lg">Lluvia acumulada en las 3 h previas</h2>
              <BarrasEfecto etiquetas={s.efecto_lluvia_3h.map((d) => `${d.rango} mm`)} valores={s.efecto_lluvia_3h.map((d) => d.efecto)} alto={120} />
              <p className="note">Multiplicador frente a una hora seca. Los tramos altos tienen pocas horas: leer con cautela.</p>
            </div>
            <div>
              <h2>Regresión de Poisson: el modelo interpretable</h2>
              <PuntosRazon datos={modelo.poisson_irr} />
              <p className="note">
                Razón de tasas: cuánto cambia el número esperado de siniestros si cambia solo ese factor. Controla por zona, hora × tipo de día, mes y comuna.
              </p>
            </div>
          </section>

          <section className="report-sec">
            <h2>Cómo leer estos resultados</h2>
            <div className="caveats">
              <p>
                <b>Siniestros reportados, no choques.</b> El dataset registra hechos con víctimas. Con lluvia hay menos tránsito y quizás menos denuncias de choques leves,
                así que un efecto pequeño del clima no significa que manejar con lluvia sea seguro: falta un dato de exposición (conteos vehiculares).
              </p>
              <p>
                <b>Riesgo por celda, no por vehículo.</b> Una avenida con mucho tránsito tiene más siniestros por hora aunque cada auto corra el mismo riesgo.
                El mapa sirve para decidir dónde y cuándo poner recursos de prevención, no para comparar la peligrosidad individual de las calles.
              </p>
              <p>
                <b>Clima de reanálisis.</b> ERA5 tiene ~25 km de resolución: la lluvia es la misma para toda una zona de la ciudad y subestima tormentas localizadas.
              </p>
            </div>
          </section>
        </article>
      </main>
    </>
  )
}
