import { monthIndex, NOW, stages, type Stage } from '../data/career'
import { education } from '../data/education'
import { blenderAssembly } from './blenderAssembly'

export type Vec3 = [number, number, number]
export interface AABB { min: Vec3; max: Vec3 }
export interface Box { center: Vec3; size: Vec3 }
export type Tier = 'stone' | 'metal' | 'glass' | 'core'
export interface Block {
  stage: Stage
  index: number
  row: number
  x: number
  z: number
  width: number
  depth: number
  height: number
  tier: Tier
  variant: number
  emblem: Vec3
  stripY: number
  current: boolean
}
export interface Coin { id: number; position: Vec3 }
export interface Pad { position: Vec3; radius: number; power: number }
export interface Launcher { from: Vec3; to: Vec3; velocity: Vec3; time: number; apex: Vec3 }
export interface TimelineBar { index: number; from: number; to: number; lane: number }

export const GRAVITY = 16
export const BRAIN_SCALE = 1.9
export const LID = { z: -.35, depth: .85, inset: .15 }
const vec = (p: readonly number[]): Vec3 => [p[0], p[1], p[2]]
const box = (center: Vec3, size: Vec3): Box => ({ center, size })
const boundsOf = (b: Box): AABB => ({
  min: b.center.map((v, i) => v - b.size[i] / 2) as Vec3,
  max: b.center.map((v, i) => v + b.size[i] / 2) as Vec3,
})
const boxOf = (b: { min: readonly number[]; max: readonly number[] }): Box => ({
  center: b.min.map((v, i) => (v + b.max[i]) / 2) as Vec3,
  size: b.min.map((v, i) => b.max[i] - v) as Vec3,
})
const solid = (b: Box) => ({ ...b, collider: boundsOf(b) })
const hook = (name: keyof typeof blenderAssembly.hooks): Vec3 => vec(blenderAssembly.hooks[name])

/** Gameplay follows the original Blender assembly in metres, without scaling its districts. */
function arc(from: Vec3, to: Vec3, duration?: number): Launcher {
  const dx = to[0] - from[0], dy = to[1] - from[1], dz = to[2] - from[2]
  const time = duration ?? Math.min(2, Math.max(1, .85 + Math.hypot(dx, dz) * .085 + Math.max(0, dy) * .07))
  const vy = (dy + .5 * GRAVITY * time * time) / time
  const t = vy / GRAVITY
  return { from, to, time, velocity: [dx / time, vy, dz / time],
    apex: [from[0] + dx / time * t, from[1] + vy * t - .5 * GRAVITY * t * t, from[2] + dz / time * t] }
}

function library() {
  if (blenderAssembly.books.length !== education.length) throw new Error('Blender education books and portfolio data differ')
  const books = blenderAssembly.books.map(b => box(vec(b.center), vec(b.size)))
  const entry = hook('Hook_Library_Entry')
  return {
    origin: vec(blenderAssembly.districts.library.position), books,
    top: Math.max(...blenderAssembly.books.map(b => b.top)),
    shelves: [-20.35, -13.65].map(x => box([x, 2.3, -12.65], [3.5, 4.6, .7])),
    lecterns: [box([-16.25, .55, -9.25], [.9, 1.1, .6])],
    arch: { position: [-17, 0, -3.35] as Vec3, yaw: 0 },
    path: Array.from({ length: 4 }, (_, i): Vec3 => [entry[0], 0, entry[2] + 1.5 - i * .5]),
    signpost: [-14.5, 0, -2] as Vec3,
  }
}

