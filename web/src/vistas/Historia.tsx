// Home: la historia en 7 actos. Se avanza con la rueda del mouse, deslizando, con flechas o con un clicker
// (PageDown / PageUp). El mapa de fondo, el clima en pantalla y el sonido siguen a cada acto.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { PolygonLayer, ScatterplotLayer } from '@deck.gl/layers'
import { DataFilterExtension } from '@deck.gl/extensions'
import type { MapRef } from 'react-map-gl/maplibre'
import gsap from 'gsap'
import { useGSAP } from '@gsap/react'
import { SplitText } from 'gsap/SplitText'

import { debajoDe, MapaBase } from '../components/MapaBase'
import { EfectoClima } from '../ambiente/EfectoClima'
import { intensidadDeLluvia, luzDelDia } from '../ambiente/luz'
import { BotonSonido, trueno, useAmbienteSonoro, useSonido } from '../ambiente/Sonido'
import { colorEn, DIAS, escenario, fmtNum, hhmm, NOMBRE_CLIMA, nombreCelda, posicion, totalCiudad, type Celda, type Dominio, type Riesgo } from '../riesgo'
import type { Modelo, Patrones, Siniestros } from '../data'
import { useAhoraBA, usePronostico } from '../vivo'

gsap.registerPlugin(useGSAP, SplitText)

interface Props {
  riesgo: Riesgo
  siniestros: Siniestros
  patrones: Patrones
  modelo: Modelo
  onExplorar: () => void
}

type Id = 'portada' | 'ciudad' | 'pregunta' | 'sol' | 'lluvia' | 'noche' | 'tormenta' | 'ahora'

interface Camara {
  zoom: number
  pitch: number
  bearing: number
  centro?: [number, number]
}

interface Acto {
  id: Id
  nombre: string
  /** Escenario del modelo (día 0 = lunes); null = el acto muestra los puntos históricos. */
  escena: { dia: number; hora: number; clima: string } | null
  camara: Camara
}

const CENTRO: [number, number] = [-58.445, -34.615]
const MARTES = 1
const COLOR_PUNTO: [number, number, number, number] = [255, 150, 70, 190]
const COLOR_PUNTO_TENUE: [number, number, number, number] = [255, 150, 70, 80]

const ACTOS: Acto[] = [
  { id: 'portada', nombre: 'Portada', escena: null, camara: { zoom: 10.2, pitch: 0, bearing: 0 } },
  { id: 'ciudad', nombre: 'La ciudad', escena: null, camara: { zoom: 11.25, pitch: 28, bearing: -10 } },
  { id: 'pregunta', nombre: 'La pregunta', escena: null, camara: { zoom: 11.05, pitch: 0, bearing: 0 } },
  { id: 'sol', nombre: 'Sale el sol', escena: { dia: MARTES, hora: 14, clima: 'despejado' }, camara: { zoom: 11.55, pitch: 34, bearing: -14 } },
  { id: 'lluvia', nombre: 'Empieza a llover', escena: { dia: MARTES, hora: 14, clima: 'lluvia' }, camara: { zoom: 11.75, pitch: 40, bearing: 6 } },
  { id: 'noche', nombre: 'Se hace de noche', escena: { dia: MARTES, hora: 22, clima: 'lluvia' }, camara: { zoom: 11.85, pitch: 46, bearing: 22 } },
  { id: 'tormenta', nombre: 'Tormenta', escena: { dia: MARTES, hora: 22, clima: 'tormenta' }, camara: { zoom: 12.4, pitch: 58, bearing: -28 } },
  { id: 'ahora', nombre: 'Ahora mismo', escena: null, camara: { zoom: 11.4, pitch: 0, bearing: 0 } },
]
const ULTIMO = ACTOS.length - 1

const pct = (rr: number) => Math.round((rr - 1) * 100)
const conSigno = (n: number) => `${n > 0 ? '+' : n < 0 ? '−' : ''}${fmtNum(Math.abs(n))} %`

