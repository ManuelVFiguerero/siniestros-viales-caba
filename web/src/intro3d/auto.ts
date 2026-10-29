// Hatchback compacto genérico de 5 puertas, armado por código (sin marca ni logo): carrocería extruida,
// habitáculo vidriado con pilares negros, llantas de aleación, faros finos con luz real y espejos.
// Ejes locales: X = largo (el frente está en x = 0 y mira hacia -X), Y = alto, Z = ancho.
import * as THREE from 'three'

export const COLOR_PINTURA = '#8e1518' // rojo metalizado; cambiar acá para otro color
const LARGO = 3.95
const ANCHO = 1.7
const RUEDA_R = 0.31
const EJES = [0.8, 3.18]

export interface Auto {
  grupo: THREE.Group
  ruedas: THREE.Object3D[]
  faros: THREE.SpotLight[]
  brillos: THREE.Sprite[]
  opticas: THREE.MeshStandardMaterial
  /** Luces (0–1) y luces altas (0–1). */
  encender: (luces: number, altas: number) => void
}

function extruir(puntos: [number, number][], profundidad: number, bisel = 0.05): THREE.ExtrudeGeometry {
  const s = new THREE.Shape(puntos.map(([x, y]) => new THREE.Vector2(x, y)))
  const g = new THREE.ExtrudeGeometry(s, { depth: profundidad, bevelEnabled: bisel > 0, bevelThickness: bisel, bevelSize: bisel, bevelSegments: 4, curveSegments: 18 })
  g.translate(0, 0, -profundidad / 2)
  return g
}

/** Perfil lateral de la parte baja (hasta la línea de cintura) con los pasarruedas recortados. */
function perfilBajo(): THREE.Shape {
  const s = new THREE.Shape()
  s.moveTo(0.08, 0.3)
  s.lineTo(EJES[0] - 0.4, 0.3)
  s.absarc(EJES[0], 0.31, 0.4, Math.PI, 0, true)
  s.lineTo(EJES[1] - 0.4, 0.3)
  s.absarc(EJES[1], 0.31, 0.4, Math.PI, 0, true)
  s.lineTo(3.86, 0.3)
  s.lineTo(3.95, 0.42)
  s.lineTo(3.97, 0.8)
  s.lineTo(3.9, 0.97)
  s.lineTo(3.5, 1.0)
  s.lineTo(1.22, 0.94)
  s.lineTo(0.85, 0.88)
  s.quadraticCurveTo(0.32, 0.83, 0.1, 0.76)
  s.quadraticCurveTo(-0.02, 0.68, 0.0, 0.5)
  s.lineTo(0.08, 0.3)
  return s
}

