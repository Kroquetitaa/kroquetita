/** Integration checks against the actual world and player controller. Node >= 22.15. */
import assert from 'node:assert/strict'
import { registerHooks } from 'node:module'
import { readFile } from 'node:fs/promises'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { Box3, Vector3 } from 'three'

registerHooks({ resolve(specifier, context, next) {
  try { return next(specifier, context) }
  catch (error) {
    if (error.code === 'ERR_MODULE_NOT_FOUND' && specifier.startsWith('.') && !/\.[a-z]+$/i.test(specifier)) return next(`${specifier}.ts`, context)
    throw error
  }
}})
const { world } = await import('../src/world/layout.ts')
const { blenderAssembly } = await import('../src/world/blenderAssembly.ts')
const { lab } = await import('../src/world/lab.ts')
const { zones } = await import('../src/world/zones.ts')
const { cityStations } = await import('../src/world/cityKit.ts')
const { bookLanding } = await import('../src/world/bookLanding.ts')
const { createBody, stepBody, rampHeight, HALF, HEIGHT } = await import('../src/game/physics.ts')
const idle = { x: 0, z: 0, run: false, jump: false }
const simulation = { ...world, gravityScale: 1 }
function free(x, z, label) {
  const blocking = world.colliders.filter(b => x + HALF > b.min[0] && x - HALF < b.max[0] && z + HALF > b.min[2] && z - HALF < b.max[2] && HEIGHT > b.min[1] && b.max[1] > 0.32)
  assert.equal(blocking.length, 0, `${label}: arrival/interaction point is inside an obstacle`)
}
for (const zone of zones) free(...zone.arrive, zone.id)
for (const station of cityStations) free(station.position[0], station.position[2], station.id)
free(world.spawn[0], world.spawn[2], 'spawn')
for (const exhibit of lab.exhibits) free(exhibit.pad.center[0], exhibit.pad.center[2], exhibit.id)
for (const id of ['factory', 'hangar']) {
  const zone = zones.find(z => z.id === id)
  const body = createBody([zone.arrive[0], 0, zone.arrive[1]])
  for (let n = 0; n < 180; n++) stepBody(body, { ...idle, z: -1 }, 1 / 60, simulation)
  assert.ok(body.pos[2] < zone.arrive[1] - 2, `${id}: entrance must be walkable`)
  assert.ok(body.pos[1] < 0.4, `${id}: entrance must not teleport the player onto a machine`)
}
// Existing jump/double-jump/landing and collectibles are untouched by the kit's colliders.
const player = createBody(world.spawn)
stepBody(player, { ...idle, jump: true }, 1 / 60, simulation)
assert.ok(player.vel[1] > 0 && !player.grounded, 'original jump')
stepBody(player, { ...idle, jump: true }, 1 / 60, simulation)
assert.ok(player.justDoubleJumped, 'original double jump')
for (let n = 0; n < 240; n++) stepBody(player, idle, 1 / 60, simulation)
assert.ok(player.grounded && Math.abs(player.pos[1]) < 0.01, 'original landing')
assert.equal(world.coins.length, 16, 'existing collectible layout')
assert.equal(world.blocks.length, 11, 'career stages')
assert.equal(world.props.campus.books.length, 8, 'education books')
assert.equal(lab.exhibits.length, 12, 'interactive concepts')
for (let index = 0; index < 8; index++) {
  const point = bookLanding(index)
  const reader = createBody(point)
  for (let n = 0; n < 120; n++) stepBody(reader, idle, 1 / 60, simulation)
  assert.ok(reader.grounded && Math.abs(reader.pos[1] - point[1]) < .01,
    `book ${index}: clicking must land on this book, not push the player onto its neighbour`)
}

// Simulate the actual controller: arcs must land on the intended native roof/deck.
for (const [index, launcher] of world.launchers.entries()) {
  const jumper = createBody([...launcher.from])
  jumper.vel = [...launcher.velocity]
  jumper.grounded = false
  jumper.ballistic = launcher.time + .3
  let landed = false
  for (let frame = 0; frame < 240; frame++) {
    stepBody(jumper, idle, 1 / 120, simulation)
    if (jumper.grounded) { landed = true; break }
  }
  assert.ok(landed, 'launcher ' + index + ': no landing')
  assert.ok(Math.abs(jumper.pos[1] - launcher.to[1]) < .02 &&
    Math.hypot(jumper.pos[0] - launcher.to[0], jumper.pos[2] - launcher.to[2]) < .45,
    'launcher ' + index + ': landed on ' + JSON.stringify(jumper.pos) + ' instead of ' + JSON.stringify(launcher.to))
}

