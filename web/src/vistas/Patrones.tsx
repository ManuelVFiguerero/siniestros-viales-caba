import type { ReactNode } from 'react'
import type { Patron, Patrones as PatronesData, ZonaPatron } from '../data'
import { COLOR_DIA, COLOR_NOCHE, CurvaHoraClima, FilasRazon, Interacciones } from '../components/graficosPatrones'
import { DIAS, fmtNum, hhmm, NOMBRE_CLIMA } from '../riesgo'

export interface DestinoMapa {
  dia: number
  hora: number
  clima: string
  celda?: string
}

const VEREDICTO: Record<Patron['veredicto'], { texto: string; clase: string }> = {
  confirmado: { texto: 'Confirmado en los datos', clase: 'ok' },
  sugerente: { texto: 'Sugerente · pocos casos', clase: 'warn' },
  'sin efecto': { texto: 'Sin efecto claro', clase: 'muted' },
  modelo: { texto: 'Patrón del modelo', clase: 'model' },
}

function Grafico({ p }: { p: Patron }) {
  const g = p.grafico
  if (!g) return null
  if (g.tipo === 'curva_hora') return <CurvaHoraClima modelo={g.modelo} observado={g.observado} />
  if (g.tipo === 'victimas')
    return (
      <FilasRazon
        leyenda={[{ nombre: 'De día (7–20 h)', color: COLOR_DIA }, { nombre: 'De noche (21–6 h)', color: COLOR_NOCHE }]}
        filas={g.filas.map((f) => ({ etiqueta: f.modo, series: [{ nombre: 'De día', color: COLOR_DIA, r: f.dia }, { nombre: 'De noche', color: COLOR_NOCHE, r: f.noche }] }))}
      />
    )
  if (g.tipo === 'pares') return <FilasRazon filas={g.filas.map((f) => ({ etiqueta: f.etiqueta, series: [{ color: 'var(--ink-2)', r: f }] }))} />
  return <Interacciones filas={g.filas} />
}

function ListaZonas({ titulo, zonas, unidad, escenario, onMapa }: { titulo: string; zonas: ZonaPatron[]; unidad: string; escenario?: Patron['escenario']; onMapa: (d: DestinoMapa) => void }) {
  return (
    <div className="pz">
      <p className="kicker">{titulo}</p>
      <ol>
        {zonas.map((z) => (
          <li key={z.id}>
            <button onClick={() => escenario && onMapa({ ...escenario, celda: z.id })} disabled={!escenario}>
              <span className="pz-name">
                {z.nombre}
                <small>Comuna {z.comuna}</small>
              </span>
              <span className="pz-val">{fmtNum(z.valor * 100, 0)} % {unidad}</span>
            </button>
          </li>
        ))}
      </ol>
    </div>
  )
}

export function Patrones({ datos, cabecera, onMapa }: { datos: PatronesData; cabecera: ReactNode; onMapa: (d: DestinoMapa) => void }) {
  const ps = datos.patrones
  return (
    <>
      <aside className="side">
        {cabecera}
        <div className="side-body">
          <section className="block">
            <p className="kicker">Qué es esto</p>
            <p className="lede small flush">
              Patrones que encontró el modelo cruzando hora, día, lugar y clima. Cada uno se contrastó con los siniestros
              reales para separar lo que es un efecto de lo que es ruido.
            </p>
          </section>
          <section className="block">
            <p className="kicker">Índice</p>
            <ol className="toc">
              {ps.map((p, i) => (
                <li key={p.id}>
                  <a href={`#p-${p.id}`} onClick={(e) => { e.preventDefault(); document.getElementById(`p-${p.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }) }}>
                    <span className="toc-n">{String(i + 1).padStart(2, '0')}</span>
                    <span>{p.titulo}</span>
                    <i className={`dot ${VEREDICTO[p.veredicto].clase}`} title={VEREDICTO[p.veredicto].texto} />
                  </a>
                </li>
              ))}
            </ol>
          </section>
          <section className="block">
            <p className="kicker">Cómo se validó</p>
            <p className="hint flush">{datos.metodo}</p>
            <ul className="badge-key">
              {(['confirmado', 'sugerente', 'modelo'] as const).map((k) => (
                <li key={k}><i className={`dot ${VEREDICTO[k].clase}`} />{VEREDICTO[k].texto}</li>
              ))}
            </ul>
          </section>
        </div>
        <footer className="side-foot">Detalle y figuras para la presentación en <code>reports/patrones.md</code>.</footer>
      </aside>

      <main className="stage report">
        <article className="report-body">
          <header className="report-head">
            <p className="kicker">Patrones · siniestros con víctimas 2019–2025</p>
            <h1>El clima no hace más peligrosa la ciudad: cambia cuándo y dónde lo es</h1>
            <p className="lede">
              De día la lluvia vacía las calles y los siniestros bajan; de noche, con menos visibilidad, suben. El modelo
              aprendió solo esa inversión, y los datos la confirman.
            </p>
          </header>

          {ps.map((p, i) => {
            const v = VEREDICTO[p.veredicto]
            return (
              <section key={p.id} id={`p-${p.id}`} className="report-sec patron">
                <div className="patron-head">
                  <span className="patron-n">{String(i + 1).padStart(2, '0')}</span>
                  <span className={`badge ${v.clase}`}>{v.texto}</span>
                </div>
                <h2 className="patron-title">{p.titulo}</h2>
                <p className="lede small">{p.resumen}</p>
                <Grafico p={p} />
                {(p.zonas || p.zonas_caen) && (
                  <div className="pz-wrap">
                    {p.zonas && <ListaZonas titulo="Zonas donde más pesa la madrugada" zonas={p.zonas} unidad="del riesgo diurno hábil" escenario={p.escenario} onMapa={onMapa} />}
                    {p.zonas_caen && <ListaZonas titulo="Se vacían el domingo" zonas={p.zonas_caen} unidad="del riesgo hábil" escenario={p.escenario} onMapa={onMapa} />}
                    {p.zonas_suben && <ListaZonas titulo="Siguen activas el domingo" zonas={p.zonas_suben} unidad="del riesgo hábil" escenario={p.escenario} onMapa={onMapa} />}
                  </div>
                )}
                <p className="patron-read"><b>Lectura.</b> {p.lectura}</p>
                {p.escenario && (
                  <button className="play map-link" onClick={() => onMapa(p.escenario!)}>
                    Ver en el mapa: {DIAS[p.escenario.dia].toLowerCase()} {hhmm(p.escenario.hora)}, {NOMBRE_CLIMA[p.escenario.clima].toLowerCase()} →
                  </button>
                )}
              </section>
            )
          })}
        </article>
      </main>
    </>
  )
}
