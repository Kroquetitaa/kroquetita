import type { AABB } from '../world/layout'

/**
 * Controlador de personaje cinemático contra cajas AABB.
 * `pos` es el punto entre los pies; el cuerpo ocupa HALF en X/Z y HEIGHT en Y.
 */
export const HALF = 0.26
export const HEIGHT = 0.9

const GRAVITY = 16
const JUMP_SPEED = 7
const WALK_SPEED = 3.2
const RUN_SPEED = 5.6
const STEP_MAX = 0.32
const COYOTE = 0.12

export interface Body {
  pos: [number, number, number]
  vel: [number, number, number]
  grounded: boolean
  coyote: number
  /** Orientación en radianes alrededor de Y */
  facing: number
  /** Velocidad horizontal normalizada 0..1 (para animar) */
  speed: number
  justJumped: boolean
  justLanded: boolean
  /** Saltos en el aire que quedan (se recarga al tocar suelo) */
  airJumps: number
  justDoubleJumped: boolean
  /** Un trampolín acaba de lanzarlo */
  justLaunched: boolean
  /** Segundos de vuelo dirigido que quedan: mientras dure no se puede maniobrar */
  ballistic: number
}

/** Trampolín: lanza hacia arriba a quien lo pise. */
export interface Pad {
  position: [number, number, number]
  radius: number
  power: number
}

export interface World {
  colliders: AABB[]
  bounds: Bounds
  pads: Pad[]
  /** 1 = gravedad normal; menos = gravedad lunar */
  gravityScale: number
}

export interface Controls {
  x: number
  z: number
  run: boolean
  jump: boolean
  /** Multiplicador de velocidad (1 = normal) */
  boost?: number
}

export interface Bounds {
  minX: number
  maxX: number
  minZ: number
  maxZ: number
}

export const createBody = (spawn: [number, number, number]): Body => ({
  pos: [...spawn],
  vel: [0, 0, 0],
  grounded: true,
  coyote: 0,
  facing: 0,
  speed: 0,
  justJumped: false,
  justLanded: false,
  airJumps: 1,
  justDoubleJumped: false,
  justLaunched: false,
  ballistic: 0,
})

function hits(colliders: AABB[], x: number, y: number, z: number, out: AABB[]) {
  out.length = 0
  for (const b of colliders) {
    if (
      x + HALF > b.min[0] &&
      x - HALF < b.max[0] &&
      y + HEIGHT > b.min[1] &&
      y < b.max[1] &&
      z + HALF > b.min[2] &&
      z - HALF < b.max[2]
    ) {
      out.push(b)
    }
  }
  return out
}

const scratch: AABB[] = []
const probe: AABB[] = []

function moveAxis(body: Body, axis: 0 | 2, delta: number, colliders: AABB[]) {
  if (delta === 0) return
  const p = body.pos
  const next: [number, number, number] = [p[0], p[1], p[2]]
  next[axis] += delta

  const found = hits(colliders, next[0], next[1], next[2], scratch)
  if (found.length === 0) {
    p[axis] = next[axis]
    return
  }

  // Subir escalones bajos sin saltar.
  if (body.grounded) {
    let top = -Infinity
    for (const b of found) top = Math.max(top, b.max[1])
    const rise = top - p[1]
    if (rise > 0 && rise <= STEP_MAX && hits(colliders, next[0], top, next[2], probe).length === 0) {
      p[axis] = next[axis]
      p[1] = top
      return
    }
  }

  // Bloqueado: pegarse a la cara del obstáculo.
  if (delta > 0) {
    let edge = Infinity
    for (const b of found) edge = Math.min(edge, b.min[axis])
    p[axis] = Math.min(next[axis], edge - HALF)
  } else {
    let edge = -Infinity
    for (const b of found) edge = Math.max(edge, b.max[axis])
    p[axis] = Math.max(next[axis], edge + HALF)
  }
  body.vel[axis] = 0
}

/** Altura del suelo bajo los pies dentro de un margen, o null si no hay. */
function groundBelow(body: Body, colliders: AABB[], reach: number): number | null {
  const [x, y, z] = body.pos
  let best: number | null = y - reach <= 0 ? 0 : null
  for (const b of colliders) {
    if (x + HALF > b.min[0] && x - HALF < b.max[0] && z + HALF > b.min[2] && z - HALF < b.max[2]) {
      const top = b.max[1]
      if (top <= y + 1e-4 && top >= y - reach && (best === null || top > best)) best = top
    }
  }
  return best
}

