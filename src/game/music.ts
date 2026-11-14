/**
 * Banda sonora generativa, sintetizada con Web Audio (no usa archivos de
 * audio). Tiene dos estilos que comparten progresión y tonalidad:
 *  - 'synthwave': oscuro, con arpegio, bajo pulsante y pad.
 *  - 'house': French house — bombo a negras, bombeo tipo sidechain, acordes
 *    filtrados a contratiempo, bajo con octavas y una voz robótica.
 */

export type MusicStyle = 'synthwave' | 'house'

const BPM: Record<MusicStyle, number> = { synthwave: 104, house: 120 }
const STEPS_PER_CHORD = 32 // dos compases

/** Progresión i–VI–III–VII en re menor: raíz del bajo y notas del acorde (MIDI). */
const CHORDS = [
  { root: 38, tones: [62, 65, 69, 74] },
  { root: 34, tones: [62, 65, 70, 74] },
  { root: 41, tones: [60, 65, 69, 72] },
  { root: 36, tones: [60, 64, 67, 72] },
]
const ARP = [0, 2, 1, 3, 2, 3, 1, 2]

/** La misma progresión con séptimas, que es lo que le da el color disco. */
const HOUSE_CHORDS = [
  { root: 38, tones: [60, 62, 65, 69] }, // Dm7
  { root: 34, tones: [57, 58, 62, 65] }, // Bbmaj7
  { root: 41, tones: [60, 64, 65, 69] }, // Fmaj7
  { root: 36, tones: [58, 60, 64, 67] }, // C7
]
/** Golpes de acorde sincopados (un compás de semicorcheas). */
const STABS = [0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0]
/** Bajo: semitonos sobre la raíz (-1 = silencio), saltando a la octava. */
const BASSLINE = [0, -1, 12, -1, 0, -1, 12, 0, -1, 0, 12, -1, 7, -1, 12, 10]
/** Frase de la voz robótica (pentatónica de re menor), en la segunda mitad de cada acorde. */
const VOX = [74, -1, 77, -1, 79, -1, 77, 74, -1, 72, -1, 74, -1, -1, -1, -1]
/** Formantes de las "vocales" que va diciendo la voz: [F1, F2] en Hz. */
const VOWELS = [
  [800, 1200],
  [450, 850],
  [400, 2000],
  [320, 2300],
]

const freq = (midi: number) => 440 * Math.pow(2, (midi - 69) / 12)

interface Rig {
  ctx: AudioContext
  out: GainNode
  /** Por aquí pasa todo menos la percusión: el estilo house lo "bombea" con cada bombo */
  duck: GainNode
  arpFilter: BiquadFilterNode
  arpBus: GainNode
  padBus: GainNode
  bassFilter: BiquadFilterNode
  bassBus: GainNode
  /** Acordes del estilo house: un paso bajo resonante que se abre y se cierra */
  stabFilter: BiquadFilterNode
  voxBus: GainNode
  delay: DelayNode
  drumBus: GainNode
  noise: AudioBuffer
}

let rig: Rig | null = null
let timer: number | undefined
let nextTime = 0
let step = 0
let muted = false
let intensity: 0 | 1 | 2 = 0
let style: MusicStyle = 'house'

/** Duración de una semicorchea en el estilo actual. */
const stepTime = () => 60 / BPM[style] / 4

function impulse(ctx: AudioContext, seconds: number) {
  const length = Math.floor(ctx.sampleRate * seconds)
  const buffer = ctx.createBuffer(2, length, ctx.sampleRate)
  for (let channel = 0; channel < 2; channel++) {
    const data = buffer.getChannelData(channel)
    for (let i = 0; i < length; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, 2.6)
    }
  }
  return buffer
}

