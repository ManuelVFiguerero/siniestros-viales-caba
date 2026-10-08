# Siniestros viales en CABA × clima

Mapa de calor interactivo de los siniestros viales de la Ciudad de Buenos Aires (2019–2025) cruzado
con el clima histórico hora por hora, y un **modelo que predice el riesgo de siniestro por zona y
momento**: elegís "viernes 19 h con lluvia" y el mapa pinta las celdas de ~350 m más probables.

## Estructura

```
data/
  raw/          siniestros_viales_hechos.xlsx y comunas.geojson (BA Data, versionados)
  processed/    parquets intermedios y modelos (se regeneran, no se versionan)
pipeline/       ETL y modelado en Python, un script por paso
reports/        métricas y figuras para la presentación (SHAP, curva de captura, Poisson)
notebooks/      análisis exploratorio
web/            app React + deck.gl + MapLibre: riesgo previsto, histórico e informe del modelo
index.html      la app compilada en un solo archivo: doble clic y listo
```

## Pipeline

```bash
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt

python pipeline/01_limpiar_siniestros.py   # Excel -> parquet limpio (descarta sin coordenadas)
python pipeline/02_descargar_clima.py      # clima horario de Open-Meteo para 4 puntos de CABA
python pipeline/03_cruzar_clima.py         # asigna clima a cada siniestro (punto más cercano + hora)
python pipeline/04_exportar_web.py         # JSON para la web + riesgo relativo por clima

# Modelo de riesgo (en macOS, LightGBM necesita: brew install libomp)
python pipeline/05_grilla_h3.py            # grilla H3 + comunas + red vial de OpenStreetMap
python pipeline/06_dataset_modelo.py       # tabla celda × hora 2019-2025 con todas las variables
python pipeline/07_entrenar_modelos.py     # Poisson, Random Forest y LightGBM + SHAP (~4 min)
python pipeline/08_exportar_riesgo_web.py  # 840 escenarios de riesgo para la web
python pipeline/09_patrones.py             # patrones del modelo validados con los datos
```

| Paso | Qué hace |
|---|---|
| 01 | 65.818 siniestros → 62.737 con lat/lon dentro de CABA y fecha/hora válidas |
| 02 | Open-Meteo Historical API (reanálisis ERA5), sin API key. Variables: código WMO, precipitación, temperatura, humedad, viento, ráfagas, nubosidad |
| 03 | Cada siniestro toma el clima del punto de muestreo más cercano en la hora del hecho |
| 04 | Exporta `web/src/data/` y calcula el riesgo relativo estandarizado |
| 05 | 2.860 hexágonos H3 resolución 9 (~350 m). Por celda: comuna, km de autopista/avenida/terciaria y vías principales que se cruzan (Overpass/OSM) |
| 06 | 175,5 M celda-horas: las 62 mil con siniestro + 5 M ceros muestreados con peso 35,1 (diseño caso-control: las sumas ponderadas reproducen la ciudad entera) |
| 07 | Entrena con 2019–2023, evalúa con 2024–2025, explica con SHAP, reentrena el LightGBM final con todo |
| 08 | Clima (5) × día (7) × hora (24) = 840 mapas, cuantizados a 1 byte en escala log (`riesgo.json`) |
| 09 | Patrones del modelo (clima × hora, víctimas, zonas nocturnas, domingos, interacciones SHAP), cada uno contrastado con tasas observadas e IC 95 % (`patrones.json`, `reports/patrones.md`) |

### Clasificación del clima (`pipeline/clima.py`)

ERA5 no emite códigos de tormenta ni de niebla, así que se aproximan:

- **Tormenta:** precipitación ≥ 4 mm/h, o ≥ 1 mm/h con ráfagas ≥ 55 km/h
- **Lluvia:** códigos WMO de llovizna/lluvia o precipitación ≥ 0,5 mm/h
- **Niebla:** humedad ≥ 97 %, viento < 8 km/h y sin precipitación
- **Nublado:** nubosidad ≥ 70 %
- **Despejado:** el resto

### Riesgo relativo

