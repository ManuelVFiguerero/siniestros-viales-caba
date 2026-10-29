// Capa de clima sobre el mapa: lluvia, gotas en el "vidrio", salpicaduras, relámpagos (canvas) y sol, nubes,
// niebla y luz del día (capas CSS). No intercepta el mouse: el mapa sigue siendo usable debajo.
import { useEffect, useRef } from 'react'
import { luzDelDia, nivelesDe, prefiereMenosMovimiento, type Niveles } from './luz'

interface Props {
  clima: string
  /** Hora del escenario (admite decimales para transiciones suaves). */
  hora: number
  /** 0–1,1: intensidad de la lluvia (por ejemplo, desde los mm/h reales). Si no viene, la típica del clima. */
  intensidad?: number
  /** 'sutil' sobre el mapa de trabajo; 'pleno' en la historia. */
  fuerza?: 'sutil' | 'pleno'
  /** Gotas que corren sobre la pantalla, como en un vidrio. */
  vidrio?: boolean
  /** Se llama en cada relámpago; cercania 0–1 (para sincronizar el trueno). */
  onRelampago?: (cercania: number) => void
}

interface Gota { x: number; y: number; z: number; v: number; l: number }
interface Anillo { x: number; y: number; t: number; r: number }
interface GotaVidrio { x: number; y: number; r: number; vy: number; quieta: number; rastro: number }
interface Rayo { puntos: [number, number][][]; t: number }

const MAX_GOTAS = 1100