function build(ctx: AudioContext): Rig {
  const out = ctx.createGain()
  out.gain.value = 0
  const compressor = ctx.createDynamicsCompressor()
  compressor.threshold.value = -18
  compressor.ratio.value = 4
  out.connect(compressor).connect(ctx.destination)

  const duck = ctx.createGain()
  duck.connect(out)

  const reverb = ctx.createConvolver()
  reverb.buffer = impulse(ctx, 3.2)
  const reverbGain = ctx.createGain()
  reverbGain.gain.value = 0.5
  reverb.connect(reverbGain).connect(duck)

  // Arpegio: filtro paso bajo que se abre y cierra despacio + eco con puntillo.
  const arpFilter = ctx.createBiquadFilter()
  arpFilter.type = 'lowpass'
  arpFilter.frequency.value = 900
  arpFilter.Q.value = 7
  const lfo = ctx.createOscillator()
  lfo.frequency.value = 0.045
  const lfoDepth = ctx.createGain()
  lfoDepth.gain.value = 520
  lfo.connect(lfoDepth).connect(arpFilter.frequency)
  lfo.start()

  const arpBus = ctx.createGain()
  arpBus.gain.value = 0.55
  const delay = ctx.createDelay(1)
  delay.delayTime.value = stepTime() * 3
  const feedback = ctx.createGain()
  feedback.gain.value = 0.38
  const delayWet = ctx.createGain()
  delayWet.gain.value = 0.32
  arpFilter.connect(arpBus)
  arpBus.connect(duck)
  arpBus.connect(delay)
  delay.connect(feedback).connect(delay)
  delay.connect(delayWet).connect(duck)
  arpBus.connect(reverb)

  const padFilter = ctx.createBiquadFilter()
  padFilter.type = 'lowpass'
  padFilter.frequency.value = 1100
  const padBus = ctx.createGain()
  padBus.gain.value = 0.5
  padBus.connect(padFilter)
  padFilter.connect(duck)
  padFilter.connect(reverb)

  const bassFilter = ctx.createBiquadFilter()
  bassFilter.type = 'lowpass'
  bassFilter.frequency.value = 420
  bassFilter.Q.value = 3
  const bassBus = ctx.createGain()
  bassBus.gain.value = 0.7
  bassBus.connect(bassFilter).connect(duck)

  // Acordes house: el barrido lento del filtro es media canción.
  const stabFilter = ctx.createBiquadFilter()
  stabFilter.type = 'lowpass'
  stabFilter.frequency.value = 900
  stabFilter.Q.value = 6
  const sweep = ctx.createOscillator()
  sweep.frequency.value = 0.07
  const sweepDepth = ctx.createGain()
  sweepDepth.gain.value = 650
  sweep.connect(sweepDepth).connect(stabFilter.frequency)
  sweep.start()
  const stabBus = ctx.createGain()
  stabBus.gain.value = 0.6
  stabFilter.connect(stabBus)
  stabBus.connect(duck)
  stabBus.connect(reverb)

  const voxBus = ctx.createGain()
  voxBus.gain.value = 0.5
  voxBus.connect(duck)
  voxBus.connect(delay)

  const drumBus = ctx.createGain()
  drumBus.gain.value = 0
  drumBus.connect(out)

  const noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate)
  const data = noise.getChannelData(0)
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1

  return { ctx, out, duck, arpFilter, arpBus, padBus, bassFilter, bassBus, stabFilter, voxBus, delay, drumBus, noise }
}

function voice(
  r: Rig,
  target: AudioNode,
  type: OscillatorType,
  frequency: number,
  time: number,
  attack: number,
  length: number,
  volume: number,
  detune = 0,
) {
  const osc = r.ctx.createOscillator()
  const gain = r.ctx.createGain()
  osc.type = type
  osc.frequency.value = frequency
  osc.detune.value = detune
  gain.gain.setValueAtTime(0.0001, time)
  gain.gain.exponentialRampToValueAtTime(volume, time + attack)
  gain.gain.exponentialRampToValueAtTime(0.0001, time + length)
  osc.connect(gain).connect(target)
  osc.start(time)
  osc.stop(time + length + 0.05)
}

/** Voz robótica: una sierra pasada por dos formantes que se mueven de una vocal a otra. */
function robot(r: Rig, midi: number, time: number, length: number, from: number[], to: number[]) {
  const osc = r.ctx.createOscillator()
  const gain = r.ctx.createGain()
  osc.type = 'sawtooth'
  osc.frequency.value = freq(midi)
  gain.gain.setValueAtTime(0.0001, time)
  gain.gain.exponentialRampToValueAtTime(0.5, time + 0.02)
  gain.gain.exponentialRampToValueAtTime(0.0001, time + length)
  osc.connect(gain)
  for (let i = 0; i < 2; i++) {
    const formant = r.ctx.createBiquadFilter()
    formant.type = 'bandpass'
    formant.Q.value = 9
    formant.frequency.setValueAtTime(from[i], time)
    formant.frequency.exponentialRampToValueAtTime(to[i], time + length * 0.8)
    gain.connect(formant).connect(r.voxBus)
  }
  osc.start(time)
  osc.stop(time + length + 0.05)
}

