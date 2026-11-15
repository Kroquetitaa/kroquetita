import assert from 'node:assert/strict'
import { registerHooks } from 'node:module'
import { readFile } from 'node:fs/promises'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { Vector3 } from 'three'
registerHooks({ resolve(specifier, context, next) {
  try { return next(specifier, context) } catch (e) {
    if (e.code === 'ERR_MODULE_NOT_FOUND' && specifier.startsWith('.') && !/\.[a-z]+$/i.test(specifier)) return next(specifier + '.ts', context)
    throw e
  }
}})
const { cityNavigation, cityAirNavigation } = await import('../src/game/cityNavigation.ts')
const { spawnGroundAgent, nearestGroundPoint, randomGroundPoint, navigateGround, steerGround, sweepGround } = await import('../src/game/groundNavigation.ts')
let seed = 731
const random = () => { seed = Math.imul(seed, 1664525) + 1013904223 | 0; return (seed >>> 0) / 4294967296 }

// Independent circular-footprint overlap oracle (not the navigator's expanded rectangles).
function clear(profile, x, z, label) {
  const { area: a, radius: r } = profile
  assert(x - r >= a.minX - 1e-6 && x + r <= a.maxX + 1e-6 && z - r >= a.minZ - 1e-6 && z + r <= a.maxZ + 1e-6, label + ': full footprint outside district')
  for (const b of profile.obstacles()) {
    if (b.max[1] <= .04 || b.min[1] >= profile.height) continue
    const cx = Math.max(b.min[0], Math.min(b.max[0], x)), cz = Math.max(b.min[2], Math.min(b.max[2], z))
    assert(Math.hypot(x - cx, z - cz) >= r - 1e-6, label + ': geometry overlap')
  }
  for (const c of profile.circles ?? []) assert(Math.hypot(x - c.x, z - c.z) >= r + c.radius - 1e-6, label + ': overlaps a stationary character')
}
function stepCheck(p, before, after, budget, label) {
  assert(Math.hypot(after.x - before.x, after.z - before.z) <= budget + 1e-6, label + ': teleport/speed overshoot')
  for (let i = 0; i <= 6; i++) clear(p, before.x + (after.x - before.x) * i / 6, before.z + (after.z - before.z) * i / 6, label)
}

const wall = { area: { minX: -6, maxX: 6, minZ: -6, maxZ: 6 }, radius: .4, height: 1.5, obstacles: () => [{ min: [-.025, 0, -2], max: [.025, 3, 2] }] }
const stop = sweepGround(wall, -4, 0, 8, 0, true)
assert(stop.x < -.425 && stop.blocked, 'thin wall must stop a high-speed crossing')
stepCheck(wall, { x: -4, z: 0 }, stop, 8, 'thin wall')
const agent = spawnGroundAgent(wall, [-4, 0]); agent.tx = 4; agent.tz = 0
for (let i = 0; i < 600; i++) { const before = { ...agent }; navigateGround(wall, agent, 2, 1 / 30); stepCheck(wall, before, agent, 2 / 30, 'A* detour') }
assert(Math.hypot(agent.x - 4, agent.z) < .15, 'A* must reach the far side by going around the wall')
const sealed = { ...wall, obstacles: () => [{ min: [-6, 0, -6], max: [6, 3, 6] }] }
assert.equal(randomGroundPoint(sealed, random), null, 'occupied district must not return an unsafe fallback')
assert.equal(nearestGroundPoint(sealed, 0, 0), null)

