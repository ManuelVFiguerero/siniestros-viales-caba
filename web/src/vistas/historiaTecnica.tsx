// Piezas visuales de los actos más técnicos de la historia: la curva hora por hora, las fuentes de datos,
// el pipeline, la comparación de modelos, qué mira el modelo (SHAP) y las limitaciones.
// Todas leen los JSON del pipeline; las animaciones las dispara el useGSAP de Historia.tsx con las clases
// .h-trazo (líneas que se dibujan), .h-punto (puntos que aparecen) y [data-ancho] (barras que crecen).
import type { Modelo, Patrones } from '../data'
import { fmtNum } from '../riesgo'

interface Razon { rr: number; lo: number; hi: number }
interface Franja { franja: string; desde: number; hasta: number; lluvia: Razon; tormenta: Razon }

// ---------- 1. La curva: efecto de la lluvia según la hora ----------

export function CurvaHora({ patrones }: { patrones: Patrones }) {
  const g = patrones.patrones.find((p) => p.grafico?.tipo === 'curva_hora')?.grafico
  if (!g || g.tipo !== 'curva_hora') return null
  const { lluvia, tormenta } = g.modelo
  const observado = g.observado as Franja[]
  const W = 720
  const H = 330
  const m = { l: 56, r: 18, t: 22, b: 44 }
  const lo = 0.6
  const hi = 1.6
  const x = (h: number) => m.l + (h / 23) * (W - m.l - m.r)
  // Escala logarítmica: −20 % y +25 % quedan a la misma distancia de la línea de 1.
  const y = (v: number) => m.t + (1 - (Math.log(v) - Math.log(lo)) / (Math.log(hi) - Math.log(lo))) * (H - m.t - m.b)
  const linea = (vals: number[]) => vals.map((v, h) => `${h ? 'L' : 'M'}${x(h).toFixed(1)} ${y(v).toFixed(1)}`).join(' ')
  const marcas = [0.7, 0.8, 0.9, 1, 1.1, 1.25, 1.5]

  return (
    <svg className="h-curva" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Efecto de la lluvia y la tormenta sobre los siniestros según la hora del día">
      {/* Franjas de día y de noche. */}
      <rect x={x(0)} y={m.t} width={x(6.5) - x(0)} height={H - m.t - m.b} className="h-curva-noche" />
      <rect x={x(20.5)} y={m.t} width={x(23) - x(20.5)} height={H - m.t - m.b} className="h-curva-noche" />
      <text x={x(3.2)} y={m.t + 16} className="h-curva-etq" textAnchor="middle">noche</text>
      <text x={x(13.5)} y={m.t + 16} className="h-curva-etq" textAnchor="middle">día</text>
      <text x={x(21.8)} y={m.t + 16} className="h-curva-etq" textAnchor="middle">noche</text>
      {marcas.map((v) => (
        <g key={v}>
          <line x1={m.l} x2={W - m.r} y1={y(v)} y2={y(v)} className={v === 1 ? 'h-curva-base' : 'h-curva-grilla'} />
          <text x={m.l - 8} y={y(v) + 4} textAnchor="end" className="h-curva-eje">
            {v === 1 ? 'igual' : `${v > 1 ? '+' : '−'}${fmtNum(Math.abs(v - 1) * 100)} %`}
          </text>
        </g>
      ))}
      {[0, 6, 12, 18, 23].map((h) => (
        <text key={h} x={x(h)} y={H - m.b + 20} textAnchor="middle" className="h-curva-eje">{String(h).padStart(2, '0')} h</text>
      ))}
      <text x={x(7.6)} y={y(1) - 8} textAnchor="start" className="h-curva-eje">igual que con cielo despejado</text>
      {/* Observado: razón observados/esperados por franja, con IC 95 %. */}
      {observado.map((f) => {
        const cx = x((f.desde + f.hasta) / 2)
        return (
          <g key={f.franja} className="h-punto">
            <line x1={cx} x2={cx} y1={y(f.lluvia.lo)} y2={y(f.lluvia.hi)} className="h-curva-ic" />
            <rect x={x(f.desde) - 2} y={y(f.lluvia.rr) - 1.5} width={Math.max(8, x(f.hasta) - x(f.desde) + 4)} height={3} rx={1.5} className="h-curva-obs" />
          </g>
        )
      })}
      <path d={linea(tormenta)} className="h-trazo h-curva-tormenta" pathLength={1} />
      <path d={linea(lluvia)} className="h-trazo h-curva-lluvia" pathLength={1} />
      <g className="h-punto">
        <circle cx={x(22)} cy={y(tormenta[22])} r={6} className="h-curva-pico" />
        <text x={x(22) - 10} y={y(tormenta[22]) - 12} textAnchor="end" className="h-curva-nota">tormenta, 22 h</text>
      </g>
    </svg>
  )
}

