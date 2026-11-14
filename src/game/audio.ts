/**
 * Efectos de sonido sintetizados con Web Audio (sin archivos).
 * El contexto se crea en la primera interacción del usuario.
 */
import { setMusicMuted, startMusic } from './music'

let ctx: AudioContext | null = null
let muted = false

export function setMuted(value: boolean) {
  muted = value
  setMusicMuted(value)
}

export function unlockAudio() {
  if (!ctx) {
    try {
      ctx = new AudioContext()
    } catch {
      ctx = null
    }
  }
  if (!ctx) return
  if (ctx.state === 'suspended') void ctx.resume()
  startMusic(ctx)
}

function tone(
  from: number,
  to: number,
  duration: number,
  type: OscillatorType,
  volume: number,
  delay = 0,
) {
  if (!ctx || muted || ctx.state !== 'running') return
  const start = ctx.currentTime + delay
  const osc = ctx.createOscillator()
  const gain = ctx.createGain()
  osc.type = type
  osc.frequency.setValueAtTime(from, start)
  osc.frequency.exponentialRampToValueAtTime(to, start + duration)
  gain.gain.setValueAtTime(0.0001, start)
  gain.gain.exponentialRampToValueAtTime(volume, start + 0.012)
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration)
  osc.connect(gain).connect(ctx.destination)
  osc.start(start)
  osc.stop(start + duration + 0.02)
}

let noiseBuffer: AudioBuffer | null = null

/** Ráfaga de ruido filtrado (explosiones). */
function noise(duration: number, volume: number, from: number, to: number) {
  if (!ctx || muted || ctx.state !== 'running') return
  if (!noiseBuffer) {
    noiseBuffer = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate)
    const data = noiseBuffer.getChannelData(0)
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1
  }
  const now = ctx.currentTime
  const source = ctx.createBufferSource()
  source.buffer = noiseBuffer
  const filter = ctx.createBiquadFilter()
  filter.type = 'lowpass'
  filter.frequency.setValueAtTime(from, now)
  filter.frequency.exponentialRampToValueAtTime(to, now + duration)
  const gain = ctx.createGain()
  gain.gain.setValueAtTime(volume, now)
  gain.gain.exponentialRampToValueAtTime(0.0001, now + duration)
  source.connect(filter).connect(gain).connect(ctx.destination)
  source.start(now, 0, Math.min(duration + 0.05, 0.95))
}

export const sfx = {
  coin() {
    tone(988, 988, 0.09, 'square', 0.05)
    tone(1319, 1319, 0.28, 'square', 0.05, 0.08)
  },
  jump() {
    tone(260, 520, 0.16, 'triangle', 0.09)
  },
  land() {
    tone(140, 70, 0.09, 'sine', 0.12)
  },
  doubleJump() {
    tone(420, 880, 0.14, 'triangle', 0.08)
  },
  launch() {
    tone(180, 1200, 0.45, 'sawtooth', 0.05)
    tone(90, 60, 0.2, 'sine', 0.14)
  },
  hologram() {
    tone(1200, 400, 0.18, 'sine', 0.06)
    tone(600, 1800, 0.22, 'triangle', 0.04, 0.05)
  },
  secret() {
    ;[392, 523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, f, 0.12, 'square', 0.05, i * 0.07))
  },
  quack() {
    tone(820, 520, 0.09, 'sawtooth', 0.06)
    tone(700, 420, 0.13, 'sawtooth', 0.06, 0.1)
  },
  button() {
    tone(320, 140, 0.14, 'square', 0.07)
  },
  alarm() {
    ;[0, 0.16, 0.32].forEach((delay) => tone(980, 980, 0.1, 'square', 0.06, delay))
  },
  explosion() {
    noise(0.9, 0.5, 2400, 90)
    tone(130, 28, 0.8, 'sine', 0.35)
  },
  rebuild() {
    ;[330, 440, 554, 659].forEach((f, i) => tone(f, f, 0.14, 'triangle', 0.06, i * 0.08))
  },
  ding() {
    tone(1319, 1319, 0.5, 'sine', 0.06)
    tone(1760, 1760, 0.6, 'sine', 0.04, 0.12)
  },
  firework() {
    tone(1400, 300, 0.5, 'sine', 0.03)
    tone(90, 40, 0.35, 'triangle', 0.1, 0.02)
  },
  win() {
    ;[523, 659, 784, 1047].forEach((f, i) => tone(f, f, 0.22, 'triangle', 0.08, i * 0.11))
  },
}
