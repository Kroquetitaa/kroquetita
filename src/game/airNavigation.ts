import type { GroundArea, GroundBox } from './groundNavigation'
export type AirPoint = [number, number, number]
export interface AirSpace { area: GroundArea; radius: number; obstacles: () => readonly GroundBox[] }
function hits(box: GroundBox, a: AirPoint, b: AirPoint, r: number) {
  let enter = 0, leave = 1
  for (let axis = 0; axis < 3; axis++) {
    const d = b[axis] - a[axis], low = box.min[axis] - r, high = box.max[axis] + r
    if (Math.abs(d) < 1e-8) { if (a[axis] <= low || a[axis] >= high) return false }
    else { const t1 = (low - a[axis]) / d, t2 = (high - a[axis]) / d; enter = Math.max(enter, Math.min(t1, t2)); leave = Math.min(leave, Math.max(t1, t2)) }
  }
  return enter <= leave && enter <= 1 && leave >= 0
}
export function airSegmentFree(space: AirSpace, a: AirPoint, b: AirPoint) {
  const { area, radius: r } = space
  for (const p of [a, b]) if (p[0] < area.minX + r || p[0] > area.maxX - r || p[2] < area.minZ + r || p[2] > area.maxZ - r || p[1] < r) return false
  return !space.obstacles().some(box => hits(box, a, b, r))
}
/** Only used for first appearance / player fast travel, never to escape a flight collision. */
export function safeAirPoint(space: AirSpace, requested: AirPoint): AirPoint {
  const { area: a, radius: r } = space
  const point: AirPoint = [Math.max(a.minX + r, Math.min(a.maxX - r, requested[0])), Math.max(r + .01, requested[1]), Math.max(a.minZ + r, Math.min(a.maxZ - r, requested[2]))]
  for (let pass = 0; pass < 12; pass++) {
    const overlap = space.obstacles().filter(box => hits(box, point, point, r))
    if (!overlap.length) return point
    point[1] = Math.max(...overlap.map(box => box.max[1] + r + .05))
  }
  point[1] = Math.max(point[1], ...space.obstacles().map(box => box.max[1] + r + .05))
  return point
}
export function stepAirFlight(space: AirSpace, from: AirPoint, requested: AirPoint, distance: number): AirPoint {
  const goal = safeAirPoint(space, requested)
  const step = (to: AirPoint): AirPoint | null => {
    const dx = to[0] - from[0], dy = to[1] - from[1], dz = to[2] - from[2], length = Math.hypot(dx, dy, dz)
    if (length < .001) return null
    const k = Math.min(1, distance / length)
    const next: AirPoint = [from[0] + dx * k, from[1] + dy * k, from[2] + dz * k]
    return airSegmentFree(space, from, next) ? next : null
  }
  if (airSegmentFree(space, from, goal)) return step(goal) ?? from
  const blocking = space.obstacles().filter(box => hits(box, from, goal, space.radius))
  const cruise = Math.max(from[1], goal[1], ...blocking.map(box => box.max[1] + space.radius + .12))
  const rise = step([from[0], cruise, from[2]])
  if (rise) return rise
  const across = step([goal[0], cruise, goal[2]])
  if (across) return across
  const heading = Math.atan2(goal[0] - from[0], goal[2] - from[2])
  for (const offset of [Math.PI / 2, -Math.PI / 2, Math.PI, .75, -.75]) {
    const next = step([from[0] + Math.sin(heading + offset), from[1], from[2] + Math.cos(heading + offset)])
    if (next) return next
  }
  return from
}
