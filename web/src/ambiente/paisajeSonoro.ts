// Paisaje sonoro generado por código con Tone.js: no hay archivos de audio, así el index.html no engorda.
// Capas: lluvia, viento, tránsito (rumor + autos que pasan + bocinas), pájaros, sirena lejana y truenos.
import * as Tone from 'tone'

export interface EstadoSonoro {
  clima: string
  hora: number
  /** 0–1: cuánto tránsito suena (se liga a los siniestros esperados de esa hora). */
  transito: number
  /** 0–1: intensidad de la lluvia (por defecto la típica del clima). */
  lluvia?: number
  sirena?: boolean
  /** true: todo el ambiente en silencio (por ejemplo, durante la intro, que trae su propio sonido). */
  silencio?: boolean
}

const azar = (a: number, b: number) => a + Math.random() * (b - a)

class Paisaje {
  private listo = false
  private iniciando: Promise<void> | null = null
  private estado: EstadoSonoro = { clima: 'despejado', hora: 12, transito: 0.5 }
  private timers: ReturnType<typeof setTimeout>[] = []

  private maestro!: Tone.Volume
  private reverb!: Tone.Reverb
  private lluviaGain!: Tone.Gain
  private goteoGain!: Tone.Gain
  private vientoGain!: Tone.Gain
  private rumorGain!: Tone.Gain
  private autos: { filtro: Tone.Filter; panner: Tone.Panner; gain: Tone.Gain }[] = []
  private bocina!: { oscs: Tone.Oscillator[]; gain: Tone.Gain }
  private pajaro!: { osc: Tone.Oscillator; gain: Tone.Gain; panner: Tone.Panner }
  private sirena!: { gain: Tone.Gain; panner: Tone.Panner }
  private truenoGain!: Tone.Gain
  private truenoFiltro!: Tone.Filter
  private crujidoGain!: Tone.Gain
  private sirenaSonando = false

  get activo() {
    return this.listo
  }

  /** Debe llamarse desde un clic o una tecla: los navegadores no dejan sonar audio sin un gesto del usuario. */
  iniciar(): Promise<void> {
    if (this.listo) return Promise.resolve()
    if (!this.iniciando) {
      this.iniciando = Tone.start().then(() => {
        this.construir()
        this.listo = true
        this.aplicar(true)
        this.programar()
      })
    }
    return this.iniciando
  }

