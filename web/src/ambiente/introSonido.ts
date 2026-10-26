// Sonido de la intro (música original de suspenso + motor, bocina, frenada y choque), generado con Tone.js.
// La música es propia: un ostinato en re menor con bronces y percusión, sin citar ninguna banda sonora.
import * as Tone from 'tone'

export interface SonidoIntro {
  /** Arranca la música y el motor lejano. */
  empezar: () => void
  /** Golpe de bronces (para cada nombre de los créditos). */
  golpe: (k: number) => void
  /** 0–1: cercanía del auto (motor más fuerte y agudo). */
  acercar: (p: number) => void
  bocina: () => void
  frenada: () => void
  /** Impacto: corta la música y queda en silencio. */
  choque: () => void
  /** Corta todo de inmediato (saltar la intro). */
  detener: () => void
}

const ACORDES = [
  ['D3', 'F3', 'A3', 'E4'],
  ['Bb2', 'D3', 'F3', 'C4'],
  ['G2', 'Bb2', 'D3', 'A3'],
  ['A2', 'C#3', 'E3', 'G3'],
]

export function crearSonidoIntro(): SonidoIntro {
  const salida = new Tone.Volume(-6).toDestination()
  const sala = new Tone.Reverb({ decay: 2.8, wet: 0.25 }).connect(salida)
  const musica = new Tone.Volume(-4).connect(sala)
  const nodos: { dispose: () => void }[] = [salida, sala, musica]

  // Bajo: ostinato en corcheas.
  const bajo = new Tone.MonoSynth({
    oscillator: { type: 'sawtooth' },
    filter: { Q: 2, type: 'lowpass', rolloff: -24 },
    envelope: { attack: 0.005, decay: 0.15, sustain: 0.4, release: 0.1 },
    filterEnvelope: { attack: 0.005, decay: 0.12, sustain: 0.3, baseFrequency: 120, octaves: 2.6 },
  }).connect(musica)
  bajo.volume.value = -8
  const lineaBajo = ['D2', 'D2', 'A2', 'D2', 'F2', 'D2', 'G2', 'E2', 'D2', 'D2', 'A2', 'D2', 'Bb1', 'C2', 'C#2', 'D2']
  const secuencia = new Tone.Sequence((t, nota) => bajo.triggerAttackRelease(nota, '16n', t), lineaBajo, '8n')

  // Colchón de cuerdas que crece.
  const colchon = new Tone.PolySynth(Tone.Synth, { oscillator: { type: 'fatsawtooth', count: 3, spread: 24 }, envelope: { attack: 2.5, decay: 0, sustain: 1, release: 1.2 } })
  const filtroColchon = new Tone.Filter(600, 'lowpass').connect(musica)
  colchon.connect(filtroColchon)
  colchon.volume.value = -22

  // Percusión: hi-hat de ruido en semicorcheas con acentos, y un bombo en negras.
  const hat = new Tone.NoiseSynth({ noise: { type: 'white' }, envelope: { attack: 0.001, decay: 0.04, sustain: 0 } })
  hat.connect(new Tone.Filter(7000, 'highpass').connect(musica))
  hat.volume.value = -28
  const bombo = new Tone.MembraneSynth({ pitchDecay: 0.05, octaves: 6, envelope: { attack: 0.001, decay: 0.4, sustain: 0 } }).connect(musica)
  bombo.volume.value = -10
  const ritmo = new Tone.Loop((t) => {
    for (let k = 0; k < 4; k++) hat.triggerAttackRelease('32n', t + k * Tone.Time('16n').toSeconds(), k === 2 ? 1 : 0.45)
    bombo.triggerAttackRelease('D1', '8n', t)
  }, '4n')

  // Bronces: acordes cortos y brillantes.
  const bronces = new Tone.PolySynth(Tone.Synth, { oscillator: { type: 'sawtooth' }, envelope: { attack: 0.02, decay: 0.35, sustain: 0.15, release: 0.4 } })
  bronces.connect(new Tone.Filter(2400, 'lowpass').connect(sala))
  bronces.volume.value = -14

  // Subida de tensión: ruido con filtro que se abre.
  const subida = new Tone.Noise('pink')
  const filtroSubida = new Tone.Filter(300, 'bandpass')
  const gSubida = new Tone.Gain(0).connect(salida)
  subida.connect(filtroSubida)
  filtroSubida.connect(gSubida)

  // Motor: diente de sierra grave con filtro; sube de tono al acercarse.
  const motor = new Tone.Oscillator(55, 'sawtooth')
  const filtroMotor = new Tone.Filter(260, 'lowpass')
  const gMotor = new Tone.Gain(0).connect(salida)
  motor.connect(filtroMotor)
  filtroMotor.connect(gMotor)
  const vibrato = new Tone.LFO({ frequency: 28, min: -40, max: 40 }).connect(motor.detune)

  // Lluvia de fondo.
  const lluvia = new Tone.Noise('pink')
  const gLluvia = new Tone.Gain(0).connect(salida)
  lluvia.connect(new Tone.Filter(5000, 'lowpass').connect(gLluvia))

  // Bocina, frenada y choque.
  const gBocina = new Tone.Gain(0).connect(sala)
  const fBocina = new Tone.Filter(2000, 'lowpass').connect(gBocina)
  const bocinas = [new Tone.Oscillator(370, 'square'), new Tone.Oscillator(440, 'square')]
  bocinas.forEach((o) => o.connect(fBocina))
  const chirrido = new Tone.Noise('white')
  const fChirrido = new Tone.Filter(2900, 'bandpass')
  fChirrido.Q.value = 9
  const gChirrido = new Tone.Gain(0).connect(salida)
  chirrido.connect(fChirrido)
  fChirrido.connect(gChirrido)
  const golpeSeco = new Tone.MembraneSynth({ pitchDecay: 0.08, octaves: 8, envelope: { attack: 0.001, decay: 1.2, sustain: 0 } }).connect(salida)
  golpeSeco.volume.value = 4
  const estruendo = new Tone.NoiseSynth({ noise: { type: 'brown' }, envelope: { attack: 0.001, decay: 1.4, sustain: 0 } }).connect(salida)
  estruendo.volume.value = 2
  const vidrio = new Tone.MetalSynth({ envelope: { attack: 0.001, decay: 0.5, release: 0.2 }, harmonicity: 8.5, modulationIndex: 40, resonance: 5200, octaves: 1.2 })
  vidrio.connect(new Tone.Filter(3500, 'highpass').connect(sala))
  vidrio.volume.value = -14

  nodos.push(bajo, secuencia, colchon, filtroColchon, hat, bombo, ritmo, bronces, subida, filtroSubida, gSubida, motor, filtroMotor, gMotor, vibrato, lluvia, gLluvia, gBocina, fBocina, ...bocinas, chirrido, fChirrido, gChirrido, golpeSeco, estruendo, vidrio)

  const transporte = Tone.getTransport()
  let vivo = true

  const apagarTodo = (rapido: boolean) => {
    if (!vivo) return
    vivo = false
    const t = rapido ? 0.05 : 0.02
    salida.volume.rampTo(-80, t)
    setTimeout(() => {
      transporte.stop()
      transporte.cancel()
      nodos.forEach((n) => n.dispose())
    }, 2600)
  }

  return {
    empezar() {
      transporte.bpm.value = 126
      transporte.position = 0
      secuencia.start(0)
      ritmo.start('2m')
      transporte.start('+0.05')
      colchon.triggerAttack(ACORDES[0])
      filtroColchon.frequency.rampTo(1800, 7)
      lluvia.start()
      gLluvia.gain.rampTo(0.12, 1.5)
      motor.start()
      vibrato.start()
      subida.start()
    },
    golpe(k) {
      if (!vivo) return
      const acorde = ACORDES[k % ACORDES.length]
      bronces.triggerAttackRelease(acorde, '8n')
      colchon.releaseAll()
      colchon.triggerAttack(acorde)
    },
    acercar(p) {
      if (!vivo) return
      motor.frequency.rampTo(50 + p * p * 170, 0.1)
      filtroMotor.frequency.rampTo(220 + p * 2400, 0.1)
      gMotor.gain.rampTo(0.02 + p * p * 0.5, 0.1)
      filtroSubida.frequency.rampTo(300 + p * p * 5000, 0.1)
      gSubida.gain.rampTo(p * p * 0.18, 0.1)
    },
    bocina() {
      if (!vivo) return
      const t = Tone.now()
      bocinas.forEach((o) => o.start(t).stop(t + 0.9))
      gBocina.gain.setValueAtTime(0, t)
      gBocina.gain.linearRampToValueAtTime(0.09, t + 0.02)
      gBocina.gain.setValueAtTime(0.09, t + 0.75)
      gBocina.gain.linearRampToValueAtTime(0, t + 0.85)
    },
    frenada() {
      if (!vivo) return
      const t = Tone.now()
      chirrido.start(t)
      fChirrido.frequency.setValueAtTime(3400, t)
      fChirrido.frequency.exponentialRampToValueAtTime(2100, t + 0.7)
      gChirrido.gain.setValueAtTime(0, t)
      gChirrido.gain.linearRampToValueAtTime(0.35, t + 0.08)
    },
    choque() {
      if (!vivo) return
      const t = Tone.now()
      // La música y el motor cortan en seco: después del golpe, silencio.
      musica.volume.setValueAtTime(-80, t)
      gMotor.gain.setValueAtTime(0, t)
      gSubida.gain.setValueAtTime(0, t)
      gChirrido.gain.setValueAtTime(0, t)
      gLluvia.gain.setValueAtTime(0, t)
      transporte.stop(t)
      golpeSeco.triggerAttackRelease('A0', '2n', t)
      estruendo.triggerAttackRelease('2n', t)
      for (let k = 0; k < 9; k++) vidrio.triggerAttackRelease(3000 + Math.random() * 3500, '32n', t + 0.03 + k * (0.03 + Math.random() * 0.06), 0.3 + Math.random() * 0.5)
      setTimeout(() => apagarTodo(false), 2500)
    },
    detener() {
      apagarTodo(true)
    },
  }
}
