// La ciudad de la intro: una avenida porteña de noche, con lluvia. Todo generado por código (sin imágenes)
// y con una semilla fija, así la escena es idéntica en cada ensayo.
//
// Para que tenga profundidad y no se vea "de cajas":
// - cuadras de ~100 m con esquinas (cruce de calle, senda peatonal y semáforos) que marcan el ritmo de la distancia;
// - edificios con pisos y ventanas en escala real (la textura no se estira), pilastras entre fachadas, cornisas,
//   balcones corridos y planta baja retirada con locales iluminados, persianas y carteles;
// - vereda de baldosas con cordón, árboles, autos estacionados y faroles de sodio con su cono de luz;
// - charcos de luz y reflejos alargados de faroles y locales sobre el asfalto mojado.
//
// Ejes: la cámara mira hacia -Z desde z ≈ 1,6; la calzada va de x = -5 a x = 5.
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'

const LARGO = 760
const Z0 = 6 // la avenida empieza un poco detrás de la cámara
const CALZADA = 5
const CORDON = 0.15
const LINEA = 8.2 // línea municipal: donde empiezan las fachadas
const ANCHO_CRUCE = 11
const ESQUINAS = [-36, -136, -236, -336, -436, -536, -636]
const PISO = 3.0 // alto de un piso en edificios
const PISO_ANTIGUO = 3.75
const PB = 4.2 // alto de la planta baja

export interface Ciudad {
  grupo: THREE.Group
  /** Luces reales de los faroles más cercanos a la cámara (las demás son solo brillo). */
  luces: THREE.PointLight[]
}

// ---------- utilidades ----------

