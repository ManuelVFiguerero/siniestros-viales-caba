// Escena 3D de la intro: una calle porteña de noche con lluvia, veredas, edificios con ventanas
// encendidas, faroles de sodio y el auto que viene de frente hasta chocar contra la cámara ("la pantalla").
// Lee el mismo estado que anima GSAP en Intro.tsx: p (0–1, cercanía), luces y altas.
import * as THREE from 'three'
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js'
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'
import { crearAuto, RADIO_RUEDA } from './auto'

export interface EstadoIntro {
  p: number
  luces: number
  altas: number
  fin: boolean
}

const Z_INICIO = -260
const Z_CHOQUE = 1.15 // el frente del auto llega a la cámara
const CAMARA = new THREE.Vector3(0, 1.22, 1.6)

/** Arranca la escena en el canvas. Devuelve la función para destruirla, o null si no hay WebGL. */
export function iniciarEscena3D(canvas: HTMLCanvasElement, estado: { current: EstadoIntro }, calma: boolean): (() => void) | null {
  let renderer: THREE.WebGLRenderer
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' })
  } catch {
    return null
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5))
  renderer.toneMapping = THREE.ACESFilmicToneMapping
  renderer.toneMappingExposure = 1.05
  renderer.outputColorSpace = THREE.SRGBColorSpace

  const escena = new THREE.Scene()
  escena.background = new THREE.Color('#06070a')
  escena.fog = new THREE.FogExp2('#0b0c10', 0.011)
  const pmrem = new THREE.PMREMGenerator(renderer)
  escena.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture
  escena.environmentIntensity = 0.18

  const camara = new THREE.PerspectiveCamera(46, 1, 0.05, 900)
  camara.position.copy(CAMARA)
  camara.lookAt(0, 1.0, -40)

  escena.add(new THREE.HemisphereLight('#2a3550', '#0a0a0a', 0.5))

  // ---------- calle ----------
  const asfalto = new THREE.MeshStandardMaterial({ color: '#16181b', roughness: 1, metalness: 0.05, roughnessMap: texturaCharcos() })
  asfalto.roughnessMap!.wrapS = asfalto.roughnessMap!.wrapT = THREE.RepeatWrapping
  asfalto.roughnessMap!.repeat.set(2, 60)
  const calle = new THREE.Mesh(new THREE.PlaneGeometry(10, 760), asfalto)
  calle.rotation.x = -Math.PI / 2
  calle.position.z = -360
  escena.add(calle)

  const pintura = new THREE.MeshStandardMaterial({ color: '#c9a24a', emissive: '#c9a24a', emissiveIntensity: 0.12, roughness: 0.6 })
  const guiones = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.14, 3), pintura, 70)
  const m = new THREE.Matrix4()
  for (let k = 0; k < 70; k++) {
    m.makeRotationX(-Math.PI / 2).setPosition(0, 0.012, -k * 9)
    guiones.setMatrixAt(k, m)
  }
  escena.add(guiones)
  const blanco = new THREE.MeshStandardMaterial({ color: '#cfd2d6', roughness: 0.6 })
  for (const x of [-4.6, 4.6]) {
    const borde = new THREE.Mesh(new THREE.PlaneGeometry(0.12, 760), blanco)
    borde.rotation.x = -Math.PI / 2
    borde.position.set(x, 0.012, -360)
    escena.add(borde)
    const vereda = new THREE.Mesh(new THREE.BoxGeometry(3, 0.16, 760), new THREE.MeshStandardMaterial({ color: '#1c1e21', roughness: 0.85 }))
    vereda.position.set(Math.sign(x) * 6.5, 0.08, -360)
    escena.add(vereda)
  }

  // ---------- edificios con ventanas encendidas ----------
  const ventanas = texturaVentanas()
  const fachada = new THREE.MeshStandardMaterial({ color: '#0d0e11', roughness: 0.9, emissive: '#ffd39a', emissiveMap: ventanas, emissiveIntensity: 0.4 })
  const n = 90
  const edificios = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), fachada, n)
  let z = 4
  for (let k = 0; k < n; k++) {
    const lado = k % 2 === 0 ? -1 : 1
    if (lado === -1) z -= 9 + Math.random() * 7
    const ancho = 5 + Math.random() * 5
    const alto = 9 + Math.random() ** 1.6 * 34
    const fondo = 8 + Math.random() * 7
    m.compose(new THREE.Vector3(lado * (8 + ancho / 2), alto / 2, z - Math.random() * 4), new THREE.Quaternion(), new THREE.Vector3(ancho, alto, fondo))
    edificios.setMatrixAt(k, m)
  }
  escena.add(edificios)

  // ---------- faroles de luz de sodio ----------
  const poste = new THREE.MeshStandardMaterial({ color: '#1a1b1d', roughness: 0.7, metalness: 0.4 })
  const lampara = new THREE.MeshStandardMaterial({ color: '#ffb36b', emissive: '#ffb36b', emissiveIntensity: 3.5 })
  for (let k = 0; k < 18; k++) {
    const lado = k % 2 === 0 ? -1 : 1
    const zf = -6 - k * 22
    const columna = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 7), poste)
    columna.position.set(lado * 5.1, 3.5, zf)
    const brazo = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.06, 0.06), poste)
    brazo.position.set(lado * 4.45, 6.95, zf)
    const foco = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.08, 0.22), lampara)
    foco.position.set(lado * 3.85, 6.88, zf)
    escena.add(columna, brazo, foco)
    if (k < 6) {
      const luz = new THREE.PointLight('#ffad62', 55, 26, 2)
      luz.position.set(lado * 3.85, 6.6, zf)
      escena.add(luz)
    }
  }

  // Resplandor anaranjado de la ciudad al fondo.
  const resplandor = new THREE.Mesh(new THREE.PlaneGeometry(900, 160), new THREE.MeshBasicMaterial({ map: texturaResplandor(), transparent: true, fog: false, depthWrite: false }))
  resplandor.position.set(0, 40, -700)
  escena.add(resplandor)

  // ---------- lluvia ----------
  const GOTAS = calma ? 900 : 2600
  const posiciones = new Float32Array(GOTAS * 6)
  const vel = new Float32Array(GOTAS)
  const caja = { x: 11, y: 13, z0: -55, z1: 3 }
  const nuevaGota = (i: number, y?: number) => {
    const x = (Math.random() * 2 - 1) * caja.x
    const yy = y ?? Math.random() * caja.y
    const zz = caja.z0 + Math.random() * (caja.z1 - caja.z0)
    posiciones.set([x, yy, zz, x + 0.05, yy + 0.55, zz], i * 6)
    vel[i] = 11 + Math.random() * 6
  }
  for (let i = 0; i < GOTAS; i++) nuevaGota(i)
  const geoLluvia = new THREE.BufferGeometry()
  geoLluvia.setAttribute('position', new THREE.BufferAttribute(posiciones, 3))
  const lluvia = new THREE.LineSegments(geoLluvia, new THREE.LineBasicMaterial({ color: '#a9bcd8', transparent: true, opacity: 0.32 }))
  lluvia.frustumCulled = false
  escena.add(lluvia)

  // ---------- destellos desenfocados (bokeh) flotando a distintas profundidades ----------
  const BOKEH = 150
  const posBokeh = new Float32Array(BOKEH * 3)
  const colBokeh = new Float32Array(BOKEH * 3)
  const faseBokeh = new Float32Array(BOKEH)
  const calido = new THREE.Color('#ffb46e')
  const frio = new THREE.Color('#8fb4ff')
  for (let i = 0; i < BOKEH; i++) {
    posBokeh.set([(Math.random() * 2 - 1) * 7, 0.4 + Math.random() * 5, -16 + Math.random() * 16.5], i * 3)
    const c = Math.random() < 0.7 ? calido : frio
    colBokeh.set([c.r, c.g, c.b], i * 3)
    faseBokeh[i] = Math.random() * Math.PI * 2
  }
  const geoBokeh = new THREE.BufferGeometry()
  geoBokeh.setAttribute('position', new THREE.BufferAttribute(posBokeh, 3))
  geoBokeh.setAttribute('color', new THREE.BufferAttribute(colBokeh, 3))
  const bokeh = new THREE.Points(
    geoBokeh,
    new THREE.PointsMaterial({ size: 0.16, map: texturaDisco(), vertexColors: true, transparent: true, opacity: 0.42, blending: THREE.AdditiveBlending, depthWrite: false }),
  )
  bokeh.frustumCulled = false
  escena.add(bokeh)

  // ---------- auto ----------
  const auto = crearAuto()
  auto.grupo.rotation.y = Math.PI / 2 // el frente (-X local) mira a la cámara (+Z)
  escena.add(auto.grupo)

  // ---------- posprocesado: bloom para faros, faroles y ventanas ----------
  const composer = new EffectComposer(renderer)
  composer.addPass(new RenderPass(escena, camara))
  const bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.5, 0.45, 0.92)
  composer.addPass(bloom)
  composer.addPass(new OutputPass())

  const medir = () => {
    const w = canvas.clientWidth
    const h = canvas.clientHeight
    renderer.setSize(w, h, false)
    composer.setSize(w, h)
    camara.aspect = w / h
    camara.updateProjectionMatrix()
  }
  medir()
  window.addEventListener('resize', medir)

  let previo = performance.now()
  let recorrido = 0
  let zPrevio = Z_INICIO
  let raf = 0
  const cuadro = (ahora: number) => {
    const dt = Math.min(0.05, (ahora - previo) / 1000)
    previo = ahora
    const e = estado.current
    const p = Math.min(1, Math.max(0, e.p))

    // Posición: lejos al principio, se acelera al final; viene corrido de carril y encara la cámara.
    const zAuto = Z_CHOQUE - (Z_CHOQUE - Z_INICIO) * (1 - p) ** 2
    const xAuto = -1.9 * (1 - p) ** 0.8
    auto.grupo.position.set(xAuto, 0, zAuto)
    auto.grupo.rotation.y = Math.PI / 2 + 0.07 * (1 - p) ** 0.5
    // Frenada: el frente se hunde un poco en los últimos metros.
    auto.grupo.rotation.z = p > 0.9 ? 0.035 * Math.min(1, (p - 0.9) / 0.06) : 0
    recorrido += Math.abs(zAuto - zPrevio)
    zPrevio = zAuto
    auto.ruedas.forEach((r) => (r.rotation.z = recorrido / RADIO_RUEDA))
    // De cerca, el reflejo de los faros en el asfalto mojado saturaría la imagen: se atenúa con la distancia.
    const atenuar = 0.3 + 0.7 * Math.min(1, Math.max(0, -zAuto) / 22)
    auto.encender(e.luces * atenuar, e.altas)

    // Cámara: leve temblor que crece con la cercanía y un "zoom" de tensión al final.
    const temblor = calma ? 0 : 0.003 + p ** 5 * 0.05
    // Cámara "en mano": flota apenas para que la escena respire y se note la profundidad.
    const t = ahora / 1000
    const flote = calma ? 0 : 1
    camara.position.set(
      CAMARA.x + Math.sin(t * 0.37) * 0.05 * flote + (Math.random() - 0.5) * temblor,
      CAMARA.y + Math.sin(t * 0.53) * 0.035 * flote + (Math.random() - 0.5) * temblor,
      CAMARA.z,
    )
    for (let i = 0; i < BOKEH; i++) {
      posBokeh[i * 3] += Math.sin(t * 0.4 + faseBokeh[i]) * 0.0015
      posBokeh[i * 3 + 1] += Math.cos(t * 0.3 + faseBokeh[i]) * 0.0012
    }
    geoBokeh.attributes.position.needsUpdate = true
    camara.fov = 46 + p ** 4 * 10
    camara.updateProjectionMatrix()
    camara.lookAt(xAuto * 0.25, 1.0, -40)

    // Lluvia.
    for (let i = 0; i < GOTAS; i++) {
      const b = i * 6
      const dy = vel[i] * dt
      posiciones[b + 1] -= dy
      posiciones[b + 4] -= dy
      if (posiciones[b + 1] < 0) nuevaGota(i, caja.y)
    }
    geoLluvia.attributes.position.needsUpdate = true

    composer.render()
    if (!e.fin) raf = requestAnimationFrame(cuadro)
  }
  raf = requestAnimationFrame(cuadro)

  return () => {
    cancelAnimationFrame(raf)
    window.removeEventListener('resize', medir)
    escena.traverse((o) => {
      const malla = o as THREE.Mesh
      malla.geometry?.dispose()
      const mats = Array.isArray(malla.material) ? malla.material : malla.material ? [malla.material] : []
      mats.forEach((mat) => {
        Object.values(mat).forEach((v) => (v as THREE.Texture)?.isTexture && (v as THREE.Texture).dispose())
        mat.dispose()
      })
    })
    pmrem.dispose()
    composer.dispose()
    renderer.dispose()
  }
}