Contar siniestros por clima engaña: "despejado" siempre gana porque es lo más frecuente. Se usa
**estandarización indirecta**: para cada condición se comparan los siniestros observados con los
esperados si esas mismas horas hubieran tenido la tasa de horas despejadas de la misma zona,
año, hora del día y tipo de día (hábil/finde).

Primer resultado: con lluvia hay ~13 % **menos** siniestros reportados por hora. Hipótesis a
investigar: con lluvia baja el volumen de tránsito (menos exposición) y se denuncian menos
choques leves. Para separar ambos efectos hace falta un dato de exposición (conteos vehiculares).

## Modelo de riesgo

**Objetivo:** cantidad de siniestros con víctimas en una celda H3 en una hora (regresión de Poisson).

**Variables:**
- *Zona:* siniestros históricos de la celda y de sus 6 vecinas, km de avenida/autopista/terciaria,
  vías principales que se cruzan, comuna, coordenadas.
- *Momento:* hora, día de la semana, mes, feriado (`holidays`), cuarentena estricta 2020.
- *Clima:* lluvia de la hora y de las 3 h previas, temperatura, humedad, viento, ráfagas, nubosidad, niebla.

**Validación con corte temporal:** se entrena con 2019–2023 y se evalúa con 2024–2025. El historial de
cada celda se calcula sin el año de la fila (leave-one-year-out) para que el modelo no vea su propio
objetivo, y el early stopping de LightGBM usa 2023, dentro del período de entrenamiento.

| Modelo (test 2024–2025) | AUC | Deviance explicada | Captura 5 % | Captura 10 % |
|---|---:|---:|---:|---:|
| **LightGBM** (Poisson) | **0,797** | **8,2 %** | **25,9 %** | **40,2 %** |
| Poisson (GLM) | 0,793 | 7,9 % | 25,7 % | 39,9 % |
| Random Forest | 0,787 | 7,4 % | 25,0 % | 39,0 % |
| *Base: historial × perfil horario* | 0,793 | 7,8 % | 25,2 % | 39,7 % |
| *Base: solo historial de la celda* | 0,745 | 5,3 % | 20,5 % | 33,2 % |

"Captura 10 %": qué porcentaje de los siniestros reales cae en el 10 % de celda-horas que el modelo
marca como más riesgosas. Detalle completo en `reports/metricas.md` y en la pestaña **Modelo** de la web.

**Hallazgos:**
- Lo que más concentra el riesgo es **dónde** (57 % del |SHAP|) y **cuándo** (39 %). Sumar hora y día al
  mapa de puntos calientes clásico sube la captura del 33 % al 40 %.
- El **clima pesa poco** (4 % del |SHAP|, 7 % en horas con lluvia). La regresión de Poisson da −11 % de
  siniestros con lluvia frente a despejado y solo la lluvia intensa (≥ 4 mm/h) muestra un aumento (~+10 %).
  Coherente con el análisis descriptivo: con lluvia baja el tránsito y quizás se denuncian menos choques leves.
- Los tres modelos rinden parecido; LightGBM gana por poco. La regresión de Poisson es casi tan buena y
  es la que conviene para explicar efectos (razones de tasas en `reports/figuras/poisson_razones.png`).

### Patrones

El paso 9 busca patrones en el modelo y los contrasta con los datos: para cada condición compara
los siniestros observados con los esperados en horas comparables (misma zona de clima, año, hora y
tipo de día), con intervalo de confianza del 95 %. Los más fuertes:

- **La lluvia cambia de signo con la hora:** −16 % de siniestros de día (7–20 h), +9 % de noche (21–6 h).
  Una tormenta en noche hábil (21–23 h): +56 %. El modelo aprendió la misma inversión por su cuenta.
- **Con lluvia cambia quién se lastima:** de día caen los ciclistas (−31 %) y motociclistas (−20 %),
  porque menos gente sale; de noche suben los peatones (+32 %) y ocupantes de autos (+28 %).
