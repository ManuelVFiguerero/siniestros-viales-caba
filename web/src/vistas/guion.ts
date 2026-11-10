// Guion de la historia: lo que ve el público (nombre) y lo que lee el orador en la ventana de notas.
export type IdActo =
  | 'portada' | 'ciudad' | 'crudos' | 'pregunta' | 'sol' | 'lluvia' | 'noche' | 'tormenta' | 'patron' | 'respuesta' | 'acierta'
  | 'datos' | 'pipeline' | 'modelo' | 'limites' | 'ahora'

export interface Guion {
  id: IdActo
  nombre: string
  /** Tiempo sugerido en segundos. */
  segundos: number
  notas: string[]
  /** La historia (para todo público) o la parte técnica de la charla. */
  parte?: 'historia' | 'tecnica'
}

export const GUION: Guion[] = [
  {
    id: 'portada',
    nombre: 'Portada',
    segundos: 35,
    notas: [
      'Mientras entra la gente: dejar la antesala en pantalla (la ciudad dibujada con sus choques y el ritmo en vivo según el modelo).',
      'Para arrancar: tocar "Comenzar con sonido" (el audio solo arranca con un clic). Corre la intro (~21 s): el video de la avenida con los créditos, lluvia y música de suspenso que crecen y, en el segundo 13, el auto que choca contra la pantalla y la rompe. I la repite para ensayar, Esc la saltea.',
      'No hablar durante el choque ni durante el alejamiento: el silencio es parte del efecto. El punto del impacto es un siniestro real del dataset (martes, 22 h, con tormenta).',
      'Cuando la cámara termina de alejarse y aparece la pregunta: presentarse y lanzarla en voz alta, sin responderla: "¿La lluvia nos hace más cuidadosos?".',
      'Tocar "Empezar".',
    ],
  },
  {
    id: 'ciudad',
    nombre: 'El pulso',
    segundos: 40,
    notas: [
      'Fuente: BA Data, siniestros con víctimas 2019–2025. 65.818 registros, 62.737 con coordenadas y hora válidas.',
      'El reloj recorre las 24 horas de un día: se encienden los siniestros de cada hora y el mapa pasa de noche a día.',
      'Dos ideas: las avenidas y autopistas dibujan el mapa (el dónde) y la hora marca el ritmo (el cuándo). A las 4 de la mañana hay diez veces menos siniestros que a las 17.',
      'Anticipar: al final vamos a ver que el dónde y el cuándo explican casi todo el modelo.',
    ],
  },
  {
    id: 'crudos',
    nombre: 'Antes del modelo',
    segundos: 60,
    notas: [
      'Antes del modelo: el tablero de Power BI con los datasets tal como vienen (siniestros de BA Data y clima de Open-Meteo).',
      'Mostrar dos o tres indicadores y no más: la idea es que vean el material de partida, no recorrer todo el tablero.',
      'Antes de presentar: abrir el reporte en el navegador de la notebook e iniciar sesión en Power BI; si no, el recuadro pide credenciales.',
      'Después de tocar el reporte, sacar el mouse del recuadro para que vuelvan a andar el clicker y las flechas (o usar el botón de abajo).',
    ],
  },
  {
    id: 'pregunta',
    nombre: 'La pregunta',
    segundos: 60,
    notas: [
      'Pedir que escaneen el QR y voten. Esperar a que se muevan las barras.',
      'Mientras votan: cruzamos cada siniestro con el clima horario de Open-Meteo (reanálisis ERA5) del punto más cercano.',
      'No revelar nada todavía. Avanzar cuando la votación se estabilice.',
    ],
  },
  {
    id: 'sol',
    nombre: 'Sale el sol',
    segundos: 25,
    notas: [
      'Mapa del modelo LightGBM: riesgo previsto por celda H3 de ~350 m para un martes a las 14 h despejado.',
      'Rojo = varias veces el promedio de la ciudad. Es la línea de base para comparar.',
    ],
  },
  {
    id: 'lluvia',
    nombre: 'Empieza a llover',
    segundos: 40,
    notas: [
      'Revelar el resultado de la votación (aparece abajo de la cifra). Señalar el cielo gris: todavía es de día.',
      'De día con lluvia hay 16 % menos siniestros que en horas despejadas comparables (misma zona, año, hora y tipo de día). IC 95 %: 13 % a 18 % menos.',
      'Explicación: baja la exposición. Caen ciclistas (−31 %) y motociclistas (−20 %): sale menos gente, no son calles más seguras.',
    ],
  },
  {
    id: 'noche',
    nombre: 'Se hace de noche',
    segundos: 40,
    notas: [
      'Dejar correr la transición de las 14 a las 22 h: el giro de la historia.',
      'De noche con lluvia: +9 %. El efecto cambia de signo.',
      'Suben peatones (+32 %) y ocupantes de autos (+28 %): tránsito imprescindible, poca visibilidad, asfalto mojado.',
      'El modelo aprendió esta inversión solo, sin que se la indiquemos.',
    ],
  },
  {
    id: 'tormenta',
    nombre: 'Tormenta',
    segundos: 35,
    notas: [
      'Martes 22 h con tormenta: +56 % (35 observados contra 22,5 esperados). La combinación de clima más riesgosa de la semana.',
      'Intervalo amplio porque hay pocos casos: decirlo.',
      'Nombrar las 3 zonas que aparecen en pantalla.',
    ],
  },
  {
    id: 'patron',
    nombre: 'El patrón',
    segundos: 45,
    notas: [
      'Este es el hallazgo central: el efecto de la lluvia cambia de signo según la hora.',
      'Las líneas son lo que aprendió el modelo, hora por hora. Las marcas con barras son lo observado en los datos por franja, con intervalo de confianza del 95 %.',
      'De día la lluvia queda debajo de "igual" (menos siniestros); de noche, arriba. Con tormenta el pico está a las 22 h.',
      'El modelo encontró la inversión solo, sin que se la indiquemos: por eso confiamos en el patrón.',
    ],
  },
  {
    id: 'respuesta',
    nombre: 'La respuesta',
    segundos: 35,
    notas: [
      'Volver a la pregunta del título y responderla en una frase: de día, sí; de noche, no.',
      'De día la lluvia saca gente de la calle (−16 %); de noche queda el tránsito imprescindible, con poca visibilidad y asfalto mojado (+9 %; con tormenta a las 22 h, +56 %).',
      'Recordar la votación que aparece en pantalla: los dos bandos tenían razón, depende de la hora.',
      'Puente: "¿Y podemos confiar en el modelo?".',
    ],
  },
  {
    id: 'acierta',
    nombre: '¿El modelo acierta?',
    segundos: 40,
    notas: [
      'Validación temporal: entrenado con 2019–2023, evaluado con 2024–2025, que el modelo nunca vio.',
      'El 10 % de zonas-hora que marca como más riesgosas concentra el 40 % de los siniestros reales.',
      'Contra el mapa clásico de puntos calientes (33 %), sumar hora, día y clima mejora la captura.',
      'Comparar con Poisson y Random Forest si preguntan: rinden parecido; LightGBM gana por poco.',
    ],
  },
  {
    id: 'datos',
    nombre: 'Los datos',
    segundos: 50,
    parte: 'tecnica',
    notas: [
      'Pasamos a la parte técnica. Tres fuentes abiertas y una cuarta en análisis.',
      'Siniestros: BA Data, 65.818 registros 2019–2025; descartamos los que no tienen coordenadas dentro de CABA o fecha/hora válida (quedan 62.737).',
      'Clima: Open-Meteo histórico (reanálisis ERA5), por hora, en 4 puntos de la ciudad; cada siniestro toma el punto más cercano.',
      'Ciudad: comunas de BA Data y red vial de OpenStreetMap sobre una grilla H3 de 2.860 hexágonos.',
    ],
  },
  {
    id: 'pipeline',
    nombre: 'El pipeline',
    segundos: 50,
    parte: 'tecnica',
    notas: [
      'Un script por paso, todo reproducible (README).',
      'La clave del paso 6: la ciudad tiene 175 M de celda-horas y solo 62 mil con siniestro. Diseño caso-control: guardamos todas las horas con siniestro y una muestra de las sin siniestro, con peso 35,1 para que las sumas reproduzcan la ciudad entera.',
      'El historial de cada celda se calcula sin el año de la fila (leave-one-year-out) para que el modelo no vea su propio objetivo.',
    ],
  },
  {
    id: 'modelo',
    nombre: 'El modelo',
    segundos: 55,
    parte: 'tecnica',
    notas: [
      'Regresión de Poisson: cantidad de siniestros con víctimas por celda y hora.',
      'Validación temporal: entrenamos con 2019–2023 y evaluamos con 2024–2025. El early stopping usa 2023, dentro del entrenamiento.',
      'Los tres modelos rinden parecido; LightGBM gana por poco. La regresión de Poisson es casi tan buena y es la que conviene para explicar efectos.',
      'SHAP: lo que más pesa es dónde (historial de la celda y sus vecinas, avenidas) y cuándo (hora, día). El clima suma poco, pero cambia de signo según la hora.',
    ],
  },
  {
    id: 'limites',
    nombre: 'Límites y próximos pasos',
    segundos: 45,
    parte: 'tecnica',
    notas: [
      'Ser honestos con las limitaciones: sin datos de exposición, ERA5 aproximado, solo siniestros con víctimas.',
      'Próximo paso concreto: cruzar los siniestros nocturnos con lluvia con el dataset de alumbrado LED de BA Data (luminarias por km de calle en cada hexágono).',
    ],
  },
  {
    id: 'ahora',
    nombre: 'Ahora mismo',
    segundos: 45,
    notas: [
      'Clima real de este momento según el pronóstico. Si llueve afuera, llueve en la pantalla.',
      'Cierre: el clima pesa 4 % del modelo; el dónde (57 %) y el cuándo (39 %) mandan. El clima no crea el riesgo, lo cambia de horario.',
      'Tocar "Explorar todo" para pasar a la app y responder preguntas en el mapa ("¿y mi barrio?").',
      'Limitaciones si queda tiempo: sin datos de tránsito (exposición), ERA5 de ~25 km, solo siniestros con víctimas.',
    ],
  },
]