// ---------- 2. Las fuentes de datos ----------

export function Fuentes({ total, filas }: { total: number; filas: number }) {
  const fuentes = [
    { k: 'Siniestros viales', fuente: 'BA Data · Ciudad de Buenos Aires', cifra: fmtNum(65818), nota: `registros 2019–2025 → ${fmtNum(total)} con coordenadas, fecha y hora válidas`, tag: 'base' },
    { k: 'Clima horario', fuente: 'Open-Meteo · reanálisis ERA5 (ECMWF)', cifra: '7', nota: 'variables por hora en 4 puntos de la ciudad: lluvia, temperatura, humedad, viento, ráfagas, nubosidad', tag: 'cruce' },
    { k: 'Calles y comunas', fuente: 'OpenStreetMap + BA Data', cifra: fmtNum(2860), nota: 'hexágonos H3 de ~350 m con km de avenida, autopista y calles que se cruzan', tag: 'cruce' },
    { k: 'Alumbrado LED', fuente: 'BA Data · Dirección General de Alumbrado', cifra: '¿?', nota: 'ubicación de cada luminaria: próximo cruce para entender la noche', tag: 'proximo' },
  ]
  return (
    <div className="h-fuentes">
      {fuentes.map((f) => (
        <div key={f.k} className={`h-fuente h-anim ${f.tag}`}>
          <span className="h-fuente-tag">{f.tag === 'base' ? 'dataset principal' : f.tag === 'cruce' ? 'se cruza con' : 'en análisis'}</span>
          <strong>{f.k}</strong>
          <span className="h-fuente-cifra">{f.cifra}</span>
          <p>{f.nota}</p>
          <small>{f.fuente}</small>
        </div>
      ))}
      <p className="h-fuentes-pie h-anim">
        Todo termina en una tabla de <b>{fmtNum(filas)}</b> filas: cada siniestro y una muestra de las horas sin siniestro de cada hexágono.
      </p>
    </div>
  )
}

// ---------- 3. El pipeline ----------

export function Pipeline({ celdaHoras }: { celdaHoras: number }) {
  const pasos = [
    { n: '01', t: 'Limpieza', d: 'Coordenadas fuera de CABA, fechas y horas inválidas' },
    { n: '02–03', t: 'Cruce con el clima', d: 'Cada siniestro toma el clima de su punto más cercano en esa hora' },
    { n: '05', t: 'Grilla H3', d: '2.860 hexágonos con su red vial y su comuna' },
    { n: '06', t: 'Tabla celda × hora', d: `${fmtNum(celdaHoras / 1e6, 1)} M de celda-horas, diseño caso-control` },
    { n: '07', t: 'Modelos', d: 'Poisson, Random Forest y LightGBM con validación temporal' },
    { n: '08–09', t: 'Escenarios y patrones', d: '840 mapas de riesgo y patrones contrastados con IC 95 %' },
  ]
  return (
    <ol className="h-pipeline">
      {pasos.map((p, k) => (
        <li key={p.n} className="h-paso h-anim" style={{ ['--k' as string]: k }}>
          <span className="h-paso-n">{p.n}</span>
          <strong>{p.t}</strong>
          <p>{p.d}</p>
        </li>
      ))}
    </ol>
  )
}

