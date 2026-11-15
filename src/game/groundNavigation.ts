/** Flat-ground movement shared by the city inhabitants. No React or render state. */
export type GroundPoint = [number, number]
export interface GroundArea { minX: number; maxX: number; minZ: number; maxZ: number }
export interface GroundBox { min: readonly number[]; max: readonly number[] }
export interface GroundProfile {
  area: GroundArea
  radius: number
  height: number
  obstacles: () => readonly GroundBox[]
  circles?: readonly { x: number; z: number; radius: number }[]
}
export interface GroundAgent { x: number; z: number; heading: number; tx: number; tz: number }
const EPS = .00001

export function groundFree(p: GroundProfile, x: number, z: number): boolean {
  const { area: a, radius: r } = p
  if (x < a.minX + r || x > a.maxX - r || z < a.minZ + r || z > a.maxZ - r) return false
  for (const b of p.obstacles()) {
    if (b.max[1] <= .04 || b.min[1] >= p.height) continue
    if (x > b.min[0] - r - EPS && x < b.max[0] + r + EPS && z > b.min[2] - r - EPS && z < b.max[2] + r + EPS) return false
  }
  return !(p.circles ?? []).some(c => Math.hypot(x - c.x, z - c.z) < r + c.radius + EPS)
}

/** Slab intersection against the complete swept footprint, including thin posts. */
export function groundSegmentFree(p: GroundProfile, ax: number, az: number, bx: number, bz: number): boolean {
  if (!groundFree(p, ax, az) || !groundFree(p, bx, bz)) return false
  const dx = bx - ax, dz = bz - az
  for (const b of p.obstacles()) {
    if (b.max[1] <= .04 || b.min[1] >= p.height) continue
    let enter = 0, leave = 1
    for (const [start, change, low, high] of [[ax, dx, b.min[0] - p.radius, b.max[0] + p.radius], [az, dz, b.min[2] - p.radius, b.max[2] + p.radius]]) {
      if (Math.abs(change) < EPS) { if (start <= low || start >= high) { enter = 2; break } }
      else {
        const t1 = (low - start) / change, t2 = (high - start) / change
        enter = Math.max(enter, Math.min(t1, t2)); leave = Math.min(leave, Math.max(t1, t2))
      }
    }
    if (enter <= leave && enter <= 1 && leave >= 0) return false
  }
  const length2 = dx * dx + dz * dz
  for (const c of p.circles ?? []) {
    const u = length2 ? Math.max(0, Math.min(1, ((c.x - ax) * dx + (c.z - az) * dz) / length2)) : 0
    if (Math.hypot(ax + u * dx - c.x, az + u * dz - c.z) < p.radius + c.radius + EPS) return false
  }
  return true
}

/** A failed search returns null, never a point inside an obstacle. */
export function nearestGroundPoint(p: GroundProfile, x: number, z: number): GroundPoint | null {
  const a = p.area, r = p.radius + .002
  x = Math.max(a.minX + r, Math.min(a.maxX - r, x)); z = Math.max(a.minZ + r, Math.min(a.maxZ - r, z))
  if (groundFree(p, x, z)) return [x, z]
  let best: GroundPoint | null = null, score = Infinity
  for (let zz = a.minZ + r; zz <= a.maxZ - r; zz += .25) for (let xx = a.minX + r; xx <= a.maxX - r; xx += .25) {
    const d = (xx - x) ** 2 + (zz - z) ** 2
    if (d < score && groundFree(p, xx, zz)) { best = [xx, zz]; score = d }
  }
  return best
}

export function randomGroundPoint(p: GroundProfile, random = Math.random): GroundPoint | null {
  const a = p.area, r = p.radius + .002
  for (let i = 0; i < 40; i++) {
    const x = a.minX + r + random() * (a.maxX - a.minX - r * 2)
    const z = a.minZ + r + random() * (a.maxZ - a.minZ - r * 2)
    if (groundFree(p, x, z)) return [x, z]
  }
  return nearestGroundPoint(p, (a.minX + a.maxX) / 2, (a.minZ + a.maxZ) / 2)
}

export function spawnGroundAgent(p: GroundProfile, preferred: GroundPoint): GroundAgent {
  const at = nearestGroundPoint(p, ...preferred)
  if (!at) throw new Error('No free ground for this actor footprint')
  return { x: at[0], z: at[1], tx: at[0], tz: at[1], heading: 0 }
}

/** Move only up to the first obstacle. Optional axis sliding never bypasses a wall. */
export function sweepGround(p: GroundProfile, x: number, z: number, dx: number, dz: number, slide = false) {
  const startX = x, startZ = z
  if (!groundFree(p, x, z)) return { x, z, blocked: true, moved: 0 }
  const travel = (mx: number, mz: number) => {
    if (groundSegmentFree(p, x, z, x + mx, z + mz)) { x += mx; z += mz; return 1 }
    let low = 0, high = 1
    for (let i = 0; i < 14; i++) { const mid = (low + high) / 2; if (groundSegmentFree(p, x, z, x + mx * mid, z + mz * mid)) low = mid; else high = mid }
    x += mx * low; z += mz * low; return low
  }
  const fraction = travel(dx, dz)
  const directX = x, directZ = z
  if (slide && fraction < 1) { travel(dx * (1 - fraction), 0); travel(0, dz * (1 - fraction)) }
  if (!groundSegmentFree(p, startX, startZ, x, z)) { x = directX; z = directZ }
  return { x, z, blocked: fraction < .999, moved: Math.hypot(x - startX, z - startZ) }
}

