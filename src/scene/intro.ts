import { uTime } from './materials/shaders'

/** Momento (en el reloj de shaders) en que la escena quedó lista; -1 = aún no. */
let startedAt = -1

export function startIntro() {
  if (startedAt < 0) startedAt = uTime.value
}

/** Segundos desde que arrancó la animación de entrada (0 si no ha empezado). */
export function introTime() {
  return startedAt < 0 ? 0 : uTime.value - startedAt
}

const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3)

/** Progreso 0..1 con retardo y duración, ya suavizado. */
export function introProgress(delay: number, duration: number) {
  const t = Math.min(1, Math.max(0, (introTime() - delay) / duration))
  return easeOutCubic(t)
}

/** Los bloques emergen del suelo en cascada; esto da su progreso. */
export const blockRise = (index: number) => introProgress(0.15 + index * 0.13, 1.2)