// ---------- 4. Comparación de modelos y qué mira el modelo ----------

export function ComparacionModelos({ modelo }: { modelo: Modelo }) {
  const orden = ['Historial de la celda', 'Poisson (GLM)', 'Random Forest', 'LightGBM']
  const filas = orden.map((n) => modelo.metricas.find((m) => m.modelo === n)).filter((m): m is Modelo['metricas'][number] => !!m)
  return (
    <table className="h-tabla h-anim">
      <thead>
        <tr>
          <th>Modelo</th>
          <th>AUC</th>
          <th>Deviance explicada</th>
          <th>Captura 10 %</th>
        </tr>
      </thead>
      <tbody>
        {filas.map((m) => (
          <tr key={m.modelo} className={m.modelo === 'LightGBM' ? 'gana' : m.modelo.startsWith('Historial') ? 'base' : ''}>
            <td>{m.modelo === 'Historial de la celda' ? 'Base: solo el historial de la zona' : m.modelo}</td>
            <td>{fmtNum(m.auc, 3)}</td>
            <td>{fmtNum(m.d2 * 100, 1)} %</td>
            <td>{fmtNum(m.captura_10 * 100, 1)} %</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

const COLOR_GRUPO: Record<string, string> = { Zona: '#8cc4ea', Momento: '#fdae61', Clima: '#ff7a52' }

export function Shap({ modelo }: { modelo: Modelo }) {
  const vars = modelo.shap.variables.slice(0, 9)
  const max = Math.max(...vars.map((v) => v.valor))
  return (
    <div className="h-shap-lista h-anim">
      <div className="h-shap-leyenda">
        {Object.entries(COLOR_GRUPO).map(([g, c]) => (
          <span key={g}><i style={{ background: c }} />{g}</span>
        ))}
      </div>
      {vars.map((v) => (
        <div key={v.variable} className="h-shap-fila">
          <span className="h-shap-nombre">{v.etiqueta}</span>
          <span className="h-shap-pista"><i data-ancho={Math.round((v.valor / max) * 100)} style={{ background: COLOR_GRUPO[v.grupo] ?? '#a8adb2' }} /></span>
        </div>
      ))}
    </div>
  )
}

// ---------- 5. Limitaciones y próximos pasos ----------

export function Limites() {
  const limites = [
    { t: 'No sabemos cuánta gente circula', d: 'Sin conteos de tránsito, "menos siniestros con lluvia" puede ser menos exposición y no calles más seguras.' },
    { t: 'El clima es aproximado', d: 'ERA5 tiene celdas de ~25 km: una tormenta localizada puede no aparecer en el dato.' },
    { t: 'Solo siniestros con víctimas', d: 'Los choques sin heridos no están, y los leves con lluvia podrían denunciarse menos.' },
  ]
  const proximos = [
    { t: '¿Las calles peor iluminadas explican el +9 % nocturno con lluvia?', d: 'Cruce con el dataset de alumbrado LED de BA Data: luminarias por km de calle en cada hexágono.' },
    { t: 'Medir la exposición', d: 'Conteos vehiculares por hora para separar "menos gente" de "más peligro".' },
    { t: 'Quién se lastima', d: 'Sumar el dataset de víctimas (edad, rol) para ver la gravedad con tormenta.' },
  ]
  return (
    <div className="h-limites">
      <div>
        <p className="h-sub h-anim">Limitaciones</p>
        {limites.map((l) => (
          <div key={l.t} className="h-tarjeta h-anim aviso">
            <strong>{l.t}</strong>
            <p>{l.d}</p>
          </div>
        ))}
      </div>
      <div>
        <p className="h-sub h-anim">Próximos pasos</p>
        {proximos.map((l, k) => (
          <div key={l.t} className={`h-tarjeta h-anim${k === 0 ? ' destacada' : ''}`}>
            <strong>{l.t}</strong>
            <p>{l.d}</p>
          </div>
        ))}
      </div>
    </div>
  )
}