/** Small A* grid. Every edge and shortcut is checked against the live obstacle list. */
export function groundPath(p: GroundProfile, start: GroundPoint, wanted: GroundPoint): GroundPoint[] {
  const goal = nearestGroundPoint(p, ...wanted)
  if (!goal || !groundFree(p, ...start)) return []
  if (groundSegmentFree(p, ...start, ...goal)) return [goal]
  const cell = .5, a = p.area, r = p.radius + .002
  const nx = Math.floor((a.maxX - a.minX - r * 2) / cell) + 1, nz = Math.floor((a.maxZ - a.minZ - r * 2) / cell) + 1
  const point = (id: number): GroundPoint => [a.minX + r + id % nx * cell, a.minZ + r + Math.floor(id / nx) * cell]
  const allowed = new Map<number, boolean>()
  const valid = (id: number) => { if (!allowed.has(id)) allowed.set(id, groundFree(p, ...point(id))); return allowed.get(id)! }
  const scores = new Map<number, number>(), previous = new Map<number, number>(), open = new Set<number>(), done = new Set<number>()
  for (let id = 0; id < nx * nz; id++) {
    const at = point(id), d = Math.hypot(at[0] - start[0], at[1] - start[1])
    if (d < 1.1 && valid(id) && groundSegmentFree(p, ...start, ...at)) { scores.set(id, d); open.add(id) }
  }
  let best = -1, bestDistance = Math.hypot(start[0] - goal[0], start[1] - goal[1]), connected = false
  while (open.size) {
    let current = -1, value = Infinity
    for (const id of open) { const at = point(id), f = scores.get(id)! + Math.hypot(at[0] - goal[0], at[1] - goal[1]); if (f < value) { current = id; value = f } }
    open.delete(current); done.add(current)
    const at = point(current), distance = Math.hypot(at[0] - goal[0], at[1] - goal[1])
    if (distance < bestDistance) { bestDistance = distance; best = current }
    if (groundSegmentFree(p, ...at, ...goal)) { best = current; connected = true; break }
    const cx = current % nx, cz = Math.floor(current / nx)
    for (const [ox, oz] of [[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]]) {
      const xx = cx + ox, zz = cz + oz, next = zz * nx + xx
      if (xx < 0 || xx >= nx || zz < 0 || zz >= nz || done.has(next) || !valid(next)) continue
      const to = point(next)
      if (!groundSegmentFree(p, ...at, ...to)) continue
      const cost = scores.get(current)! + Math.hypot(ox, oz) * cell
      if (cost < (scores.get(next) ?? Infinity)) { scores.set(next, cost); previous.set(next, current); open.add(next) }
    }
  }
  if (best < 0) return []
  const route: GroundPoint[] = connected ? [goal] : []
  for (let id: number | undefined = best; id !== undefined; id = previous.get(id)) route.unshift(point(id))
  const smooth: GroundPoint[] = []; let at = start
  for (let i = 0; i < route.length;) {
    let next = route.length - 1
    while (next > i && !groundSegmentFree(p, ...at, ...route[next])) next--
    smooth.push(route[next]); at = route[next]; i = next + 1
  }
  return smooth
}

const routes = new WeakMap<GroundAgent, { points: GroundPoint[]; x: number; z: number; wait: number }>()
export function navigateGround(p: GroundProfile, agent: GroundAgent, speed: number, delta: number) {
  const dt = Math.min(.05, Math.max(0, delta))
  let route = routes.get(agent)
  if (!route) { route = { points: [], x: Infinity, z: Infinity, wait: 0 }; routes.set(agent, route) }
  route.wait -= dt
  if (route.wait <= 0 && (Math.hypot(agent.tx - route.x, agent.tz - route.z) > .35 || !route.points.length)) {
    route.points = groundPath(p, [agent.x, agent.z], [agent.tx, agent.tz]); route.x = agent.tx; route.z = agent.tz; route.wait = .5
  }
  while (route.points.length && Math.hypot(agent.x - route.points[0][0], agent.z - route.points[0][1]) < .04) route.points.shift()
  const next = route.points[0]
  if (!next) return { moved: false, arrived: Math.hypot(agent.tx - agent.x, agent.tz - agent.z) < .15, blocked: true }
  const dx = next[0] - agent.x, dz = next[1] - agent.z, gap = Math.hypot(dx, dz), distance = Math.min(gap, speed * dt)
  const move = sweepGround(p, agent.x, agent.z, dx / gap * distance, dz / gap * distance)
  agent.x = move.x; agent.z = move.z
  if (move.moved > EPS) { const angle = Math.atan2(dx, dz) - agent.heading; agent.heading += Math.atan2(Math.sin(angle), Math.cos(angle)) * (1 - Math.exp(-10 * dt)) }
  if (move.blocked) { route.points = []; route.wait = 0 }
  return { moved: move.moved > EPS, arrived: gap <= distance + .04 && route.points.length <= 1, blocked: move.blocked }
}

/** Autonomous little robots turn before obstacles; they never get an unchecked escape step. */
export function steerGround(p: GroundProfile, x: number, z: number, heading: number, distance: number, side = 1) {
  const look = Math.max(distance, .22)
  for (const turn of [0, .55, -.55, 1.1, -1.1, 1.7, -1.7, Math.PI]) {
    const angle = heading + turn * side, dx = Math.sin(angle), dz = Math.cos(angle)
    if (!groundSegmentFree(p, x, z, x + dx * look, z + dz * look)) continue
    return { ...sweepGround(p, x, z, dx * distance, dz * distance), heading: angle }
  }
  return { x, z, heading: heading + Math.PI / 2 * side, blocked: true, moved: 0 }
}
