/** Deterministic choreography: both windows sample the same six performers. */
export type PortalSide = 'day' | 'night'
export type SceneEdge = 'left' | 'right' | 'top' | 'bottom'
export type Point = { x: number; y: number; z: number }
export type ActorPose = Point & { visible: boolean; yaw: number; walk: number; cheer: number; stretch: number }
export const PORTAL_ACTORS = ['duck', 'Claude', 'ChatGPT', 'Gemini', 'Qwen3', 'Mistral'] as const
export const CORE_POINT = { x: -3.2, y: 1.95, z: -.36 }
export const COFFEE_POINT = { x: 3, y: 1.3, z: -.32 }
const clamp = (x: number) => Math.max(0, Math.min(1, x))
const mix = (a: number, b: number, x: number) => a + (b - a) * x
const smooth = (a: number, b: number, x: number) => { const f = clamp((x - a) / (b - a)); return f * f * (3 - 2 * f) }
const opposite: Record<SceneEdge, SceneEdge> = { left: 'right', right: 'left', top: 'bottom', bottom: 'top' }
const vertical = (edge: SceneEdge) => edge === 'top' || edge === 'bottom'
function formation(edge: SceneEdge, i: number): Point {
  const sign = edge === 'right' || edge === 'bottom' ? 1 : -1
  return vertical(edge)
    ? { x: i ? sign * (i - 3) * 1.12 : 0, y: .025, z: .55 + sign * (i ? (5 - i) * .1 - .15 : .65) }
    : { x: sign * (2.65 - i * 1.02), y: .025, z: .55 }
}

export function portalActorPose(side: PortalSide, time: number, index: number, gate: Point, edge: SceneEdge, reduced = false): ActorPose {
  const t = Math.max(0, Math.min(32, time))
  const start = formation(edge, index)
  const arrival = formation(opposite[edge], index)
  const pose: ActorPose = { ...start, visible: side === 'day', yaw: 0, walk: 0, cheer: 0, stretch: 0 }
  const moving = (from: Point, to: Point, f: number, flying = false) => {
    const travel = flying ? smooth(.14, .86, f) : f
    pose.x = mix(from.x, to.x, travel); pose.y = mix(from.y, to.y, f); pose.z = mix(from.z, to.z, travel)
    if (flying) {
      const altitude = Math.max(3.1, from.y, to.y)
      pose.y = mix(from.y, altitude, smooth(0, .14, f))
      pose.y = mix(pose.y, to.y, smooth(.86, 1, f))
      pose.cheer = .4
    }
    pose.yaw = Math.atan2(to.x - from.x, to.z - from.z)
    pose.walk = 1
  }
  if (t < 4) {
    if (index === 0) {
      const atCore = { x: -3.05, y: .025, z: -.02 }
      if (t < 1.4) moving({ x: -2.05, y: .025, z: .03 }, atCore, clamp(t / 1.4))
      else if (t < 2.65) {
        Object.assign(pose, atCore)
        const leap = clamp((t - 1.4) / 1.25)
        pose.y += reduced ? 0 : Math.sin(leap * Math.PI) * 1.58
        pose.yaw = Math.PI; pose.walk = .2
      } else if (t < 2.9) moving(atCore, { ...atCore, z: 1.25 }, (t - 2.65) / .25)
      else if (t < 3.8) moving({ ...atCore, z: 1.25 }, { ...start, z: 1.25 }, (t - 2.9) / .9)
      else moving({ ...start, z: 1.25 }, start, (t - 3.8) / .2)
    } else pose.cheer = t > 2.1 ? .65 : 0
    return pose
  }
  if (t >= 14 && t < 18) {
    // A shared airborne half-turn preserves the spacing of the whole parade.
    // It puts the duck in front again before the trip home, clear of the props.
    const angle = Math.PI * smooth(14.7, 17.3, t)
    const z = arrival.z - .55
    pose.x = arrival.x * Math.cos(angle) + z * Math.sin(angle)
    pose.z = .55 - arrival.x * Math.sin(angle) + z * Math.cos(angle)
    pose.y = .025 + smooth(14.35, 14.7, t) * (1 - smooth(17.3, 18, t)) * 3.1
    pose.visible = side === 'night'; pose.cheer = index ? .5 : 1; pose.yaw = angle
    return pose
  }
  if (t >= 28) {
    Object.assign(pose, arrival, { visible: side === 'day', cheer: t > 30.7 ? 1 : .2 })
    if (index === 0) {
      if (t < 28.3) moving(arrival, { ...arrival, z: 1.25 }, (t - 28) / .3)
      else if (t < 29.5) moving({ ...arrival, z: 1.25 }, { x: 3, y: .025, z: 1.25 }, (t - 28.3) / 1.2)
      else if (t < 29.8) moving({ x: 3, y: .025, z: 1.25 }, { x: 3, y: .025, z: -.22 }, (t - 29.5) / .3)
      else {
        pose.x = 3; pose.z = -.22; pose.yaw = t < 31 ? Math.PI : .2
        pose.y += reduced ? 0 : Math.sin(clamp((t - 29.8) / 1) * Math.PI) * .86
      }
    }
    return pose
  }
  const back = t >= 18
  const progress = clamp((t - (back ? 18 : 4) - index * .6) / 6.8)
  const source = start
  const destination = arrival
  const outgoing = side === (back ? 'night' : 'day')
  const foot = { x: gate.x, y: Math.max(.025, gate.y - (index ? .64 : .30)), z: gate.z }
  const outward = { x: edge === 'right' ? 1 : edge === 'left' ? -1 : 0, z: edge === 'bottom' ? 1 : edge === 'top' ? -1 : 0 }
  const flying = vertical(edge) || Math.abs(gate.z) > .5
  if (outgoing) {
    pose.visible = progress < .79
    if (progress <= .5) moving(source, foot, progress * 2, flying)
    else moving(foot, { x: foot.x + outward.x * 4, y: foot.y, z: foot.z + outward.z * 4 }, (progress - .5) * 2)
  } else {
    pose.visible = progress > .21
    if (progress < .5) moving({ x: foot.x + outward.x * 4, y: foot.y, z: foot.z + outward.z * 4 }, foot, progress * 2)
    else moving(foot, destination, (progress - .5) * 2, flying)
  }
  if (progress === 0 || progress === 1) pose.walk = 0
  pose.stretch = reduced ? 0 : Math.max(0, 1 - Math.abs(progress - .5) * 12)
  return pose
}