export function crearAuto(): Auto {
  const grupo = new THREE.Group()
  const pintura = new THREE.MeshPhysicalMaterial({ color: COLOR_PINTURA, metalness: 0.55, roughness: 0.32, clearcoat: 1, clearcoatRoughness: 0.08 })
  const negroBrillo = new THREE.MeshPhysicalMaterial({ color: '#0b0c0e', metalness: 0.3, roughness: 0.25, clearcoat: 0.6 })
  const plastico = new THREE.MeshStandardMaterial({ color: '#111214', roughness: 0.8 })
  const vidrio = new THREE.MeshPhysicalMaterial({ color: '#05070a', metalness: 0.4, roughness: 0.05, clearcoat: 1 })
  const goma = new THREE.MeshStandardMaterial({ color: '#0d0d0e', roughness: 0.9 })
  const aleacion = new THREE.MeshStandardMaterial({ color: '#9aa0a6', metalness: 0.9, roughness: 0.28 })
  const opticas = new THREE.MeshStandardMaterial({ color: '#dfe8ff', emissive: '#e8f0ff', emissiveIntensity: 0, roughness: 0.15 })

  // Carrocería baja.
  const bajo = new THREE.ExtrudeGeometry(perfilBajo(), { depth: ANCHO - 0.12, bevelEnabled: true, bevelThickness: 0.06, bevelSize: 0.06, bevelSegments: 5, curveSegments: 24 })
  bajo.translate(0, 0, -(ANCHO - 0.12) / 2)
  grupo.add(new THREE.Mesh(bajo, pintura))

  // Habitáculo vidriado (más angosto: los costados se inclinan hacia adentro) y techo pintado.
  grupo.add(new THREE.Mesh(extruir([[1.24, 0.95], [2.0, 1.38], [3.28, 1.41], [3.8, 1.12], [3.86, 0.99], [3.5, 1.0]], ANCHO - 0.36, 0.03), vidrio))
  grupo.add(new THREE.Mesh(extruir([[1.96, 1.37], [2.08, 1.45], [3.26, 1.47], [3.84, 1.16], [3.78, 1.12], [3.27, 1.41]], ANCHO - 0.44, 0.04), pintura))
  // Pilares negros (diseño "techo flotante") y alerón trasero.
  for (const [x, inclinacion] of [[2.47, 0.06], [3.02, -0.18]] as const) {
    const pilar = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.42, ANCHO - 0.34), negroBrillo)
    pilar.position.set(x, 1.19, 0)
    pilar.rotation.z = inclinacion
    grupo.add(pilar)
  }

  // Frente: parrilla horizontal sin logo, toma de aire inferior, patente lisa y faros finos.
  const parrilla = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.13, 0.98), negroBrillo)
  parrilla.position.set(0.03, 0.64, 0)
  grupo.add(parrilla)
  for (let k = 0; k < 3; k++) {
    const lama = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.008, 0.92), aleacion)
    lama.position.set(0.0, 0.6 + k * 0.035, 0)
    grupo.add(lama)
  }
  const toma = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.2, 1.28), negroBrillo)
  toma.position.set(0.02, 0.4, 0)
  grupo.add(toma)
  const patente = new THREE.Mesh(new THREE.BoxGeometry(0.015, 0.1, 0.4), new THREE.MeshStandardMaterial({ color: '#d9dcdf', roughness: 0.4 }))
  patente.position.set(-0.02, 0.5, 0)
  grupo.add(patente)

  const faros: THREE.SpotLight[] = []
  const brillos: THREE.Sprite[] = []
  const textura = brilloTextura()
  for (const lado of [-1, 1]) {
    // Óptica fina y en ángulo, que acompaña la línea del capot.
    const optica = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.055, 0.4), opticas)
    optica.position.set(0.07, 0.73, lado * 0.6)
    optica.rotation.x = lado * 0.1
    optica.rotation.y = lado * -0.25
    grupo.add(optica)
    const marco = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.11, 0.46), negroBrillo)
    marco.position.set(0.1, 0.72, lado * 0.6)
    marco.rotation.y = lado * -0.25
    // Luz diurna: tira fina debajo de la óptica.
    const diurna = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.012, 0.38), opticas)
    diurna.position.set(0.06, 0.685, lado * 0.6)
    diurna.rotation.y = lado * -0.25
    grupo.add(diurna)
    grupo.add(marco)
    // Faro antiniebla en la toma de aire.
    const niebla = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.03, 0.14), opticas)
    niebla.position.set(0.0, 0.4, lado * 0.66)
    grupo.add(niebla)

    const luz = new THREE.SpotLight('#f4f1ea', 0, 0, 0.42, 0.55, 1.6)
    luz.position.set(0.05, 0.71, lado * 0.58)
    luz.target.position.set(-30, 0, lado * 1.4)
    grupo.add(luz, luz.target)
    faros.push(luz)

    const brillo = new THREE.Sprite(new THREE.SpriteMaterial({ map: textura, color: '#fff3dc', blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0 }))
    brillo.position.set(-0.05, 0.71, lado * 0.58)
    grupo.add(brillo)
    brillos.push(brillo)

    // Espejo.
    const espejo = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.11, 0.18), pintura)
    espejo.position.set(1.52, 1.0, lado * (ANCHO / 2 + 0.06))
    grupo.add(espejo)
  }

  // Antena tipo látigo sobre el techo.
  const antena = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.01, 0.38), plastico)
  antena.position.set(3.15, 1.64, 0)
  antena.rotation.z = -0.5
  grupo.add(antena)

  // Ruedas: neumático + llanta de 10 rayos.
  const ruedas: THREE.Object3D[] = []
  const neumatico = new THREE.CylinderGeometry(RUEDA_R, RUEDA_R, 0.22, 32)
  neumatico.rotateX(Math.PI / 2)
  const disco = new THREE.CylinderGeometry(0.2, 0.2, 0.23, 24)
  disco.rotateX(Math.PI / 2)
  for (const x of EJES) {
    for (const lado of [-1, 1]) {
      const rueda = new THREE.Group()
      rueda.add(new THREE.Mesh(neumatico, goma))
      rueda.add(new THREE.Mesh(disco, plastico))
      for (let k = 0; k < 10; k++) {
        const rayo = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.19, 0.02), aleacion)
        rayo.position.set(Math.sin((k / 10) * Math.PI * 2) * 0.1, Math.cos((k / 10) * Math.PI * 2) * 0.1, lado * 0.12)
        rayo.rotation.z = -(k / 10) * Math.PI * 2 + 0.25
        rueda.add(rayo)
      }
      rueda.position.set(x, RUEDA_R, lado * (ANCHO / 2 - 0.1))
      grupo.add(rueda)
      ruedas.push(rueda)
    }
  }

  grupo.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) o.castShadow = false
  })

  return {
    grupo,
    ruedas,
    faros,
    brillos,
    opticas,
    encender(luces, altas) {
      const fuerza = luces * (1 + altas * 2.2)
      faros.forEach((f) => (f.intensity = 130 * fuerza))
      opticas.emissiveIntensity = 2.2 * fuerza
      // El halo es chico en metros: de lejos se ve como un destello y de cerca no tapa la pantalla.
      brillos.forEach((b) => {
        b.material.opacity = Math.min(0.8, luces * 0.8)
        const s = (0.32 + altas * 0.35) * (0.6 + luces * 0.4)
        b.scale.set(s, s, 1)
      })
    },
  }
}

/** Halo radial para el resplandor de los faros (con el bloom queda como un destello). */
function brilloTextura(): THREE.Texture {
  const c = document.createElement('canvas')
  c.width = c.height = 128
  const g = c.getContext('2d')!
  const r = g.createRadialGradient(64, 64, 0, 64, 64, 64)
  r.addColorStop(0, 'rgba(255,255,255,1)')
  r.addColorStop(0.12, 'rgba(255,245,225,0.8)')
  r.addColorStop(0.4, 'rgba(255,225,180,0.18)')
  r.addColorStop(1, 'rgba(255,220,170,0)')
  g.fillStyle = r
  g.fillRect(0, 0, 128, 128)
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  return t
}

export const LARGO_AUTO = LARGO
export const RADIO_RUEDA = RUEDA_R
