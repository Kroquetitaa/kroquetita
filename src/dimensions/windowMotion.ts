import { useEffect } from 'react'

export interface WindowMotionMetrics { x: number; y: number; width: number; height: number; fullscreen: boolean; reducedMotion: boolean }
export interface WindowMotionState {
  velocity: { x: number; y: number }
  acceleration: { x: number; y: number }
  strength: number
  updatedAt: number
}
export interface WindowMotionSample extends WindowMotionState {
  previous: WindowMotionMetrics | null
  previousRawVelocity: { x: number; y: number }
}
export const WINDOW_MOTION_POLL_MS = 1000 / 15
export const WINDOW_VELOCITY_SCALE = 1200
export const WINDOW_ACCELERATION_SCALE = 12000
const clamp = (value: number, max = 1) => Math.max(-max, Math.min(max, value))
const damping = (dt: number, seconds: number) => 1 - Math.exp(-dt / seconds)
export function createWindowMotionSample(): WindowMotionSample {
  return { velocity: { x: 0, y: 0 }, acceleration: { x: 0, y: 0 }, strength: 0, updatedAt: 0, previous: null, previousRawVelocity: { x: 0, y: 0 } }
}
/** Pure 15 Hz filter. Inputs use CSS screen pixels, output axes are bounded to [-1, 1]. */
export function sampleWindowMotion(previous: WindowMotionSample, metrics: WindowMotionMetrics, now: number): WindowMotionSample {
  const dt = (now - previous.updatedAt) / 1000, before = previous.previous
  const valid = [metrics.x, metrics.y, metrics.width, metrics.height, now].every(Number.isFinite) && metrics.width > 0 && metrics.height > 0
  const reset = !before || dt <= 0 || dt > .5 || metrics.reducedMotion || metrics.fullscreen
    || before.reducedMotion !== metrics.reducedMotion || before.fullscreen !== metrics.fullscreen
    || before.width !== metrics.width || before.height !== metrics.height
    || !valid
  if (reset) return { ...createWindowMotionSample(), previous: valid ? { ...metrics } : null, updatedAt: now }
  const raw = { x: clamp((metrics.x - before.x) / dt, WINDOW_VELOCITY_SCALE), y: clamp((metrics.y - before.y) / dt, WINDOW_VELOCITY_SCALE) }
  const rawAccel = { x: clamp((raw.x - previous.previousRawVelocity.x) / dt / WINDOW_ACCELERATION_SCALE), y: clamp((raw.y - previous.previousRawVelocity.y) / dt / WINDOW_ACCELERATION_SCALE) }
  const velocity = { x: previous.velocity.x + (raw.x / WINDOW_VELOCITY_SCALE - previous.velocity.x) * damping(dt, .12),
    y: previous.velocity.y + (raw.y / WINDOW_VELOCITY_SCALE - previous.velocity.y) * damping(dt, .12) }
  const acceleration = { x: previous.acceleration.x + (rawAccel.x - previous.acceleration.x) * damping(dt, .18),
    y: previous.acceleration.y + (rawAccel.y - previous.acceleration.y) * damping(dt, .18) }
  const target = Math.min(1, Math.hypot(velocity.x, velocity.y) * .8 + Math.hypot(acceleration.x, acceleration.y) * .2)
  const strength = target > previous.strength ? target : previous.strength + (target - previous.strength) * damping(dt, .35)
  return { velocity, acceleration, strength: strength < .0001 ? 0 : strength, updatedAt: now, previous: { ...metrics }, previousRawVelocity: raw }
}

/** Read directly inside useFrame; subscription never schedules React renders. */
export const windowMotion: WindowMotionState = { velocity: { x: 0, y: 0 }, acceleration: { x: 0, y: 0 }, strength: 0, updatedAt: 0 }
let sample = createWindowMotionSample(), timer: number | null = null, removeEvents: (() => void) | null = null
const leases = new Map<symbol, boolean>()
const publish = () => {
  Object.assign(windowMotion.velocity, sample.velocity); Object.assign(windowMotion.acceleration, sample.acceleration)
  windowMotion.strength = sample.strength; windowMotion.updatedAt = sample.updatedAt
}
const metrics = (): WindowMotionMetrics => ({ x: window.screenX, y: window.screenY, width: window.outerWidth, height: window.outerHeight,
  fullscreen: !!document.fullscreenElement, reducedMotion: [...leases.values()].some(Boolean) || window.matchMedia('(prefers-reduced-motion: reduce)').matches })
const poll = () => { sample = sampleWindowMotion(sample, metrics(), performance.now()); publish() }
export function resetWindowMotion() {
  sample = { ...createWindowMotionSample(), previous: metrics(), updatedAt: performance.now() }; publish()
}
/** Multiple consumers share one poller. The last cleanup releases all listeners and momentum. */
export function acquireWindowMotion(reducedMotion = false) {
  const token = Symbol('window-motion'); leases.set(token, reducedMotion)
  if (timer === null) {
    resetWindowMotion()
    timer = window.setInterval(poll, WINDOW_MOTION_POLL_MS)
    const media = window.matchMedia('(prefers-reduced-motion: reduce)')
    window.addEventListener('resize', resetWindowMotion)
    document.addEventListener('fullscreenchange', resetWindowMotion)
    document.addEventListener('visibilitychange', resetWindowMotion)
    media.addEventListener('change', resetWindowMotion)
    removeEvents = () => { window.removeEventListener('resize', resetWindowMotion); document.removeEventListener('fullscreenchange', resetWindowMotion)
      document.removeEventListener('visibilitychange', resetWindowMotion); media.removeEventListener('change', resetWindowMotion) }
  } else if (reducedMotion) resetWindowMotion()
  let released = false
  return () => {
    if (released) return
    released = true; leases.delete(token)
    if (timer !== null && leases.size === 0) {
      window.clearInterval(timer); timer = null; removeEvents?.(); removeEvents = null
      sample = createWindowMotionSample(); publish()
    } else resetWindowMotion()
  }
}
export function useWindowMotion(enabled = true, reducedMotion = false) {
  useEffect(() => enabled ? acquireWindowMotion(reducedMotion) : undefined, [enabled, reducedMotion])
  return windowMotion
}