export function stepBody(body: Body, controls: Controls, dt: number, world: World) {
  const { colliders, bounds, pads, gravityScale } = world
  const wasGrounded = body.grounded
  body.justJumped = false
  body.justLanded = false
  body.justDoubleJumped = false
  body.justLaunched = false

  // Velocidad horizontal objetivo.
  let ix = controls.x
  let iz = controls.z
  const len = Math.hypot(ix, iz)
  if (len > 1) {
    ix /= len
    iz /= len
  }
  const max = (controls.run ? RUN_SPEED : WALK_SPEED) * (controls.boost ?? 1)
  const flying = body.ballistic > 0
  body.ballistic = Math.max(0, body.ballistic - dt)
  if (!flying) {
    // En un vuelo dirigido (muelle) la trayectoria ya está decidida.
    const blend = 1 - Math.exp(-(body.grounded ? 14 : 8) * dt)
    body.vel[0] += (ix * max - body.vel[0]) * blend
    body.vel[2] += (iz * max - body.vel[2]) * blend
  }

  if (len > 0.1) {
    const target = Math.atan2(ix, iz)
    let diff = target - body.facing
    diff = Math.atan2(Math.sin(diff), Math.cos(diff))
    body.facing += diff * (1 - Math.exp(-14 * dt))
  }

  // Salto (con un pequeño margen tras dejar el suelo).
  body.coyote = body.grounded ? COYOTE : Math.max(0, body.coyote - dt)
  let jumped = false
  if (flying) {
    // Sin saltos mientras dura el vuelo.
  } else if (controls.jump && body.coyote > 0) {
    body.vel[1] = JUMP_SPEED
    body.grounded = false
    body.coyote = 0
    body.justJumped = true
    jumped = true
  } else if (controls.jump && body.airJumps > 0) {
    // Doble salto: un impulso extra en el aire.
    body.vel[1] = JUMP_SPEED * 0.9
    body.airJumps--
    body.justDoubleJumped = true
  }

  moveAxis(body, 0, body.vel[0] * dt, colliders)
  moveAxis(body, 2, body.vel[2] * dt, colliders)

  body.pos[0] = Math.min(bounds.maxX, Math.max(bounds.minX, body.pos[0]))
  body.pos[2] = Math.min(bounds.maxZ, Math.max(bounds.minZ, body.pos[2]))

  // Vertical.
  body.vel[1] -= GRAVITY * gravityScale * dt
  let nextY = body.pos[1] + body.vel[1] * dt
  let grounded = false
  if (nextY <= 0) {
    nextY = 0
    grounded = true
  }
  const found = hits(colliders, body.pos[0], nextY, body.pos[2], scratch)
  if (found.length > 0) {
    if (body.vel[1] <= 0) {
      for (const b of found) nextY = Math.max(nextY, b.max[1])
      grounded = true
    } else {
      for (const b of found) nextY = Math.min(nextY, b.min[1] - HEIGHT)
      body.vel[1] = 0
    }
  }
  body.pos[1] = nextY

  // Al bajar escalones, seguir pegado al suelo en lugar de "volar".
  if (!grounded && wasGrounded && !jumped) {
    const ground = groundBelow(body, colliders, STEP_MAX)
    if (ground !== null) {
      body.pos[1] = ground
      grounded = true
    }
  }

  if (grounded) {
    body.vel[1] = 0
    body.airJumps = 1
    if (body.ballistic < 0.01 || body.vel[1] <= 0) body.ballistic = 0
    // Trampolines.
    for (const pad of pads) {
      const dx = body.pos[0] - pad.position[0]
      const dz = body.pos[2] - pad.position[2]
      if (Math.abs(body.pos[1] - pad.position[1]) < 0.05 && dx * dx + dz * dz < pad.radius * pad.radius) {
        body.vel[1] = pad.power
        body.justLaunched = true
        grounded = false
        break
      }
    }
  }
  if (grounded && !wasGrounded) body.justLanded = true
  body.grounded = grounded
  // Si choca en pleno vuelo, se acabó el vuelo dirigido.
  if (flying && body.vel[0] === 0 && body.vel[2] === 0) body.ballistic = 0
  body.speed = Math.min(1, Math.hypot(body.vel[0], body.vel[2]) / RUN_SPEED)
}