// The original bridge is a sloped walkable surface, not one enormous AABB.
for (const ramp of world.ramps) {
  // Approach from the side behind the skyline; a tower stands directly in front.
  const walker = createBody([ramp.start[0] + 1.6, 0, ramp.start[2] - .4])
  for (let frame = 0; frame < 35; frame++) stepBody(walker, { ...idle, x: -1 }, 1 / 60, simulation)
  walker.vel[0] = 0
  for (let frame = 0; frame < 210; frame++) stepBody(walker, { ...idle, z: -1 }, 1 / 60, simulation)
  assert.ok(walker.pos[2] < ramp.end[2] - .2 && walker.pos[1] > 4.45 && walker.grounded,
    'native bridge ascent: ' + JSON.stringify(walker.pos))
  for (let frame = 0; frame < 235; frame++) stepBody(walker, { ...idle, z: 1 }, 1 / 60, simulation)
  assert.ok(walker.pos[2] > ramp.start[2] - .6 && walker.pos[1] < .3 && walker.grounded,
    'native bridge descent: ' + JSON.stringify(walker.pos))
  const midpoint = [(ramp.start[0] + ramp.end[0]) / 2, (ramp.start[2] + ramp.end[2]) / 2]
  const below = createBody([midpoint[0], 0, midpoint[1]])
  for (let frame = 0; frame < 30; frame++) stepBody(below, idle, 1 / 60, simulation)
  assert.equal(below.pos[1], 0, 'walking underneath must not teleport onto a bridge')
  const onBridge = createBody([midpoint[0], rampHeight(ramp, ...midpoint), midpoint[1]])
  stepBody(onBridge, { ...idle, jump: true }, 1 / 60, simulation)
  assert.ok(onBridge.justJumped && !onBridge.grounded, 'jumping from the native bridge')
}
console.log('PASS: native arrivals, 12 concept pads, workshops, 12 ballistic jumps, 16 coins, 8 book landings, bridge ascent/descent/jump/underside.')

// Test shipped meshes, not just source metadata: every live character has its Blender rig.
const { talkers } = await import('../src/data/folk.ts')
const loader = new GLTFLoader()
async function model(name) {
  const bytes = await readFile(new URL(`../public/models/city/${name}.glb`, import.meta.url))
  return (await loader.parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset+bytes.byteLength), '')).scene
}
for (const id of [...talkers.map(t=>t.id), 'intern', 'manager', 'Claude','ChatGPT','Gemini','Qwen3','Mistral']) {
  const scene=await model(`cast/${id}`)
  for(const joint of ['Head','Arms','Arm_L','Arm_R','Leg_L','Leg_R']) assert.ok(scene.getObjectByName(joint),`${id}: missing ${joint} joint`)
  const size=new Box3().setFromObject(scene,true).getSize(new Vector3())
  assert.ok(size.y>.9 && size.y<1.6,`${id}: incorrect game scale`)
}
for(const id of ['cat','duck','bug','boss','roomba']) {
  const box=new Box3().setFromObject(await model(`cast/${id}`),true)
  assert.ok(!box.isEmpty() && Number.isFinite(box.max.y),`${id}: missing geometry`)
}
const avatar=await model('avatar')
for(const joint of ['Head','Arm_L','Arm_R','Leg_L','Leg_R','Laptop','LaptopLid']) assert.ok(avatar.getObjectByName(joint),`avatar: ${joint}`)
const mask = avatar.getObjectByName('FaceScreen')
assert.ok(mask?.isMesh && mask.geometry.getAttribute('uv')?.count > 0, 'avatar: original animated mask needs a UV surface')
assert.ok(new Box3().setFromObject(mask, true).getSize(new Vector3()).length() > .2, 'avatar: mask must remain visible after optimization')
const library=await model('library')
for(let i=0;i<8;i++) {
  const node=library.getObjectByName(`Library_Book_${String(i+1).padStart(2,'0')}`)
  assert.ok(node,`missing book ${i}`)
  const center=node.getWorldPosition(new Vector3()), target=blenderAssembly.books[i].position
  assert.ok(center.distanceTo(new Vector3(...target))<.001,`book ${i}: physics/model mismatch`)
}
const career=await model('career'); let stages=0
career.traverse(node=>{
  if(!/^Career_Stage_/.test(node.name)) return
  const index=Number(node.name.slice(13,15))-1, block=world.blocks[index]
  const center=node.getWorldPosition(new Vector3())
  assert.ok(Math.abs(center.x-block.x)<.001 && Math.abs(center.z-block.z)<.001,`career ${index}: physics/model mismatch`)
  stages++
})
assert.equal(stages,11)

// Compare actual shipped geometry with the original .blend contract, not an old layout.
for (const [name, district] of Object.entries(blenderAssembly.districts)) {
  const scene = await model(district.asset)
  scene.updateMatrixWorld(true)
  const root = scene.getObjectByName(district.root)
  assert.ok(root, name + ': native assembly root')
  root.matrixWorld.elements.forEach((value, i) => assert.ok(Math.abs(value - district.matrix[i]) < .0001,
    name + ': native Blender transform changed'))
  const actual = new Box3().setFromObject(scene, true)
  for (const edge of ['min', 'max']) {
    actual[edge].toArray().forEach((value, i) => assert.ok(Math.abs(value - district.bounds[edge][i]) < .08,
      name + ': source .blend geometry bounds changed'))
  }
  assert.deepEqual(district.scale, [1, 1, 1], name + ': district must not be stretched to the old map')
}
const kit=JSON.parse(await readFile(new URL('../public/models/city/manifest.json',import.meta.url),'utf8'))
assert.equal(kit.assets.avatar.animations.length, 0, 'avatar: baked clips must not overwrite the live laptop/typing controller')
for(const name of ['career','plaza','library','bugs','lab','transport','factory','hangar','brain_inside']) assert.ok(kit.assets[name],`missing district ${name}`)
const bytes=Object.values(kit.assets).reduce((n,a)=>n+a.bytes,0)
assert.ok(bytes<12_000_000,'complete kit exceeds 12 MB transfer budget')
console.log(`PASS: 9 Blender districts, all ${talkers.length+7} speaking characters + avatar, 5 animals/robots, all animated joints, 8 book positions, 11 career positions. Complete kit: ${(bytes/1e6).toFixed(2)} MB.`)