function kick(r: Rig, time: number, volume = 0.9) {
  const osc = r.ctx.createOscillator()
  const gain = r.ctx.createGain()
  osc.frequency.setValueAtTime(140, time)
  osc.frequency.exponentialRampToValueAtTime(42, time + 0.14)
  gain.gain.setValueAtTime(volume, time)
  gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.32)
  osc.connect(gain).connect(r.drumBus)
  osc.start(time)
  osc.stop(time + 0.35)
}

function noiseHit(r: Rig, time: number, frequency: number, length: number, volume: number) {
  const source = r.ctx.createBufferSource()
  source.buffer = r.noise
  const filter = r.ctx.createBiquadFilter()
  filter.type = 'bandpass'
  filter.frequency.value = frequency
  filter.Q.value = 0.9
  const gain = r.ctx.createGain()
  gain.gain.setValueAtTime(volume, time)
  gain.gain.exponentialRampToValueAtTime(0.0001, time + length)
  source.connect(filter).connect(gain).connect(r.drumBus)
  source.start(time, Math.random() * 0.5, length + 0.05)
}

function playSynthwave(r: Rig, index: number, time: number) {
  const STEP = stepTime()
  const chord = CHORDS[Math.floor(index / STEPS_PER_CHORD) % CHORDS.length]
  const local = index % STEPS_PER_CHORD

  // Pad: el acorde entero, con ataque lento y tres sierras desafinadas por nota.
  if (local === 0) {
    const length = STEPS_PER_CHORD * STEP
    for (const tone of chord.tones.slice(0, 3)) {
      for (const detune of [-9, 0, 9]) {
        voice(r, r.padBus, 'sawtooth', freq(tone - 12), time, length * 0.35, length * 1.05, 0.035, detune)
      }
    }
  }

  // Arpegio en semicorcheas; la segunda mitad del compás sube una octava.
  const tone = chord.tones[ARP[local % ARP.length]] + (local % 16 >= 8 ? 12 : 0)
  const accent = local % 4 === 0 ? 0.16 : 0.1
  voice(r, r.arpFilter, 'sawtooth', freq(tone), time, 0.006, STEP * 1.7, accent)

  // Bajo en corcheas sobre la tónica, con salto de octava al final del compás.
  if (local % 2 === 0) {
    const octave = local % 16 === 14 ? 12 : 0
    voice(r, r.bassBus, 'sawtooth', freq(chord.root + octave), time, 0.008, STEP * 1.8, 0.3)
    voice(r, r.bassBus, 'sine', freq(chord.root), time, 0.008, STEP * 1.9, 0.35)
  }

  // Melodía de victoria: negras agudas con onda cuadrada, por el bus con eco.
  if (intensity === 2 && local % 4 === 0) {
    const lead = chord.tones[[3, 2, 1, 2, 3, 1, 2, 0][(local / 4) % 8]] + 12
    voice(r, r.arpFilter, 'square', freq(lead), time, 0.01, STEP * 3.6, 0.13)
    voice(r, r.padBus, 'triangle', freq(lead + 12), time, 0.02, STEP * 3.2, 0.05)
  }

  // Percusión (solo suena con intensidad alta: en modo juego).
  if (local % 8 === 0) kick(r, time)
  if (local % 4 === 2) noiseHit(r, time, 8200, 0.05, 0.16)
  if (local % 16 === 8) noiseHit(r, time, 1900, 0.2, 0.35)
}