  private construir() {
    const comp = new Tone.Compressor(-18, 3).toDestination()
    this.maestro = new Tone.Volume(-4).connect(comp)
    this.reverb = new Tone.Reverb({ decay: 3.5, wet: 0.35 }).connect(this.maestro)

    // Lluvia: ruido rosa filtrado + un "goteo" crepitante de ruido blanco modulado.
    this.lluviaGain = new Tone.Gain(0).connect(this.maestro)
    new Tone.Noise('pink').connect(new Tone.Filter(450, 'highpass').connect(new Tone.Filter(6500, 'lowpass').connect(this.lluviaGain))).start()
    this.goteoGain = new Tone.Gain(0).connect(this.maestro)
    const goteoMod = new Tone.Gain(0).connect(this.goteoGain)
    new Tone.Noise('white').connect(new Tone.Filter(2800, 'bandpass').connect(goteoMod)).start()
    new Tone.LFO({ frequency: 17, min: 0, max: 0.6, type: 'sawtooth' }).connect(goteoMod.gain).start()

    // Viento: ruido marrón con un filtro que barre despacio.
    this.vientoGain = new Tone.Gain(0).connect(this.maestro)
    const barrido = new Tone.AutoFilter({ frequency: 0.07, baseFrequency: 180, octaves: 3.2, type: 'sine' }).connect(this.vientoGain).start()
    new Tone.Noise('brown').connect(barrido).start()

    // Tránsito: rumor grave de fondo.
    this.rumorGain = new Tone.Gain(0).connect(this.maestro)
    new Tone.Noise('brown').connect(new Tone.Filter(240, 'lowpass').connect(this.rumorGain)).start()

    // Autos que pasan: dos voces de ruido con filtro (efecto Doppler) y paneo de un lado al otro.
    for (let i = 0; i < 2; i++) {
      const gain = new Tone.Gain(0).connect(this.maestro)
      const panner = new Tone.Panner(0).connect(gain)
      const filtro = new Tone.Filter(700, 'bandpass', -24).connect(panner)
      filtro.Q.value = 0.9
      new Tone.Noise('pink').connect(filtro).start()
      this.autos.push({ filtro, panner, gain })
    }

    // Bocina: dos osciladores cuadrados (los colectivos suenan así de desafinados).
    const gBocina = new Tone.Gain(0).connect(this.reverb)
    const fBocina = new Tone.Filter(1800, 'lowpass').connect(gBocina)
    this.bocina = { gain: gBocina, oscs: [new Tone.Oscillator(392, 'square').connect(fBocina).start(), new Tone.Oscillator(466, 'square').connect(fBocina).start()] }

    // Pájaros: un seno con saltos rápidos de frecuencia.
    const gPajaro = new Tone.Gain(0)
    const pPajaro = new Tone.Panner(0).connect(this.reverb)
    gPajaro.connect(pPajaro)
    this.pajaro = { osc: new Tone.Oscillator(3000, 'sine').connect(gPajaro).start(), gain: gPajaro, panner: pPajaro }

    // Sirena lejana: triángulo que sube y baja, con mucha reverberación.
    const gSirena = new Tone.Gain(0)
    const pSirena = new Tone.Panner(-0.6).connect(this.reverb)
    gSirena.connect(pSirena)
    const oSirena = new Tone.Oscillator(800, 'triangle').connect(new Tone.Filter(2200, 'lowpass').connect(gSirena)).start()
    new Tone.LFO({ frequency: 0.28, min: 620, max: 1250 }).connect(oSirena.frequency).start()
    this.sirena = { gain: gSirena, panner: pSirena }

    // Trueno: estallido de ruido marrón muy filtrado + crujido inicial.
    this.truenoGain = new Tone.Gain(0).connect(this.reverb)
    this.truenoFiltro = new Tone.Filter(160, 'lowpass', -24).connect(this.truenoGain)
    new Tone.Noise('brown').connect(this.truenoFiltro).start()
    this.crujidoGain = new Tone.Gain(0).connect(this.maestro)
    new Tone.Noise('white').connect(new Tone.Filter(1200, 'lowpass').connect(this.crujidoGain)).start()
  }

  set(estado: EstadoSonoro) {
    this.estado = estado
    if (this.listo) this.aplicar(false)
  }

  private niveles() {
    const { clima, hora, transito, lluvia, silencio } = this.estado
    if (silencio) return { lluvia: 0, viento: 0, transito: 0, pajaros: 0, mudo: true }
    const lluviaBase = clima === 'tormenta' ? 1 : clima === 'lluvia' ? 0.55 : 0
    const ll = lluviaBase > 0 ? (lluvia ?? lluviaBase) : 0
    const dia = hora >= 6.5 && hora < 20
    return {
      lluvia: ll,
      viento: clima === 'tormenta' ? 0.9 : clima === 'niebla' ? 0.25 : clima === 'nublado' ? 0.2 : 0.05,
      transito: Math.min(1, Math.max(0.05, transito)) * (clima === 'niebla' ? 0.8 : 1),
      pajaros: dia && (clima === 'despejado' || clima === 'nublado') ? (clima === 'despejado' ? 1 : 0.4) : 0,
      mudo: false,
    }
  }

  private aplicar(inmediato: boolean) {
    const n = this.niveles()
    const t = inmediato ? 0.4 : 1.8
    this.lluviaGain.gain.rampTo(0.55 * n.lluvia, t)
    this.goteoGain.gain.rampTo(0.12 * n.lluvia, t)
    this.vientoGain.gain.rampTo(0.5 * n.viento, t)
    this.rumorGain.gain.rampTo(n.mudo ? 0 : 0.22 + 0.5 * n.transito, t)
    const quiere = !!this.estado.sirena && !n.mudo
    if (quiere !== this.sirenaSonando) {
      this.sirenaSonando = quiere
      this.sirena.gain.gain.rampTo(quiere ? 0.05 : 0, quiere ? 4 : 2)
    }
  }