/** Compatibility metadata for the minimap and original breakable controllers. */
function breakRoom() {
  const target = (id: string) => {
    const item = blenderAssembly.breakables.find(b => b.id === id)
    if (!item) throw new Error('Missing Blender breakable: ' + id)
    return solid(boxOf(item))
  }
  const gauss = target('gauss'), dice = target('dice'), pinata = target('pinata'), stack = target('stack')
  const sheet = target('table')
  return {
    origin: vec(blenderAssembly.districts.bugs.position),
    area: { minX: 11, maxX: 23, minZ: -14, maxZ: -2 },
    arch: { position: [17, 0, -2.95] as Vec3, yaw: 0 },
    path: Array.from({ length: 4 }, (_, i): Vec3 => [17, 0, -.8 - i * .45]),
    signpost: [14.3, 0, -1.8] as Vec3,
    board: [17, 0, -13.35] as Vec3,
    fences: blenderAssembly.colliders.filter(c => c.district === 'bugs' && /Wall|curb/i.test(c.name)).map(boxOf),
    tests: target('tests'), network: target('network'), graph: target('graph'), prs: target('prs'), legacy: target('legacy'),
    gauss: { center: gauss.center, pitch: .25, depth: gauss.size[2], count: 13, bars: [gauss] },
    dice: { size: .6, pen: { minX: dice.collider.min[0], maxX: dice.collider.max[0], minZ: dice.collider.min[2], maxZ: dice.collider.max[2] }, dice: [dice, dice] },
    pinata: { center: pinata.center, half: 1, height: pinata.size[1], rope: .65, posts: [] as ReturnType<typeof solid>[] },
    stack: { ...stack, frame: [.8, .2, .6] as Vec3, base: 4, limit: 9 },
    table: { ...sheet, columns: 6, rows: 8, cell: [.25, .16] as [number, number], foot: .1 },
    overfit: target('overfit'),
  }
}

