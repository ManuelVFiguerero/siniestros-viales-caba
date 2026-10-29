// Intro de la presentación (~13 s): créditos sobre una ruta mojada, un auto que se acerca a la pantalla,
// el choque contra el "vidrio" y, en silencio, la cifra real. Esc o clic en "Saltar" la terminan.
import { useEffect, useMemo, useRef, useState } from 'react'
import gsap from 'gsap'
import { crearSonidoIntro, type SonidoIntro } from '../ambiente/introSonido'
import { prefiereMenosMovimiento } from '../ambiente/luz'
import { fmtNum } from '../riesgo'
import { iniciarEscena3D } from '../intro3d/escena'

export const INTEGRANTES = ['Tomas Joaquin Cortes', 'Dante Leandro Aguilar', 'Walter Jaldin', 'Manuel Vicente Figuerero']

interface Props {
  /** El sonido ya fue habilitado con un clic. */
  conSonido: boolean
  total: number
  desde: number
  hasta: number
  onFin: () => void
}

/** Grietas del vidrio: rayos quebrados desde el punto de impacto y anillos concéntricos. */
function grietas(cx: number, cy: number): string[] {
  let semilla = 11
  const azar = () => ((semilla = (semilla * 16807) % 2147483647) / 2147483647)
  const lineas: string[] = []
  const rayos = 17
  for (let r = 0; r < rayos; r++) {
    const ang = (r / rayos) * Math.PI * 2 + azar() * 0.3
    let x = cx
    let y = cy
    let d = `M${x.toFixed(1)} ${y.toFixed(1)}`
    const largo = 380 + azar() * 900
    let recorrido = 0
    while (recorrido < largo) {
      const paso = 25 + azar() * 60
      const a = ang + (azar() - 0.5) * 0.5
      x += Math.cos(a) * paso
      y += Math.sin(a) * paso
      recorrido += paso
      d += ` L${x.toFixed(1)} ${y.toFixed(1)}`
    }
    lineas.push(d)
  }
  for (const radio of [40, 85, 150, 240]) {
    let d = ''
    const puntos = 22
    for (let k = 0; k <= puntos; k++) {
      if (azar() < 0.25) continue
      const a = (k / puntos) * Math.PI * 2
      const rr = radio * (0.85 + azar() * 0.3)
      d += `${d && azar() > 0.3 ? ' L' : ' M'}${(cx + Math.cos(a) * rr).toFixed(1)} ${(cy + Math.sin(a) * rr).toFixed(1)}`
    }
    lineas.push(d.trim())
  }
  return lineas
}