/** Generador pseudoaleatorio con semilla (mulberry32): misma ciudad en cada ejecución. */
function semilla(s: number) {
  return () => {
    s |= 0
    s = (s + 0x6d2b79f5) | 0
    let t = Math.imul(s ^ (s >>> 15), 1 | s)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function lienzo(w: number, h: number, dibujar: (g: CanvasRenderingContext2D) => void, color = true): THREE.CanvasTexture {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  dibujar(c.getContext('2d')!)
  const t = new THREE.CanvasTexture(c)
  if (color) t.colorSpace = THREE.SRGBColorSpace
  t.anisotropy = 4
  return t
}

/** Pinta toda la geometría de un color (atributo de vértice) para fusionar piezas de distinto tono. */
function teñir(g: THREE.BufferGeometry, color: THREE.Color): THREE.BufferGeometry {
  const n = g.attributes.position.count
  const c = new Float32Array(n * 3)
  for (let i = 0; i < n; i++) c.set([color.r, color.g, color.b], i * 3)
  g.setAttribute('color', new THREE.BufferAttribute(c, 3))
  return g
}

/** Escala y desplaza las UV (para que las texturas vayan en metros y no se estiren). */
function uv(g: THREE.BufferGeometry, sx: number, sy: number, ox = 0, oy = 0): THREE.BufferGeometry {
  const a = g.attributes.uv as THREE.BufferAttribute
  for (let i = 0; i < a.count; i++) a.setXY(i, a.getX(i) * sx + ox, a.getY(i) * sy + oy)
  return g
}

function unir(geos: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const lista = geos.map((g) => (g.index ? g.toNonIndexed() : g))
  // Todas con los mismos atributos: si alguna tiene color, se lo agregamos (blanco) a las que no.
  if (lista.some((g) => g.attributes.color)) lista.forEach((g) => !g.attributes.color && teñir(g, new THREE.Color(1, 1, 1)))
  return mergeGeometries(lista)
}

const enCruce = (z: number, margen = 0) => ESQUINAS.some((e) => Math.abs(z - e) < ANCHO_CRUCE / 2 + margen)

/** Plano que mira hacia la calle desde una fachada del lado `lado` (-1 izquierda, 1 derecha). */
function planoFachada(ancho: number, alto: number, lado: number): THREE.PlaneGeometry {
  const g = new THREE.PlaneGeometry(ancho, alto)
  g.rotateY(lado < 0 ? Math.PI / 2 : -Math.PI / 2)
  return g
}

/** Plano horizontal sobre el piso (mira hacia arriba). */
function planoPiso(ancho: number, largo: number): THREE.PlaneGeometry {
  const g = new THREE.PlaneGeometry(ancho, largo)
  g.rotateX(-Math.PI / 2)
  return g
}

// ---------- la ciudad ----------

export function crearCiudad(): Ciudad {
  const azar = semilla(20260611)
  const entre = (a: number, b: number) => a + azar() * (b - a)
  const grupo = new THREE.Group()
  const luces: THREE.PointLight[] = []
  const tramos: [number, number][] = [] // cuadras: [z inicial, z final], z decreciente
  {
    let z = Z0
    for (const e of ESQUINAS) {
      tramos.push([z, e + ANCHO_CRUCE / 2])
      z = e - ANCHO_CRUCE / 2
    }
    tramos.push([z, Z0 - LARGO])
  }

  // ---------- calzada, cruces y pintura ----------
  const asfalto = new THREE.MeshStandardMaterial({
    color: '#15171a',
    map: texturaAsfalto(),
    roughness: 1,
    roughnessMap: texturaCharcos(),
    metalness: 0,
    envMapIntensity: 2.2,
  })
  const calzada = [uv(planoPiso(CALZADA * 2, LARGO), 1, LARGO / 10)]
  calzada[0].translate(0, 0, Z0 - LARGO / 2)
  for (const e of ESQUINAS) calzada.push(uv(planoPiso(80, ANCHO_CRUCE), 8, 1.1).translate(0, 0.001, e))
  grupo.add(new THREE.Mesh(unir(calzada), asfalto))

  const pinturaAmarilla = new THREE.MeshStandardMaterial({ color: '#c9a24a', emissive: '#c9a24a', emissiveIntensity: 0.1, roughness: 0.55 })
  const pinturaBlanca = new THREE.MeshStandardMaterial({ color: '#d4d6d9', emissive: '#d4d6d9', emissiveIntensity: 0.05, roughness: 0.55 })
  const guiones: THREE.BufferGeometry[] = []
  for (let z = Z0 - 2; z > Z0 - LARGO; z -= 9) if (!enCruce(z, 4)) guiones.push(planoPiso(0.14, 3).translate(0, 0.012, z))
  grupo.add(new THREE.Mesh(unir(guiones), pinturaAmarilla))
  const blancas: THREE.BufferGeometry[] = []
  for (const [a, b] of tramos) {
    for (const x of [-4.55, 4.55]) blancas.push(planoPiso(0.12, a - b).translate(x, 0.012, (a + b) / 2))
    // Senda peatonal antes de cada esquina (del lado de la cámara) y línea de detención.
    if (b > Z0 - LARGO + 10) {
      for (let x = -4.2; x <= 4.2; x += 1.05) blancas.push(planoPiso(0.55, 3.2).translate(x, 0.013, b + 2))
      blancas.push(planoPiso(CALZADA * 2 - 0.4, 0.35).translate(0, 0.013, b + 4.6))
    }
  }
  grupo.add(new THREE.Mesh(unir(blancas), pinturaBlanca))

  // ---------- veredas de baldosas y cordón ----------
  const baldosa = texturaBaldosas()
  const vereda = new THREE.MeshStandardMaterial({ map: baldosa.mapa, roughnessMap: baldosa.rugosidad, roughness: 1, color: '#9a958e', envMapIntensity: 1.6 })
  const hormigon = new THREE.MeshStandardMaterial({ color: '#5b5c5e', roughness: 0.85 })
  const veredas: THREE.BufferGeometry[] = []
  const cordones: THREE.BufferGeometry[] = []
  for (const [a, b] of tramos) {
    const largo = a - b
    const zc = (a + b) / 2
    for (const lado of [-1, 1]) {
      const anchoVereda = LINEA - CALZADA
      // Baldosas de 40 cm: la textura tiene 4 × 4, así que una unidad de UV son 1,6 m.
      veredas.push(uv(planoPiso(anchoVereda, largo), anchoVereda / 1.6, largo / 1.6, azar(), azar()).translate(lado * (CALZADA + anchoVereda / 2), CORDON, zc))
      cordones.push(new THREE.BoxGeometry(0.2, CORDON + 0.02, largo).translate(lado * (CALZADA + 0.1), (CORDON + 0.02) / 2 - 0.01, zc))
    }
  }
  grupo.add(new THREE.Mesh(unir(veredas), vereda))
  grupo.add(new THREE.Mesh(unir(cordones), hormigon))

  // ---------- edificios ----------
  const atlasModerno = texturaFachada('moderno')
  const atlasAntiguo = texturaFachada('antiguo')
  const atlasLocales = texturaLocales()
  const mFachadaModerna = new THREE.MeshStandardMaterial({ map: atlasModerno.mapa, emissiveMap: atlasModerno.luz, emissive: '#ffffff', emissiveIntensity: 1, roughness: 0.75, vertexColors: true })
  const mFachadaAntigua = new THREE.MeshStandardMaterial({ map: atlasAntiguo.mapa, emissiveMap: atlasAntiguo.luz, emissive: '#ffffff', emissiveIntensity: 1, roughness: 0.85, vertexColors: true })
  const mLocales = new THREE.MeshStandardMaterial({ map: atlasLocales.mapa, emissiveMap: atlasLocales.luz, emissive: '#ffffff', emissiveIntensity: 0.65, roughness: 0.5 })
  const mMuro = new THREE.MeshStandardMaterial({ roughness: 0.92, vertexColors: true })
  const mCarteles = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false })
  const mCharcoLuz = new THREE.MeshBasicMaterial({ map: texturaRadial(), vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false })
  const mReflejo = new THREE.MeshBasicMaterial({ map: texturaReflejo(), vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false })

  const fachadasModernas: THREE.BufferGeometry[] = []
  const fachadasAntiguas: THREE.BufferGeometry[] = []
  const locales: THREE.BufferGeometry[] = []
  const muros: THREE.BufferGeometry[] = []
  const detalles: THREE.BufferGeometry[] = [] // pilastras, cornisas y balcones (color por vértice)
  const carteles: THREE.BufferGeometry[] = []
  const charcos: THREE.BufferGeometry[] = []
  const reflejos: THREE.BufferGeometry[] = []
  const TONOS_MURO = ['#3a3633', '#2f3134', '#463d36', '#34383d', '#3d3a35', '#2b2c2e', '#4a4440']
  const TONOS_CARTEL = ['#ff2a1f', '#ff9d0a', '#12b8ff', '#e8e8e8', '#2fe36a', '#ff2f7d']
  const CALIDO = new THREE.Color('#ffb36b')

  for (const [a, b] of tramos) {
    if (a < -460) continue // más lejos, la niebla ya los borra: alcanza con el resplandor
    for (const lado of [-1, 1]) {
      let z = a
      while (z > b + 2) {
        const ancho = Math.min(z - b, entre(7, 15))
        if (ancho < 3) break
        const zc = z - ancho / 2
        z -= ancho
        const antiguo = azar() < 0.4
        const tono = new THREE.Color(TONOS_MURO[Math.floor(azar() * TONOS_MURO.length)]).multiplyScalar(entre(1.5, 2.3))
        const retiro = azar() < 0.2 ? 0.5 : 0 // algunas fachadas un poco más atrás: quiebran el plano
        const x0 = LINEA + retiro
        const fondo = 14
        let alto: number
        let pisos: number
        const modulo = antiguo ? PISO_ANTIGUO : PISO
        if (antiguo) {
          pisos = 1 + Math.floor(azar() * 2)
          alto = PB + pisos * PISO_ANTIGUO + 1.1
        } else {
          pisos = 3 + Math.floor(azar() ** 1.4 * 12)
          alto = PB + pisos * PISO + 0.9
        }
        const lx = (dx: number) => lado * (x0 + dx) // x a dx metros hacia adentro de la fachada

        // Volumen: desde la PB hacia arriba (la planta baja queda retirada bajo el voladizo).
        const cuerpo = new THREE.BoxGeometry(fondo, alto - PB, ancho - 0.02)
        cuerpo.translate(lx(fondo / 2), PB + (alto - PB) / 2, zc)
        muros.push(teñir(cuerpo, tono))
        const fondoPB = new THREE.BoxGeometry(fondo - 0.64, PB, ancho - 0.02)
        fondoPB.translate(lx(0.64 + (fondo - 0.64) / 2), PB / 2, zc)
        muros.push(teñir(fondoPB, tono.clone().multiplyScalar(0.6)))

        // Ventanas: tantos módulos enteros como entren, así la textura no se estira.
        const modulos = Math.max(2, Math.floor((ancho - 0.9) / 3))
        const anchoVentanas = modulos * 3
        const atlas = antiguo ? 8 : 16 // módulos por lado del atlas
        const fachada = planoFachada(anchoVentanas, pisos * modulo, lado)
        uv(fachada, modulos / atlas, pisos / atlas, Math.floor(azar() * atlas) / atlas, Math.floor(azar() * atlas) / atlas)
        fachada.translate(lx(-0.015), PB + (pisos * modulo) / 2, zc)
        ;(antiguo ? fachadasAntiguas : fachadasModernas).push(teñir(fachada, tono.clone().multiplyScalar(2.2)))

        // Planta baja: local iluminado, kiosco, persiana baja o vidriera oscura.
        const tipo = azar() < 0.42 ? 0 : azar() < 0.35 ? 1 : azar() < 0.6 ? 2 : 3
        const local = planoFachada(ancho - 0.7, PB - CORDON - 0.25, lado)
        uv(local, 0.25, 1, tipo * 0.25, 0)
        local.translate(lx(0.6), CORDON + (PB - CORDON - 0.25) / 2, zc)
        locales.push(local)
        if (tipo <= 1) {
          // Luz del local sobre la vereda y su reflejo en la calle mojada.
          const c = tipo === 0 ? CALIDO.clone().multiplyScalar(0.55) : new THREE.Color('#cfe3ff').multiplyScalar(0.45)
          charcos.push(teñir(planoPiso(3.4, ancho * 0.9).translate(lado * (LINEA - 1.6), CORDON + 0.01, zc), c))
          reflejos.push(teñir(planoPiso(0.9, 7).translate(lado * (CALZADA - 0.7), 0.02, zc + 3.5), c.clone().multiplyScalar(0.5)))
          // Cartel luminoso sobre la vidriera.
          if (azar() < 0.75) {
            const cartel = new THREE.BoxGeometry(0.12, 0.38, Math.min(ancho * 0.45, 4))
            cartel.translate(lx(-0.08), PB - 0.62, zc)
            carteles.push(teñir(cartel, new THREE.Color(TONOS_CARTEL[Math.floor(azar() * TONOS_CARTEL.length)]).multiplyScalar(entre(0.55, 0.85))))
          }
        }

        // Pilastras en los bordes (separan las fachadas y dan relieve vertical).
        const tonoDetalle = tono.clone().multiplyScalar(1.35)
        for (const s of [-1, 1]) {
          const pilastra = new THREE.BoxGeometry(0.3, alto - CORDON, 0.42)
          pilastra.translate(lx(-0.15), CORDON + (alto - CORDON) / 2, zc + s * (ancho / 2 - 0.21))
          detalles.push(teñir(pilastra, tonoDetalle))
        }
        // Cornisa arriba y dintel sobre la planta baja.
        detalles.push(teñir(new THREE.BoxGeometry(0.55, 0.38, ancho + 0.12).translate(lx(-0.27), alto - 0.19, zc), tonoDetalle))
        detalles.push(teñir(new THREE.BoxGeometry(0.4, 0.3, ancho - 0.1).translate(lx(-0.2), PB - 0.15, zc), tonoDetalle))
        if (antiguo) {
          // Balcones de hierro: una losa con baranda delante de cada ventana alta.
          for (let p = 0; p < pisos; p++) {
            const y = PB + p * PISO_ANTIGUO + 0.55
            for (let m = 0; m < modulos; m++) {
              const zm = zc - anchoVentanas / 2 + 1.5 + m * 3
              detalles.push(teñir(new THREE.BoxGeometry(0.75, 0.12, 1.9).translate(lx(-0.38), y, zm), tonoDetalle))
              detalles.push(teñir(new THREE.BoxGeometry(0.05, 0.9, 1.9).translate(lx(-0.74), y + 0.5, zm), new THREE.Color('#141414')))
            }
          }
          // Balaustrada sobre la cornisa.
          detalles.push(teñir(new THREE.BoxGeometry(0.3, 0.8, ancho - 0.3).translate(lx(-0.1), alto + 0.4, zc), tonoDetalle))
        } else if (azar() < 0.65) {
          // Balcones corridos en cada piso: las líneas horizontales que más profundidad dan.
          const salida = entre(0.8, 1.3)
          for (let p = 1; p <= pisos; p++) {
            const y = PB + p * PISO - PISO + 0.05
            detalles.push(teñir(new THREE.BoxGeometry(salida, 0.16, ancho - 0.9).translate(lx(-salida / 2), y, zc), tonoDetalle))
            detalles.push(teñir(new THREE.BoxGeometry(0.05, 0.06, ancho - 0.9).translate(lx(-salida + 0.03), y + 1.0, zc), new THREE.Color('#1c1d1f')))
          }
        }
        // Tanque de agua en algunas terrazas.
        if (!antiguo && azar() < 0.4) {
          muros.push(teñir(new THREE.BoxGeometry(2.6, 2.2, 2.6).translate(lx(fondo * 0.6), alto + 1.1, zc), tono.clone().multiplyScalar(0.8)))
        }
      }
    }
  }
  grupo.add(new THREE.Mesh(unir(muros), mMuro))
  grupo.add(new THREE.Mesh(unir(detalles), mMuro))
  if (fachadasModernas.length) grupo.add(new THREE.Mesh(unir(fachadasModernas), mFachadaModerna))
  if (fachadasAntiguas.length) grupo.add(new THREE.Mesh(unir(fachadasAntiguas), mFachadaAntigua))
  grupo.add(new THREE.Mesh(unir(locales), mLocales))
  if (carteles.length) grupo.add(new THREE.Mesh(unir(carteles), mCarteles))

  // ---------- árboles de vereda ----------
  const troncos: THREE.BufferGeometry[] = []
  const copas: THREE.BufferGeometry[] = []
  for (const [a, b] of tramos) {
    if (a < -330) continue
    for (const lado of [-1, 1]) {
      for (let z = a - entre(3, 7); z > b + 3; z -= entre(8, 11)) {
        if (z > -12) continue // nada pegado a la cámara: deja ver la avenida
        if (Math.abs(((z + 6) % 25 + 25) % 25 - 12.5) > 10.5) continue // no pegados a un farol
        const x = lado * (CALZADA + 0.75)
        const alto = entre(3.0, 3.8)
        troncos.push(new THREE.CylinderGeometry(0.1, 0.17, alto, 7).translate(x, CORDON + alto / 2, z))
        for (let k = 0; k < 4; k++) {
          const r = entre(1.2, 2.0)
          const copa = follaje(r, azar).scale(entre(0.8, 1.15), entre(0.65, 0.95), entre(0.8, 1.15))
          copa.translate(x + lado * entre(-0.3, 1.2), CORDON + alto + entre(0.6, 2.0), z + entre(-1.4, 1.4))
          copas.push(teñir(copa, new THREE.Color('#2a3a25').multiplyScalar(entre(0.7, 1.2))))
        }
      }
    }
  }
  const troncosM = new THREE.Mesh(unir(troncos), new THREE.MeshStandardMaterial({ color: '#2a241f', roughness: 0.95 }))
  const copasM = new THREE.Mesh(unir(copas), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95 }))
  grupo.add(troncosM, copasM)

  // ---------- autos estacionados ----------
  const PINTURAS = ['#1a1c1f', '#b9bcc0', '#e3e3e0', '#26303e', '#5e1414', '#3a3a3a', '#7c8186']
  const porColor = new Map<string, THREE.BufferGeometry[]>()
  const vidrios: THREE.BufferGeometry[] = []
  const ruedas: THREE.BufferGeometry[] = []
  const ojos: THREE.BufferGeometry[] = []
  for (const [a, b] of tramos) {
    if (a < -260) continue
    for (const lado of [-1, 1]) {
      for (let z = a - entre(3, 8); z > b + 9; z -= entre(5.6, 7.5)) {
        if (z > -10 || azar() < 0.22) continue // lugares libres (y nada pegado a la cámara)
        const color = PINTURAS[Math.floor(azar() * PINTURAS.length)]
        const x = lado * (CALZADA - 1.05)
        // Del lado derecho miran hacia adelante (vemos la cola); del izquierdo, hacia la cámara.
        const largo = entre(3.9, 4.4)
        const cuerpo = new RoundedBoxGeometry(1.74, 0.72, largo, 3, 0.2).translate(x, 0.33 + 0.36, z)
        const techo = new RoundedBoxGeometry(1.5, 0.08, largo * 0.45, 2, 0.04).translate(x, 1.44, z + lado * 0.15)
        porColor.set(color, [...(porColor.get(color) ?? []), cuerpo, techo])
        vidrios.push(new RoundedBoxGeometry(1.52, 0.42, largo * 0.55, 2, 0.12).translate(x, 1.2, z + lado * 0.15))
        for (const dz of [-largo / 2 + 0.75, largo / 2 - 0.75]) {
          for (const dx of [-0.8, 0.8]) ruedas.push(new THREE.CylinderGeometry(0.31, 0.31, 0.2, 14).rotateZ(Math.PI / 2).translate(x + dx, 0.31, z + dz))
        }
        // Ojos de gato traseros (rojos) o delanteros apagados.
        for (const dx of [-0.62, 0.62]) ojos.push(new THREE.BoxGeometry(0.28, 0.1, 0.04).translate(x + dx, 0.82, z + lado * (largo / 2 + 0.005)))
      }
    }
  }
  for (const [color, geos] of porColor) {
    grupo.add(new THREE.Mesh(unir(geos), new THREE.MeshPhysicalMaterial({ color, metalness: 0.5, roughness: 0.35, clearcoat: 1, clearcoatRoughness: 0.1 })))
  }
  grupo.add(new THREE.Mesh(unir(vidrios), new THREE.MeshPhysicalMaterial({ color: '#07090c', metalness: 0.3, roughness: 0.08, clearcoat: 1 })))
  grupo.add(new THREE.Mesh(unir(ruedas), new THREE.MeshStandardMaterial({ color: '#0c0c0d', roughness: 0.9 })))
  grupo.add(new THREE.Mesh(unir(ojos), new THREE.MeshStandardMaterial({ color: '#5a0a0a', emissive: '#ff2a1a', emissiveIntensity: 0.6 })))

  // ---------- faroles de sodio: columna, brazo, luz, cono en la lluvia, charco y reflejo ----------
  const metal = new THREE.MeshStandardMaterial({ color: '#1d1e20', roughness: 0.6, metalness: 0.5 })
  const lampara = new THREE.MeshStandardMaterial({ color: '#ffb36b', emissive: '#ffb36b', emissiveIntensity: 4 })
  const postes: THREE.BufferGeometry[] = []
  const focos: THREE.BufferGeometry[] = []
  const conos: THREE.BufferGeometry[] = []
  const halo = texturaRadial()
  for (let k = 0; k < 24; k++) {
    const lado = k % 2 === 0 ? -1 : 1
    const zf = -6 - k * 25
    if (enCruce(zf, 2)) continue
    const xc = lado * (CALZADA + 0.45)
    const xl = lado * (CALZADA - 1.25)
    postes.push(new THREE.CylinderGeometry(0.07, 0.11, 7.4, 8).translate(xc, CORDON + 3.7, zf))
    postes.push(new THREE.BoxGeometry(Math.abs(xc - xl) + 0.1, 0.07, 0.07).translate((xc + xl) / 2, 7.5, zf))
    postes.push(new THREE.BoxGeometry(0.8, 0.12, 0.34).translate(xl, 7.42, zf))
    focos.push(new THREE.BoxGeometry(0.62, 0.05, 0.24).translate(xl, 7.34, zf))
    // Cono de luz visible por la lluvia (solo en los cercanos: de lejos, con niebla, se ensucia).
    if (k < 9) conos.push(new THREE.CylinderGeometry(0.25, 3.2, 7.2, 20, 1, true).translate(xl, 3.75, zf))
    // Charco de luz en el asfalto y su reflejo estirado hacia la cámara (así se ve el piso mojado).
    charcos.push(teñir(planoPiso(9, 9).translate(xl, 0.015, zf), CALIDO.clone().multiplyScalar(0.5)))
    reflejos.push(teñir(planoPiso(1.1, 14).translate(xl, 0.02, zf + 7), CALIDO.clone().multiplyScalar(0.75)))
    const brillo = new THREE.Sprite(new THREE.SpriteMaterial({ map: halo, color: '#ffb46e', blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.85 }))
    brillo.position.set(xl, 7.25, zf)
    brillo.scale.set(2.4, 2.4, 1)
    grupo.add(brillo)
    if (luces.length < 7) {
      const luz = new THREE.PointLight('#ffad62', 70, 32, 2)
      luz.position.set(xl, 6.9, zf)
      luces.push(luz)
      grupo.add(luz)
    }
  }
  grupo.add(new THREE.Mesh(unir(postes), metal))
  grupo.add(new THREE.Mesh(unir(focos), lampara))
  grupo.add(new THREE.Mesh(unir(conos), new THREE.MeshBasicMaterial({ map: texturaCono(), color: '#ffb46e', transparent: true, opacity: 0.11, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide })))
  grupo.add(new THREE.Mesh(unir(charcos), mCharcoLuz))
  grupo.add(new THREE.Mesh(unir(reflejos), mReflejo))

  // ---------- semáforos en cada esquina ----------
  const LUZ_SEMAFORO = { rojo: '#ff2a1a', amarillo: '#ffb020', verde: '#2bff8a' }
  const caja = new THREE.MeshStandardMaterial({ color: '#141516', roughness: 0.6 })
  ESQUINAS.forEach((e, k) => {
    if (e < -450) return
    const activo = k % 2 === 0 ? 'verde' : 'rojo'
    for (const lado of [-1, 1]) {
      const x = lado * (CALZADA + 0.5)
      const z = e + ANCHO_CRUCE / 2 + 0.6
      const poste = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.07, 3.4, 8), metal)
      poste.position.set(x, CORDON + 1.7, z)
      const cabeza = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.95, 0.3), caja)
      cabeza.position.set(x, CORDON + 3.6, z)
      grupo.add(poste, cabeza)
      ;(['rojo', 'amarillo', 'verde'] as const).forEach((c, i) => {
        const on = c === activo
        const lente = new THREE.Mesh(
          new THREE.CircleGeometry(0.1, 16),
          new THREE.MeshStandardMaterial({ color: '#111', emissive: LUZ_SEMAFORO[c], emissiveIntensity: on ? 4 : 0.06 }),
        )
        lente.position.set(x, CORDON + 3.9 - i * 0.3, z + 0.16)
        grupo.add(lente)
        if (on) {
          const g = new THREE.Sprite(new THREE.SpriteMaterial({ map: halo, color: LUZ_SEMAFORO[c], blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.9 }))
          g.position.copy(lente.position)
          g.scale.set(1.1, 1.1, 1)
          grupo.add(g)
          const r = new THREE.Mesh(planoPiso(0.5, 9), new THREE.MeshBasicMaterial({ map: mReflejo.map, color: LUZ_SEMAFORO[c], transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false }))
          r.position.set(lado * (CALZADA - 0.6), 0.025, z + 4.5)
          grupo.add(r)
        }
      })
    }
  })

  // ---------- resplandor anaranjado de la ciudad al fondo ----------
  const resplandor = new THREE.Mesh(new THREE.PlaneGeometry(900, 160), new THREE.MeshBasicMaterial({ map: texturaResplandor(), transparent: true, fog: false, depthWrite: false }))
  resplandor.position.set(0, 40, -700)
  grupo.add(resplandor)

  return { grupo, luces }
}

