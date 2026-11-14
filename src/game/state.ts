import { useGame } from '../store'
import { world } from '../world/layout'
import { createBody } from './physics'

/** Cuerpo del jugador: mutable y compartido entre jugador, cámara y monedas. */
export const body = createBody(world.spawn)

export function respawn() {
  Object.assign(body, createBody(world.spawn))
}

/** Viaje rápido: coloca al jugador en un punto, parado. La partida en curso deja de valer para los récords. */
export function warp(x: number, y: number, z: number) {
  body.pos[0] = x
  body.pos[1] = y
  body.pos[2] = z
  body.vel[0] = body.vel[1] = body.vel[2] = 0
  body.ballistic = 0
  useGame.getState().assist()
}

/** Momento (performance.now) del último aterrizaje del jugador. */
export const lastLanding = { time: 0 }

/** Sacudida de cámara pendiente (la consume y amortigua la cámara). */
export const shake = { value: 0 }

// Solo en desarrollo: acceso desde la consola para depurar la física.
if (import.meta.env.DEV) {
  ;(window as unknown as { __body: typeof body }).__body = body
}

// Solo en desarrollo: el mundo tal y como lo usa el juego (para pruebas).
if (import.meta.env.DEV) {
  ;(window as unknown as { __world: typeof world }).__world = world
}
