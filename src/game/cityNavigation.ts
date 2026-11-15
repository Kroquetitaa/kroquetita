import { world } from '../world/layout'
import { areaOf } from '../world/zones'
import { talkers } from '../data/folk'
import { blenderAssembly } from '../world/blenderAssembly'
import { airObstacles } from './airObstacles'
import type { GroundProfile } from './groundNavigation'

const circles = [
  ...talkers.map(t => ({ x: t.position[0], z: t.position[1], radius: .34 })),
  { x: world.props.table.center[0], z: world.props.table.center[2], radius: 1.7 },
]
// Player smash targets deliberately have no solid player collider. Inhabitants must still
// go around their real pedestals; otherwise the Bugs district appears to have empty rows.
let colliderSource = world.colliders
let colliderCount = colliderSource.length
let navigationObstacles = [...colliderSource, ...blenderAssembly.breakables]
const obstacles = () => {
  if (colliderSource !== world.colliders || colliderCount !== world.colliders.length) {
    colliderSource = world.colliders; colliderCount = colliderSource.length
    navigationObstacles = [...colliderSource, ...blenderAssembly.breakables]
  }
  return navigationObstacles
}
const profile = (area: GroundProfile['area'], radius: number, height: number): GroundProfile => ({ area, radius, height, obstacles, circles })
/** Circular footprints enclose the shipped GLB vertices, controller scale and animated limbs. */
export const cityNavigation = {
  cat: profile(areaOf('library'), .57, 1.2),
  bug: profile(areaOf('arcade'), .62, .45),
  manager: profile(areaOf('hangar'), .74, 1.55),
  roomba: profile({ ...areaOf('factory'), minZ: 11.7 }, .67, .4),
  duck: profile(world.bounds, .88, 1.3),
  intern: profile(world.bounds, .37, 1.1),
  boss: profile({ minX: -10, maxX: 10, minZ: 18.1, maxZ: 26.4 }, 3.1, 2.6),
}

let flightSource = navigationObstacles
let flightObstacles = [...flightSource, ...airObstacles]
export const cityAirNavigation = { area: world.bounds, radius: .65, obstacles: () => {
  const ground = obstacles()
  if (ground !== flightSource) { flightSource = ground; flightObstacles = [...ground, ...airObstacles] }
  return flightObstacles
} }