export function EfectoClima({ clima, hora, intensidad, fuerza = 'sutil', vidrio = false, onRelampago }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const flashRef = useRef<HTMLDivElement>(null)
  const objetivo = useRef<Niveles>(nivelesDe(clima, intensidad))
  const opciones = useRef({ fuerza, vidrio, onRelampago })

  useEffect(() => {
    objetivo.current = nivelesDe(clima, intensidad)
    opciones.current = { fuerza, vidrio, onRelampago }
  })

  useEffect(() => {
    const canvas = canvasRef.current!
    const c = canvas.getContext('2d')!
    const calma = prefiereMenosMovimiento()
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5)
    let ancho = 0
    let alto = 0
    const medir = () => {
      const r = canvas.getBoundingClientRect()
      ancho = r.width
      alto = r.height
      canvas.width = Math.round(ancho * dpr)
      canvas.height = Math.round(alto * dpr)
    }
    medir()
    const ro = new ResizeObserver(medir)
    ro.observe(canvas)

    const actual: Niveles = { lluvia: 0, nubes: 0, niebla: 0, sol: 0, tormenta: 0 }
    const gotas: Gota[] = []
    const anillos: Anillo[] = []
    const vidrioGotas: GotaVidrio[] = []
    let rayo: Rayo | null = null
    let proximoRayo = performance.now() + 2500
    let previo = performance.now()
    let raf = 0
    let sucio = false
    // Gota de vidrio pre-dibujada una vez: dibujarla escalada es mucho más barato que un degradado por cuadro.
    const sprite = document.createElement('canvas')
    sprite.width = sprite.height = 64
    {
      const sc = sprite.getContext('2d')!
      const grad = sc.createRadialGradient(32 - 11, 32 - 13, 3, 32, 32, 32)
      grad.addColorStop(0, 'rgba(255, 255, 255, 0.55)')
      grad.addColorStop(0.35, 'rgba(200, 220, 245, 0.12)')
      grad.addColorStop(0.85, 'rgba(10, 16, 26, 0.25)')
      grad.addColorStop(1, 'rgba(255, 255, 255, 0.18)')
      sc.beginPath()
      sc.ellipse(32, 32, 29.5, 32, 0, 0, Math.PI * 2)
      sc.fillStyle = grad
      sc.fill()
    }

    const nuevaGota = (arriba: boolean): Gota => {
      const z = 0.35 + Math.random() * 0.65
      return { x: Math.random() * (ancho + 200) - 100, y: arriba ? -Math.random() * alto * 0.3 : Math.random() * alto, z, v: 900 + 900 * z, l: 10 + 22 * z }
    }

    const nuevaVidrio = (): GotaVidrio => ({
      x: Math.random() * ancho,
      y: Math.random() * alto * 0.9,
      r: 2 + Math.random() ** 2 * 9,
      vy: 0,
      quieta: 1 + Math.random() * 6,
      rastro: 0,
    })

    const crearRayo = (): Rayo => {
      const ramas: [number, number][][] = []
      let x = ancho * (0.15 + Math.random() * 0.7)
      let y = -10
      const fin = alto * (0.45 + Math.random() * 0.35)
      const principal: [number, number][] = [[x, y]]
      while (y < fin) {
        x += (Math.random() - 0.5) * 46
        y += 14 + Math.random() * 26
        principal.push([x, y])
        if (Math.random() < 0.12 && ramas.length < 3) {
          const rama: [number, number][] = [[x, y]]
          let bx = x
          let by = y
          const dir = Math.random() < 0.5 ? -1 : 1
          for (let k = 0; k < 5 + Math.random() * 6; k++) {
            bx += dir * (8 + Math.random() * 22)
            by += 10 + Math.random() * 20
            rama.push([bx, by])
          }
          ramas.push(rama)
        }
      }
      return { puntos: [principal, ...ramas], t: 0 }
    }

    const cuadro = (ahora: number) => {
      const dt = Math.min(0.05, (ahora - previo) / 1000)
      previo = ahora
      const obj = objetivo.current
      const { fuerza: f, vidrio: conVidrio } = opciones.current
      const k = 1 - Math.exp(-dt * 1.6) // acercamiento suave a los niveles objetivo
      for (const clave of Object.keys(actual) as (keyof Niveles)[]) actual[clave] += (obj[clave] - actual[clave]) * k

      // Sin nada que dibujar, el canvas queda limpio y no se repinta (ahorra GPU en notebooks).
      const hayAlgo = actual.lluvia > 0.01 || gotas.length || anillos.length || vidrioGotas.length || rayo || (actual.tormenta > 0.5 && !calma)
      if (!hayAlgo) {
        if (sucio) {
          c.setTransform(1, 0, 0, 1, 0, 0)
          c.clearRect(0, 0, canvas.width, canvas.height)
          sucio = false
        }
        raf = requestAnimationFrame(cuadro)
        return
      }
      sucio = true
      c.setTransform(dpr, 0, 0, dpr, 0, 0)
      c.clearRect(0, 0, ancho, alto)

      // --- lluvia ---
      const factor = f === 'pleno' ? 1 : 0.55
      const deseadas = Math.round(MAX_GOTAS * Math.min(1, actual.lluvia) * factor * (calma ? 0.35 : 1))
      while (gotas.length < deseadas) gotas.push(nuevaGota(gotas.length > 20))
      if (gotas.length > deseadas) gotas.length = deseadas
      const viento = 0.08 + 0.22 * actual.tormenta
      c.lineCap = 'round'
      for (let capa = 0; capa < 3; capa++) {
        c.beginPath()
        const zMin = 0.35 + capa * 0.217
        const zMax = zMin + 0.217
        for (const g of gotas) {
          if (g.z < zMin || g.z >= zMax) continue
          c.moveTo(g.x, g.y)
          c.lineTo(g.x - g.l * viento, g.y - g.l)
        }
        c.strokeStyle = `rgba(190, 210, 235, ${(0.12 + capa * 0.1) * (f === 'pleno' ? 1 : 0.8)})`
        c.lineWidth = 0.8 + capa * 0.45
        c.stroke()
      }
      const vel = calma ? 0.35 : 1
      for (const g of gotas) {
        g.y += g.v * dt * vel
        g.x += g.v * dt * vel * viento
        if (g.y - g.l > alto) {
          if (anillos.length < 160 && Math.random() < 0.5) anillos.push({ x: g.x, y: Math.random() * alto, t: 0, r: 2 + g.z * 5 })
          Object.assign(g, nuevaGota(true))
        }
      }

      // --- salpicaduras: anillos que se abren sobre el suelo (vista cenital) ---
      c.lineWidth = 0.8
      for (let i = anillos.length - 1; i >= 0; i--) {
        const a = anillos[i]
        a.t += dt * 3.2
        if (a.t >= 1) {
          anillos.splice(i, 1)
          continue
        }
        c.beginPath()
        c.ellipse(a.x, a.y, a.r * a.t * 1.6, a.r * a.t * 0.9, 0, 0, Math.PI * 2)
        c.strokeStyle = `rgba(200, 220, 240, ${0.35 * (1 - a.t)})`
        c.stroke()
      }

      // --- gotas en el vidrio ---
      const deseadasVidrio = conVidrio ? Math.round(70 * Math.min(1, actual.lluvia)) : 0
      while (vidrioGotas.length < deseadasVidrio) vidrioGotas.push(nuevaVidrio())
      if (vidrioGotas.length > deseadasVidrio) vidrioGotas.length = deseadasVidrio
      for (const g of vidrioGotas) {
        g.quieta -= dt
        if (g.quieta <= 0 && g.r > 4.5) g.vy = Math.min(260, g.vy + 400 * dt)
        else g.vy *= 0.9
        g.y += g.vy * dt * vel
        g.x += Math.sin(g.y * 0.05) * 0.15
        g.rastro = g.vy > 20 ? Math.min(60, g.rastro + g.vy * dt) : Math.max(0, g.rastro - 30 * dt)
        if (g.y - g.r > alto) Object.assign(g, nuevaVidrio(), { y: -10 })
        if (g.vy < 5 && Math.random() < 0.002) {
          g.quieta = 2 + Math.random() * 6
        }
        if (g.rastro > 0) {
          c.beginPath()
          c.moveTo(g.x, g.y - g.rastro)
          c.lineTo(g.x, g.y)
          c.strokeStyle = 'rgba(210, 225, 245, 0.10)'
          c.lineWidth = g.r * 0.6
          c.stroke()
        }
        c.drawImage(sprite, g.x - g.r, g.y - g.r, g.r * 2, g.r * 2)
      }

      // --- relámpagos (máximo un destello doble cada ~4 s; ninguno con movimiento reducido) ---
      if (!calma && actual.tormenta > 0.5 && ahora > proximoRayo) {
        rayo = crearRayo()
        proximoRayo = ahora + 4200 + Math.random() * 6500
        const cerca = Math.random()
        const intensidadFlash = (f === 'pleno' ? 0.5 : 0.28) * (0.5 + cerca * 0.5)
        flashRef.current?.animate(
          [
            { opacity: 0 },
            { opacity: intensidadFlash, offset: 0.08 },
            { opacity: 0.04, offset: 0.25 },
            { opacity: intensidadFlash * 0.7, offset: 0.36 },
            { opacity: 0 },
          ],
          { duration: 750, easing: 'ease-out' },
        )
        opciones.current.onRelampago?.(cerca)
      }
      if (rayo) {
        rayo.t += dt
        const vida = 1 - rayo.t / 0.35
        if (vida <= 0) rayo = null
        else {
          c.save()
          c.shadowColor = 'rgba(190, 210, 255, 0.9)'
          c.shadowBlur = 18
          rayo.puntos.forEach((linea, i) => {
            c.beginPath()
            linea.forEach(([x, y], j) => (j ? c.lineTo(x, y) : c.moveTo(x, y)))
            c.strokeStyle = `rgba(235, 240, 255, ${vida * (i === 0 ? 0.95 : 0.5)})`
            c.lineWidth = i === 0 ? 2.2 : 1
            c.stroke()
          })
          c.restore()
        }
      }

      raf = requestAnimationFrame(cuadro)
    }
    raf = requestAnimationFrame(cuadro)
    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
    }
  }, [])

  const n = nivelesDe(clima, intensidad)
  const { dia, dorado } = luzDelDia(hora)
  const m = fuerza === 'pleno' ? 1 : 0.6

  return (
    <div className={`clima-fx fx-${fuerza}`} aria-hidden>
      <div className="fx-noche" style={{ opacity: (1 - dia) * (fuerza === 'pleno' ? 0.75 : 0.5) }} />
      <div className="fx-dorado" style={{ opacity: dorado * m }} />
      {/* Cielo de día nublado: con lluvia de día la luz es gris y difusa, no oscura como de noche. */}
      <div className="fx-dia" style={{ opacity: dia * Math.min(1, n.nubes * 1.1) * m }} />
      <div className="fx-sol" style={{ opacity: n.sol * dia * m }}>
        <div className="fx-rayos" />
      </div>
      <div className="fx-nubes" style={{ opacity: n.nubes * m }}>
        <i /><i /><i /><i />
      </div>
      <div className="fx-niebla" style={{ opacity: n.niebla * m }}>
        <i /><i />
      </div>
      <div className="fx-mojado" style={{ opacity: Math.min(1, n.lluvia) * m }} />
      <canvas ref={canvasRef} className="fx-canvas" />
      <div ref={flashRef} className="fx-flash" />
    </div>
  )
}