function build() {
  if (stages.length !== blenderAssembly.stages.length) throw new Error('Blender career stages and portfolio data differ')
  const n = stages.length, perRow = Math.ceil(n / 2)
  const blocks: Block[] = stages.map((stage, i) => {
    const native = blenderAssembly.stages[i]
    return {
      stage, index: i, row: i < perRow ? 0 : 1,
      x: native.center[0], z: native.center[2], width: native.size[0], depth: native.size[2], height: native.roofY,
      tier: i === n - 1 ? 'core' : i < n * .3 ? 'stone' : i < n * .56 ? 'metal' : 'glass',
      variant: stages.slice(0, i).filter(s => s.discipline === stage.discipline).length,
      emblem: [0, 1.05, -.2], stripY: Math.max(.2, native.roofY * .37), current: i === n - 1,
    }
  })
  const deck = blenderAssembly.colliders.find(c => c.name === 'Career_CoreDeck')
  if (!deck) throw new Error('Missing native career lookout collider')
  const summit = boxOf(deck), summitTop = deck.max[1]
  const first = blocks[0]
  const padOn = (i: number): Vec3 => {
    const p = blenderAssembly.stages[i].hook
    return [p[0], blocks[i].height, p[2]]
  }
  const landOn = (i: number): Vec3 => [blocks[i].x - .5, blocks[i].height, blocks[i].z + .44]
  const lookout = hook('Hook_Career_Lookout')
  const launchers = [
    arc([first.x - 1.8, 0, first.z + 1.55], landOn(0)),
    // Two roofs sit beneath the native lookout: use a shallow arc with headroom.
    ...blocks.slice(0, -1).map((_, i) => arc(padOn(i), landOn(i + 1), i === 7 || i === 8 ? .45 : undefined)),
    arc(padOn(n - 1), [lookout[0], summitTop, lookout[2]]),
  ]
  const upper = blocks[perRow]
  const elevator = solid(box([upper.x + upper.width / 2 + .85, .125, upper.z], [1.5, .25, 1.5]))
  const coffee = boxOf(blenderAssembly.standalone.coffee_machine.bounds)
  const desk = box([-8.5, .41, 2.5], [3.1, .82, 1.1])
  const table = box([3.55, .42, .75], [1.7, .84, 1.7])
  const key = (x: number, width: number) => solid(box([x, .15, -.8], [width, .3, 1]))
  const crate: Vec3 = [1.1, .6, .65]
  const piles = [box([24.6, .9, -11], [1.1, 1.8, .65]), box([26, .6, -11], [1.1, 1.2, .65])]
  const park = {
    racks: box([24.5, 1.3, -5], [3.2, 2.6, 1.2]), cloud: [24.5, 4.2, -5] as Vec3,
    sign: [24.5, 0, -2.8] as Vec3, globe: box([24.5, .225, 0], [1.6, .45, 1.6]),
    containers: { center: [25.3, 0, -11] as Vec3, size: crate, piles,
      hoisted: { ...solid(box([26, 1.5, -11], crate)), lift: 1.2 } },
    belt: box([-25, .5, -7], [4.2, 1, 1.1]), gates: [-26.3, -25, -23.7],
    tower: box([-25, 1.3, -12], [1.8, 2.6, 1.8]), towerHeight: 5,
    gpu: box([-25, .875, -1.5], [3.2, 1.75, .6]),
    keys: [key(-9.45, 1.5), key(-7.85, 1), key(-6.71, 1)],
  }
  const city = {
    bar: box([8.5, 1.3, -4], [3, 2.6, 2.2]),
    benches: [-3.8, 3.8].map(x => box([x, .45, -1.25], [2.1, .22, .58])),
  }
  const campus = library(), arcade = breakRoom()
  const props = {
    elevator: { ...elevator, top: upper.height }, summit,
    portals: [[8.5, 0, -7.7], [blocks[perRow + 1].x - .45, blocks[perRow + 1].height, blocks[perRow + 1].z + .45]] as [Vec3, Vec3],
    coffee, desk, table,
    button: box([8.4, .25, 2.4], [1.4, .5, 1.4]), server: box([9, 1.3, -.6], [1.7, 2.6, 1.7]),
    duck: [-8.6, 0, 12] as Vec3, park, city, campus, arcade,
  }
  const left = -7.5, right = 7.5
  const firstYear = Math.floor(Math.min(...stages.map(s => monthIndex(s.start))) / 12)
  const lastYear = Math.floor(NOW / 12) + 1
  const origin = firstYear * 12, span = lastYear * 12 - origin
  const xAt = (month: number) => left + (month - origin) / span * (right - left)
  const laneEnds: number[] = []
  const bars: TimelineBar[] = stages.map((stage, index) => {
    const from = monthIndex(stage.start), to = stage.end ? monthIndex(stage.end) + 1 : NOW + 1
    let lane = laneEnds.findIndex(end => end <= from + 1)
    if (lane === -1) lane = laneEnds.length
    laneEnds[lane] = to
    return { index, from: xAt(from), to: xAt(to), lane }
  })
  const timeline = { left, right, z: -5.83, lanePitch: .15, lanes: laneEnds.length, bars,
    years: Array.from({ length: lastYear - firstYear + 1 }, (_, i) => ({ year: firstYear + i, x: xAt((firstYear + i) * 12) })), today: xAt(NOW + 1) }
  const coinSpots: Vec3[] = [
    ...launchers.slice(0, -1).map(l => [l.apex[0], l.apex[1] + .45, l.apex[2]] as Vec3),
    [lookout[0] + 1, summitTop + .75, lookout[2]], [-7, .75, 4.2], [1, .75, 5], [7, .75, 4.2], [17, .75, 14],
  ]
  const colliders: AABB[] = [
    ...blenderAssembly.colliders.map(c => ({ min: vec(c.min), max: vec(c.max) })),
    boundsOf(coffee), boundsOf(props.button), boundsOf(props.server),
    props.elevator.collider, ...park.keys.map(k => k.collider),
  ]
  const core = hook('Hook_Career_CoreFocus')
  return {
    blocks, launchers, coins: coinSpots.map((position, id): Coin => ({ id, position })),
    pads: [{ position: [-10, 0, 5] as Vec3, radius: .6, power: 10.5 }], props, timeline, colliders,
    ramps: blenderAssembly.ramps,
    spawn: [-2.2, 0, 4.6] as Vec3,
    trophy: [lookout[0], summitTop + 1.2, lookout[2]] as Vec3,
    core, stem: [core[0], core[1] - 1.83, core[2]] as Vec3, top: summitTop,
    plaza: { minX: -9, maxX: 9, minZ: -2.4, maxZ: 5.4 },
    view: { position: [53, 62, 75] as Vec3, look: [0, 1, -3] as Vec3, halfWidth: 42.5 },
    bounds: { minX: -29, maxX: 29, minZ: -32.5, maxZ: 26.5 },
  }
}

export const world = build()
