// Antesala: lo que ve la sala mientras se acomoda, antes del primer clic (que habilita el sonido).
// La ciudad aparece dibujada solo con sus 62.737 siniestros; titilan los que ocurrieron a esta misma hora del
// día, y una línea en vivo dice cada cuántos minutos el modelo espera uno, con la hora y el clima de ahora.
import { useEffect, useMemo, useRef } from 'react'
import type { Siniestros } from '../data'
import { prefiereMenosMovimiento } from '../ambiente/luz'
import { DIAS, fmtNum, NOMBRE_CLIMA, totalCiudad, type Riesgo } from '../riesgo'
import type { Ahora } from '../vivo'

interface Props {
  siniestros: Siniestros
  riesgo: Riesgo
  ahora: Ahora
  clima: string
  conPronostico: boolean
  onSonido: () => void
  onSilencio: () => void
  onSaltar: () => void
}

export function Antesala({ siniestros: s, riesgo, ahora, clima, conPronostico, onSonido, onSilencio, onSaltar }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const cuentaRef = useRef<HTMLElement>(null)
  const n = s.lon.length

  // Siniestros esperados por hora en toda la ciudad, según el modelo, para este día, hora y clima.
  const iClima = Math.max(0, riesgo.climas.indexOf(clima))
  const porHoraModelo = totalCiudad(riesgo, iClima, ahora.dia, ahora.hora)
  const cadaMin = 60 / Math.max(porHoraModelo, 1e-6)
  const tasa = useRef(porHoraModelo)
  useEffect(() => {
    tasa.current = porHoraModelo
  }, [porHoraModelo])

  // Índices de los siniestros de cada hora del día: titilan los de la hora actual.
  const porHora = useMemo(() => {
    const listas: number[][] = Array.from({ length: 24 }, () => [])
    for (let j = 0; j < n; j++) listas[s.hora[j]].push(j)
    return listas
  }, [s, n])
  const horaRef = useRef(ahora.hora)
  useEffect(() => {
    horaRef.current = ahora.hora
  }, [ahora.hora])

  useEffect(() => {
    const canvas = canvasRef.current!
    const c = canvas.getContext('2d')!
    const calma = prefiereMenosMovimiento()
    let W = 0
    let H = 0
    let dpr = 1
    let base: HTMLCanvasElement | null = null
    const xy = new Float32Array(n * 2)

    // Proyección equirectangular corregida por la latitud, ajustada a la mitad derecha (o a toda la pantalla si es angosta).
    const medir = () => {
      dpr = Math.min(window.devicePixelRatio || 1, 2)
      W = canvas.clientWidth
      H = canvas.clientHeight
      canvas.width = W * dpr
      canvas.height = H * dpr
      let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity
      const kx = Math.cos((34.6 * Math.PI) / 180)
      for (let j = 0; j < n; j++) {
        const x = s.lon[j] * kx
        const y = -s.lat[j]
        x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y)
      }
      const angosta = W < 900
      const caja = angosta ? { l: 0.04 * W, t: 0.06 * H, w: 0.92 * W, h: 0.88 * H } : { l: 0.4 * W, t: 0.05 * H, w: 0.57 * W, h: 0.9 * H }
      const esc = Math.min(caja.w / (x1 - x0), caja.h / (y1 - y0))
      const ox = caja.l + (caja.w - (x1 - x0) * esc) / 2
      const oy = caja.t + (caja.h - (y1 - y0) * esc) / 2
      for (let j = 0; j < n; j++) {
        xy[j * 2] = ox + (s.lon[j] * kx - x0) * esc
        xy[j * 2 + 1] = oy + (-s.lat[j] - y0) * esc
      }
      // La ciudad completa se dibuja una sola vez en un canvas aparte.
      base = document.createElement('canvas')
      base.width = W * dpr
      base.height = H * dpr
      const b = base.getContext('2d')!
      b.setTransform(dpr, 0, 0, dpr, 0, 0)
      b.globalCompositeOperation = 'lighter'
      b.fillStyle = 'rgba(255, 140, 70, 0.13)'
      const r = angosta ? 1 : 1.25
      for (let j = 0; j < n; j++) b.fillRect(xy[j * 2] - r / 2, xy[j * 2 + 1] - r / 2, r, r)
    }
    medir()
    window.addEventListener('resize', medir)

    interface Chispa { j: number; vida: number; dura: number }
    const chispas: Chispa[] = []
    const inicio = performance.now()
    let previo = inicio
    let ultimoTexto = 0
    let raf = 0
    const cuadro = (t: number) => {
      const dt = Math.min(0.1, (t - previo) / 1000)
      previo = t
      c.setTransform(dpr, 0, 0, dpr, 0, 0)
      c.clearRect(0, 0, W, H)
      // La ciudad "respira" apenas.
      c.globalAlpha = calma ? 1 : 0.86 + 0.14 * Math.sin(t / 2600)
      if (base) c.drawImage(base, 0, 0, W, H)
      c.globalAlpha = 1
      if (!calma) {
        // Chispas: siniestros reales de esta misma hora del día, uno tras otro.
        const lista = porHora[horaRef.current]
        let nuevas = dt * 22
        while (nuevas > 0 && lista.length) {
          if (Math.random() < nuevas) chispas.push({ j: lista[Math.floor(Math.random() * lista.length)], vida: 0, dura: 1.4 + Math.random() * 1.6 })
          nuevas -= 1
        }
        c.globalCompositeOperation = 'lighter'
        for (let k = chispas.length - 1; k >= 0; k--) {
          const ch = chispas[k]
          ch.vida += dt
          const f = ch.vida / ch.dura
          if (f >= 1) {
            chispas.splice(k, 1)
            continue
          }
          const a = f < 0.12 ? f / 0.12 : (1 - f) ** 1.5
          const x = xy[ch.j * 2]
          const y = xy[ch.j * 2 + 1]
          const g = c.createRadialGradient(x, y, 0, x, y, 9)
          g.addColorStop(0, `rgba(255, 214, 160, ${0.95 * a})`)
          g.addColorStop(0.25, `rgba(255, 140, 70, ${0.45 * a})`)
          g.addColorStop(1, 'rgba(255, 120, 60, 0)')
          c.fillStyle = g
          c.fillRect(x - 9, y - 9, 18, 18)
          // Onda que se abre.
          c.strokeStyle = `rgba(255, 160, 100, ${0.35 * a})`
          c.lineWidth = 1
          c.beginPath()
          c.arc(x, y, 3 + f * 16, 0, Math.PI * 2)
          c.stroke()
        }
        c.globalCompositeOperation = 'source-over'
      }
      // Siniestros esperados desde que se abrió la página (se actualiza 4 veces por segundo).
      if (t - ultimoTexto > 250 && cuentaRef.current) {
        ultimoTexto = t
        cuentaRef.current.textContent = fmtNum((((t - inicio) / 3_600_000) * tasa.current), 3)
      }
      raf = requestAnimationFrame(cuadro)
    }
    raf = requestAnimationFrame(cuadro)
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', medir)
    }
  }, [s, n, porHora])

  const reloj = `${String(ahora.hora).padStart(2, '0')}:${String(ahora.minuto).padStart(2, '0')}`

  return (
    <section className="antesala">
      <canvas ref={canvasRef} className="a-ciudad" aria-hidden />
      <div className="a-velo" aria-hidden />
      <div className="a-texto">
        <p className="a-kicker">Trabajo práctico · Ciencia de Datos</p>
        <h1 className="a-titulo">Siniestros viales en la Ciudad de Buenos Aires</h1>
        <p className="a-sub">Cada punto de la derecha es un siniestro con víctimas, 2019–2025. Los que titilan ocurrieron a esta misma hora del día.</p>

        <div className="a-vivo">
          <p className="a-vivo-kicker">
            <i className="live-dot" aria-hidden /> Ahora · {DIAS[ahora.dia]} {reloj} · {conPronostico ? NOMBRE_CLIMA[clima] : 'sin pronóstico, se asume despejado'}
          </p>
          <p className="a-vivo-frase">
            Uno cada <b>{fmtNum(cadaMin, cadaMin < 10 ? 1 : 0)}</b> minutos.
          </p>
          <p className="a-vivo-nota">
            Es lo que el modelo espera en toda la ciudad a esta hora y con este clima. Desde que se abrió esta página: <b ref={cuentaRef}>0</b>.
          </p>
        </div>

        <div className="h-acciones">
          <button className="h-primario" onClick={onSonido}>Comenzar con sonido</button>
          <button className="h-secundario" onClick={onSilencio}>Sin sonido</button>
        </div>
        <p className="a-pie">
          Recomendado con sonido y en pantalla completa (F11) ·{' '}
          <button className="a-saltar" onClick={onSaltar}>ir directo a la portada</button>
        </p>
      </div>
    </section>
  )
}
