import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { Map, useControl, type MapRef } from 'react-map-gl/maplibre'
import { MapLibreOverlay, type MapLibreOverlayProps } from '@deck.gl/maplibre'
import type { Layer, PickingInfo } from '@deck.gl/core'
import maplibregl from 'maplibre-gl'
import maplibreWorker from 'maplibre-gl/dist/maplibre-gl-csp-worker.js?raw'
import 'maplibre-gl/dist/maplibre-gl.css'
import { agregarEdificios, aplicarLuz } from '../ambiente/mapaLuz'
import comunas from '../data/comunas.json'

// El worker de MapLibre se incrusta como blob para que funcione dentro del index.html único (incluso con file://).
maplibregl.setWorkerUrl(URL.createObjectURL(new Blob([maplibreWorker], { type: 'text/javascript' })))

const ESTILO_MAPA = 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json'
// Sin internet (o si el mapa base no responde): fondo oscuro con las comunas, incluido en el index.html.
const ESTILO_RESPALDO = {
  version: 8 as const,
  sources: { comunas: { type: 'geojson' as const, data: comunas as GeoJSON.FeatureCollection } },
  layers: [
    { id: 'background', type: 'background' as const, paint: { 'background-color': '#0e0f11' } },
    { id: 'comunas-fill', type: 'fill' as const, source: 'comunas', paint: { 'fill-color': '#16191c' } },
    { id: 'comunas-line', type: 'line' as const, source: 'comunas', paint: { 'line-color': '#2b3036', 'line-width': 1 } },
    { id: 'etiquetas-respaldo', type: 'symbol' as const, source: 'comunas', layout: {} },
  ],
}
let sinMapaBase = false
const ESPERA_MAPA_MS = 9000

const VISTA_INICIAL = { longitude: -58.445, latitude: -34.615, zoom: 11.4, pitch: 0, bearing: 0 }

/**
 * Prop `beforeId` de MapLibreOverlay intercalado: dibuja la capa debajo de esa capa del mapa base.
 * Existe en tiempo de ejecución pero no en los tipos de las capas de deck.gl.
 */
export const debajoDe = (id: string | undefined) => ({ beforeId: id }) as object

function DeckOverlay(props: MapLibreOverlayProps) {
  const overlay = useControl<MapLibreOverlay>(() => new MapLibreOverlay(props))
  overlay.setProps(props)
  return null
}

interface Props {
  /** Recibe el id de la primera capa de etiquetas: las capas de datos van debajo de los nombres de calles. */
  layers: (antesDeEtiquetas: string | undefined) => Layer[]
  onHover?: (info: PickingInfo) => void
  onClick?: (info: PickingInfo) => void
  onCargar?: (map: maplibregl.Map) => void
  children?: ReactNode
  mapRef?: React.Ref<MapRef>
  /** Luz del día (ver ambiente/luz.ts): el mapa base se aclara de día y toma tono cálido al atardecer. */
  luz?: { dia: number; dorado: number }
  /** Edificios 3D del mapa base (se ven desde zoom 13). */
  edificios?: boolean
  /** false: sin arrastre ni zoom con la rueda (la historia usa la rueda para avanzar). */
  interactivo?: boolean
  /** Capas que se mueven solas (tránsito): se redibujan en cada cuadro sin re-renderizar la vista. */
  animacion?: { velocidad: number; capas: (t: number) => Layer[] }
}

const MANEJADORES = ['scrollZoom', 'boxZoom', 'dragRotate', 'dragPan', 'keyboard', 'doubleClickZoom', 'touchZoomRotate'] as const

export function MapaBase({ layers, onHover, onClick, onCargar, children, mapRef, luz, edificios = false, interactivo = true, animacion }: Props) {
  const [etiquetas, setEtiquetas] = useState<string | undefined>()
  const [mapa, setMapa] = useState<maplibregl.Map | null>(null)
  const [respaldo, setRespaldo] = useState(sinMapaBase)

  // Si el estilo no carga (sin internet) o tarda demasiado, se pasa al mapa de respaldo.
  useEffect(() => {
    if (respaldo || mapa) return
    const t = setTimeout(() => {
      sinMapaBase = true
      setRespaldo(true)
    }, ESPERA_MAPA_MS)
    return () => clearTimeout(t)
  }, [respaldo, mapa])
  const alError = useCallback(
    (e: { error?: { message?: string } }) => {
      if (mapa || respaldo) return
      if (/style|Failed to fetch|NetworkError|AJAXError/i.test(e.error?.message ?? '')) {
        sinMapaBase = true
        setRespaldo(true)
      }
    },
    [mapa, respaldo],
  )

  useEffect(() => {
    if (!mapa) return
    for (const h of MANEJADORES) {
      if (interactivo) mapa[h].enable()
      else mapa[h].disable()
    }
  }, [mapa, interactivo])

  // Reloj de animación propio: solo este componente se actualiza en cada cuadro.
  const [t, setT] = useState(0)
  const velocidad = useRef(1)
  const vel = animacion?.velocidad ?? 1
  useEffect(() => {
    velocidad.current = vel
  }, [vel])
  const anima = !!animacion
  useEffect(() => {
    if (!anima) return
    let raf = 0
    let previo = performance.now()
    const cuadro = (ahora: number) => {
      const dt = Math.min(0.1, (ahora - previo) / 1000)
      previo = ahora
      setT((x) => x + dt * 6 * velocidad.current)
      raf = requestAnimationFrame(cuadro)
    }
    raf = requestAnimationFrame(cuadro)
    return () => cancelAnimationFrame(raf)
  }, [anima])

  const alCargar = useCallback((e: { target: maplibregl.Map }) => {
    const capas = e.target.getStyle().layers ?? []
    const primeraEtiqueta = capas.find((l) => l.type === 'symbol')?.id
    setEtiquetas(primeraEtiqueta)
    setMapa(e.target)
    onCargar?.(e.target)
    // Solo importa el manejador vigente al cargar el mapa.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const dia = luz?.dia
  const dorado = luz?.dorado
  useEffect(() => {
    if (mapa && dia !== undefined && dorado !== undefined) aplicarLuz(mapa, dia, dorado)
  }, [mapa, dia, dorado])

  useEffect(() => {
    if (!mapa) return
    if (edificios) agregarEdificios(mapa, etiquetas)
    else if (mapa.getLayer('edificios-3d')) mapa.removeLayer('edificios-3d')
  }, [mapa, edificios, etiquetas])

  return (
    <Map
      key={respaldo ? 'respaldo' : 'carto'}
      ref={mapRef}
      mapLib={maplibregl}
      mapStyle={respaldo ? ESTILO_RESPALDO : ESTILO_MAPA}
      initialViewState={VISTA_INICIAL}
      maxPitch={65}
      attributionControl={{ compact: true }}
      onLoad={alCargar}
      onError={alError}
      style={{ position: 'absolute', inset: 0 }}
    >
      <DeckOverlay interleaved layers={etiquetas ? [...layers(etiquetas), ...(animacion ? animacion.capas(t) : [])] : []} onHover={onHover} onClick={onClick} />
      {children}
    </Map>
  )
}
