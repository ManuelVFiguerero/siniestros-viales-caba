// Home: la historia en actos. Se avanza con la rueda del mouse, deslizando, con flechas o con un clicker
// (PageDown / PageUp). El mapa de fondo, el clima en pantalla, el tránsito y el sonido siguen a cada acto.
// Teclas: N abre las notas del orador · M sonido · I repite la intro · en el último acto, espacio libera el mapa.
//
// Arranque: antesala (habilita el sonido) → intro del choque → hero: el mapa espera a nivel calle sobre el
// siniestro real del impacto y se aleja mientras se encienden los 62.737, del más cercano al más lejano.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { PolygonLayer, ScatterplotLayer } from '@deck.gl/layers'
import { DataFilterExtension } from '@deck.gl/extensions'
import type { PickingInfo } from '@deck.gl/core'
import type { MapRef } from 'react-map-gl/maplibre'
import gsap from 'gsap'
import { useGSAP } from '@gsap/react'
import { SplitText } from 'gsap/SplitText'
import QRCode from 'qrcode'

import { debajoDe, MapaBase } from '../components/MapaBase'
import { FichaCelda } from '../components/FichaCelda'
import { EfectoClima } from '../ambiente/EfectoClima'
import { intensidadDeLluvia, luzDelDia, prefiereMenosMovimiento } from '../ambiente/luz'
import { BotonSonido, trueno, useAmbienteSonoro, useSonido } from '../ambiente/Sonido'
import { capaTransito, factorClima, viajes } from '../ambiente/transito'
import { useVotacion } from '../ambiente/votacion'
import {
  colorEn, cuantil, DIAS, escenario, fmtNum, hhmm, NOMBRE_CLIMA, nombreCelda, posicion, totalCiudad,
  type Celda, type Dominio, type Riesgo,
} from '../riesgo'
import type { Modelo, Patrones, Siniestros } from '../data'
import { useAhoraBA, usePronostico } from '../vivo'
import { GUION, type IdActo } from './guion'
import { CANAL, type MensajeNotas } from './Notas'
import { ComparacionModelos, CurvaHora, Fuentes, Limites, Pipeline, Shap } from './historiaTecnica'
import { Intro } from './Intro'
import { Antesala } from './Antesala'

gsap.registerPlugin(useGSAP, SplitText)

interface Props {
  riesgo: Riesgo
  siniestros: Siniestros
  patrones: Patrones
  modelo: Modelo
  onExplorar: () => void
}

interface Camara {
  zoom: number
  pitch: number
  bearing: number
}

const CENTRO: [number, number] = [-58.445, -34.615]
const MARTES = 1
const COLOR_PUNTO: [number, number, number, number] = [255, 150, 70, 190]
const COLOR_PUNTO_TENUE: [number, number, number, number] = [255, 150, 70, 60]
const COLOR_ACIERTO: [number, number, number, number] = [255, 248, 225, 240]
const COLOR_FUERA: [number, number, number, number] = [120, 132, 145, 80]
const COLOR_PULSO: [number, number, number, number] = [255, 196, 130, 235]
const COLOR_FOCO: [number, number, number, number] = [255, 140, 84, 255]

/** Cámara del hero: a nivel calle sobre el siniestro de la intro. */
const CAMARA_FOCO = { zoom: 16.6, pitch: 58, bearing: -28 }
/** Duración del alejamiento del hero (ms) y vueltas del reloj del acto "El pulso" (s por día). */
const DESPEGUE_MS = 8200
const DIA_PULSO_S = 18

type Hero = 'foco' | 'despegue' | 'listo'

const CON_CLIMA: Record<string, string> = {
  tormenta: 'con tormenta',
  lluvia: 'con lluvia',
  niebla: 'con niebla',
  nublado: 'con el cielo nublado',
  despejado: 'con el cielo despejado',
}

/** Escenario del modelo (día 0 = lunes) y cámara de cada acto; los textos están en guion.ts. */
const ESCENA: Record<IdActo, { escena: { dia: number; hora: number; clima: string } | null; camara: Camara }> = {
  portada: { escena: null, camara: { zoom: 11.05, pitch: 40, bearing: -12 } },
  ciudad: { escena: null, camara: { zoom: 11.25, pitch: 28, bearing: -10 } },
  pregunta: { escena: null, camara: { zoom: 11.05, pitch: 0, bearing: 0 } },
  sol: { escena: { dia: MARTES, hora: 14, clima: 'despejado' }, camara: { zoom: 11.55, pitch: 34, bearing: -14 } },
  lluvia: { escena: { dia: MARTES, hora: 14, clima: 'lluvia' }, camara: { zoom: 11.75, pitch: 52, bearing: 6 } },
  noche: { escena: { dia: MARTES, hora: 22, clima: 'lluvia' }, camara: { zoom: 11.85, pitch: 46, bearing: 22 } },
  tormenta: { escena: { dia: MARTES, hora: 22, clima: 'tormenta' }, camara: { zoom: 12.4, pitch: 58, bearing: -28 } },
  patron: { escena: { dia: MARTES, hora: 22, clima: 'lluvia' }, camara: { zoom: 11.1, pitch: 20, bearing: 8 } },
  respuesta: { escena: { dia: MARTES, hora: 22, clima: 'lluvia' }, camara: { zoom: 10.95, pitch: 8, bearing: 0 } },
  acierta: { escena: null, camara: { zoom: 11.2, pitch: 0, bearing: 0 } },
  datos: { escena: null, camara: { zoom: 10.8, pitch: 35, bearing: -20 } },
  pipeline: { escena: null, camara: { zoom: 10.7, pitch: 45, bearing: 15 } },
  modelo: { escena: null, camara: { zoom: 10.9, pitch: 30, bearing: 35 } },
  limites: { escena: null, camara: { zoom: 10.7, pitch: 0, bearing: 0 } },
  ahora: { escena: null, camara: { zoom: 11.4, pitch: 0, bearing: 0 } },
}
const ULTIMO = GUION.length - 1
const CON_TRANSITO: IdActo[] = ['sol', 'lluvia', 'noche', 'tormenta', 'ahora']

const pct = (rr: number) => Math.round((rr - 1) * 100)
const conSigno = (n: number) => `${n > 0 ? '+' : n < 0 ? '−' : ''}${fmtNum(Math.abs(n))} %`