export function Intro({ conSonido, total, desde, hasta, onFin }: Props) {
  const raiz = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const estado = useRef({ p: 0, luces: 0, altas: 0, fin: false })
  const terminar = useRef(onFin)
  const saltarRef = useRef<() => void>(() => onFin())
  const lineas = useMemo(() => grietas(960 + 40, 540 - 60), [])

  useEffect(() => {
    terminar.current = onFin
  })

  // ---------- escena 3D (three.js); si no hay WebGL, la versión plana de abajo ----------
  const canvas3dRef = useRef<HTMLCanvasElement>(null)
  const [sin3d, setSin3d] = useState(false)
  useEffect(() => {
    const destruir = iniciarEscena3D(canvas3dRef.current!, estado, prefiereMenosMovimiento())
    if (!destruir) setSin3d(true)
    return () => destruir?.()
  }, [])

  // ---------- versión plana (canvas 2D): respaldo para equipos sin WebGL ----------
  useEffect(() => {
    if (!sin3d) return
    const canvas = canvasRef.current!
    const c = canvas.getContext('2d')!
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5)
    let W = 0
    let H = 0
    const medir = () => {
      W = canvas.clientWidth
      H = canvas.clientHeight
      canvas.width = W * dpr
      canvas.height = H * dpr
    }
    medir()
    window.addEventListener('resize', medir)
    const gotas = Array.from({ length: 420 }, () => ({ x: Math.random(), y: Math.random(), v: 0.6 + Math.random() * 0.8, l: 0.01 + Math.random() * 0.025 }))
    const luces = Array.from({ length: 90 }, () => ({ x: Math.random(), y: Math.random(), t: Math.random(), f: Math.random() * 6 }))
    let fase = 0
    let previo = performance.now()
    let raf = 0

    const cuadro = (ahora: number) => {
      const dt = Math.min(0.05, (ahora - previo) / 1000)
      previo = ahora
      const e = estado.current
      c.setTransform(dpr, 0, 0, dpr, 0, 0)
      c.fillStyle = '#030405'
      c.fillRect(0, 0, W, H)
      const vx = W / 2
      const vy = H * 0.6
      const velocidad = 0.35 + e.p * e.p * 5
      fase = (fase + dt * velocidad) % 1

      // Resplandor de la ciudad en el horizonte, luces lejanas y suelo.
      const cielo = c.createLinearGradient(0, vy - H * 0.25, 0, vy)
      cielo.addColorStop(0, 'rgba(40, 30, 24, 0)')
      cielo.addColorStop(1, 'rgba(70, 48, 30, 0.35)')
      c.fillStyle = cielo
      c.fillRect(0, vy - H * 0.25, W, H * 0.25)
      for (const l of luces) {
        c.fillStyle = `rgba(255, ${190 + l.t * 50}, ${120 + l.t * 80}, ${0.25 + 0.35 * Math.abs(Math.sin(ahora / 900 + l.f))})`
        c.fillRect(l.x * W, vy - 2 - l.y * H * 0.035, 1.6, 1.6)
      }
      const suelo = c.createLinearGradient(0, vy, 0, H)
      suelo.addColorStop(0, '#050607')
      suelo.addColorStop(1, '#0a0b0c')
      c.fillStyle = suelo
      c.fillRect(0, vy, W, H - vy)

      // Ruta en perspectiva.
      const g = c.createLinearGradient(0, vy, 0, H)
      g.addColorStop(0, '#07080a')
      g.addColorStop(1, '#121417')
      c.fillStyle = g
      c.beginPath()
      c.moveTo(vx - 4, vy)
      c.lineTo(vx + 4, vy)
      c.lineTo(W * 1.6, H)
      c.lineTo(-W * 0.6, H)
      c.closePath()
      c.fill()
      // Bordes y línea central discontinua que viene hacia la cámara.
      c.strokeStyle = 'rgba(200, 205, 210, 0.12)'
      c.lineWidth = 1.5
      c.beginPath()
      c.moveTo(vx - 3, vy)
      c.lineTo(-W * 0.45, H)
      c.moveTo(vx + 3, vy)
      c.lineTo(W * 1.45, H)
      c.stroke()
      for (let k = 0; k < 14; k++) {
        const d0 = ((k + fase) / 14) ** 2.2
        const d1 = ((k + fase + 0.45) / 14) ** 2.2
        const y0 = vy + (H - vy) * d0
        const y1 = vy + (H - vy) * Math.min(1, d1)
        const w0 = 1 + d0 * 16
        const w1 = 1 + d1 * 16
        c.fillStyle = `rgba(230, 200, 120, ${0.1 + d0 * 0.35})`
        c.beginPath()
        c.moveTo(vx - w0 / 2, y0)
        c.lineTo(vx + w0 / 2, y0)
        c.lineTo(vx + w1 / 2, y1)
        c.lineTo(vx - w1 / 2, y1)
        c.fill()
      }

      // Auto: crece con la cercanía (p³) y se corre un poco hacia el centro al final.
      const p = e.p
      const s = 0.012 + p ** 3 * 1.5
      const cx = vx + W * 0.06 * (1 - p)
      const cy = vy + H * 0.02 + s * H * 0.22
      const brillo = e.luces * (1 + e.altas * 1.6)
      if (e.luces > 0) {
        // Reflejos de los faros sobre el asfalto mojado.
        for (const lado of [-1, 1]) {
          const lx = cx + lado * s * W * 0.2
          const ref = c.createLinearGradient(0, cy, 0, H)
          ref.addColorStop(0, `rgba(255, 236, 200, ${0.25 * brillo})`)
          ref.addColorStop(1, 'rgba(255, 236, 200, 0)')
          c.fillStyle = ref
          c.fillRect(lx - s * W * 0.03, cy, s * W * 0.06, H - cy)
        }
        // Silueta del auto.
        if (s > 0.08) {
          c.fillStyle = 'rgba(10, 12, 15, 0.95)'
          const bw = s * W * 0.62
          const bh = s * W * 0.24
          c.beginPath()
          c.roundRect(cx - bw / 2, cy - bh * 0.95, bw, bh * 1.25, bh * 0.25)
          c.fill()
          c.fillStyle = 'rgba(40, 46, 54, 0.6)'
          c.beginPath()
          c.roundRect(cx - bw * 0.36, cy - bh * 1.55, bw * 0.72, bh * 0.68, bh * 0.2)
          c.fill()
        }
        // Faros con resplandor.
        c.globalCompositeOperation = 'lighter'
        for (const lado of [-1, 1]) {
          const lx = cx + lado * s * W * 0.2
          const r = Math.max(2.5, s * W * 0.07) * (1 + e.altas * 0.6)
          const halo = c.createRadialGradient(lx, cy, 0, lx, cy, r * 9)
          halo.addColorStop(0, `rgba(255, 244, 220, ${Math.min(1, 0.55 * brillo)})`)
          halo.addColorStop(0.15, `rgba(255, 230, 190, ${0.22 * brillo})`)
          halo.addColorStop(1, 'rgba(255, 220, 170, 0)')
          c.fillStyle = halo
          c.beginPath()
          c.arc(lx, cy, r * 9, 0, Math.PI * 2)
          c.fill()
          c.fillStyle = `rgba(255, 255, 250, ${Math.min(1, brillo)})`
          c.beginPath()
          c.ellipse(lx, cy, r, r * 0.7, 0, 0, Math.PI * 2)
          c.fill()
        }
        c.globalCompositeOperation = 'source-over'
      }

      // Lluvia: más visible dentro del haz de los faros.
      c.lineWidth = 1
      for (const d of gotas) {
        d.y += d.v * dt * (0.9 + p)
        if (d.y > 1) {
          d.y -= 1
          d.x = Math.random()
        }
        const x = d.x * W
        const y = d.y * H
        const cerca = e.luces ? Math.max(0, 1 - Math.hypot(x - cx, y - cy) / (W * (0.12 + s * 0.6))) : 0
        c.strokeStyle = `rgba(200, 215, 235, ${0.08 + cerca * 0.55 * brillo})`
        c.beginPath()
        c.moveTo(x, y)
        c.lineTo(x - d.l * W * 0.08, y - d.l * H)
        c.stroke()
      }
      if (!e.fin) raf = requestAnimationFrame(cuadro)
    }
    raf = requestAnimationFrame(cuadro)
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', medir)
    }
  }, [sin3d])

  // ---------- guion temporal ----------
  useEffect(() => {
    const el = raiz.current!
    const calma = prefiereMenosMovimiento()
    let sonido: SonidoIntro | null = null
    if (conSonido) {
      sonido = crearSonidoIntro()
      sonido.empezar()
    }
    const e = estado.current
    const q = (s: string) => el.querySelectorAll(s)
    const tl = gsap.timeline({ onComplete: () => terminar.current() })
    // Los créditos llegan desde el fondo (profundidad real con perspectiva CSS).
    tl.fromTo(q('.i-kicker'), { autoAlpha: 0, z: -420, y: 0 }, { autoAlpha: 1, z: 0, duration: 1.3, ease: 'expo.out' }, 0.4)
    tl.fromTo(q('.i-materia'), { autoAlpha: 0, z: -700, y: 0, filter: 'blur(14px)' }, { autoAlpha: 1, z: 0, filter: 'blur(0px)', duration: 1.5, ease: 'expo.out' }, 1.2)
    tl.to(e, { luces: 1, duration: 2.5, ease: 'power1.in' }, 2.6)
    tl.to(e, { p: 0.5, duration: 4.4, ease: 'power1.in', onUpdate: () => sonido?.acercar(e.p) }, 2.6)
    q('.i-nombre').forEach((n, k) => {
      const t = 2.9 + k * 0.85
      tl.fromTo(n, { autoAlpha: 0, z: -360, y: 0, filter: 'blur(8px)' }, { autoAlpha: 1, z: 0, filter: 'blur(0px)', duration: 0.9, ease: 'expo.out' }, t)
      tl.call(() => sonido?.golpe(k), [], t)
    })
    // Salen hacia la cámara, como si el auto los atravesara.
    tl.to(q('.i-creditos'), { autoAlpha: 0, z: 260, filter: 'blur(10px)', duration: 0.7, ease: 'power2.in' }, 6.9)
    tl.to(e, { p: 1, duration: 1.6, ease: 'power3.in', onUpdate: () => sonido?.acercar(e.p) }, 7.0)
    tl.call(() => sonido?.bocina(), [], 7.35)
    tl.to(e, { altas: 1, duration: 0.12, yoyo: true, repeat: 3 }, 7.45)
    tl.call(() => sonido?.frenada(), [], 7.9)
    // Impacto.
    tl.call(
      () => {
        sonido?.choque()
        e.fin = true
      },
      [],
      8.6,
    )
    tl.set(q('.i-ruta'), { autoAlpha: 0 }, 8.6)
    if (!calma) {
      tl.fromTo(q('.i-flash'), { opacity: 1 }, { opacity: 0, duration: 0.45, ease: 'power2.out', immediateRender: false }, 8.6)
      tl.fromTo(q('.i-sacudon'), { x: -18, y: 12 }, { x: 0, y: 0, duration: 0.55, ease: 'elastic.out(1.2, 0.25)', immediateRender: false }, 8.6)
    }
    tl.set(q('.i-grieta'), { autoAlpha: 1 }, 8.6)
    tl.fromTo(q('.i-grieta path'), { strokeDashoffset: 1600 }, { strokeDashoffset: 0, duration: 0.35, ease: 'power4.out', stagger: 0.008, immediateRender: false }, 8.62)
    tl.to(q('.i-grieta'), { autoAlpha: 0, duration: 0.8 }, 10.0)
    tl.to(q('.i-cifra'), { autoAlpha: 1, duration: 0.9 }, 10.6)
    tl.to(q('.i-cifra'), { autoAlpha: 0, duration: 0.7 }, 13.4)
    // Fundido a la portada (que ya está debajo) en vez de un corte.
    tl.to(el, { autoAlpha: 0, duration: 1.1, ease: 'power1.inOut' }, 13.9)

    const saltarConFundido = () => {
      tl.kill()
      sonido?.detener()
      gsap.to(el, { autoAlpha: 0, duration: 0.45, ease: 'power1.out', onComplete: () => terminar.current() })
    }
    saltarRef.current = saltarConFundido
    // Parallax: los créditos giran apenas siguiendo al mouse.
    const alMover = (ev: PointerEvent) => {
      if (calma) return
      const rx = (ev.clientY / window.innerHeight - 0.5) * -8
      const ry = (ev.clientX / window.innerWidth - 0.5) * 10
      gsap.to(el.querySelector('.i-creditos'), { rotationX: rx, rotationY: ry, duration: 1.2, ease: 'power2.out', overwrite: 'auto' })
    }
    window.addEventListener('pointermove', alMover)
    const saltar = (ev: KeyboardEvent) => {
      if (ev.key === 'Escape') {
        ev.preventDefault()
        saltarConFundido()
      }
    }
    window.addEventListener('keydown', saltar)
    return () => {
      window.removeEventListener('keydown', saltar)
      window.removeEventListener('pointermove', alMover)
      tl.kill()
      sonido?.detener()
    }
  }, [conSonido])

  return (
    <div className="intro" ref={raiz}>
      <div className="i-sacudon">
        <canvas ref={canvas3dRef} className="i-ruta" style={{ display: sin3d ? 'none' : 'block' }} />
        <canvas ref={canvasRef} className="i-ruta" style={{ display: sin3d ? 'block' : 'none' }} />
        <div className="i-creditos">
          <p className="i-kicker">Trabajo práctico</p>
          <h1 className="i-materia">Ciencia de Datos</h1>
          <ul className="i-nombres">
            {INTEGRANTES.map((n) => (
              <li key={n} className="i-nombre"><span>{n}</span></li>
            ))}
          </ul>
        </div>
        <svg className="i-grieta" viewBox="0 0 1920 1080" preserveAspectRatio="xMidYMid slice" aria-hidden>
          {lineas.map((d, k) => (
            <path key={k} d={d} pathLength={1600} strokeDasharray="1600" />
          ))}
        </svg>
      </div>
      <div className="i-flash" />
      <p className="i-cifra">
        Entre {desde} y {hasta} hubo <b>{fmtNum(total)}</b> siniestros con víctimas en la Ciudad de Buenos Aires.
      </p>
      <button
        className="i-saltar"
        onClick={() => saltarRef.current()}
      >
        Saltar intro <kbd>Esc</kbd>
      </button>
    </div>
  )
}