// ---------- texturas generadas ----------

/** Asfalto: granulado irregular y manchas, en tono neutro (el color lo da el material). */
/** Dibuja algo nueve veces (desplazado ± el tamaño del lienzo) para que la textura no tenga costuras al repetirse. */
function sinCostura(t: number, dibujar: (dx: number, dy: number) => void) {
  for (const dx of [-t, 0, t]) for (const dy of [-t, 0, t]) dibujar(dx, dy)
}

/** Copa de árbol: esfera deformada con ruido (el mismo desplazamiento en vértices repetidos, así no se abre). */
function follaje(r: number, azar: () => number): THREE.BufferGeometry {
  const g = new THREE.SphereGeometry(r, 12, 9)
  const p = g.attributes.position as THREE.BufferAttribute
  const f = [azar() * 10, azar() * 10, azar() * 10]
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i)
    const y = p.getY(i)
    const z = p.getZ(i)
    const ruido = Math.sin(x * 2.3 + f[0]) * Math.cos(z * 2.1 + f[1]) + 0.6 * Math.sin(y * 3.7 + x * 1.3 + f[2])
    const k = 1 + 0.16 * ruido
    p.setXYZ(i, x * k, y * k, z * k)
  }
  g.computeVertexNormals()
  return g
}

function texturaAsfalto() {
  const t = lienzo(256, 256, (g) => {
    const azar = semilla(3)
    g.fillStyle = '#8a8a8a'
    g.fillRect(0, 0, 256, 256)
    for (let k = 0; k < 9000; k++) {
      const v = 100 + azar() * 90
      g.fillStyle = `rgb(${v},${v},${v})`
      g.fillRect(azar() * 256, azar() * 256, 1.4, 1.4)
    }
    for (let k = 0; k < 14; k++) {
      const x0 = azar() * 256
      const y0 = azar() * 256
      const r = 20 + azar() * 50
      sinCostura(256, (dx, dy) => {
        const x = x0 + dx
        const y = y0 + dy
        const gr = g.createRadialGradient(x, y, 0, x, y, r)
        gr.addColorStop(0, 'rgba(60,60,60,0.35)')
        gr.addColorStop(1, 'rgba(60,60,60,0)')
        g.fillStyle = gr
        g.fillRect(x - r, y - r, r * 2, r * 2)
      })
    }
  })
  t.wrapS = t.wrapT = THREE.RepeatWrapping
  return t
}

