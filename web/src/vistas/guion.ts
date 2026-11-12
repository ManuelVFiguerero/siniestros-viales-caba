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
      'Puente a la parte técnica: "¿Cómo llegamos a esto? Primero, los datos".',
    ],
  },
  {
    id: 'datos',
    nombre: 'Los datos',
    segundos: 90,
    parte: 'tecnica',
    notas: [
      'Pasamos a la parte técnica. Siniestros: Excel de BA Data con 65.818 filas y 21 columnas, una fila por siniestro (2019–2025).',
      'Duplicados: verificamos id_siniestro y filas idénticas. Hubo 0 duplicados, así que no se eliminó ninguno.',
      'Sin ubicación: 3.031 siniestros sin latitud o longitud (vacías o cargadas como "SD" / "sd"). Se descartan porque no se pueden asignar a ninguna zona.',
      'Coordenadas fuera de CABA: aplicamos un filtro por rectángulo de la ciudad (lat −34,71 a −34,52; lon −58,54 a −58,33) para detectar coordenadas mal cargadas. Lo corrimos y no encontró ninguna: todas las que tenían coordenadas caían en CABA.',
      'Fechas y horas: las fechas venían en formatos mezclados ("2019-01-01" y "2025-9-9") y se parsearon con un formato flexible. 81 siniestros sin hora (vacía o "SD") se descartan. También se invalidan las horas que no existen por el cambio de horario (no apareció ninguna).',
      'Resultado: 3.081 descartados (4,7 %) y quedan 62.737.',
      'Faltantes codificados como texto: en las columnas numéricas, "SD" pasa a nulo (por ejemplo, 3.276 sin cantidad de víctimas; esa columna no entra al modelo). En las categóricas, "SD" pasa a la categoría "SIN DATO" (10.928 en modo de desplazamiento), para no perder el siniestro.',
      'Normalización de texto: gravedad, modo y tipo de vía en mayúsculas y sin espacios sobrantes; la comuna "Comuna 4" pasa a 4.',
      'Outliers: no sacamos siniestros por tener muchas víctimas ni por estar en zonas con muchos casos, porque el objetivo es contarlos. Los outliers reales eran de ubicación, y ese filtro no encontró ninguno.',
      'Clima: Open-Meteo histórico (reanálisis ERA5), hora por hora, en 4 puntos de la ciudad (uno por cuadrante, porque ERA5 tiene celdas de ~25 km). Cada siniestro toma el clima del punto más cercano en su hora.',
      'Condición del clima con reglas, porque ERA5 no trae códigos de tormenta ni de niebla: tormenta con ≥ 4 mm/h, o ≥ 1 mm/h con ráfagas ≥ 55 km/h; lluvia con ≥ 0,5 mm/h; niebla con humedad ≥ 97 %, viento < 8 km/h y sin lluvia; nublado con ≥ 70 % de nubosidad.',
      'Ciudad: comunas de BA Data y red vial de OpenStreetMap (autopistas, avenidas, calles terciarias). No usan los siniestros, así que no pueden filtrar el objetivo.',
    ],
  },
  {
    id: 'pipeline',
    nombre: 'El pipeline',
    segundos: 90,
    parte: 'tecnica',
    notas: [
      'Un script de Python por paso, todo reproducible desde el README (pandas, H3, scikit-learn, LightGBM, SHAP).',
      'Unidad de análisis: celda H3 × hora. Partimos la ciudad en 2.860 hexágonos de ~350 m: es una discretización espacial (clase 11), pasar de coordenadas continuas a zonas comparables.',
      'Target: y = cantidad de siniestros con víctimas en esa celda en esa hora. Es un conteo, así que el problema es de regresión de Poisson y no de clasificación.',
      'Desbalance extremo: 175,5 M celda-horas y solo 62 mil con siniestro (0,04 %). Diseño caso-control: guardamos todas las celda-horas con siniestro y 5 M sin siniestro sorteadas al azar, cada una con peso 35,1. Así 5,06 M filas representan la ciudad entera sin sesgar las tasas.',
      '22 features en tres grupos. Zona: historial de la celda y de sus 6 vecinas, km de autopista, avenida y terciaria, vías que se cruzan, comuna y coordenadas. Momento: hora, día, mes, feriado y cuarentena 2020. Clima: lluvia de la hora y de las 3 h previas, temperatura, humedad, viento, ráfagas, nubosidad y niebla.',
      'Features creadas (feature engineering, clase 11): lluvia acumulada de las 3 h previas (la calzada sigue mojada), feriados de Argentina, y una marca de cuarentena estricta (20/3 al 8/11/2020) para que el modelo no atribuya la caída de 2020 al clima.',
      'Data leakage (clase 11): el historial de la celda funciona como un target encoding. Si se calcula con todos los años, cada fila "ve" su propio target. Por eso se calcula sin el año de la fila (leave-one-year-out), y para el test solo con años de entrenamiento.',
      'Codificación: en la regresión de Poisson, One-Hot de hora × tipo de día, día, mes, comuna y condición, con una categoría de referencia para evitar la dummy trap (hábil 8 h, lunes, enero, comuna 1, despejado). Además, logaritmo de las variables muy asimétricas (historial y km de vías).',
      'En los modelos de árboles no hace falta escalar ni One-Hot, porque cortan cada variable por separado; LightGBM usa la comuna como categórica nativa.',
    ],
  },
  {
    id: 'modelo',
    nombre: 'El modelo',
    segundos: 110,
    parte: 'tecnica',
    notas: [
      'Split temporal, no aleatorio: un train_test_split mezcla las filas y el modelo "vería el futuro" (por ejemplo, una esquina que empeora en 2024). Cortamos por fecha.',
      'Train: 2019–2023 (41.560 siniestros, 66 %). Test: 2024–2025 (21.177, 34 %), dos años completos que el modelo nunca vio.',
      'Validation: 2023, dentro del train. LightGBM se entrena con 2019–2022 y frena cuando el error en 2023 deja de mejorar (early stopping: 415 árboles). Después se reentrena con 2019–2023 con esa cantidad de árboles.',
      'Proporciones efectivas: 54 % train, 15 % validación y 34 % test (en clase vimos 70/15/15; el test es más grande porque quisimos dos años completos, con todas sus estaciones).',
      'No usamos K-Fold: en datos temporales mezclar los folds filtra el futuro. La alternativa correcta es una validación cruzada temporal (ventanas que avanzan), que queda como mejora.',
      'Por qué tres modelos: cubren el trade-off bias-variance de la clase 11, de lo más simple e interpretable a lo más flexible, y así comparamos qué aporta cada nivel de complejidad.',
      '1) Regresión de Poisson (modelo lineal generalizado con enlace log). Alto bias y baja varianza, pero interpretable: cada coeficiente es una razón de tasas (por ejemplo, lluvia −11 % frente a despejado). Es Poisson y no lineal porque el target es un conteo ≥ 0 y muy asimétrico: una lineal predeciría valores negativos, como la recta del ejemplo de la logística en la clase 12.',
      '2) Random Forest: promedia 200 árboles de regresión (clase 12) con criterio Poisson. Capta no linealidades e interacciones sin pedírselas, y promediar baja la varianza. Pre-pruning: profundidad máxima 18 y hojas de al menos 2.000 filas; con hojas chicas memorizaba celdas con 1 o 2 siniestros (overfitting). Por costo, se entrenó con todos los positivos y 1,2 M ceros.',
      '3) LightGBM: gradient boosting con objetivo Poisson. Árboles en secuencia, cada uno corrige el error del anterior; con 5 M filas es rápido y suele ganar. Regularización: early stopping, mínimo 300 filas por hoja, 80 % de filas y features por árbol, y L2.',
      'Métricas en test: AUC, captura al 10 % y deviance explicada (D²), que es el equivalente del R² para Poisson (1 − deviance del modelo / deviance de predecir siempre la media). LightGBM: AUC 0,797, D² 8,2 %, captura 40,2 %. Poisson: 0,793, 7,9 %, 39,9 %. Random Forest: 0,787, 7,4 %, 39,0 %.',
      'Si preguntan por el D² bajo: es normal en eventos raros. Que haya o no un siniestro en una celda en una hora concreta es casi azar; lo que el modelo sí logra es ordenar bien qué zonas y horas son más riesgosas.',
      'Elección: LightGBM para el mapa (gana en todas las métricas) y Poisson para explicar efectos. Para la web se reentrenó con 2019–2025 (581 árboles) con los mismos hiperparámetros.',
      'SHAP (cuánto aporta cada variable a cada predicción): dónde 57 %, cuándo 39 %, clima 4 %. El clima pesa poco, pero cambia de signo según la hora.',
    ],
  },
  {
    id: 'acierta',
    nombre: '¿El modelo acierta?',
    segundos: 70,
    notas: [
      'Puente desde "El modelo": ya vimos cómo se entrenó; ahora, ¿acierta con datos que nunca vio?',
      'Qué medimos: el modelo estima cuántos siniestros esperar en cada celda-hora. Ordenamos todas las celda-horas de 2024–2025 de mayor a menor riesgo y contamos cuántos siniestros reales cayeron en el 10 % de arriba: el 40 % (captura al 10 %).',
      'Test set honesto: 2024–2025 no se usó ni para entrenar ni para elegir la cantidad de árboles. Se evaluó una sola vez, al final (el "examen final" de la clase 9).',
      'Por qué no accuracy: el 99,96 % de las celda-horas no tiene ningún siniestro. Un modelo que siempre dice "no pasa nada" tendría 99,96 % de accuracy y no serviría para nada: es el ejemplo del fraude de la clase 9 (clases desbalanceadas).',
      'AUC 0,797: si tomamos al azar una celda-hora con siniestro y otra sin, el modelo le da más riesgo a la que tuvo el siniestro 8 de cada 10 veces. No depende de ningún umbral; 0,5 sería tirar una moneda.',
      'Línea de base (como el DummyClassifier de la clase 9): el mapa clásico de puntos calientes, que solo mira el historial de la celda, captura 33 % con AUC 0,745. Sumar hora, día y clima lleva la captura a 40 %.',
      'Si preguntan por los otros modelos: Poisson 39,9 % y Random Forest 39,0 %. Rinden parecido; LightGBM gana por poco.',
    ],
  },
  {
    id: 'limites',
    nombre: 'Límites y próximos pasos',
    segundos: 60,
    parte: 'tecnica',
    notas: [
      'Exposición: no sabemos cuánta gente circula. "Menos siniestros con lluvia" puede ser menos tránsito y no calles más seguras.',
      'Clima aproximado: ERA5 tiene celdas de ~25 km; una tormenta localizada puede no aparecer en el dato.',
      'Solo siniestros con víctimas: los choques sin heridos no están, y con lluvia los leves podrían denunciarse menos.',
      'Drift: los siniestros crecieron (2025 es el año récord, 11.097 frente a ~9.600 en 2019 y 2023). El modelo subestima ~15 % el total de 2024–2025: ordena bien el riesgo, pero el nivel general quedó corto.',
      'Honestidad metodológica: los hiperparámetros del Random Forest (hojas de ≥ 2.000 filas) se ajustaron mirando el test, así que su métrica es levemente optimista. Con una validación temporal aparte no pasaría.',
      'Faltantes: descartamos el 4,7 % por no tener ubicación u hora. Si esos faltantes se concentraran en ciertas zonas, habría un sesgo.',
      'Próximos pasos: alumbrado LED de BA Data (luminarias por km en cada hexágono) para el +9 % nocturno con lluvia; conteos vehiculares para medir la exposición; dataset de víctimas (edad, rol); y validación cruzada temporal.',
    ],
  },
  {
    id: 'ahora',
    nombre: 'Ahora mismo',
    segundos: 50,
    notas: [
      'Clima real de este momento según el pronóstico de Open-Meteo, clasificado con las mismas reglas que el entrenamiento. Si llueve afuera, llueve en la pantalla.',
      'El riesgo sale del modelo final (entrenado con 2019–2025). La web no corre el modelo en vivo: usa 840 escenarios precalculados (5 climas × 7 días × 24 horas), con valores típicos de clima para cada hora.',
      'Cierre: el clima pesa 4 % del modelo; el dónde (57 %) y el cuándo (39 %) mandan. El clima no crea el riesgo, lo cambia de horario.',
      'Tocar "Explorar todo" para pasar a la app y responder preguntas en el mapa ("¿y mi barrio?").',
    ],
  },
]
