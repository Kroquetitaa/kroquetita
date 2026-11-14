/**
 * Banda sonora generativa: synthwave oscuro sintetizado con Web Audio
 * (arpegio, bajo pulsante, pad y percusión). No usa archivos de audio.
 */

const BPM = 104
const STEP = 60 / BPM / 4 // semicorchea
const STEPS_PER_CHORD = 32 // dos compases

/** Progresión i–VI–III–VII en re menor: raíz del bajo y notas del acorde (MIDI). */
const CHORDS = [
  { root: 38, tones: [62, 65, 69, 74] },
  { root: 34, tones: [62, 65, 70, 74] },
  { root: 41, tones: [60, 65, 69, 72] },
  { root: 36, tones: [60, 64, 67, 72] },
]
const ARP = [0, 2, 1, 3, 2, 3, 1, 2]

const freq = (midi: number) => 440 * Math.pow(2, (midi - 69) / 12)

interface Rig {
  ctx: AudioContext
  out: GainNode
  arpFilter: BiquadFilterNode
  arpBus: GainNode
  padBus: GainNode
  bassBus: GainNode
  drumBus: GainNode
  noise: AudioBuffer
}

let rig: Rig | null = null
let timer: number | undefined
let nextTime = 0
let step = 0
let muted = false
let intensity: 0 | 1 | 2 = 0

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

  const reverb = ctx.createConvolver()
  reverb.buffer = impulse(ctx, 3.2)
  const reverbGain = ctx.createGain()
  reverbGain.gain.value = 0.5
  reverb.connect(reverbGain).connect(out)

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
  delay.delayTime.value = STEP * 3
  const feedback = ctx.createGain()
  feedback.gain.value = 0.38
  const delayWet = ctx.createGain()
  delayWet.gain.value = 0.32
  arpFilter.connect(arpBus)
  arpBus.connect(out)
  arpBus.connect(delay)
  delay.connect(feedback).connect(delay)
  delay.connect(delayWet).connect(out)
  arpBus.connect(reverb)

  const padFilter = ctx.createBiquadFilter()
  padFilter.type = 'lowpass'
  padFilter.frequency.value = 1100
  const padBus = ctx.createGain()
  padBus.gain.value = 0.5
  padBus.connect(padFilter)
  padFilter.connect(out)
  padFilter.connect(reverb)

  const bassFilter = ctx.createBiquadFilter()
  bassFilter.type = 'lowpass'
  bassFilter.frequency.value = 420
  bassFilter.Q.value = 3
  const bassBus = ctx.createGain()
  bassBus.gain.value = 0.7
  bassBus.connect(bassFilter).connect(out)

  const drumBus = ctx.createGain()
  drumBus.gain.value = 0
  drumBus.connect(out)

  const noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate)
  const data = noise.getChannelData(0)
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1

  return { ctx, out, arpFilter, arpBus, padBus, bassBus, drumBus, noise }
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

function kick(r: Rig, time: number) {
  const osc = r.ctx.createOscillator()
  const gain = r.ctx.createGain()
  osc.frequency.setValueAtTime(140, time)
  osc.frequency.exponentialRampToValueAtTime(42, time + 0.14)
  gain.gain.setValueAtTime(0.9, time)
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

function playStep(r: Rig, index: number, time: number) {
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

function pump() {
  if (!rig) return
  while (nextTime < rig.ctx.currentTime + 0.14) {
    playStep(rig, step, nextTime)
    nextTime += STEP
    step = (step + 1) % (STEPS_PER_CHORD * CHORDS.length)
  }
}

function applyLevels() {
  if (!rig) return
  const now = rig.ctx.currentTime
  rig.out.gain.setTargetAtTime(muted ? 0 : 0.5, now, 0.4)
  rig.drumBus.gain.setTargetAtTime(intensity > 0 ? 0.8 : 0, now, 0.6)
  rig.arpFilter.frequency.setTargetAtTime([900, 1900, 3200][intensity], now, 1.2)
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