export function Historia({ riesgo, siniestros: s, patrones, modelo, onExplorar }: Props) {
  const [acto, setActo] = useState(0)
  const [apuesta, setApuesta] = useState<'mas' | 'menos' | null>(null)
  const [revelados, setRevelados] = useState(0)
  const [horaVis, setHoraVis] = useState(21)
  const [libre, setLibre] = useState(false)
  const [seleccion, setSeleccion] = useState<number | null>(null)
  const [libreEsc, setLibreEsc] = useState<{ dia: number; hora: number; clima: number } | null>(null)
  const [qr, setQr] = useState('')
  const raiz = useRef<HTMLDivElement>(null)
  const mapRef = useRef<MapRef>(null)
  const [mapaListo, setMapaListo] = useState(false)
  const silencioElegido = useRef(false)
  // Antes de la portada: pantalla de inicio (habilita el sonido con un clic) y la intro del choque.
  const [fase, setFase] = useState<'inicio' | 'intro' | 'historia'>('inicio')
  const [sonidoIntro, setSonidoIntro] = useState(false)
  // Hero de la portada: 'foco' (a nivel calle sobre el siniestro), 'despegue' (la cámara se aleja) y 'listo'.
  const [hero, setHero] = useState<Hero>('foco')
  const [horaPulso, setHoraPulso] = useState(0)
  // El mapa queda tapado por la antesala y la intro: el clima en pantalla y las animaciones del mapa solo
  // corren cuando se ve (desde que la intro empieza a desvanecerse), para no competir con la escena 3D.
  const [revelando, setRevelando] = useState(false)
  const mapaVisible = fase === 'historia' || revelando
  useEffect(() => {
    if (fase !== 'historia') setRevelando(false)
  }, [fase])
  const { activo: sonido, encender, apagar } = useSonido()
  const ahora = useAhoraBA()
  const pronostico = usePronostico()
  const G = GUION[acto]
  const id = G.id
  const conf = ESCENA[id]

  // ---------- cifras: todas salen de los JSON del pipeline ----------
  const cifras = useMemo(() => {
    const p = Object.fromEntries(patrones.patrones.map((x) => [x.id, x]))
    const datos = (pid: string) => ((p[pid] as unknown as { datos?: Record<string, { rr: number; obs: number; esp: number; lo: number; hi: number }> })?.datos ?? {})
    const victimas = p.victimas_lluvia?.grafico?.tipo === 'victimas' ? p.victimas_lluvia.grafico.filas : []
    const modo = (m: string) => victimas.find((f) => f.modo === m)
    const grupos = Object.fromEntries(modelo.shap.grupos.map((g) => [g.grupo, Math.round(g.share * 100)]))
    const tn = datos('tormenta_noche').tormenta_noche_habil
    const ld = datos('lluvia_dia_noche').lluvia_dia
    const metrica = (nombre: string) => modelo.metricas.find((m) => m.modelo === nombre)
    return {
      lluviaDia: pct(ld?.rr ?? 0.84),
      lluviaDiaObs: ld?.obs ?? 4323,
      lluviaDiaEsp: ld?.esp ?? 5120,
      lluviaDiaRR: ld?.rr ?? 0.844,
      lluviaDiaLo: ld?.lo ?? 0.82,
      lluviaDiaHi: ld?.hi ?? 0.87,
      lluviaNoche: pct(datos('lluvia_dia_noche').lluvia_noche?.rr ?? 1.09),
      tormentaNoche: pct(tn?.rr ?? 1.56),
      tormentaObs: tn?.obs ?? 35,
      tormentaEsp: tn?.esp ?? 22.5,
      ciclistasDia: pct(modo('Ciclistas')?.dia.rr ?? 0.69),
      motosDia: pct(modo('Motociclistas')?.dia.rr ?? 0.8),
      peatonesNoche: pct(modo('Peatones')?.noche.rr ?? 1.32),
      autosNoche: pct(modo('Ocupantes de autos')?.noche.rr ?? 1.28),
      zona: grupos.Zona ?? 57,
      momento: grupos.Momento ?? 39,
      clima: grupos.Clima ?? 4,
      captura: Math.round((metrica('LightGBM')?.captura_10 ?? 0.4015) * 100),
      capturaBase: Math.round((metrica('Historial de la celda')?.captura_10 ?? 0.3323) * 100),
      test: modelo.periodo.test,
      train: modelo.periodo.train,
    }
  }, [patrones, modelo])

  // ---------- siniestros ordenados por año (para que "caigan" de 2019 a 2025) ----------
  const n = s.lon.length
  const { rango, porAnio } = useMemo(() => {
    const idx = Array.from({ length: n }, (_, i) => i)
    const azar = new Float32Array(n).map(() => Math.random())
    idx.sort((a, b) => s.anio[a] - s.anio[b] || azar[a] - azar[b])
    const rango = new Float32Array(n)
    idx.forEach((i, k) => (rango[i] = k))
    const anios = [...new Set(s.anio)].sort()
    let acum = 0
    const porAnio = anios.map((anio) => {
      acum += s.anio.reduce((c, x) => c + (x === anio ? 1 : 0), 0)
      return { anio, hasta: acum }
    })
    return { rango, porAnio }
  }, [s, n])
  // Primer índice (en el orden de caída) de 2024: los de la validación.
  const desdeTest = porAnio.find((p) => p.anio === 2023)?.hasta ?? 0

  // ---------- "¿el modelo acierta?": riesgo medio por celda y a qué celda cae cada siniestro ----------
  const acierto = useMemo(() => {
    const nc = riesgo.n_celdas
    const media = new Float32Array(nc)
    const escenarios = riesgo.lambda.length / nc
    for (let e = 0; e < escenarios; e++) {
      const off = e * nc
      for (let i = 0; i < nc; i++) media[i] += riesgo.lambda[off + i]
    }
    for (let i = 0; i < nc; i++) media[i] /= escenarios
    const umbral = cuantil(media, 0.9)
    const top = media.map((v) => (v >= umbral ? 1 : 0))
    // Celda más cercana a cada siniestro, con una grilla de búsqueda para no comparar contra las 2.860.
    const paso = 0.006
    const grilla = new Map<string, number[]>()
    riesgo.celdas.forEach((c, i) => {
      const k = `${Math.floor(c.c[0] / paso)},${Math.floor(c.c[1] / paso)}`
      grilla.set(k, [...(grilla.get(k) ?? []), i])
    })
    const enTop = new Uint8Array(n)
    const celdaDe = new Int32Array(n)
    for (let j = 0; j < n; j++) {
      const gx = Math.floor(s.lon[j] / paso)
      const gy = Math.floor(s.lat[j] / paso)
      let mejor = -1
      let dmin = Infinity
      for (let dx = -1; dx <= 1; dx++)
        for (let dy = -1; dy <= 1; dy++)
          for (const i of grilla.get(`${gx + dx},${gy + dy}`) ?? []) {
            const d = (riesgo.celdas[i].c[0] - s.lon[j]) ** 2 + (riesgo.celdas[i].c[1] - s.lat[j]) ** 2
            if (d < dmin) {
              dmin = d
              mejor = i
            }
          }
      enTop[j] = mejor >= 0 ? top[mejor] : 0
      celdaDe[j] = mejor
    }
    return { media, top, enTop, celdaDe }
  }, [riesgo, s, n])

  // ---------- el siniestro de la intro: uno real, un martes a las 22 con tormenta, en una zona de riesgo alto ----------
  const foco = useMemo(() => {
    const C = s.dicts.condicion
    const reglas: ((j: number) => boolean)[] = [
      (j) => C[s.condicion[j]] === 'tormenta' && s.hora[j] === 22 && s.dia_semana[j] === MARTES,
      (j) => (C[s.condicion[j]] === 'tormenta' || C[s.condicion[j]] === 'lluvia') && s.hora[j] >= 21 && s.dia_semana[j] < 5,
      () => true,
    ]
    let elegido = 0
    for (const regla of reglas) {
      let mejor = -1
      for (let j = 0; j < n; j++) {
        const c = acierto.celdaDe[j]
        if (c < 0 || !riesgo.celdas[c].via || !regla(j)) continue
        if (mejor < 0 || acierto.media[c] > acierto.media[acierto.celdaDe[mejor]]) mejor = j
      }
      if (mejor >= 0) {
        elegido = mejor
        break
      }
    }
    const j = elegido
    const celda = riesgo.celdas[Math.max(0, acierto.celdaDe[j])]
    const clima = C[s.condicion[j]]
    const dia = DIAS[s.dia_semana[j]].toLowerCase()
    return {
      lon: s.lon[j],
      lat: s.lat[j],
      lugar: nombreCelda(celda),
      comuna: celda.comuna,
      clima,
      momento: `${DIAS[s.dia_semana[j]]} · ${s.hora[j]} h · ${NOMBRE_CLIMA[clima] ?? clima} · ${s.anio[j]}`,
      frase: `un ${dia} de ${s.anio[j]}, a las ${s.hora[j]}, ${CON_CLIMA[clima] ?? ''}`.trim(),
    }
  }, [s, n, riesgo, acierto])

  // Orden de encendido del hero: del siniestro de la intro hacia afuera.
  const rangoDist = useMemo(() => {
    const kx = Math.cos((foco.lat * Math.PI) / 180)
    const d = new Float32Array(n)
    for (let j = 0; j < n; j++) d[j] = ((s.lon[j] - foco.lon) * kx) ** 2 + (s.lat[j] - foco.lat) ** 2
    const idx = Array.from({ length: n }, (_, i) => i).sort((a, b) => d[a] - d[b])
    const r = new Float32Array(n)
    idx.forEach((i, k) => (r[i] = k))
    return r
  }, [s, n, foco])

  // ---------- "El pulso": cuántos siniestros hay en cada hora del día ----------
  const pulso = useMemo(() => {
    const porHora = Array.from({ length: 24 }, () => 0)
    const valor = new Float32Array(n)
    for (let j = 0; j < n; j++) {
      porHora[s.hora[j]]++
      // Cada siniestro se enciende en un minuto al azar de su hora, para que el latido sea continuo.
      valor[j] = s.hora[j] + Math.random()
    }
    const max = Math.max(...porHora)
    const min = Math.min(...porHora)
    return { porHora, valor, max, min, hMax: porHora.indexOf(max), hMin: porHora.indexOf(min) }
  }, [s, n])

  // ---------- votación en vivo ----------
  const votacion = useVotacion(id === 'pregunta' || id === 'lluvia' || id === 'respuesta')
  useEffect(() => {
    if (id !== 'pregunta') return
    QRCode.toString(votacion.url, { type: 'svg', margin: 1, errorCorrectionLevel: 'M', color: { dark: '#0b0d0f', light: '#ebe9e4' } })
      .then(setQr)
      .catch(() => setQr(''))
  }, [id, votacion.url])
  const pctMas = votacion.total ? Math.round((votacion.mas / votacion.total) * 100) : 0

  // ---------- escenario del mapa ----------
  const climaVivo = pronostico.estado === 'ok' ? pronostico.horas.find((h) => h.clave === ahora.claveHora) : undefined
  const condicionVivo = climaVivo?.condicion ?? 'despejado'
  const escena = useMemo(() => {
    if (id === 'ahora' && libre && libreEsc) return { dia: libreEsc.dia, hora: libreEsc.hora, clima: riesgo.climas[libreEsc.clima] }
    if (id === 'ahora') return { dia: ahora.dia, hora: ahora.hora, clima: condicionVivo }
    return conf.escena
  }, [id, libre, libreEsc, ahora.dia, ahora.hora, condicionVivo, conf, riesgo])
  const climaEscena = escena?.clima ?? 'despejado'
  const iClima = Math.max(0, riesgo.climas.indexOf(climaEscena))
  const horaEscena = id === 'noche' ? Math.round(horaVis) : (escena?.hora ?? 21)
  const valores = useMemo(() => (escena ? escenario(riesgo, iClima, escena.dia, horaEscena) : null), [riesgo, iClima, escena, horaEscena])
  const dominio = useMemo<Dominio>(() => ({ lo: riesgo.cuantiles['25'], hi: riesgo.cuantiles['99.9'] }), [riesgo])
  const total = escena ? totalCiudad(riesgo, iClima, escena.dia, horaEscena) : 0
  const top = useMemo(() => {
    if (!valores) return []
    return Array.from(valores.keys()).sort((a, b) => valores[b] - valores[a]).slice(0, 3)
  }, [valores])
  // Perfil horario de un día despejado: base del tránsito y del sonido.
  const diaPerfil = escena?.dia ?? MARTES
  const perfilDespejado = useMemo(
    () => Array.from({ length: 24 }, (_, h) => totalCiudad(riesgo, riesgo.climas.indexOf('despejado'), diaPerfil, h)),
    [riesgo, diaPerfil],
  )
  const maxPerfil = Math.max(...perfilDespejado, 1e-6)

  // ---------- capas ----------
  const tecnico = GUION[acto].parte === 'tecnica'
  const mostrarPuntos = id === 'portada' || id === 'ciudad' || id === 'pregunta' || id === 'acierta' || tecnico
  const tenue = id === 'pregunta' || id === 'ciudad' || tecnico
  const enPortada = id === 'portada'
  const es3d = id === 'tormenta'
  const filtro = useMemo(() => new DataFilterExtension({ filterSize: 1 }), [])
  const datosPuntos = useMemo(() => ({ length: n }), [n])
  const rangoFiltro: [number, number] =
    id === 'acierta' ? [desdeTest, Math.max(desdeTest, desdeTest + revelados - 1)]
    : id === 'ciudad' ? [0, n]
    : [0, Math.max(0, revelados - 1)]
  // Ventana del latido: se encienden los de la hora que pasa y se apagan en ~1 h.
  const rangoPulso: [number, number] = [horaPulso - 1.3, horaPulso]
  const suavePulso: [number, number] = [horaPulso - 0.55, horaPulso - 0.04]

  const capas = (antesDe: string | undefined) => [
    new PolygonLayer<Celda>({
      // Capa distinta en 3D: la transición de colores no puede mezclar la geometría plana con la extruida.
      id: es3d ? 'riesgo-hex-3d' : 'riesgo-hex',
      data: riesgo.celdas,
      getPolygon: (c) => c.p,
      getFillColor: (_, { index }) => {
        if (id === 'acierta') {
          const x = posicion(acierto.media[index], dominio)
          return acierto.top[index] ? [...colorEn(Math.max(0.78, x)), 150] : [...colorEn(x), 45]
        }
        if (!valores) return [0, 0, 0, 0]
        const x = posicion(valores[index], dominio)
        return [...colorEn(x), es3d ? 235 : Math.round(90 + 130 * Math.min(1, Math.max(0, x)))]
      },
      getElevation: (_, { index }) => (valores ? Math.max(0, posicion(valores[index], dominio)) ** 2 * 1700 : 0),
      extruded: es3d,
      stroked: false,
      pickable: libre,
      material: { ambient: 0.55, diffuse: 0.6, shininess: 24 },
      transitions: { getFillColor: { duration: 1100 }, getElevation: { duration: 1400 } },
      updateTriggers: { getFillColor: [valores, es3d, id === 'acierta'], getElevation: [valores] },
      ...debajoDe(es3d ? undefined : antesDe),
    }),
    new PolygonLayer<Celda>({
      id: 'seleccion',
      data: libre && seleccion !== null ? [riesgo.celdas[seleccion]] : [],
      getPolygon: (c) => c.p,
      filled: false,
      stroked: true,
      getLineColor: [255, 255, 255, 255],
      lineWidthMinPixels: 2.5,
      ...debajoDe(antesDe),
    }),
    new ScatterplotLayer({
      id: 'siniestros',
      data: datosPuntos,
      visible: mostrarPuntos,
      getPosition: (_: unknown, { index }: { index: number }) => [s.lon[index], s.lat[index]],
      getFillColor:
        id === 'acierta'
          ? (_: unknown, { index }: { index: number }) => (acierto.enTop[index] ? COLOR_ACIERTO : COLOR_FUERA)
          : tenue ? COLOR_PUNTO_TENUE : COLOR_PUNTO,
      getRadius: id === 'acierta' ? 38 : 22,
      radiusMinPixels: id === 'acierta' ? 2 : enPortada ? 1.4 : 1.1,
      radiusMaxPixels: 4,
      getFilterValue: (_: unknown, { index }: { index: number }) => (enPortada ? rangoDist[index] : rango[index]),
      filterRange: rangoFiltro,
      extensions: [filtro],
      updateTriggers: { getFillColor: [id === 'acierta', tenue], getFilterValue: [enPortada] },
      ...debajoDe(antesDe),
    }),
    new ScatterplotLayer({
      id: 'pulso',
      data: datosPuntos,
      visible: id === 'ciudad',
      getPosition: (_: unknown, { index }: { index: number }) => [s.lon[index], s.lat[index]],
      getFillColor: COLOR_PULSO,
      getRadius: 34,
      radiusMinPixels: 1.7,
      radiusMaxPixels: 5,
      getFilterValue: (_: unknown, { index }: { index: number }) => pulso.valor[index],
      filterRange: rangoPulso,
      filterSoftRange: suavePulso,
      extensions: [filtro],
      ...debajoDe(antesDe),
    }),
    // El siniestro de la intro, el mismo punto que quedó en el "vidrio".
    new ScatterplotLayer({
      id: 'foco',
      data: enPortada && hero !== 'listo' ? [foco] : [],
      getPosition: (f: typeof foco) => [f.lon, f.lat],
      getFillColor: COLOR_FOCO,
      getLineColor: [255, 236, 214, 230],
      stroked: true,
      lineWidthUnits: 'pixels',
      getLineWidth: 1.5,
      radiusUnits: 'pixels',
      getRadius: 7,
    }),
  ]

  // ---------- tránsito animado ----------
  const conTransito = CON_TRANSITO.includes(id)
  const fClima = factorClima(climaEscena, horaEscena)
  const densidad = conTransito ? Math.min(1, (perfilDespejado[horaEscena] / maxPerfil) * fClima.cantidad) : 0
  const pasoDensidad = Math.round(densidad * 20) / 20 // recorta el pool solo en pasos del 5 %
  const datosTransito = useMemo(() => {
    const todos = viajes()
    return todos.slice(0, Math.round(todos.length * pasoDensidad))
  }, [pasoDensidad])
  const conAnillo = enPortada && hero !== 'listo' && mapaVisible
  const animacion = useMemo(() => {
    if (!conTransito && !conAnillo) return undefined
    return {
      velocidad: conTransito ? fClima.velocidad : 1,
      capas: (t: number) => [
        ...(conTransito ? [capaTransito(datosTransito, t, es3d ? 0.6 : 1)] : []),
        ...(conAnillo ? anillosFoco(foco, t) : []),
      ],
    }
  }, [conTransito, conAnillo, fClima.velocidad, datosTransito, es3d, foco])

  // ---------- cámara ----------
  useEffect(() => {
    const m = mapRef.current
    if (!m || !mapaListo || libre) return
    const cam = conf.camara
    const mapa = m.getMap()
    if (id === 'portada') {
      if (hero === 'foco') {
        // A nivel calle, con una deriva lenta para que la escena respire mientras corre la intro.
        m.jumpTo({ center: [foco.lon, foco.lat], ...CAMARA_FOCO })
        if (!mapaVisible) return
        mapa.easeTo({ bearing: CAMARA_FOCO.bearing + 9, zoom: CAMARA_FOCO.zoom + 0.25, duration: 40000, easing: (t) => t })
        return
      }
      if (hero === 'despegue') {
        // easeTo (y no flyTo): el zoom baja de forma pareja, sin pasarse de largo y volver.
        m.easeTo({ center: CENTRO, zoom: cam.zoom, pitch: cam.pitch, bearing: cam.bearing, duration: DESPEGUE_MS, easing: (t) => (t < 0.5 ? 4 * t ** 3 : 1 - (-2 * t + 2) ** 3 / 2), essential: true })
        return
      }
      const orbitar = () => mapa.easeTo({ bearing: cam.bearing + 28, duration: 70000, easing: (t) => t })
      const lejos = Math.abs(mapa.getZoom() - cam.zoom) > 0.3
      if (mapa.isMoving() && !lejos) mapa.once('moveend', orbitar)
      else if (lejos) {
        m.flyTo({ center: CENTRO, zoom: cam.zoom, pitch: cam.pitch, bearing: cam.bearing, duration: 2200, essential: true })
        mapa.once('moveend', orbitar)
      } else orbitar()
      return () => {
        mapa.off('moveend', orbitar)
      }
    }
    let centro = CENTRO
    if (id === 'tormenta' && top.length) {
      const c = riesgo.celdas[top[0]].c
      centro = [(c[0] + CENTRO[0] * 2) / 3, (c[1] + CENTRO[1] * 2) / 3]
    }
    m.flyTo({ center: centro, zoom: cam.zoom, pitch: cam.pitch, bearing: cam.bearing, duration: id === 'ciudad' ? 5000 : 2600, essential: true })
    if (id === 'tormenta') {
      const orbitar = () => mapa.easeTo({ bearing: cam.bearing + 40, duration: 40000, easing: (t) => t })
      mapa.once('moveend', orbitar)
      return () => {
        mapa.off('moveend', orbitar)
      }
    }
    // La cámara solo se mueve al cambiar de acto, de fase del hero o al volver del mapa libre.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [acto, mapaListo, libre, hero, mapaVisible])

  // ---------- animaciones por acto ----------
  useEffect(() => {
    if (acto !== 0) setHero('listo') // volver a la portada muestra el estado final, sin repetir el alejamiento
    if (id === 'acierta') {
      const o = { v: 0 }
      setRevelados(0)
      const t = gsap.to(o, { v: n - desdeTest, duration: 6, ease: 'power1.in', delay: 1, onUpdate: () => setRevelados(Math.round(o.v)) })
      return () => {
        t.kill()
      }
    }
    if (id === 'ciudad') {
      // Un día entero cada DIA_PULSO_S segundos, en bucle; el estado se actualiza cada 5 minutos de reloj.
      setRevelados(n)
      const o = { h: 0 }
      setHoraPulso(0)
      const t = gsap.to(o, { h: 24, duration: DIA_PULSO_S, ease: 'none', repeat: -1, onUpdate: () => setHoraPulso(Math.round(o.h * 12) / 12) })
      if (prefiereMenosMovimiento()) {
        t.kill()
        setHoraPulso(pulso.hMax + 0.99)
      }
      return () => {
        t.kill()
      }
    }
    if (id === 'pregunta' || GUION[acto].parte === 'tecnica') setRevelados(n)
    if (id === 'noche') {
      const o = { h: 14 }
      setHoraVis(14)
      const t = gsap.to(o, { h: 22, duration: 3.6, ease: 'power1.inOut', delay: 0.4, onUpdate: () => setHoraVis(o.h) })
      return () => {
        t.kill()
      }
    }
    setHoraVis(id === 'ahora' ? ahora.hora + ahora.minuto / 60 : (conf.escena?.hora ?? 21))
    // Solo al entrar a cada acto.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [acto])

  // ---------- hero: espera a nivel calle, se aleja encendiendo los siniestros y recién ahí aparece la pregunta ----------
  useEffect(() => {
    if (fase !== 'historia' || acto !== 0 || hero !== 'foco' || !mapaListo) return
    if (prefiereMenosMovimiento()) {
      setHero('listo')
      return
    }
    const t = setTimeout(() => setHero('despegue'), 2600)
    return () => clearTimeout(t)
  }, [fase, acto, hero, mapaListo])
  useEffect(() => {
    if (acto !== 0) return
    if (hero === 'listo') {
      setRevelados(n)
      return
    }
    if (hero === 'foco') {
      setRevelados(0)
      return
    }
    const o = { v: 1 }
    setRevelados(1)
    const t = gsap.to(o, { v: n, duration: (DESPEGUE_MS - 900) / 1000, ease: 'power3.in', delay: 0.5, onUpdate: () => setRevelados(Math.round(o.v)), onComplete: () => setHero('listo') })
    return () => {
      t.kill()
    }
  }, [hero, acto, n])

  // ---------- texto: entra palabra por palabra; las cifras cuentan solas; las barras crecen ----------
  useGSAP(
    () => {
      const panel = raiz.current?.querySelector('.h-panel')
      if (!panel) return
      const titulo = panel.querySelector('.h-titulo')
      const tl = gsap.timeline()
      if (titulo) {
        const sp = SplitText.create(titulo, { type: 'words', mask: 'words' })
        tl.from(sp.words, { yPercent: 110, duration: 0.8, ease: 'power3.out', stagger: 0.045 }, 0.1)
      }
      tl.from(panel.querySelectorAll('.h-anim'), { y: 22, autoAlpha: 0, duration: 0.7, ease: 'power2.out', stagger: 0.12 }, 0.35)
      tl.fromTo(panel.querySelectorAll('.h-trazo'), { strokeDashoffset: 1 }, { strokeDashoffset: 0, duration: 2.2, ease: 'power2.inOut', stagger: 0.5 }, 0.8)
      tl.from(panel.querySelectorAll('.h-punto'), { autoAlpha: 0, duration: 0.5, stagger: 0.15 }, 2.4)
      const barras = panel.querySelectorAll<HTMLElement>('[data-ancho]')
      const paso = barras.length > 3 ? 0.09 : 0.5
      barras.forEach((el, k) => {
        tl.fromTo(el, { width: '0%' }, { width: `${el.dataset.ancho}%`, duration: 1.2, ease: 'power2.out' }, 0.9 + k * paso)
      })
      panel.querySelectorAll<HTMLElement>('[data-cuenta]').forEach((el) => {
        const fin = Number(el.dataset.cuenta)
        const dec = Number(el.dataset.dec ?? 0)
        const signo = el.dataset.signo === '1'
        const suf = el.dataset.suf ?? ''
        const o = { v: 0 }
        const pintar = () => {
          el.textContent = signo ? conSigno(Math.round(o.v)) : `${fmtNum(o.v, dec)}${suf}`
        }
        pintar()
        tl.to(o, { v: fin, duration: 1.6, ease: 'power2.out', onUpdate: pintar }, Number(el.dataset.retraso ?? 0.5))
      })
      // Con movimiento reducido el texto aparece directo, sin animación.
      if (prefiereMenosMovimiento()) tl.progress(1)
    },
    { scope: raiz, dependencies: [acto, libre, hero === 'listo'], revertOnUpdate: true },
  )

  // ---------- notas del orador (ventana aparte, tecla N) ----------
  const notas = useRef<Window | null>(null)
  const inicio = useRef<number | undefined>(undefined)
  const entrada = useRef(Date.now())
  const enviarEstado = useCallback(() => {
    notas.current?.postMessage({ canal: CANAL, tipo: 'estado', acto, inicio: inicio.current, entrada: entrada.current } satisfies MensajeNotas, '*')
  }, [acto])
  useEffect(() => {
    entrada.current = Date.now()
    if (acto > 0 && !inicio.current) inicio.current = Date.now()
    enviarEstado()
  }, [acto, enviarEstado])
  const abrirNotas = () => {
    notas.current = window.open(`${location.href.split('#')[0]}#notas`, 'rvcaba-notas', 'width=980,height=720')
  }

  // ---------- navegación: rueda, deslizar, teclado y clicker ----------
  const ir = useCallback(
    (destino: number) => {
      const d = Math.min(ULTIMO, Math.max(0, destino))
      // Durante el alejamiento del hero, el primer "siguiente" lo completa en vez de cambiar de acto.
      if (acto === 0 && d === 1 && hero !== 'listo') {
        setHero('listo')
        return
      }
      setLibre(false)
      setActo((a) => {
        // Salir de la portada con una tecla o la rueda cuenta como gesto: se puede encender el sonido.
        if (a === 0 && d > 0 && !sonido && !silencioElegido.current) void encender()
        return d
      })
    },
    [sonido, encender, acto, hero],
  )
  useEffect(() => {
    const alMensaje = (e: MessageEvent<MensajeNotas>) => {
      if (e.data?.canal !== CANAL) return
      if (e.data.tipo === 'hola') {
        notas.current = e.source as Window
        enviarEstado()
      } else if (e.data.tipo === 'ir' && typeof e.data.acto === 'number') ir(e.data.acto)
    }
    window.addEventListener('message', alMensaje)
    return () => window.removeEventListener('message', alMensaje)
  }, [enviarEstado, ir])

  const entrarLibre = useCallback(() => {
    setLibre(true)
    setLibreEsc((e) => e ?? { dia: ahora.dia, hora: ahora.hora, clima: Math.max(0, riesgo.climas.indexOf(condicionVivo)) })
  }, [ahora.dia, ahora.hora, condicionVivo, riesgo])

  const bloqueo = useRef(0)
  const acumulado = useRef(0)
  useEffect(() => {
    const el = raiz.current
    if (!el) return
    const alRodar = (e: WheelEvent) => {
      if (libre || fase !== 'historia') return // en el mapa libre la rueda hace zoom
      e.preventDefault()
      const t = performance.now()
      if (t < bloqueo.current) return
      acumulado.current += e.deltaY
      if (Math.abs(acumulado.current) > 50) {
        ir(acto + Math.sign(acumulado.current))
        acumulado.current = 0
        bloqueo.current = t + 1100
      }
    }
    let y0 = 0
    const alTocar = (e: TouchEvent) => (y0 = e.touches[0].clientY)
    const alSoltar = (e: TouchEvent) => {
      if (libre) return
      const dy = y0 - e.changedTouches[0].clientY
      if (Math.abs(dy) > 50) ir(acto + Math.sign(dy))
    }
    const alTeclear = (e: KeyboardEvent) => {
      const objetivo = e.target as HTMLElement
      if (fase !== 'historia') return // la intro maneja sus propias teclas
      if (objetivo.closest('input, select, textarea') || e.metaKey || e.ctrlKey || e.altKey) return
      if (e.key.toLowerCase() === 'i' && !libre) {
        setActo(0)
        setHero('foco')
        setFase('intro')
        return
      }
      const k = e.key
      if (k.toLowerCase() === 'm') {
        if (sonido) apagar()
        else void encender()
        return
      }
      if (k.toLowerCase() === 'n') {
        abrirNotas()
        return
      }
      // Último acto: la barra espaciadora alterna entre la historia y el mapa libre.
      if (k === ' ' && id === 'ahora') {
        e.preventDefault()
        if (libre) setLibre(false)
        else entrarLibre()
        return
      }
      if (libre) {
        if (k === 'Escape') setLibre(false)
        return
      }
      if (['ArrowDown', 'ArrowRight', 'PageDown', ' ', 'Enter'].includes(k)) {
        if (k === 'Enter' && objetivo.closest('button')) return
        e.preventDefault()
        ir(acto + 1)
      } else if (['ArrowUp', 'ArrowLeft', 'PageUp', 'Backspace'].includes(k)) {
        e.preventDefault()
        ir(acto - 1)
      } else if (k === 'Home') ir(1)
      else if (k === 'End') ir(ULTIMO)
      else if (k === 'Escape') onExplorar()
    }
    el.addEventListener('wheel', alRodar, { passive: false })
    el.addEventListener('touchstart', alTocar, { passive: true })
    el.addEventListener('touchend', alSoltar, { passive: true })
    window.addEventListener('keydown', alTeclear)
    return () => {
      el.removeEventListener('wheel', alRodar)
      el.removeEventListener('touchstart', alTocar)
      el.removeEventListener('touchend', alSoltar)
      window.removeEventListener('keydown', alTeclear)
    }
  })

  // ---------- mapa libre: búsqueda de calles y ficha de la celda ----------
  const vias = useMemo(() => [...new Set(riesgo.celdas.flatMap((c) => [c.via, c.via2]).filter((v): v is string => !!v))].sort((a, b) => a.localeCompare(b, 'es')), [riesgo])
  const [busqueda, setBusqueda] = useState('')
  const buscar = (texto: string) => {
    setBusqueda(texto)
    const via = vias.find((v) => v.toLowerCase() === texto.trim().toLowerCase())
    if (!via) return
    const celdas = riesgo.celdas.map((c, i) => ({ c, i })).filter(({ c }) => c.via === via || c.via2 === via)
    if (!celdas.length) return
    const val = valores ?? acierto.media
    const mejor = celdas.reduce((a, b) => (val[b.i] > val[a.i] ? b : a))
    setSeleccion(mejor.i)
    const lons = celdas.map(({ c }) => c.c[0])
    const lats = celdas.map(({ c }) => c.c[1])
    mapRef.current?.fitBounds([[Math.min(...lons), Math.min(...lats)], [Math.max(...lons), Math.max(...lats)]], { padding: 120, maxZoom: 15, duration: 1400 })
  }
  const alClic = (info: PickingInfo) => {
    if (!libre) return
    setSeleccion(info.layer?.id.startsWith('riesgo-hex') && info.index >= 0 ? info.index : null)
  }

  // ---------- ambiente: clima en pantalla, luz y sonido ----------
  const intensidadVivo = id === 'ahora' && !libre && climaVivo ? intensidadDeLluvia(climaVivo.precipitacion) : undefined
  const horaAmbiente = id === 'ahora' && libre && libreEsc ? libreEsc.hora : id === 'ciudad' ? horaPulso : enPortada ? 22 : horaVis
  // En la portada llueve: tormenta sobre el siniestro de la intro y lluvia mansa cuando aparece la pregunta.
  const climaAmbiente = enPortada ? (hero === 'foco' && foco.clima === 'tormenta' ? 'tormenta' : 'lluvia') : climaEscena
  const horaLuz = Math.round(horaAmbiente * 4) / 4 // el mapa base se recolorea cada 15 minutos de reloj
  const luz = useMemo(() => luzDelDia(horaLuz), [horaLuz])
  const transitoSonido =
    id === 'portada' ? (hero === 'listo' ? 0.12 : 0.05)
    : id === 'ciudad' ? 0.1 + 0.85 * (pulso.porHora[Math.floor(horaPulso) % 24] / pulso.max)
    : id === 'pregunta' || id === 'acierta' || tecnico ? 0.25
    : Math.min(1, (perfilDespejado[horaEscena] / maxPerfil) * fClima.cantidad)
  useAmbienteSonoro({
    clima: climaAmbiente,
    hora: horaAmbiente,
    transito: transitoSonido,
    lluvia: intensidadVivo,
    sirena: id === 'tormenta' || (enPortada && hero !== 'listo'),
    silencio: fase !== 'historia',
  })

  // ---------- texto de cada acto ----------
  const revelacion =
    votacion.total > 0
      ? `El ${fmtNum(pctMas)} % de ustedes apostó a "más choques"${pctMas >= 50 ? '. De día, los datos dicen lo contrario.' : '. Acertaron… por ahora.'}`
      : apuesta === 'mas' ? 'Apostaron a "más". De día, los datos dicen lo contrario.'
      : apuesta === 'menos' ? 'Apostaron a "menos". Acertaron… por ahora.'
      : null

  const panel = (() => {
    switch (id) {
      case 'portada':
        return null
      case 'ciudad': {
        const h = Math.floor(horaPulso) % 24
        const veces = Math.round(pulso.max / Math.max(1, pulso.min))
        return (
          <>
            <p className="h-kicker h-anim">Acto {acto} · El pulso</p>
            <h2 className="h-titulo">La ciudad choca al ritmo de su día.</h2>
            <p className="h-cifra h-anim">
              <span className="h-num h-reloj">{hhmm(h)}</span>
              <span className="h-num-nota">
                <b className="h-pulso-cuenta">{fmtNum(pulso.porHora[h])}</b> siniestros a esta hora, sumando 2019–2025
              </span>
            </p>
            <svg className="h-pulso h-anim" viewBox="0 0 480 96" role="img" aria-label="Siniestros por hora del día">
              {pulso.porHora.map((v, k) => {
                const alto = (v / pulso.max) * 78
                return (
                  <rect key={k} x={k * 20 + 2} y={80 - alto} width={16} height={alto} rx={2} className={k === h ? 'on' : k < h ? 'pasada' : ''} />
                )
              })}
              {[0, 6, 12, 18].map((k) => (
                <text key={k} x={k * 20 + 2} y={94} className="h-pulso-eje">{String(k).padStart(2, '0')} h</text>
              ))}
            </svg>
            <p className="h-cuerpo h-anim">
              A las {pulso.hMin} de la mañana, <b>{fmtNum(pulso.min)}</b>. A las {pulso.hMax}, <b>{fmtNum(pulso.max)}</b>: {veces} veces más. Las avenidas dibujan el mapa; la hora marca el ritmo.
            </p>
          </>
        )
      }
      case 'pregunta':
        return (
          <>
            <p className="h-kicker h-anim">Acto {acto} · La pregunta</p>
            <h2 className="h-titulo">Cuando llueve, ¿hay más choques o menos?</h2>
            <p className="h-cuerpo h-anim">Cruzamos cada siniestro con el clima de esa hora y ese lugar. Antes de mirar: escaneen el código y voten.</p>
            <div className="h-votos h-anim" aria-live="polite">
              {(['mas', 'menos'] as const).map((v) => {
                const cuenta = v === 'mas' ? votacion.mas : votacion.menos
                const p = votacion.total ? (cuenta / votacion.total) * 100 : 0
                return (
                  <button key={v} className={`h-voto-fila${apuesta === v ? ' on' : ''}`} onClick={() => setApuesta(v)} title="Voto del presentador (si nadie vota desde el celular)">
                    <span className="h-voto-nombre">{v === 'mas' ? 'Más choques' : 'Menos choques'}</span>
                    <span className="h-voto-barra"><i style={{ width: `${p}%` }} className={v} /></span>
                    <span className="h-voto-num">{votacion.total ? `${fmtNum(p)} %` : '—'}</span>
                  </button>
                )
              })}
              <p className="h-voto-total">
                {votacion.total ? `${fmtNum(votacion.total)} ${votacion.total === 1 ? 'voto' : 'votos'}` : 'Esperando votos…'}
                {votacion.conexion === 'error' && ' · sin conexión con el servidor de votos'}
              </p>
            </div>
          </>
        )
      case 'sol':
        return (
          <>
            <p className="h-kicker h-anim">Acto {acto} · Martes, 14:00 · Despejado</p>
            <h2 className="h-titulo">Un martes cualquiera, a pleno sol.</h2>
            <p className="h-cifra h-anim">
              <span className="h-num" data-cuenta={total} data-dec="2">{fmtNum(total, 2)}</span>
              <span className="h-num-nota">siniestros esperados en esa hora, en toda la ciudad</span>
            </p>
            <p className="h-cuerpo h-anim">El mapa pinta el riesgo que predice el modelo en cada zona de ~350 m. Las luces son el tránsito: esta es la línea de base.</p>
          </>
        )
      case 'lluvia':
        return (
          <>
            <p className="h-kicker h-anim">Acto {acto} · Martes, 14:00 · Lluvia</p>
            <h2 className="h-titulo">Empieza a llover… y los siniestros bajan.</h2>
            <p className="h-cifra h-anim">
              <span className="h-num down" data-cuenta={cifras.lluviaDia} data-signo="1">{conSigno(cifras.lluviaDia)}</span>
              <span className="h-num-nota">de día con lluvia, frente a horas despejadas comparables</span>
            </p>
            <p className="h-cuerpo h-anim">
              No son calles más seguras: sale menos gente. Ciclistas <b>{conSigno(cifras.ciclistasDia)}</b>, motociclistas <b>{conSigno(cifras.motosDia)}</b>.
            </p>
            {revelacion && <p className="h-nota h-anim">{revelacion}</p>}
          </>
        )
      case 'noche':
        return (
          <>
            <p className="h-kicker h-anim">Acto {acto} · Martes, {hhmm(Math.round(horaVis))} · Lluvia</p>
            <h2 className="h-titulo">Pero se hace de noche, y la lluvia sigue.</h2>
            <p className="h-cifra h-anim">
              <span className="h-num up" data-cuenta={cifras.lluviaNoche} data-signo="1">{conSigno(cifras.lluviaNoche)}</span>
              <span className="h-num-nota">de noche con lluvia: el efecto cambia de signo</span>
            </p>
            <p className="h-cuerpo h-anim">
              Queda el tránsito imprescindible, con poca visibilidad y asfalto mojado. Peatones <b>{conSigno(cifras.peatonesNoche)}</b>, ocupantes de autos <b>{conSigno(cifras.autosNoche)}</b>.
            </p>
          </>
        )
      case 'tormenta':
        return (
          <>
            <p className="h-kicker h-anim">Acto {acto} · Martes, 22:00 · Tormenta</p>
            <h2 className="h-titulo">El peor momento de la semana.</h2>
            <p className="h-cifra h-anim">
              <span className="h-num up" data-cuenta={cifras.tormentaNoche} data-signo="1">{conSigno(cifras.tormentaNoche)}</span>
              <span className="h-num-nota">
                siniestros en noches hábiles de tormenta ({fmtNum(cifras.tormentaObs)} observados contra {fmtNum(cifras.tormentaEsp, 1)} esperados)
              </span>
            </p>
            <ol className="h-top h-anim">
              {top.map((i) => (
                <li key={i}>{nombreCelda(riesgo.celdas[i])} <small>Comuna {riesgo.celdas[i].comuna}</small></li>
              ))}
            </ol>
          </>
        )
      case 'patron':
        return (
          <>
            <p className="h-kicker h-anim">Acto {acto} · El patrón</p>
            <h2 className="h-titulo">No fue casualidad: el efecto cambia con la hora.</h2>
            <div className="h-grafico h-anim">
              <CurvaHora patrones={patrones} />
              <div className="h-grafico-ley">
                <span><i className="lluvia" />Lluvia (modelo)</span>
                <span><i className="tormenta" />Tormenta (modelo)</span>
                <span><i className="obs" />Lluvia observada, con IC 95 %</span>
              </div>
            </div>
            <p className="h-cuerpo h-anim">De día, la lluvia saca gente de la calle. De noche, el riesgo sube. El modelo aprendió esa inversión solo, y los datos la confirman.</p>
          </>
        )
      case 'respuesta': {
        const votos =
          votacion.total > 0
            ? `Ustedes votaron ${fmtNum(pctMas)} % «más choques» y ${fmtNum(100 - pctMas)} % «menos». Los dos bandos tenían razón: depende de la hora.`
            : apuesta
              ? `La apuesta fue «${apuesta === 'mas' ? 'más' : 'menos'} choques». Las dos respuestas tenían razón: depende de la hora.`
              : '«Más choques» y «menos choques» tenían razón a la vez: depende de la hora.'
        return (
          <>
            <p className="h-kicker h-anim">Acto {acto} · La respuesta</p>
            <h2 className="h-titulo">¿Nos hace más cuidadosos? De día, sí. De noche, no.</h2>
            <div className="h-veredicto h-anim">
              <div className="h-veredicto-lado dia">
                <span className="h-veredicto-cuando">
                  <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden>
                    <circle cx="12" cy="12" r="4.2" fill="currentColor" />
                    {Array.from({ length: 8 }, (_, k) => {
                      const a = (k / 8) * Math.PI * 2
                      return <line key={k} x1={12 + Math.cos(a) * 7} y1={12 + Math.sin(a) * 7} x2={12 + Math.cos(a) * 9.6} y2={12 + Math.sin(a) * 9.6} stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                    })}
                  </svg>
                  De día, con lluvia
                </span>
                <b className="h-num down" data-cuenta={cifras.lluviaDia} data-signo="1" data-retraso="0.9">{conSigno(cifras.lluviaDia)}</b>
                <span className="h-veredicto-nota">Sale menos gente: caen ciclistas y motos.</span>
              </div>
              <div className="h-veredicto-lado noche">
                <span className="h-veredicto-cuando">
                  <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden>
                    <path d="M15.5 3.5a8.5 8.5 0 1 0 5 15.2A9 9 0 0 1 15.5 3.5Z" fill="currentColor" />
                  </svg>
                  De noche, con lluvia
                </span>
                <b className="h-num up" data-cuenta={cifras.lluviaNoche} data-signo="1" data-retraso="1.3">{conSigno(cifras.lluviaNoche)}</b>
                <span className="h-veredicto-nota">Con tormenta a las 22: <b>{conSigno(cifras.tormentaNoche)}</b>.</span>
              </div>
            </div>
            <p className="h-cuerpo h-anim">La lluvia no nos vuelve más cuidadosos: nos deja en casa. Los que salen igual, de noche, quedan más expuestos.</p>
            <p className="h-nota h-anim">{votos}</p>
          </>
        )
      }
      case 'datos':
        return (
          <>
            <p className="h-kicker h-anim">Detrás de los datos · Las fuentes</p>
            <h2 className="h-titulo">Tres datasets abiertos, cruzados hora por hora.</h2>
            <Fuentes total={n} filas={modelo.datos.filas} />
          </>
        )
      case 'pipeline':
        return (
          <>
            <p className="h-kicker h-anim">Detrás de los datos · El pipeline</p>
            <h2 className="h-titulo">De un Excel a 840 mapas de riesgo.</h2>
            <Pipeline celdaHoras={modelo.datos.celda_horas} />
            <p className="h-letra h-anim">Python (pandas, H3, scikit-learn, LightGBM, SHAP) · web en React, deck.gl y MapLibre · un script por paso, todo reproducible.</p>
          </>
        )
      case 'modelo':
        return (
          <>
            <p className="h-kicker h-anim">Detrás de los datos · El modelo</p>
            <h2 className="h-titulo">Tres modelos, una validación honesta.</h2>
            <div className="h-dos">
              <div>
                <p className="h-sub h-anim">Evaluados con {cifras.test}, años que no vieron</p>
                <ComparacionModelos modelo={modelo} />
                <p className="h-letra h-anim">Regresión de Poisson por celda y hora. Entrenados con {cifras.train}.</p>
              </div>
              <div>
                <p className="h-sub h-anim">Qué mira el modelo (SHAP)</p>
                <Shap modelo={modelo} />
              </div>
            </div>
          </>
        )
      case 'limites':
        return (
          <>
            <p className="h-kicker h-anim">Detrás de los datos · Lo que falta</p>
            <h2 className="h-titulo">Lo que todavía no sabemos.</h2>
            <Limites />
          </>
        )
      case 'acierta':
        return (
          <>
            <p className="h-kicker h-anim">Acto {acto} · ¿El modelo acierta?</p>
            <h2 className="h-titulo">Lo pusimos a prueba con dos años que nunca vio.</h2>
            <p className="h-cuerpo h-anim">
              De cada 10 siniestros de {cifras.test}, <b className="h-resalte">{fmtNum(Math.round(cifras.captura / 10))}</b> cayeron en el 10 % de zonas y horas que el modelo marcó como más riesgosas.
            </p>
            <div className="h-duelo h-anim" aria-label="Captura del modelo frente al mapa clásico">
              <div className="h-duelo-fila modelo">
                <span className="h-duelo-nombre">Nuestro modelo<small>zona + hora + día + clima</small></span>
                <span className="h-duelo-pista"><i data-ancho={cifras.captura * 2} /></span>
                <b data-cuenta={cifras.captura} data-suf=" %" data-retraso="1.1">{cifras.captura} %</b>
              </div>
              <div className="h-duelo-fila base">
                <span className="h-duelo-nombre">Mapa clásico de puntos calientes<small>solo la zona</small></span>
                <span className="h-duelo-pista"><i data-ancho={cifras.capturaBase * 2} /></span>
                <b data-cuenta={cifras.capturaBase} data-suf=" %" data-retraso="1.6">{cifras.capturaBase} %</b>
              </div>
            </div>
            <p className="h-letra h-anim">
              Puntos blancos: siniestros reales de {cifras.test} que cayeron en las zonas marcadas. Entrenado con {cifras.train}, evaluado con {cifras.test}.
            </p>
          </>
        )
      case 'ahora':
        return (
          <>
            <p className="h-kicker h-anim">
              <i className="live-dot" aria-hidden /> Ahora mismo · {DIAS[ahora.dia]} {String(ahora.hora).padStart(2, '0')}:{String(ahora.minuto).padStart(2, '0')} · {NOMBRE_CLIMA[condicionVivo]}
            </p>
            <h2 className="h-titulo">¿Y hoy, en Buenos Aires?</h2>
            <p className="h-cifra h-anim">
              <span className="h-num" data-cuenta={total} data-dec="2">{fmtNum(total, 2)}</span>
              <span className="h-num-nota">
                siniestros esperados en esta hora{climaVivo ? ` · ${fmtNum(climaVivo.temperatura, 0)} °C, ${fmtNum(climaVivo.precipitacion, 1)} mm/h` : ' · sin pronóstico: se asume despejado'}
              </span>
            </p>
            <div className="h-shap h-anim" aria-label="Qué pesa en el modelo">
              <span style={{ flexGrow: cifras.zona }}>Dónde {cifras.zona} %</span>
              <span style={{ flexGrow: cifras.momento }}>Cuándo {cifras.momento} %</span>
              <span style={{ flexGrow: Math.max(cifras.clima, 6) }} className="is-clima">Clima {cifras.clima} %</span>
            </div>
            <p className="h-cuerpo h-anim">El clima pesa poco en el modelo: no crea el riesgo, lo cambia de horario. El dónde y el cuándo mandan.</p>
            <div className="h-acciones h-anim">
              <button className="h-primario" onClick={entrarLibre}>Ver el mapa <kbd>espacio</kbd></button>
              <button className="h-secundario" onClick={onExplorar}>Explorar todo →</button>
              <button className="h-secundario" onClick={() => ir(1)}>Volver a empezar</button>
            </div>
          </>
        )
    }
  })()

  return (
    <div className={`historia acto-${id}${libre ? ' es-libre' : ''}${tecnico ? ' parte-tecnica' : ''}${enPortada && hero !== 'listo' ? ' hero-cine' : ''}`} ref={raiz}>
      <div className="h-mapa">
        <MapaBase
          mapRef={mapRef}
          layers={capas}
          luz={luz}
          edificios={es3d || libre || (enPortada && hero !== 'listo')}
          interactivo={libre}
          animacion={animacion}
          onClick={alClic}
          onCargar={() => setMapaListo(true)}
        />
        {mapaVisible && <EfectoClima
          clima={climaAmbiente}
          hora={horaAmbiente}
          intensidad={intensidadVivo}
          fuerza={libre ? 'sutil' : 'pleno'}
          vidrio={!libre && ((enPortada && hero !== 'listo') || id === 'lluvia' || id === 'noche' || id === 'tormenta' || (id === 'ahora' && !!intensidadVivo))}
          onRelampago={trueno}
        />}
        <div className="h-velo" />
      </div>

      <header className="h-barra">
        <div className="brand-row">
          <svg className="brand-mark" viewBox="0 0 24 24" aria-hidden>
            <path d="M12 2.5 20.2 7.25v9.5L12 21.5 3.8 16.75v-9.5Z" fill="none" stroke="currentColor" strokeWidth="1.6" />
            <path d="M12 7.6 16.2 10v4.8L12 17.2 7.8 14.8V10Z" fill="#d73027" />
          </svg>
          <div>
            <p className="brand-name">Riesgo vial CABA</p>
            <p className="brand-sub">Siniestros con víctimas × clima · 2019–2025</p>
          </div>
        </div>
        <div className="h-barra-der">
          <button className="h-saltar" onClick={abrirNotas} title="Notas del orador en otra ventana (N)">Notas <kbd>N</kbd></button>
          <BotonSonido />
          <button className="h-saltar" onClick={onExplorar}>Explorar el mapa →</button>
        </div>
      </header>

      {id === 'portada' && hero !== 'listo' ? (
        // La ficha entra recién cuando la intro deja ver el mapa.
        mapaVisible && <div className={`h-hero h-hero-${hero}`} aria-live="polite">
          <div className="h-foco-ficha">
            <p className="h-foco-kicker">Siniestro con víctimas</p>
            <p className="h-foco-lugar">Cerca de {foco.lugar} · Comuna {foco.comuna}</p>
            <p className="h-foco-momento">{foco.momento}</p>
          </div>
          <p className="h-hero-cuenta">
            <b>{fmtNum(Math.max(1, revelados))}</b>
            <span>{revelados > 1 ? 'siniestros con víctimas' : 'siniestro con víctimas'} · 2019–2025</span>
          </p>
        </div>
      ) : id === 'portada' ? (
        <section className="h-portada h-panel">
          <p className="h-kicker h-anim">Ciencia de Datos · Trabajo práctico</p>
          <h1 className="h-titulo">¿La lluvia nos hace más cuidadosos?</h1>
          <p className="h-cuerpo h-anim">
            {fmtNum(n)} siniestros viales con víctimas en la Ciudad de Buenos Aires, cruzados hora por hora con el clima.
          </p>
          <div className="h-acciones h-anim">
            <button className="h-primario" onClick={() => ir(1)}>Empezar</button>
            <button className="h-secundario" onClick={() => { setSonidoIntro(sonido); setHero('foco'); setFase('intro') }}>Ver la intro de nuevo <kbd>I</kbd></button>
          </div>
          <p className="h-ayuda h-anim">Avanzá con la rueda, deslizando, con ↓ → o con un clicker · N abre las notas del orador</p>
        </section>
      ) : libre ? (
        <section className="h-libre">
          <div className="h-libre-barra">
            <input
              list="h-vias"
              value={busqueda}
              onChange={(e) => buscar(e.target.value)}
              placeholder="Buscá una avenida o autopista"
              aria-label="Buscar una calle"
            />
            <datalist id="h-vias">
              {vias.map((v) => <option key={v} value={v} />)}
            </datalist>
            <button className="h-secundario" onClick={() => setLibre(false)}>Volver a la historia <kbd>espacio</kbd></button>
          </div>
          {libreEsc && seleccion === null && (
            <p className="h-libre-ayuda">Tocá una zona del mapa para ver su riesgo hora por hora y con cada clima.</p>
          )}
          {libreEsc && seleccion !== null && (
            <FichaCelda
              riesgo={riesgo}
              i={seleccion}
              clima={libreEsc.clima}
              dia={libreEsc.dia}
              hora={libreEsc.hora}
              dominio={dominio}
              onHora={(h) => setLibreEsc({ ...libreEsc, hora: h })}
              onClima={(c) => setLibreEsc({ ...libreEsc, clima: c })}
              onCerrar={() => setSeleccion(null)}
            />
          )}
        </section>
      ) : (
        <section className="h-panel" key={id} aria-live="polite">
          {panel}
        </section>
      )}

      {id === 'pregunta' && !libre && (
        <aside className="h-qr" aria-label="Código QR para votar">
          {qr ? <div className="h-qr-img" dangerouslySetInnerHTML={{ __html: qr }} /> : <div className="h-qr-img vacio" />}
          <p>Escaneá y votá</p>
          <button className="h-qr-reset" onClick={votacion.reiniciar} title="Empezar una votación nueva (borra los votos)">Nueva votación</button>
        </aside>
      )}

      {!libre && (
        <nav className="h-actos" aria-label="Actos">
          {GUION.slice(1).map((a, k) => [
            a.parte === 'tecnica' && GUION[k].parte !== 'tecnica' ? <span key="sep" className="h-actos-sep" title="Detrás de los datos" /> : null,
            <button key={a.id} className={acto === k + 1 ? 'on' : acto > k + 1 ? 'visto' : ''} onClick={() => ir(k + 1)} aria-label={`${k + 1}. ${a.nombre}`} aria-current={acto === k + 1}>
              <span>{a.nombre}</span>
            </button>,
          ])}
        </nav>
      )}

      {!libre && acto > 0 && acto < ULTIMO && (
        <button className="h-seguir" onClick={() => ir(acto + 1)} aria-label="Siguiente acto">
          <span>{GUION[acto + 1].nombre}</span>
          <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden><path d="M3 6l5 5 5-5" fill="none" stroke="currentColor" strokeWidth="1.6" /></svg>
        </button>
      )}
      {!libre && id === 'ahora' && <p className="h-pista">Barra espaciadora: ver el mapa</p>}
      {fase === 'inicio' && (
        <Antesala
          siniestros={s}
          riesgo={riesgo}
          ahora={ahora}
          clima={condicionVivo}
          conPronostico={!!climaVivo}
          onSonido={async () => {
            silencioElegido.current = false
            await encender()
            setSonidoIntro(true)
            setFase('intro')
          }}
          onSilencio={() => {
            silencioElegido.current = true
            apagar()
            setSonidoIntro(false)
            setFase('intro')
          }}
          onSaltar={() => setFase('historia')}
        />
      )}
      {fase === 'intro' && (
        <Intro conSonido={sonidoIntro} total={n} frase={foco.frase} onRevelar={() => setRevelando(true)} onFin={() => setFase('historia')} />
      )}
    </div>
  )
}

/** Ondas que salen del siniestro de la intro, como una alarma silenciosa (t avanza ~6 por segundo). */
function anillosFoco(foco: { lon: number; lat: number }, t: number) {
  return [0, 1, 2].map((k) => {
    const fase = ((t / 6) * 0.55 + k / 3) % 1
    return new ScatterplotLayer({
      id: `foco-onda-${k}`,
      data: [foco],
      getPosition: (f: { lon: number; lat: number }) => [f.lon, f.lat],
      filled: false,
      stroked: true,
      radiusUnits: 'pixels',
      getRadius: 9 + fase * 70,
      lineWidthUnits: 'pixels',
      getLineWidth: 1.6,
      getLineColor: [255, 150, 96, Math.round(210 * (1 - fase) ** 1.6)],
      updateTriggers: { getRadius: fase, getLineColor: fase },
    })
  })
}
