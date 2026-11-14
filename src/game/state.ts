import { world } from '../world/layout'
import { createBody } from './physics'

/** Cuerpo del jugador: mutable y compartido entre jugador, cámara y monedas. */
export const body = createBody(world.spawn)

export function respawn() {
  Object.assign(body, createBody(world.spawn))
}

// Solo en desarrollo: acceso desde la consola para depurar la física.
if (import.meta.env.DEV) {
  ;(window as unknown as { __body: typeof body }).__body = body
}