  /** Bucles aleatorios: autos, bocinas y pájaros, con frecuencia según el estado actual. */
  private programar() {
    const bucle = (fn: () => number) => {
      const paso = () => {
        const espera = fn()
        this.timers.push(setTimeout(paso, espera))
      }
      this.timers.push(setTimeout(paso, 800))
    }
    let voz = 0
    bucle(() => {
      const n = this.niveles()
      if (n.mudo) return 2000
      const a = this.autos[voz++ % this.autos.length]
      const ahora = Tone.now()
      const dur = azar(1.6, 3.2)
      const desde = Math.random() < 0.5 ? -0.9 : 0.9
      const mojado = n.lluvia > 0
      a.panner.pan.setValueAtTime(desde, ahora)
      a.panner.pan.linearRampToValueAtTime(-desde, ahora + dur)
      a.filtro.frequency.setValueAtTime(mojado ? 2600 : 900, ahora)
      a.filtro.frequency.exponentialRampToValueAtTime(mojado ? 1500 : 380, ahora + dur)
      const pico = (0.25 + 0.35 * n.transito) * azar(0.5, 1)
      a.gain.gain.cancelScheduledValues(ahora)
      a.gain.gain.setValueAtTime(0, ahora)
      a.gain.gain.linearRampToValueAtTime(pico, ahora + dur * 0.48)
      a.gain.gain.linearRampToValueAtTime(0, ahora + dur)
      return azar(700, 2600) / (0.25 + n.transito)
    })
    bucle(() => {
      const n = this.niveles()
      if (!n.mudo && Math.random() < 0.55 * n.transito) {
        const ahora = Tone.now()
        const largo = azar(0.12, 0.45)
        const veces = Math.random() < 0.3 ? 2 : 1
        for (let k = 0; k < veces; k++) {
          const t0 = ahora + k * (largo + 0.12)
          this.bocina.gain.gain.setValueAtTime(0, t0)
          this.bocina.gain.gain.linearRampToValueAtTime(0.035, t0 + 0.02)
          this.bocina.gain.gain.setValueAtTime(0.035, t0 + largo)
          this.bocina.gain.gain.linearRampToValueAtTime(0, t0 + largo + 0.05)
        }
      }
      return azar(4000, 11000)
    })
    bucle(() => {
      const n = this.niveles()
      if (n.pajaros > 0) {
        const ahora = Tone.now()
        const notas = Math.round(azar(3, 7))
        const base = azar(2400, 4200)
        this.pajaro.panner.pan.setValueAtTime(azar(-0.8, 0.8), ahora)
        for (let k = 0; k < notas; k++) {
          const t0 = ahora + k * azar(0.09, 0.16)
          const f = base * azar(0.85, 1.25)
          this.pajaro.osc.frequency.setValueAtTime(f, t0)
          this.pajaro.osc.frequency.exponentialRampToValueAtTime(f * azar(1.15, 1.5), t0 + 0.06)
          this.pajaro.gain.gain.setValueAtTime(0, t0)
          this.pajaro.gain.gain.linearRampToValueAtTime(0.022 * n.pajaros, t0 + 0.015)
          this.pajaro.gain.gain.linearRampToValueAtTime(0, t0 + 0.075)
        }
      }
      return azar(1800, 6000)
    })
  }

  /** Trueno: cercania 0–1 (más cerca = antes, más fuerte y con crujido). */
  trueno(cercania = 0.5) {
    if (!this.listo) return
    const retraso = 0.25 + (1 - cercania) * 1.8
    const t0 = Tone.now() + retraso
    const fuerza = 0.5 + cercania * 0.6
    const dur = azar(2.8, 4.8)
    this.truenoFiltro.frequency.setValueAtTime(cercania > 0.6 ? 420 : 220, t0)
    this.truenoFiltro.frequency.exponentialRampToValueAtTime(90, t0 + dur)
    const g = this.truenoGain.gain
    g.cancelScheduledValues(t0)
    g.setValueAtTime(0, t0)
    g.linearRampToValueAtTime(1.6 * fuerza, t0 + 0.08)
    // Retumbos: el trueno no se apaga parejo.
    for (let k = 1; k <= 4; k++) g.linearRampToValueAtTime(fuerza * azar(0.5, 1.3), t0 + (dur * k) / 6)
    g.linearRampToValueAtTime(0, t0 + dur)
    if (cercania > 0.55) {
      const c = this.crujidoGain.gain
      c.setValueAtTime(0, t0)
      c.linearRampToValueAtTime(0.35 * cercania, t0 + 0.01)
      c.exponentialRampToValueAtTime(0.0001, t0 + 0.35)
    }
  }

  setMute(mute: boolean) {
    Tone.getDestination().mute = mute
  }
}

export const paisaje = new Paisaje()