// Five simulated minutes per actor, with fleeing, chasing, variable deltas and blocked goals.
const starts = { cat: [-14.5, -5.3], bug: [17, -3.5], manager: [-12.6, 14.1], roomba: [22.8, 14.6], duck: [-8.6, 12], intern: [-5.9, 3.8], boss: [0, 22.4] }
for (const [id, profile] of Object.entries(cityNavigation)) {
  const actor = spawnGroundAgent(profile, starts[id]); let travel = 0
  const speed = id === 'boss' ? 3.4 : id === 'cat' ? 5 : id === 'duck' ? 12 : 3.8
  let heading = random() * Math.PI * 2
  for (let frame = 0; frame < 9000; frame++) {
    const dt = frame % 91 === 0 ? .05 : 1 / 30, before = { x: actor.x, z: actor.z }
    if (id === 'bug' || id === 'roomba' || id === 'duck') {
      if (frame % 39 === 0) heading += (random() - .5) * 3
      const move = id === 'duck'
        ? sweepGround(profile, actor.x, actor.z, Math.sin(heading) * speed * dt, Math.cos(heading) * speed * dt, true)
        : steerGround(profile, actor.x, actor.z, heading, speed * dt, frame % 2 ? 1 : -1)
      actor.x = move.x; actor.z = move.z
      heading = move.heading ?? (move.blocked ? heading + 1.3 : heading)
    } else {
      if (frame % 150 === 0) {
        const target = randomGroundPoint(profile, random)
        assert(target); [actor.tx, actor.tz] = target
        // Chase/flee goals occasionally point outside their district: the route must stay inside.
        if (frame % 600 === 0) { actor.tx += 20; actor.tz -= 20 }
      }
      navigateGround(profile, actor, speed, dt)
    }
    stepCheck(profile, before, actor, speed * dt, id)
    travel += Math.hypot(actor.x - before.x, actor.z - before.z)
  }
  assert(travel > 5, id + ': actor must actually move, not merely pass by freezing')
  console.log(`PASS ${id}: 5 minutes, ${travel.toFixed(1)}m, no obstacle crossings or district exits`)
}

// The radius must enclose the delivered mesh, including controller scale and squash.
const scales = { cat: 1.1, bug: 1.5, manager: 1.15, roomba: 1.12, duck: 1.05, intern: .74, boss: 1.3 }
const loader = new GLTFLoader(), vertex = new Vector3()
for (const [id, profile] of Object.entries(cityNavigation)) {
  const bytes = await readFile(new URL(`../public/models/city/cast/${id}.glb`, import.meta.url))
  const object = (await loader.parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '')).scene
  if (id === 'manager') { object.getObjectByName('Arm_R').rotation.x = -1.35; object.getObjectByName('Leg_L').rotation.x = .8 }
  if (id === 'cat') { object.getObjectByName('Body').rotation.x = -.5; object.getObjectByName('Tail').rotation.y = .6 }
  if (id === 'duck') object.rotation.z = .25
  object.updateMatrixWorld(true); let radius = 0
  object.traverse(mesh => {
    if (!mesh.isMesh) return
    const positions = mesh.geometry.attributes.position
    for (let i = 0; i < positions.count; i++) { vertex.fromBufferAttribute(positions, i).applyMatrix4(mesh.matrixWorld); radius = Math.max(radius, Math.hypot(vertex.x, vertex.z)) }
  })
  assert(profile.radius >= radius * scales[id], `${id}: shipped GLB exceeds its navigation footprint`)
}
console.log('PASS thin-wall sweep, A* detour, occupied-space failure, and all shipped GLB footprint sizes')

const { safeAirPoint, stepAirFlight, airSegmentFree } = await import('../src/game/airNavigation.ts')
const air = { area: wall.area, radius: .65, obstacles: wall.obstacles }
let flying = [-4, 1, 0]
for (let i = 0; i < 600; i++) {
  const next = stepAirFlight(air, flying, [4, 1, 0], .12)
  assert(airSegmentFree(air, flying, next), 'drone crossed wall while climbing')
  assert(Math.hypot(...next.map((v, axis) => v - flying[axis])) <= .120001)
  flying = next
}
assert(Math.hypot(flying[0] - 4, flying[1] - 1, flying[2]) < .15, 'drone must fly over the wall and reach the player')
const airCity = cityAirNavigation
const stops = [[-2.2,1.7,4.6], [-17,1.7,-2.5], [17,1.7,-2.45], [0,1.7,6.5], [17,1.7,14], [-17,1.7,14.2], [0,6.2,-20]]
flying = safeAirPoint(airCity, stops[0])
for (let i = 0; i < 3600; i++) {
  const target = stops[Math.floor(i / 500) % stops.length]
  if (i % 500 === 0) flying = safeAirPoint(airCity, target) // player fast travel: safe reappearance, not a flight through the city
  const next = stepAirFlight(airCity, flying, [target[0] + Math.sin(i * .01) * 3, target[1], target[2] + Math.cos(i * .01) * 3], .15)
  assert(airSegmentFree(airCity, flying, next), 'drone intersects city geometry')
  assert(Math.hypot(...next.map((v, axis) => v - flying[axis])) <= .150001)
  flying = next
}
console.log('PASS drone: wall overflight, safe fast-travel reappearance and 2 minutes around 7 city locations')