function playHouse(r: Rig, index: number, time: number) {
  const STEP = stepTime()
  const chord = HOUSE_CHORDS[Math.floor(index / STEPS_PER_CHORD) % HOUSE_CHORDS.length]
  const local = index % STEPS_PER_CHORD
  const beat = local % 4

  // Bombo en cada negra. Con él, todo lo demás se agacha y vuelve: el bombeo.
  if (beat === 0) {
    kick(r, time, 1)
    r.duck.gain.cancelScheduledValues(time)
    r.duck.gain.setValueAtTime(0.32, time)
    r.duck.gain.linearRampToValueAtTime(1, time + STEP * 3.2)
  }
  // Charles abierto a contratiempo y cerrado, flojito, en el resto.
  if (beat === 2) noiseHit(r, time, 9000, 0.12, 0.2)
  else noiseHit(r, time, 10500, 0.03, 0.06)
  // Palmada en el 2 y el 4.
  if (local % 8 === 4) {
    noiseHit(r, time, 1500, 0.16, 0.36)
    noiseHit(r, time + 0.012, 2300, 0.12, 0.2)
  }

  // Acordes con séptima, en golpes cortos y sincopados, por el filtro que barre.
  if (STABS[local % 16]) {
    for (const tone of chord.tones) {
      for (const detune of [-8, 8]) voice(r, r.stabFilter, 'sawtooth', freq(tone), time, 0.004, STEP * 1.7, 0.05, detune)
    }
  }
  // Colchón muy suave para que no quede seco entre golpes.
  if (local === 0) {
    const length = STEPS_PER_CHORD * STEP
    for (const tone of chord.tones.slice(1)) voice(r, r.padBus, 'triangle', freq(tone), time, length * 0.3, length, 0.03)
  }

  // Bajo funk: semicorcheas con silencios y saltos a la octava.
  const offset = BASSLINE[local % 16]
  if (offset >= 0) {
    voice(r, r.bassBus, 'sawtooth', freq(chord.root + offset), time, 0.005, STEP * 0.95, 0.3)
    voice(r, r.bassBus, 'square', freq(chord.root + offset), time, 0.005, STEP * 0.8, 0.12)
  }

  // Voz robótica: responde en la segunda mitad de cada acorde (siempre, tras ganar).
  const speaking = intensity === 2 || (intensity === 1 && local >= 16)
  const note = VOX[local % 16]
  if (speaking && note >= 0) {
    const vowel = Math.floor(local / 2) % VOWELS.length
    robot(r, note - 12, time, STEP * 1.9, VOWELS[vowel], VOWELS[(vowel + 1) % VOWELS.length])
  }
}

function pump() {
  if (!rig) return
  while (nextTime < rig.ctx.currentTime + 0.14) {
    if (style === 'house') playHouse(rig, step, nextTime)
    else playSynthwave(rig, step, nextTime)
    nextTime += stepTime()
    step = (step + 1) % (STEPS_PER_CHORD * CHORDS.length)
  }
}

function applyLevels() {
  if (!rig) return
  const now = rig.ctx.currentTime
  const house = style === 'house'
  rig.out.gain.setTargetAtTime(muted ? 0 : 0.68, now, 0.4)
  // En la portada el house suena "desde la sala de al lado": percusión suave y filtro cerrado.
  rig.drumBus.gain.setTargetAtTime(intensity > 0 ? 0.8 : house ? 0.3 : 0, now, 0.6)
  rig.arpFilter.frequency.setTargetAtTime([900, 1900, 3200][intensity], now, 1.2)
  rig.stabFilter.frequency.setTargetAtTime([900, 2300, 3400][intensity], now, 1.2)
  rig.bassFilter.frequency.setTargetAtTime(house ? 680 : 420, now, 0.3)
  rig.delay.delayTime.setTargetAtTime(stepTime() * 3, now, 0.05)
  if (!house) {
    rig.duck.gain.cancelScheduledValues(now)
    rig.duck.gain.setTargetAtTime(1, now, 0.1)
  }
}

/** Arranca la música (necesita un AudioContext ya desbloqueado por el usuario). */
export function startMusic(ctx: AudioContext) {
  if (rig) return
  rig = build(ctx)
  nextTime = ctx.currentTime + 0.1
  step = 0
  timer = window.setInterval(pump, 30)
  applyLevels()

  // En segundo plano los temporizadores se ralentizan: mejor pausar el audio.
  document.addEventListener('visibilitychange', () => {
    if (!rig) return
    if (document.hidden) void rig.ctx.suspend()
    else {
      void rig.ctx.resume().then(() => {
        if (rig) nextTime = Math.max(nextTime, rig.ctx.currentTime + 0.1)
      })
    }
  })
}

export function stopMusic() {
  window.clearInterval(timer)
  rig?.out.disconnect()
  rig = null
}

export function setMusicMuted(value: boolean) {
  muted = value
  applyLevels()
}

/** 0 = ambiente (intro); 1 = con percusión (jugando); 2 = victoria, con melodía. */
export function setMusicIntensity(value: 0 | 1 | 2) {
  intensity = value
  applyLevels()
}

/** Cambia de estilo sobre la marcha. */
export function setMusicStyle(value: MusicStyle) {
  if (style === value) return
  style = value
  // Se retoma desde el inicio de un acorde para que el cambio caiga en tiempo.
  step = Math.floor(step / STEPS_PER_CHORD) * STEPS_PER_CHORD
  applyLevels()
}