/** Rugosidad del asfalto: charcos lisos (reflejan) sobre asfalto áspero. */
function texturaCharcos() {
  const t = lienzo(
    256,
    256,
    (g) => {
      const azar = semilla(5)
      g.fillStyle = 'rgb(200,200,200)'
      g.fillRect(0, 0, 256, 256)
      for (let k = 0; k < 30; k++) {
        const x0 = azar() * 256
        const y0 = azar() * 256
        const r = 10 + azar() * 45
        sinCostura(256, (dx, dy) => {
          const x = x0 + dx
          const y = y0 + dy
          const gr = g.createRadialGradient(x, y, 0, x, y, r)
          gr.addColorStop(0, 'rgb(40,40,40)')
          gr.addColorStop(0.6, 'rgba(80,80,80,0.8)')
          gr.addColorStop(1, 'rgba(200,200,200,0)')
          g.fillStyle = gr
          g.fillRect(x - r, y - r, r * 2, r * 2)
        })
      }
    },
    false,
  )
  t.wrapS = t.wrapT = THREE.RepeatWrapping
  return t
}

/** Baldosas de vereda (4 × 4 de 40 cm) con juntas y brillo de agua en algunas. */
function texturaBaldosas() {
  const azar = semilla(11)
  const tonos = Array.from({ length: 16 }, () => 0.8 + azar() * 0.3)
  const mojadas = Array.from({ length: 16 }, () => azar())
  const mapa = lienzo(256, 256, (g) => {
    for (let i = 0; i < 16; i++) {
      const x = (i % 4) * 64
      const y = Math.floor(i / 4) * 64
      const v = Math.round(150 * tonos[i])
      g.fillStyle = `rgb(${v},${v - 4},${v - 10})`
      g.fillRect(x, y, 64, 64)
      // Los nueve "panes" de la baldosa vainilla.
      g.fillStyle = `rgba(0,0,0,0.12)`
      for (let a = 0; a < 3; a++) for (let b = 0; b < 3; b++) g.fillRect(x + 6 + a * 19, y + 6 + b * 19, 14, 14)
    }
    g.strokeStyle = 'rgba(20,20,20,0.9)'
    g.lineWidth = 3
    for (let k = 0; k <= 4; k++) {
      g.beginPath()
      g.moveTo(k * 64, 0)
      g.lineTo(k * 64, 256)
      g.moveTo(0, k * 64)
      g.lineTo(256, k * 64)
      g.stroke()
    }
  })
  const rugosidad = lienzo(
    256,
    256,
    (g) => {
      for (let i = 0; i < 16; i++) {
        const v = Math.round(110 + mojadas[i] * 140)
        g.fillStyle = `rgb(${v},${v},${v})`
        g.fillRect((i % 4) * 64, Math.floor(i / 4) * 64, 64, 64)
      }
    },
    false,
  )
  for (const t of [mapa, rugosidad]) t.wrapS = t.wrapT = THREE.RepeatWrapping
  return { mapa, rugosidad }
}

