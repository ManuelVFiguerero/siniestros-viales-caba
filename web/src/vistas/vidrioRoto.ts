// Parabrisas que estalla sobre el último cuadro del video de la intro (canvas 2D).
//
// Se congela el cuadro del impacto y se parte en fragmentos entre grietas radiales y anillos concéntricos, como
// un vidrio laminado golpeado en el centro. Cada fragmento muestra la imagen apenas corrida y girada (la
// refracción del vidrio quebrado) con un brillo o una sombra propios; las grietas tienen un filo oscuro y otro
// iluminado. Las grietas se propagan desde el centro en ~0,3 s, saltan esquirlas hacia la cámara y después la
// imagen se apaga hasta dejar solo las grietas, tenues, sobre negro.

export interface Encuadre {
  /** Mismo encuadre que el video en pantalla (object-fit: cover + transform de .i-video). */
  escala: number
  /** Desplazamiento en fracciones del ancho y del alto de la pantalla. */
  dx: number
  dy: number
}

export interface Rotura {
  detener: () => void
}

type Punto = [number, number]

function semilla(s: number) {
  return () => {
    s |= 0
    s = (s + 0x6d2b79f5) | 0
    let t = Math.imul(s ^ (s >>> 15), 1 | s)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const suave = (x: number) => 1 - (1 - Math.min(1, Math.max(0, x))) ** 3

export function romperVidrio(canvas: HTMLCanvasElement, video: HTMLVideoElement, encuadre: Encuadre, calma: boolean): Rotura {
  const W = canvas.clientWidth
  const H = canvas.clientHeight
  const dpr = Math.min(window.devicePixelRatio || 1, 2)
  canvas.width = Math.round(W * dpr)
  canvas.height = Math.round(H * dpr)
  const c = canvas.getContext('2d')!
  c.setTransform(dpr, 0, 0, dpr, 0, 0)
  const azar = semilla(1307)
  const entre = (a: number, b: number) => a + azar() * (b - a)

  const lienzo = () => {
    const l = document.createElement('canvas')
    l.width = canvas.width
    l.height = canvas.height
    const g = l.getContext('2d')!
    g.setTransform(dpr, 0, 0, dpr, 0, 0)
    return { l, g }
  }

  // ---------- 1. el cuadro congelado, con el mismo encuadre que el video ----------
  const foto = lienzo()
  try {
    const vw = video.videoWidth || 1280
    const vh = video.videoHeight || 720
    const cubre = Math.max(W / vw, H / vh)
    const dw = vw * cubre * encuadre.escala
    const dh = vh * cubre * encuadre.escala
    foto.g.drawImage(video, W / 2 - dw / 2 + encuadre.dx * W, H / 2 - dh / 2 + encuadre.dy * H, dw, dh)
  } catch {
    // Si el cuadro no se puede leer, el vidrio se rompe sobre un fondo de faros genérico.
    const r = foto.g.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, W * 0.6)
    r.addColorStop(0, '#fffaf0')
    r.addColorStop(0.25, '#b9b2a6')
    r.addColorStop(1, '#0a0a0b')
    foto.g.fillStyle = r
    foto.g.fillRect(0, 0, W, H)
  }

  // ---------- 2. geometría de las grietas ----------
  const C: Punto = [W / 2, H / 2]
  const rMax = Math.hypot(W, H) / 2 + 60
  const radios: number[] = [0]
  for (let r = 16, paso = 22; r < rMax; r += paso, paso *= 1.42) radios.push(r)
  radios.push(rMax)
  const K = radios.length
  const N = 26
  const angulos = Array.from({ length: N }, (_, i) => ((i + entre(-0.35, 0.35)) / N) * Math.PI * 2)
  // P[i][k]: vértice de la grieta radial i en el anillo k (con quiebres).
  const P: Punto[][] = angulos.map((a) =>
    radios.map((r, k) => {
      if (k === 0) return [C[0], C[1]] as Punto
      const aa = a + entre(-0.05, 0.05) * (1 + 3 / k)
      const rr = r * entre(0.9, 1.1)
      return [C[0] + Math.cos(aa) * rr, C[1] + Math.sin(aa) * rr] as Punto
    }),
  )
  // Anillos: cerca del centro están todos; lejos, solo algunos tramos.
  const anillo: boolean[][] = angulos.map(() => radios.map((_, k) => k <= 3 || azar() < 0.62 - k * 0.035))

  interface Fragmento { poli: Punto[]; dx: number; dy: number; giro: number; luz: number; k: number }
  const fragmentos: Fragmento[] = []
  const desplazamiento: { dx: number; dy: number; giro: number; luz: number }[][] = angulos.map(() => [])
  for (let i = 0; i < N; i++) {
    const j = (i + 1) % N
    for (let k = 0; k < K - 1; k++) {
      // Si falta el anillo interior, el fragmento continúa al de adentro (mismo corrimiento).
      const amp = 7 * (1 - k / K) + 1.2
      const propio = { dx: entre(-amp, amp), dy: entre(-amp, amp), giro: entre(-0.012, 0.012), luz: entre(-0.16, 0.2) }
      const d = k > 0 && !anillo[i][k] ? desplazamiento[i][k - 1] : propio
      desplazamiento[i][k] = d
      fragmentos.push({ poli: [P[i][k], P[i][k + 1], P[j][k + 1], P[j][k]], ...d, k })
    }
  }

  // ---------- 3. el vidrio roto, ya completo (después se revela desde el centro) ----------
  const roto = lienzo()
  const g = roto.g
  for (const f of fragmentos) {
    const cx = f.poli.reduce((s, p) => s + p[0], 0) / 4
    const cy = f.poli.reduce((s, p) => s + p[1], 0) / 4
    g.save()
    g.beginPath()
    f.poli.forEach(([x, y], n) => (n ? g.lineTo(x, y) : g.moveTo(x, y)))
    g.closePath()
    g.clip()
    g.translate(cx + f.dx, cy + f.dy)
    g.rotate(f.giro)
    g.translate(-cx, -cy)
    g.drawImage(foto.l, 0, 0, W, H)
    g.setTransform(dpr, 0, 0, dpr, 0, 0)
    g.fillStyle = f.luz > 0 ? `rgba(225,235,250,${f.luz})` : `rgba(0,0,0,${-f.luz})`
    g.fill()
    g.restore()
  }

  // Grietas: filo oscuro y filo iluminado, más ramitas finas.
  const grietas = lienzo()
  const trazos: Punto[][] = []
  for (let i = 0; i < N; i++) {
    trazos.push(P[i])
    const j = (i + 1) % N
    for (let k = 1; k < K - 1; k++) {
      if (!anillo[i][k]) continue
      const a = P[i][k]
      const b = P[j][k]
      const m: Punto = [(a[0] + b[0]) / 2 + entre(-4, 4), (a[1] + b[1]) / 2 + entre(-4, 4)]
      trazos.push([a, m, b])
    }
    // Ramitas que salen de las radiales.
    for (let k = 2; k < K - 1; k++) {
      if (azar() > 0.55) continue
      const [x, y] = P[i][k]
      const a = angulos[i] + entre(-0.9, 0.9)
      const largo = entre(14, 70) * (1 + k * 0.15)
      trazos.push([[x, y], [x + Math.cos(a) * largo * 0.5 + entre(-3, 3), y + Math.sin(a) * largo * 0.5 + entre(-3, 3)], [x + Math.cos(a) * largo, y + Math.sin(a) * largo]])
    }
  }
  const dibujarGrietas = (h: CanvasRenderingContext2D) => {
    h.lineJoin = 'round'
    h.lineCap = 'round'
    for (const [estilo, ancho, ox] of [
      ['rgba(6,7,9,0.6)', 2.4, 0],
      ['rgba(236,242,255,0.92)', 0.9, 0.7],
    ] as const) {
      h.strokeStyle = estilo
      h.lineWidth = ancho
      for (const t of trazos) {
        h.beginPath()
        t.forEach(([x, y], n) => (n ? h.lineTo(x + ox, y + ox) : h.moveTo(x + ox, y + ox)))
        h.stroke()
      }
    }
    // Centro pulverizado.
    const r = h.createRadialGradient(C[0], C[1], 0, C[0], C[1], 46)
    r.addColorStop(0, 'rgba(255,255,255,0.95)')
    r.addColorStop(0.4, 'rgba(235,240,250,0.45)')
    r.addColorStop(1, 'rgba(235,240,250,0)')
    h.fillStyle = r
    h.fillRect(C[0] - 50, C[1] - 50, 100, 100)
    for (let k = 0; k < 70; k++) {
      const a = entre(0, Math.PI * 2)
      const d = entre(2, 40) ** 1.1
      const x = C[0] + Math.cos(a) * d
      const y = C[1] + Math.sin(a) * d
      const s = entre(1.5, 5)
      h.fillStyle = azar() < 0.5 ? 'rgba(255,255,255,0.85)' : 'rgba(10,10,12,0.6)'
      h.beginPath()
      h.moveTo(x, y - s)
      h.lineTo(x + s * 0.8, y + s * 0.6)
      h.lineTo(x - s * 0.7, y + s * 0.4)
      h.fill()
    }
  }
  dibujarGrietas(grietas.g)
  g.drawImage(grietas.l, 0, 0, W, H)

  // ---------- 4. esquirlas que saltan hacia la cámara ----------
  interface Esquirla { x: number; y: number; vx: number; vy: number; giro: number; vgiro: number; t: number; vida: number; tam: number; forma: Punto[] }
  const esquirlas: Esquirla[] = calma
    ? []
    : Array.from({ length: 150 }, () => {
        const a = entre(0, Math.PI * 2)
        const v = entre(250, 1500)
        const tam = entre(3, 16)
        return {
          x: C[0] + Math.cos(a) * entre(0, 40),
          y: C[1] + Math.sin(a) * entre(0, 40),
          vx: Math.cos(a) * v,
          vy: Math.sin(a) * v - entre(0, 200),
          giro: entre(0, 6),
          vgiro: entre(-14, 14),
          t: 0,
          vida: entre(0.45, 1.1),
          tam,
          forma: [[0, -1], [entre(0.5, 1), entre(0.2, 0.9)], [entre(-1, -0.4), entre(0.1, 0.8)]] as Punto[],
        }
      })

  // ---------- 5. animación ----------
  const inicio = performance.now()
  let previo = inicio
  let raf = 0
  const PROPAGA = calma ? 0 : 0.3
  const cuadro = (ahora: number) => {
    const t = (ahora - inicio) / 1000
    const dt = Math.min(0.05, (ahora - previo) / 1000)
    previo = ahora
    c.setTransform(dpr, 0, 0, dpr, 0, 0)
    c.globalAlpha = 1
    c.globalCompositeOperation = 'source-over'
    c.drawImage(foto.l, 0, 0, W, H)
    // Las grietas avanzan desde el centro.
    const R = PROPAGA ? rMax * suave(t / PROPAGA) : rMax
    c.save()
    c.beginPath()
    c.arc(C[0], C[1], Math.max(1, R), 0, Math.PI * 2)
    c.clip()
    c.drawImage(roto.l, 0, 0, W, H)
    c.restore()
    // Se apaga la imagen: quedan solo las grietas, tenues.
    const oscuro = Math.min(0.9, Math.max(0, (t - 0.9) / 1.7) * 0.9)
    if (oscuro > 0) {
      c.fillStyle = `rgba(3,4,5,${oscuro})`
      c.fillRect(0, 0, W, H)
      c.globalAlpha = oscuro * 0.4
      c.drawImage(grietas.l, 0, 0, W, H)
      c.globalAlpha = 1
    }
    // Esquirlas: vuelan hacia afuera, crecen (se acercan) y giran.
    let vivas = 0
    for (const e of esquirlas) {
      e.t += dt
      if (e.t > e.vida) continue
      vivas++
      e.x += e.vx * dt
      e.y += e.vy * dt
      e.vy += 900 * dt
      e.giro += e.vgiro * dt
      const f = e.t / e.vida
      const s = e.tam * (1 + f * 2.5)
      c.save()
      c.translate(e.x, e.y)
      c.rotate(e.giro)
      c.globalAlpha = (1 - f) ** 1.2
      c.beginPath()
      e.forma.forEach(([x, y], n) => (n ? c.lineTo(x * s, y * s) : c.moveTo(x * s, y * s)))
      c.closePath()
      c.fillStyle = 'rgba(210,222,240,0.28)'
      c.fill()
      c.strokeStyle = 'rgba(255,255,255,0.85)'
      c.lineWidth = 1
      c.stroke()
      c.restore()
    }
    if (t < 2.8 || vivas) raf = requestAnimationFrame(cuadro)
  }
  raf = requestAnimationFrame(cuadro)
  return { detener: () => cancelAnimationFrame(raf) }
}
