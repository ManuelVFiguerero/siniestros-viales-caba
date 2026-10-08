import { useCallback, useState, type ReactNode } from 'react'
import { Map, useControl, type MapRef } from 'react-map-gl/maplibre'
import { MapLibreOverlay, type MapLibreOverlayProps } from '@deck.gl/maplibre'
import type { Layer, PickingInfo } from '@deck.gl/core'
import maplibregl from 'maplibre-gl'
import maplibreWorker from 'maplibre-gl/dist/maplibre-gl-csp-worker.js?raw'
import 'maplibre-gl/dist/maplibre-gl.css'

// El worker de MapLibre se incrusta como blob para que funcione dentro del index.html único (incluso con file://).
maplibregl.setWorkerUrl(URL.createObjectURL(new Blob([maplibreWorker], { type: 'text/javascript' })))

const ESTILO_MAPA = 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json'
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
  onCargar?: () => void
  children?: ReactNode
  mapRef?: React.Ref<MapRef>
}

export function MapaBase({ layers, onHover, onClick, onCargar, children, mapRef }: Props) {
  const [etiquetas, setEtiquetas] = useState<string | undefined>()

  const alCargar = useCallback((e: { target: maplibregl.Map }) => {
    const capas = e.target.getStyle().layers ?? []
    setEtiquetas(capas.find((l) => l.type === 'symbol')?.id)
    onCargar?.()
    // Solo importa el manejador vigente al cargar el mapa.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <Map
      ref={mapRef}
      mapLib={maplibregl}
      mapStyle={ESTILO_MAPA}
      initialViewState={VISTA_INICIAL}
      maxPitch={65}
      attributionControl={{ compact: true }}
      onLoad={alCargar}
      style={{ position: 'absolute', inset: 0 }}
    >
      <DeckOverlay interleaved layers={etiquetas ? layers(etiquetas) : []} onHover={onHover} onClick={onClick} />
      {children}
    </Map>
  )
}