- **La primera hora de lluvia** protege menos (−6 %) que la lluvia sostenida (−14 %).
- **Con frío (< 8 °C)** hay +6 % de siniestros, a igual mes y hora.
- **Madrugadas de fin de semana:** pesan el doble en autopistas y avenidas del sur (Dellepiane,
  General Paz y Roca, Fernández de la Cruz).
- **Domingos:** los corredores laborales (Juan B. Justo, San Martín) caen a un tercio; los Bosques de
  Palermo y la Comuna 8 conservan más de la mitad del riesgo.

Detalle en la pestaña **Patrones** de la web y en `reports/patrones.md`.

**Limitaciones:** el dataset registra siniestros con víctimas, no todos los choques; no hay dato de
exposición (tránsito), así que el riesgo es por celda y no por vehículo; ERA5 tiene ~25 km de resolución.
El modelo subestima ~15 % el total de 2024–2025 porque los siniestros crecieron frente a 2019–2023.
Los hiperparámetros del Random Forest (hojas de ≥ 2.000 filas) se ajustaron mirando el test, así que su
métrica es levemente optimista; con hojas chicas sobreajustaba y quedaba por debajo de la línea de base.

**Escenarios de la web:** para cada clima se usan los valores típicos (mediana) de las horas reales con
esa condición a esa hora del día; se promedian enero, abril, julio y octubre; día no feriado.

## Ver el mapa

**Abrí `index.html` (en la raíz del repo) con doble clic.** Es un único archivo con todo
adentro (código, estilos, datos y los 840 escenarios del modelo); solo necesita internet para el
mapa base y las tipografías.

- **En vivo (al abrir):** toma la hora actual de Buenos Aires y el clima pronosticado para esta hora
  ([Open-Meteo](https://open-meteo.com/), clasificado con las mismas reglas que el entrenamiento) y
  muestra el riesgo de ahora, las **zonas más peligrosas en este momento** y las próximas 12 horas.
  Se actualiza solo: el reloj cada 20 s y el pronóstico cada 15 min. Sin conexión al pronóstico
  asume despejado y lo avisa.
- **Explorar:** tocar cualquier control (o una de las próximas horas) congela el mapa en ese momento
  para consultarlo; "Volver a en vivo" retoma la hora actual.
- **Riesgo previsto:** elegí día, hora y clima; el mapa pinta el riesgo de cada celda con la escala
  azul → amarillo → rojo (veces el promedio de la ciudad). Hexágonos, superficie continua o relieve 3D;
  escala fija (para comparar escenarios) o relativa. Clic en una celda para ver su perfil horario y su
  sensibilidad al clima. "Recorrer el día" anima las 24 horas.
- **Histórico:** densidad de los siniestros reales con filtros de clima, gravedad, hora, año y víctima.
- **Patrones:** hallazgos del modelo validados con los datos; cada uno lleva al mapa en el momento
  y la zona correspondientes.
- **Modelo:** comparación de modelos, curva de captura, SHAP y regresión de Poisson.

Para desarrollar la web:

```bash
cd web
npm install
npm run dev        # servidor de desarrollo
npm run build      # regenera ../index.html
```

Se publica sola en GitHub Pages con cada push a `main` (`.github/workflows/deploy.yml`).

## Próximos pasos

- [ ] Notebook de EDA (estacionalidad, efecto 2020, gravedad según clima)
- [ ] Sumar conteos vehiculares de BA Data como medida de exposición
- [x] Modelo de probabilidad por celda H3 × hora × clima (regresión de Poisson / LightGBM)
- [ ] Validar el clima de ERA5 contra las estaciones del SMN (Aeroparque, Observatorio Central)
- [ ] Sumar el dataset de víctimas (edad, sexo, rol)

## Fuentes

- Siniestros: [BA Data – Víctimas de siniestros viales](https://data.buenosaires.gob.ar/dataset/victimas-siniestros-viales) (CC BY 2.5 AR)
- Clima: [Open-Meteo Historical Weather API](https://open-meteo.com/en/docs/historical-weather-api) (ERA5 / ECMWF, CC BY 4.0)
- Mapa base: © CARTO, © colaboradores de OpenStreetMap