/**
 * Atlas de fachadas: módulos de una ventana por piso (16 × 16 modernos de 3 × 3 m; 8 × 8 antiguos de 3 × 3,75 m).
 * `mapa` es la fachada (muro, marcos, vidrio, persianas) y `luz` las ventanas encendidas (cálidas, alguna fría).
 */
function texturaFachada(estilo: 'moderno' | 'antiguo') {
  const azar = semilla(estilo === 'moderno' ? 21 : 34)
  const n = estilo === 'moderno' ? 16 : 8
  const W = 512
  const mw = W / n
  const H = estilo === 'moderno' ? 512 : 640
  const mh = H / n
  const estados = Array.from({ length: n * n }, () => {
    const r = azar()
    return { luz: r < 0.24 ? 'calida' : r < 0.28 ? 'fria' : 'apagada', intensidad: 0.55 + azar() * 0.45, cortina: azar(), persiana: azar() }
  })
  const ventana = (i: number) => {
    const x = (i % n) * mw
    const y = Math.floor(i / n) * mh
    return estilo === 'moderno'
      ? { x, y, vx: x + mw * 0.1, vy: y + mh * 0.18, vw: mw * 0.8, vh: mh * 0.62 }
      : { x, y, vx: x + mw * 0.3, vy: y + mh * 0.12, vw: mw * 0.4, vh: mh * 0.72 }
  }
  const mapa = lienzo(W, H, (g) => {
    g.fillStyle = '#7c7873'
    g.fillRect(0, 0, W, H)
    estados.forEach((e, i) => {
      const { x, y, vx, vy, vw, vh } = ventana(i)
      // Línea de losa entre pisos.
      g.fillStyle = 'rgba(0,0,0,0.25)'
      g.fillRect(x, y + mh - 2, mw, 2)
      g.fillStyle = '#2c2c2c'
      g.fillRect(vx - 1.5, vy - 1.5, vw + 3, vh + 3)
      g.fillStyle = e.luz === 'apagada' ? '#1a2029' : '#3a3530'
      g.fillRect(vx, vy, vw, vh)
      // Reflejo tenue en el vidrio apagado.
      if (e.luz === 'apagada') {
        const r = g.createLinearGradient(vx, vy, vx + vw, vy + vh)
        r.addColorStop(0, 'rgba(120,140,170,0.22)')
        r.addColorStop(1, 'rgba(120,140,170,0)')
        g.fillStyle = r
        g.fillRect(vx, vy, vw, vh)
      }
      // Persianas de enrollar a medio bajar (en las antiguas, de madera).
      if (e.persiana < 0.45) {
        const baja = vh * (0.2 + e.persiana)
        g.fillStyle = estilo === 'moderno' ? '#4a4844' : '#3b3227'
        g.fillRect(vx, vy, vw, baja)
        g.fillStyle = 'rgba(0,0,0,0.3)'
        for (let k = vy + 2; k < vy + baja; k += 3) g.fillRect(vx, k, vw, 1)
      }
      g.fillStyle = '#2c2c2c'
      g.fillRect(vx + vw / 2 - 0.75, vy, 1.5, vh) // parante
    })
  })
  const luz = lienzo(W, H, (g) => {
    g.fillStyle = '#000'
    g.fillRect(0, 0, W, H)
    estados.forEach((e, i) => {
      if (e.luz === 'apagada') return
      const { vx, vy, vw, vh } = ventana(i)
      const baja = e.persiana < 0.45 ? vh * (0.2 + e.persiana) : 0
      const grad = g.createLinearGradient(vx, vy, vx, vy + vh)
      const a = e.intensidad
      if (e.luz === 'calida') {
        grad.addColorStop(0, `rgba(255,190,110,${a * 0.75})`)
        grad.addColorStop(1, `rgba(255,214,150,${a})`)
      } else {
        grad.addColorStop(0, `rgba(140,180,255,${a * 0.6})`)
        grad.addColorStop(1, `rgba(170,205,255,${a * 0.85})`)
      }
      g.fillStyle = grad
      g.fillRect(vx, vy + baja, vw, vh - baja)
      // Cortina recogida a un costado.
      if (e.cortina < 0.5) {
        g.fillStyle = 'rgba(0,0,0,0.45)'
        g.fillRect(vx, vy + baja, vw * (0.15 + e.cortina * 0.4), vh - baja)
      }
      g.fillStyle = '#000'
      g.fillRect(vx + vw / 2 - 0.75, vy, 1.5, vh)
    })
  })
  for (const t of [mapa, luz]) t.wrapS = t.wrapT = THREE.RepeatWrapping
  return { mapa, luz }
}

