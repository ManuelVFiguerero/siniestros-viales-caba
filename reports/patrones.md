# Patrones del modelo de riesgo

Cada patrón se contrasta con los datos observados: razón observados / esperados frente a horas comparables (misma zona de clima, año, hora y tipo de día), con IC 95 %. Se excluye la cuarentena estricta de 2020.

Figuras: `figuras/patron_lluvia_hora.png`, `figuras/patron_victimas_lluvia.png`.

## 1. La lluvia baja los siniestros de día y los sube de noche

*Confirmado en los datos*

Entre las 7 y las 20 h, una hora con lluvia tiene −16 % siniestros que una despejada comparable; entre las 21 y las 6 h, +9 %. Con tormenta: −13 % de día y +19 % de noche. El modelo aprendió la misma inversión sin que nadie se la indicara.

**Lectura:** De día la lluvia saca gente de la calle (sobre todo ciclistas y motociclistas): menos exposición. De noche el tránsito es el imprescindible y se suma poca visibilidad sobre asfalto mojado.

## 2. Una tormenta un martes a las 22 h es de lo más peligroso del clima

*Confirmado en los datos*

En días hábiles entre las 21 y las 23 h, las horas de tormenta tienen +56 % siniestros (35 observados contra 22 esperados). El modelo predice +27 %.

**Lectura:** Es la combinación de clima más riesgosa de toda la semana: el regreso nocturno con calzada inundada y poca visibilidad.

## 3. Con lluvia cambia quién se lastima

*Confirmado en los datos*

De día, con lluvia, caen los siniestros con ciclistas (−31 %) y motociclistas (−20 %). De noche suben los de peatones (+32 %) y ocupantes de autos (+28 %).

**Lectura:** Explica el patrón anterior: el descenso diurno es menos gente en bici y moto, no calles más seguras. Los peatones de noche con lluvia son el grupo a cuidar.

## 4. La primera hora de lluvia protege menos que la lluvia que ya viene cayendo

*Confirmado en los datos*

Cuando empieza a llover tras 3 horas secas: −6 % siniestros frente a despejado. Cuando ya venía lloviendo: −14 %.

**Lectura:** Al comienzo la gente ya salió y la calzada suelta aceite y polvo; con lluvia sostenida, muchos no salen.

## 5. Con mucho frío hay más siniestros, aun comparando el mismo mes y hora

*Confirmado en los datos*

Las horas por debajo de 8 °C tienen +6 % siniestros que horas templadas (14–26 °C) del mismo mes, hora y tipo de día. El calor extremo no muestra efecto.

**Lectura:** Efecto chico pero consistente. Hipótesis: madrugadas heladas, menor visibilidad por empañado y peor adherencia.

## 6. Con tormenta hay menos siniestros leves, pero no menos graves

*Sugerente (intervalo amplio)*

Leves: −9 %. Graves o mortales: +23 %, con un intervalo amplio (0,88–1,71) porque hay pocos casos.

**Lectura:** Si se confirmara con más años, la tormenta no reduce el daño: cambia la mezcla hacia choques más serios.

## 7. Autopistas y grandes avenidas del sur concentran las madrugadas de fin de semana

*Confirmado en los datos*

Para la ciudad típica, una madrugada de sábado o domingo (2–6 h) tiene 21 % del riesgo de una hora hábil diurna. En estas zonas, casi el doble. En los datos, el 4,3 % de sus siniestros cae en esa franja, contra 2,3 % en el resto de la ciudad.

**Lectura:** Corredores de salida y regreso nocturno (Dellepiane, General Paz, 9 de Julio): poco tránsito, más velocidad.

- Au, Teniente Gral, Luis Dellepiane (Comuna 8): 0,48
- Av, Gral, Paz y Av, Coronel Roca (Comuna 8): 0,37
- Carlos Pellegrini y Av, 27 de Febrero (Comuna 8): 0,35
- Av, Gral, Francisco Fernández de La Cruz (Comuna 8): 0,35
- Av, Paseo Colón y Av, Juan de Garay (Comuna 1): 0,35
- Av, Independencia y Av, Entre Ríos (Comuna 1): 0,34

## 8. El domingo el riesgo se muda de los corredores laborales a los de paseo

*Patrón del modelo*

Un domingo de día la ciudad típica tiene 40 % del riesgo de un día hábil. Los corredores de trabajo del oeste (Juan B. Justo, San Martín) caen a un tercio; los Bosques de Palermo y el sur (Comuna 8) conservan más de la mitad.

**Lectura:** El mapa de riesgo no es fijo: cambia según para qué usa la gente la ciudad ese día.

- Av, Juan Bautista Justo y Av, San Martín (Comuna 15): 0,32
- Av, San Martín y Av, Gaona (Comuna 15): 0,32
- Av, Juan Bautista Justo y Av, Corrientes (Comuna 15): 0,32
- Av, Juan Bautista Justo (Comuna 15): 0,32
- Av, San Martín (Comuna 15): 0,32

- Carlos Pellegrini y Av, 27 de Febrero (Comuna 8): 0,62
- Av, Pres, Figueroa Alcorta y Av, Pres, Sarmiento (Comuna 14): 0,58
- Av, Gral, Francisco Fernández de La Cruz (Comuna 8): 0,57
- Av, Escalada y Au, Teniente Gral, Luis Dellepiane (Comuna 8): 0,56
- Av, Emilio Castro y Av, Gral, Paz (Comuna 9): 0,55

## 9. Lo que más combina el árbol es la hora con el día y con el lugar

*Patrón del modelo*

La interacción más fuerte es hora × día de la semana: el perfil del día cambia por completo el fin de semana. Le siguen historial × hora: cada zona tiene su propio reloj. La primera interacción con clima aparece recién en el puesto 21 (Siniestros históricos de la celda × Humedad relativa).

**Lectura:** El clima modula el riesgo, pero el 'cuándo' y el 'dónde' lo definen.