// ---------- texturas generadas ----------

function canvasTextura(w: number, h: number, dibujar: (g: CanvasRenderingContext2D) => void, color = false): THREE.CanvasTexture {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  dibujar(c.getContext('2d')!)
  const t = new THREE.CanvasTexture(c)
  if (color) t.colorSpace = THREE.SRGBColorSpace
  return t
}

/** Rugosidad del asfalto: charcos (zonas lisas que reflejan) sobre asfalto áspero. */
function texturaCharcos() {
  return canvasTextura(256, 256, (g) => {
    g.fillStyle = 'rgb(165,165,165)'
    g.fillRect(0, 0, 256, 256)
    for (let k = 0; k < 26; k++) {
      const x = Math.random() * 256
      const y = Math.random() * 256
      const r = 10 + Math.random() * 40
      const grad = g.createRadialGradient(x, y, 0, x, y, r)
      grad.addColorStop(0, 'rgb(110,110,110)')
      grad.addColorStop(1, 'rgba(165,165,165,0)')
      g.fillStyle = grad
      g.fillRect(x - r, y - r, r * 2, r * 2)
    }
  })
}

function texturaDisco() {
  return canvasTextura(
    64,
    64,
    (g) => {
      const r = g.createRadialGradient(32, 32, 0, 32, 32, 32)
      r.addColorStop(0, 'rgba(255,255,255,0.9)')
      r.addColorStop(0.55, 'rgba(255,255,255,0.45)')
      r.addColorStop(0.8, 'rgba(255,255,255,0.12)')
      r.addColorStop(1, 'rgba(255,255,255,0)')
      g.fillStyle = r
      g.fillRect(0, 0, 64, 64)
    },
    true,
  )
}

