# Siniestros viales en CABA × clima

Mapa de calor interactivo de los siniestros viales de la Ciudad de Buenos Aires (2019–2025) cruzado
con el clima histórico hora por hora, para responder: **¿dónde se concentran los siniestros y
cambia el riesgo con lluvia, tormenta o niebla?**

## Estructura

```
data/
  raw/          siniestros_viales_hechos.xlsx (BA Data, versionado en el repo)
  processed/    parquets intermedios (se regeneran, no se versionan)
pipeline/       ETL en Python, un script por paso
notebooks/      análisis exploratorio
web/            app React + deck.gl + MapLibre (mapa de calor / hexágonos 3D)
```

## Pipeline

```bash
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt

python pipeline/01_limpiar_siniestros.py   # Excel -> parquet limpio (descarta sin coordenadas)
python pipeline/02_descargar_clima.py      # clima horario de Open-Meteo para 4 puntos de CABA
python pipeline/03_cruzar_clima.py         # asigna clima a cada siniestro (punto más cercano + hora)
python pipeline/04_exportar_web.py         # JSON para la web + riesgo relativo por clima
```

| Paso | Qué hace |
|---|---|
| 01 | 65.818 siniestros → 62.737 con lat/lon dentro de CABA y fecha/hora válidas |
| 02 | Open-Meteo Historical API (reanálisis ERA5), sin API key. Variables: código WMO, precipitación, temperatura, humedad, viento, ráfagas, nubosidad |
| 03 | Cada siniestro toma el clima del punto de muestreo más cercano en la hora del hecho |
| 04 | Exporta `web/public/data/` y calcula el riesgo relativo estandarizado |

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

## Web

```bash
cd web
npm install
npm run dev
```

Se publica sola en GitHub Pages con cada push a `main` (`.github/workflows/deploy.yml`).

## Próximos pasos

- [ ] Notebook de EDA (estacionalidad, efecto 2020, gravedad según clima)
- [ ] Sumar conteos vehiculares de BA Data como medida de exposición
- [ ] Modelo de probabilidad por celda H3 × hora × clima (regresión de Poisson / LightGBM)
- [ ] Validar el clima de ERA5 contra las estaciones del SMN (Aeroparque, Observatorio Central)
- [ ] Sumar el dataset de víctimas (edad, sexo, rol)

## Fuentes

- Siniestros: [BA Data – Víctimas de siniestros viales](https://data.buenosaires.gob.ar/dataset/victimas-siniestros-viales) (CC BY 2.5 AR)
- Clima: [Open-Meteo Historical Weather API](https://open-meteo.com/en/docs/historical-weather-api) (ERA5 / ECMWF, CC BY 4.0)
- Mapa base: © CARTO, © colaboradores de OpenStreetMap