/** Plantas bajas (4 variantes en u): local cálido, kiosco/farmacia blanco, persiana metálica, vidriera apagada. */
function texturaLocales() {
  const W = 1024
  const H = 128
  const cw = W / 4
  const azar = semilla(42)
  const vidriera = (g: CanvasRenderingContext2D, x: number) => {
    g.fillStyle = '#1b1b1c'
    g.fillRect(x, 0, cw, H)
    g.fillStyle = '#26282b'
    g.fillRect(x + 8, 14, cw - 16, H - 22)
    g.fillStyle = '#121314'
    g.fillRect(x + cw / 2 - 18, 22, 36, H - 30) // puerta
  }
  const mapa = lienzo(W, H, (g) => {
    for (let k = 0; k < 4; k++) {
      const x = k * cw
      if (k === 2) {
        g.fillStyle = '#5d5f62'
        g.fillRect(x, 0, cw, H)
        for (let y = 6; y < H; y += 5) {
          g.fillStyle = 'rgba(0,0,0,0.35)'
          g.fillRect(x, y, cw, 1.5)
        }
        g.fillStyle = 'rgba(30,30,30,0.6)'
        g.fillRect(x, 0, cw, 8)
      } else vidriera(g, x)
    }
  })
  const luz = lienzo(W, H, (g) => {
    g.fillStyle = '#000'
    g.fillRect(0, 0, W, H)
    for (const [k, c1, c2] of [
      [0, 'rgba(255,196,120,1)', 'rgba(255,150,70,0.85)'],
      [1, 'rgba(235,245,255,1)', 'rgba(190,215,255,0.8)'],
    ] as const) {
      const x = k * cw
      const grad = g.createLinearGradient(0, 14, 0, H - 8)
      grad.addColorStop(0, c1)
      grad.addColorStop(1, c2)
      g.fillStyle = grad
      g.fillRect(x + 8, 14, cw - 16, H - 22)
      // Estantes y gente: siluetas oscuras dentro del local.
      g.fillStyle = 'rgba(0,0,0,0.55)'
      for (let y = 40; y < H - 20; y += 22) g.fillRect(x + 12, y, cw - 24, 3)
      for (let p = 0; p < 2; p++) {
        const px = x + 30 + azar() * (cw - 60)
        g.beginPath()
        g.ellipse(px, H - 46, 7, 9, 0, 0, Math.PI * 2)
        g.fill()
        g.fillRect(px - 10, H - 38, 20, 30)
      }
      g.fillStyle = '#000'
      g.fillRect(x + cw / 2 - 18, 22, 3, H - 30)
      g.fillRect(x + cw / 2 + 15, 22, 3, H - 30)
    }
    // Una luz tenue detrás de la persiana (rendija de abajo).
    g.fillStyle = 'rgba(255,170,90,0.25)'
    g.fillRect(2 * cw, H - 6, cw, 6)
  })
  return { mapa, luz }
}