function texturaVentanas() {
  const t = canvasTextura(
    128,
    256,
    (g) => {
      g.fillStyle = '#000'
      g.fillRect(0, 0, 128, 256)
      for (let y = 6; y < 250; y += 14) {
        for (let x = 6; x < 124; x += 16) {
          if (Math.random() < 0.2) {
            const tibia = Math.random() < 0.8
            g.fillStyle = tibia ? `rgba(255, ${190 + Math.random() * 40}, 120, ${0.55 + Math.random() * 0.45})` : 'rgba(170, 200, 255, 0.7)'
            g.fillRect(x, y, 9, 8)
          }
        }
      }
    },
    true,
  )
  t.wrapS = t.wrapT = THREE.RepeatWrapping
  t.repeat.set(1.5, 2)
  return t
}

function texturaResplandor() {
  return canvasTextura(
    16,
    128,
    (g) => {
      const grad = g.createLinearGradient(0, 0, 0, 128)
      grad.addColorStop(0, 'rgba(60, 40, 30, 0)')
      grad.addColorStop(0.7, 'rgba(140, 80, 40, 0.35)')
      grad.addColorStop(1, 'rgba(180, 100, 50, 0.55)')
      g.fillStyle = grad
      g.fillRect(0, 0, 16, 128)
    },
    true,
  )
}