export function Historia({ riesgo, siniestros: s, patrones, modelo, onExplorar }: Props) {
  const [acto, setActo] = useState(0)
  const [apuesta, setApuesta] = useState<'mas' | 'menos' | null>(null)
  const [revelados, setRevelados] = useState(0)
  const [horaVis, setHoraVis] = useState(21)
  const raiz = useRef<HTMLDivElement>(null)
  const mapRef = useRef<MapRef>(null)
  const [mapaListo, setMapaListo] = useState(false)
  const silencioElegido = useRef(false)
  const { activo: sonido, encender, apagar } = useSonido()
  const ahora = useAhoraBA()
  const pronostico = usePronostico()
  const A = ACTOS[acto]

  // ---------- cifras: todas salen de los JSON del pipeline ----------
  const cifras = useMemo(() => {
    const p = Object.fromEntries(patrones.patrones.map((x) => [x.id, x]))
    const datos = (id: string) => ((p[id] as unknown as { datos?: Record<string, { rr: number; obs: number; esp: number }> })?.datos ?? {})
    const victimas = p.victimas_lluvia?.grafico?.tipo === 'victimas' ? p.victimas_lluvia.grafico.filas : []
    const modo = (m: string) => victimas.find((f) => f.modo === m)
    const grupos = Object.fromEntries(modelo.shap.grupos.map((g) => [g.grupo, Math.round(g.share * 100)]))
    const tn = datos('tormenta_noche').tormenta_noche_habil
    return {
      lluviaDia: pct(datos('lluvia_dia_noche').lluvia_dia?.rr ?? 0.84),
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
  const anioActual = porAnio.find((p) => revelados <= p.hasta)?.anio ?? porAnio[porAnio.length - 1].anio

  // ---------- escenario del mapa ----------
  const climaVivo = pronostico.estado === 'ok' ? pronostico.horas.find((h) => h.clave === ahora.claveHora) : undefined
  const condicionVivo = climaVivo?.condicion ?? 'despejado'
  const escena = useMemo(
    () => (A.id === 'ahora' ? { dia: ahora.dia, hora: ahora.hora, clima: condicionVivo } : A.escena),
    [A, ahora.dia, ahora.hora, condicionVivo],
  )
  const climaEscena = escena?.clima ?? 'despejado'
  const iClima = Math.max(0, riesgo.climas.indexOf(climaEscena))
  const horaEscena = A.id === 'noche' ? Math.round(horaVis) : (escena?.hora ?? 21)
  const valores = useMemo(() => (escena ? escenario(riesgo, iClima, escena.dia, horaEscena) : null), [riesgo, iClima, escena, horaEscena])
  const dominio = useMemo<Dominio>(() => ({ lo: riesgo.cuantiles['25'], hi: riesgo.cuantiles['99.9'] }), [riesgo])
  const total = escena ? totalCiudad(riesgo, iClima, escena.dia, horaEscena) : 0
  const top = useMemo(() => {
    if (!valores) return []
    return Array.from(valores.keys()).sort((a, b) => valores[b] - valores[a]).slice(0, 3)
  }, [valores])
  const perfilDia = useMemo(
    () => (escena ? Array.from({ length: 24 }, (_, h) => totalCiudad(riesgo, iClima, escena.dia, h)) : []),
    [riesgo, iClima, escena],
  )

  // ---------- capas ----------
  const mostrarPuntos = A.id === 'portada' || A.id === 'ciudad' || A.id === 'pregunta'
  const tenue = A.id === 'pregunta'
  const es3d = A.id === 'tormenta'
  const filtro = useMemo(() => new DataFilterExtension({ filterSize: 1 }), [])
  const datosPuntos = useMemo(() => ({ length: n }), [n])

  const capas = (antesDe: string | undefined) => [
    new ScatterplotLayer({
      id: 'siniestros',
      data: datosPuntos,
      getPosition: (_: unknown, { index }: { index: number }) => [s.lon[index], s.lat[index]],
      getFillColor: tenue ? COLOR_PUNTO_TENUE : COLOR_PUNTO,
      getRadius: 22,
      radiusMinPixels: 1.1,
      radiusMaxPixels: 4,
      getFilterValue: (_: unknown, { index }: { index: number }) => rango[index],
      filterRange: [0, Math.max(0, revelados - 1)],
      extensions: [filtro],
      visible: mostrarPuntos,
      ...debajoDe(antesDe),
    }),
    new PolygonLayer<Celda>({
      id: 'riesgo-hex',
      data: riesgo.celdas,
      getPolygon: (c) => c.p,
      getFillColor: (_, { index }) => {
        if (!valores) return [0, 0, 0, 0]
        const x = posicion(valores[index], dominio)
        return [...colorEn(x), es3d ? 235 : Math.round(90 + 130 * Math.min(1, Math.max(0, x)))]
      },
      getElevation: (_, { index }) => (valores ? Math.max(0, posicion(valores[index], dominio)) ** 2 * 1700 : 0),
      extruded: es3d,
      stroked: false,
      pickable: false,
      material: { ambient: 0.55, diffuse: 0.6, shininess: 24 },
      transitions: { getFillColor: { duration: 1100 }, getElevation: { duration: 1400 } },
      updateTriggers: { getFillColor: [valores, es3d], getElevation: [valores] },
      ...debajoDe(es3d ? undefined : antesDe),
    }),
  ]

  // ---------- cámara ----------
  useEffect(() => {
    const m = mapRef.current
    if (!m || !mapaListo) return
    const cam = A.camara
    let centro = cam.centro ?? CENTRO
    if (A.id === 'tormenta' && top.length) {
      const c = riesgo.celdas[top[0]].c
      centro = [(c[0] + CENTRO[0] * 2) / 3, (c[1] + CENTRO[1] * 2) / 3]
    }
    const duracion = A.id === 'ciudad' ? 9000 : 2600
    m.flyTo({ center: centro, zoom: cam.zoom, pitch: cam.pitch, bearing: cam.bearing, duration: duracion, essential: true })
    // En la tormenta la cámara sigue girando despacio alrededor del relieve.
    if (A.id === 'tormenta') {
      const mapa = m.getMap()
      const orbitar = () => mapa.easeTo({ bearing: cam.bearing + 40, duration: 40000, easing: (t) => t })
      mapa.once('moveend', orbitar)
      return () => {
        mapa.off('moveend', orbitar)
      }
    }
    // La cámara solo se mueve al cambiar de acto.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [acto, mapaListo])

  // ---------- animaciones por acto: puntos que caen, el día que se hace noche ----------
  useEffect(() => {
    if (A.id === 'ciudad') {
      const o = { v: 0 }
      setRevelados(0)
      const t = gsap.to(o, { v: n, duration: 9, ease: 'power1.in', onUpdate: () => setRevelados(Math.round(o.v)) })
      return () => {
        t.kill()
      }
    }
    if (A.id === 'pregunta' || A.id === 'portada') setRevelados(A.id === 'portada' ? 0 : n)
    if (A.id === 'noche') {
      const o = { h: 14 }
      setHoraVis(14)
      const t = gsap.to(o, { h: 22, duration: 3.6, ease: 'power1.inOut', delay: 0.4, onUpdate: () => setHoraVis(o.h) })
      return () => {
        t.kill()
      }
    }
    setHoraVis(A.id === 'ahora' ? ahora.hora + ahora.minuto / 60 : (A.escena?.hora ?? 21))
    // Solo al entrar a cada acto.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [acto])

  // ---------- texto: entra palabra por palabra; las cifras cuentan solas ----------
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
      panel.querySelectorAll<HTMLElement>('[data-cuenta]').forEach((el) => {
        const fin = Number(el.dataset.cuenta)
        const dec = Number(el.dataset.dec ?? 0)
        const signo = el.dataset.signo === '1'
        const suf = el.dataset.suf ?? ''
        const o = { v: 0 }
        const pintar = () => {
          const v = o.v
          el.textContent = signo ? conSigno(Math.round(v)) : `${fmtNum(v, dec)}${suf}`
        }
        pintar()
        tl.to(o, { v: fin, duration: 1.6, ease: 'power2.out', onUpdate: pintar }, 0.5)
      })
    },
    { scope: raiz, dependencies: [acto], revertOnUpdate: true },
  )

  // ---------- navegación: rueda, deslizar, teclado y clicker ----------
  const ir = useCallback(
    (destino: number) => {
      const d = Math.min(ULTIMO, Math.max(0, destino))
      setActo((a) => {
        // Salir de la portada con una tecla o la rueda cuenta como gesto: se puede encender el sonido.
        if (a === 0 && d > 0 && !sonido && !silencioElegido.current) void encender()
        return d
      })
    },
    [sonido, encender],
  )
  const bloqueo = useRef(0)
  const acumulado = useRef(0)
  useEffect(() => {
    const el = raiz.current
    if (!el) return
    const alRodar = (e: WheelEvent) => {
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
      const dy = y0 - e.changedTouches[0].clientY
      if (Math.abs(dy) > 50) ir(acto + Math.sign(dy))
    }
    const alTeclear = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest('input, select, textarea') || e.metaKey || e.ctrlKey || e.altKey) return
      const k = e.key
      if (['ArrowDown', 'ArrowRight', 'PageDown', ' ', 'Enter'].includes(k)) {
        if (k === 'Enter' && (e.target as HTMLElement).closest('button')) return
        e.preventDefault()
        ir(acto + 1)
      } else if (['ArrowUp', 'ArrowLeft', 'PageUp', 'Backspace'].includes(k)) {
        e.preventDefault()
        ir(acto - 1)
      } else if (k === 'Home') ir(1)
      else if (k === 'End') ir(ULTIMO)
      else if (k.toLowerCase() === 'm') {
        if (sonido) apagar()
        else void encender()
      }
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
  }, [acto, ir, sonido, encender, apagar, onExplorar])

  // ---------- ambiente: clima en pantalla, luz y sonido ----------
  const intensidadVivo = A.id === 'ahora' && climaVivo ? intensidadDeLluvia(climaVivo.precipitacion) : undefined
  const luz = useMemo(() => luzDelDia(horaVis), [horaVis])
  const maxPerfil = Math.max(...perfilDia, 1e-6)
  const transito =
    A.id === 'portada' ? 0.08
    : A.id === 'ciudad' ? 0.12 + 0.8 * (revelados / n)
    : A.id === 'pregunta' ? 0.3
    : perfilDia.length ? perfilDia[horaEscena] / maxPerfil : 0.5
  useAmbienteSonoro({ clima: climaEscena, hora: horaVis, transito, lluvia: intensidadVivo, sirena: A.id === 'tormenta' })

  // ---------- texto de cada acto ----------
  const apuestaTexto =
    apuesta === 'mas' ? 'Apostaron a "más". De día, los datos dicen lo contrario.'
    : apuesta === 'menos' ? 'Apostaron a "menos". Acertaron… por ahora.'
    : null

  const panel = (() => {
    switch (A.id) {
      case 'portada':
        return null
      case 'ciudad':
        return (
          <>
            <p className="h-kicker h-anim">Acto 1 · La ciudad</p>
            <h2 className="h-titulo">Cada punto es un siniestro con víctimas.</h2>
            <p className="h-cifra h-anim">
              <span className="h-num">{fmtNum(revelados)}</span>
              <span className="h-num-nota">siniestros · {revelados ? anioActual : 2019}</span>
            </p>
            <p className="h-cuerpo h-anim">Ciudad de Buenos Aires, 2019 a 2025. Siete años de choques, atropellos y caídas, uno por uno.</p>
          </>
        )
      case 'pregunta':
        return (
          <>
            <p className="h-kicker h-anim">Acto 2 · La pregunta</p>
            <h2 className="h-titulo">Cuando llueve, ¿hay más choques o menos?</h2>
            <p className="h-cuerpo h-anim">Cruzamos cada siniestro con el clima de esa hora y ese lugar. Antes de mirar: ¿qué apuestan?</p>
            <div className="h-apuesta h-anim" role="group" aria-label="Apuesta">
              <button className={apuesta === 'mas' ? 'on' : ''} onClick={() => setApuesta('mas')}>Más choques</button>
              <button className={apuesta === 'menos' ? 'on' : ''} onClick={() => setApuesta('menos')}>Menos choques</button>
            </div>
          </>
        )
      case 'sol':
        return (
          <>
            <p className="h-kicker h-anim">Acto 3 · Martes, 14:00 · Despejado</p>
            <h2 className="h-titulo">Un martes cualquiera, a pleno sol.</h2>
            <p className="h-cifra h-anim">
              <span className="h-num" data-cuenta={total} data-dec="2">{fmtNum(total, 2)}</span>
              <span className="h-num-nota">siniestros esperados en esa hora, en toda la ciudad</span>
            </p>
            <p className="h-cuerpo h-anim">El mapa pinta el riesgo que predice el modelo en cada zona de ~350 m. Esta es la línea de base.</p>
          </>
        )
      case 'lluvia':
        return (
          <>
            <p className="h-kicker h-anim">Acto 4 · Martes, 14:00 · Lluvia</p>
            <h2 className="h-titulo">Empieza a llover… y los siniestros bajan.</h2>
            <p className="h-cifra h-anim">
              <span className="h-num down" data-cuenta={cifras.lluviaDia} data-signo="1">{conSigno(cifras.lluviaDia)}</span>
              <span className="h-num-nota">de día con lluvia, frente a horas despejadas comparables</span>
            </p>
            <p className="h-cuerpo h-anim">
              No son calles más seguras: sale menos gente. Ciclistas <b>{conSigno(cifras.ciclistasDia)}</b>, motociclistas <b>{conSigno(cifras.motosDia)}</b>.
            </p>
            {apuestaTexto && <p className="h-nota h-anim">{apuestaTexto}</p>}
          </>
        )
      case 'noche':
        return (
          <>
            <p className="h-kicker h-anim">Acto 5 · Martes, {hhmm(Math.round(horaVis))} · Lluvia</p>
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
            <p className="h-kicker h-anim">Acto 6 · Martes, 22:00 · Tormenta</p>
            <h2 className="h-titulo">El peor momento de la semana.</h2>
            <p className="h-cifra h-anim">
              <span className="h-num up" data-cuenta={cifras.tormentaNoche} data-signo="1">{conSigno(cifras.tormentaNoche)}</span>
              <span className="h-num-nota">
                siniestros en noches hábiles de tormenta ({fmtNum(cifras.tormentaObs)} observados contra {fmtNum(cifras.tormentaEsp)} esperados)
              </span>
            </p>
            <ol className="h-top h-anim">
              {top.map((i) => (
                <li key={i}>{nombreCelda(riesgo.celdas[i])} <small>Comuna {riesgo.celdas[i].comuna}</small></li>
              ))}
            </ol>
          </>
        )
      case 'ahora':
        return (
          <>
            <p className="h-kicker h-anim">
              <i className="live-dot" aria-hidden /> Ahora mismo · {DIAS[ahora.dia]} {String(ahora.hora).padStart(2, '0')}:{String(ahora.minuto).padStart(2, '0')} · {NOMBRE_CLIMA[climaEscena]}
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
              <button className="h-primario" onClick={onExplorar}>Explorar el mapa →</button>
              <button className="h-secundario" onClick={() => ir(1)}>Volver a empezar</button>
            </div>
          </>
        )
    }
  })()

  return (
    <div className={`historia acto-${A.id}`} ref={raiz}>
      <div className="h-mapa">
        <MapaBase
          mapRef={mapRef}
          layers={capas}
          luz={luz}
          edificios={es3d}
          interactivo={false}
          onCargar={() => setMapaListo(true)}
        />
        <EfectoClima
          clima={climaEscena}
          hora={horaVis}
          intensidad={intensidadVivo}
          fuerza="pleno"
          vidrio={A.id === 'lluvia' || A.id === 'noche' || A.id === 'tormenta' || (A.id === 'ahora' && !!intensidadVivo)}
          onRelampago={trueno}
        />
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
          <BotonSonido />
          <button className="h-saltar" onClick={onExplorar}>Explorar el mapa →</button>
        </div>
      </header>

      {A.id === 'portada' ? (
        <section className="h-portada h-panel">
          <p className="h-kicker h-anim">Ciencia de Datos · Trabajo práctico</p>
          <h1 className="h-titulo">¿La lluvia nos hace más cuidadosos?</h1>
          <p className="h-cuerpo h-anim">
            {fmtNum(n)} siniestros viales con víctimas en la Ciudad de Buenos Aires, cruzados hora por hora con el clima.
          </p>
          <div className="h-acciones h-anim">
            <button className="h-primario" onClick={() => { silencioElegido.current = false; void encender(); ir(1) }}>Empezar con sonido</button>
            <button className="h-secundario" onClick={() => { silencioElegido.current = true; apagar(); ir(1) }}>Sin sonido</button>
          </div>
          <p className="h-ayuda h-anim">Avanzá con la rueda, deslizando, con ↓ → o con un clicker</p>
        </section>
      ) : (
        <section className="h-panel" key={A.id} aria-live="polite">
          {panel}
        </section>
      )}

      <nav className="h-actos" aria-label="Actos">
        {ACTOS.slice(1).map((a, k) => (
          <button key={a.id} className={acto === k + 1 ? 'on' : acto > k + 1 ? 'visto' : ''} onClick={() => ir(k + 1)} aria-label={`${k + 1}. ${a.nombre}`} aria-current={acto === k + 1}>
            <span>{a.nombre}</span>
          </button>
        ))}
      </nav>

      {acto > 0 && acto < ULTIMO && (
        <button className="h-seguir" onClick={() => ir(acto + 1)} aria-label="Siguiente acto">
          <span>{ACTOS[acto + 1].nombre}</span>
          <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden><path d="M3 6l5 5 5-5" fill="none" stroke="currentColor" strokeWidth="1.6" /></svg>
        </button>
      )}
    </div>
  )
}