function texturaRadial() {
  return lienzo(64, 64, (g) => {
    const r = g.createRadialGradient(32, 32, 0, 32, 32, 32)
    r.addColorStop(0, 'rgba(255,255,255,1)')
    r.addColorStop(0.35, 'rgba(255,255,255,0.45)')
    r.addColorStop(1, 'rgba(255,255,255,0)')
    g.fillStyle = r
    g.fillRect(0, 0, 64, 64)
  })
}

/** Reflejo alargado sobre el piso mojado: vetas finas, intenso cerca de la fuente (v alto) y se apaga hacia la cámara. */
function texturaReflejo() {
  return lienzo(32, 256, (g) => {
    const azar = semilla(8)
    for (let x = 0; x < 32; x++) {
      const centro = Math.exp(-(((x - 15.5) / 7) ** 2))
      const veta = 0.35 + 0.65 * azar() ** 2
      const grad = g.createLinearGradient(0, 0, 0, 256)
      grad.addColorStop(0, `rgba(255,255,255,${0.9 * centro * veta})`)
      grad.addColorStop(0.35, `rgba(255,255,255,${0.35 * centro * veta})`)
      grad.addColorStop(1, 'rgba(255,255,255,0)')
      g.fillStyle = grad
      g.fillRect(x, 0, 1, 256)
    }
  })
}

/** Cono de luz: más denso arriba (junto al farol) y se desvanece hacia el piso. */
function texturaCono() {
  return lienzo(4, 128, (g) => {
    const grad = g.createLinearGradient(0, 0, 0, 128)
    grad.addColorStop(0, 'rgba(255,255,255,0.9)')
    grad.addColorStop(0.6, 'rgba(255,255,255,0.25)')
    grad.addColorStop(1, 'rgba(255,255,255,0)')
    g.fillStyle = grad
    g.fillRect(0, 0, 4, 128)
  })
}

function texturaResplandor() {
  return lienzo(16, 128, (g) => {
    const grad = g.createLinearGradient(0, 0, 0, 128)
    grad.addColorStop(0, 'rgba(60, 40, 30, 0)')
    grad.addColorStop(0.7, 'rgba(140, 80, 40, 0.35)')
    grad.addColorStop(1, 'rgba(180, 100, 50, 0.55)')
    g.fillStyle = grad
    g.fillRect(0, 0, 16, 128)
  })
}
