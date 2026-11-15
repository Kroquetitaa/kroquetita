/** Rebuild the web kit from the editable Blender exports. No network or extra dependencies. */
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { Scene, Group, Mesh, Matrix4, Box3, Vector3, PropertyBinding, AnimationMixer } from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js'
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js'
import { adaptCityMap, mapGeometry, recordStandalone, assemblyContract } from './adapt-city-map.mjs'

// GLTFExporter only needs these two browser FileReader operations for embedded buffers.
globalThis.FileReader = class {
  readAsArrayBuffer(blob) { blob.arrayBuffer().then(result => { this.result = result; this.onloadend?.() }) }
  readAsDataURL(blob) { blob.arrayBuffer().then(result => { this.result = `data:${blob.type};base64,${Buffer.from(result).toString('base64')}`; this.onloadend?.() }) }
}
const source = new URL('../art/kroquetita-city-v01/exports/', import.meta.url)
const destination = new URL('../public/models/city/', import.meta.url)
await mkdir(destination, { recursive: true })
const loader = new GLTFLoader()
const report = { version: 2, source: 'art/kroquetita-city-v01/exports', districtSpace: 'world', districtScale: 1, assets: {} }

async function prepare(file, { name = file, extract, select, adapt = false, sourceRoot = source } = {}) {
  const bytes = await readFile(new URL(`${file}.glb`, sourceRoot))
  const gltf = await loader.parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '')
  let scene = gltf.scene
  let animations = gltf.animations
  if (extract) {
    const object = scene.getObjectByName(extract)
    if (!object) throw new Error(`Missing ${extract}`)
    scene = new Scene()
    scene.add(object)
    object.position.set(0, 0, 0)
    object.quaternion.identity()
    object.scale.setScalar(1)
    animations = []
  }
  if (select) {
    const discard = []
    scene.traverse(o => { if (o.isMesh && !select(o.name)) discard.push(o) })
    discard.forEach(o => o.removeFromParent())
    animations = []
  }
  if (adapt) { adaptCityMap(file, scene); animations = animations.filter(c => !['CareerTimeline', 'Idle'].includes(c.name)) }
  if (file === 'avatar') animations = []
  if (file === 'avatar' || file === 'coffee_machine') recordStandalone(file, scene)
  scene.updateMatrixWorld(true)
  if (name === 'factory') {
    const rig = (label, pivot, match) => {
      const anchor = scene.getObjectByName(pivot)
      if (!anchor) throw new Error(`Missing rig pivot ${pivot}`)
      const group = new Group()
      group.name = `Rig_${label}`
      anchor.getWorldPosition(group.position)
      scene.add(group)
      group.updateMatrixWorld(true)
      const members = []
      scene.traverse(o => { if (o.isMesh && match.test(o.name)) members.push(o) })
      members.forEach(o => group.attach(o))
    }
    rig('Left', 'Agent_Left_Joint_1', /^Agent_Left_(Forearm|Gripper)/)
    rig('Right', 'Agent_Right_Joint_1', /^Agent_Right_(Forearm|Gripper)/)
    rig('Croquette', 'Output_Croquette', /^Output_(Croquette|CrispCrumb|Eye|Smile)/)
    scene.updateMatrixWorld(true)
  }
  const before = { meshes: 0, triangles: 0 }
  const originalBounds = new Box3().setFromObject(scene, true)
  const dynamic = new Set()
  for (const clip of animations) for (const track of clip.tracks) {
    const id = PropertyBinding.parseTrackName(track.name).nodeName
    const node = scene.getObjectByName(id) || scene.getObjectByProperty('uuid', id)
    if (!node) throw new Error(`Unresolved animation ${track.name}`)
    dynamic.add(node)
  }
  // Keep interactive demo pivots as well as every animated pivot. Everything else is
  // batched by material in that pivot's local space, so animations stay independent.
  scene.traverse(o => { if (/^(Demo_|Rig_|Career_Stage_|Library_Book_|Hook_Library_Cover_|Breakable_|ExhibitRoot_|Head$|Arm_|Leg_|Body$|Eyes$|Tail$|Arms$|Legs$|Brush(?:[._]?\d+)?$|Laptop$|LaptopLid$|FaceScreen$)/.test(o.name)) dynamic.add(o) })
  const batches = new Map()
  const originals = []
  scene.traverse(o => {
    if (!o.isMesh) return
    before.meshes++
    before.triangles += (o.geometry.index?.count ?? o.geometry.attributes.position.count) / 3
    if (dynamic.has(o) || Array.isArray(o.material)) return
    let anchor = o.parent
    while (anchor.parent && !dynamic.has(anchor)) anchor = anchor.parent
    const key = `${anchor.uuid}:${o.material.uuid}`
    if (!batches.has(key)) batches.set(key, { anchor, material: o.material, geometries: [] })
    const geometry = o.geometry.clone()
    // The kit has no texture maps. UVs are unused and would cost bandwidth and memory.
    for (const attr of Object.keys(geometry.attributes)) if (!['position', 'normal'].includes(attr)) geometry.deleteAttribute(attr)
    if (!geometry.index) geometry.setIndex(Array.from({ length: geometry.attributes.position.count }, (_, i) => i))
    geometry.applyMatrix4(new Matrix4().copy(anchor.matrixWorld).invert().multiply(o.matrixWorld))
    batches.get(key).geometries.push(geometry)
    originals.push(o)
  })
  originals.forEach(o => o.removeFromParent())
  for (const { anchor, material, geometries } of batches.values()) {
    const merged = mergeGeometries(geometries)
    if (!merged) throw new Error('Incompatible geometry attributes')
    const geometry = mergeVertices(merged, 0.00001)
    geometry.computeBoundingSphere()
    const mesh = new Mesh(geometry, material)
    mesh.name = `Batch_${anchor.name || name}_${material.name}`
    mesh.castShadow = true
    mesh.receiveShadow = true
    anchor.add(mesh)
    geometries.forEach(g => g.dispose())
    merged.dispose()
  }
  // Remove unused empty authoring groups, but retain named sockets and animation pivots.
  const prune = o => {
    for (const child of [...o.children]) prune(child)
    if (o !== scene && !o.isMesh && !o.children.length && !dynamic.has(o) && !/Hook|Socket/.test(o.name)) o.removeFromParent()
  }
  prune(scene)
  scene.updateMatrixWorld(true)
  const after = { meshes: 0, triangles: 0 }
  const hooks = {}
  scene.traverse(o => {
    if (o.isMesh) { after.meshes++; after.triangles += (o.geometry.index?.count ?? o.geometry.attributes.position.count) / 3 }
    if (/Hook|Socket/.test(o.name)) hooks[o.name] = o.getWorldPosition(new Vector3()).toArray()
  })
  const bounds = new Box3().setFromObject(scene)
  const result = await new GLTFExporter().parseAsync(scene, { binary: true, animations, onlyVisible: false, trs: true })
  // Verify the actual shipped file, including animation target bindings and finite bounds.
  const check = await loader.parseAsync(result, '')
  const checkBounds = new Box3().setFromObject(check.scene, true)
  if (name === 'avatar') {
    if (!check.scene.getObjectByName('Laptop')?.children.length) throw new Error('Avatar laptop hierarchy was lost')
    if (!check.scene.getObjectByName('FaceScreen')?.geometry?.attributes.uv) throw new Error('Avatar face UVs were lost')
  }
  if (![...checkBounds.min.toArray(), ...checkBounds.max.toArray()].every(Number.isFinite)) throw new Error(`Invalid bounds: ${name}`)
  if (checkBounds.min.distanceTo(originalBounds.min) > 0.0001 || checkBounds.max.distanceTo(originalBounds.max) > 0.0001) throw new Error(`Geometry moved during batching: ${name}`)
  if (check.animations.length !== animations.length || check.animations.some(c => !Number.isFinite(c.duration))) throw new Error(`Animation lost: ${name}`)
  for (const clip of check.animations) for (const track of clip.tracks) {
    if (!check.scene.getObjectByName(PropertyBinding.parseTrackName(track.name).nodeName)) throw new Error(`Broken target: ${track.name}`)
  }
  for (const clip of check.animations) {
    const mixer = new AnimationMixer(check.scene)
    mixer.clipAction(clip).play()
    for (const fraction of [0, 0.25, 0.5, 0.75, 0.99]) {
      mixer.setTime(clip.duration * fraction)
      const pose = new Box3().setFromObject(check.scene)
      if (![...pose.min.toArray(), ...pose.max.toArray()].every(Number.isFinite)) throw new Error(`Invalid animated pose: ${name}`)
    }
    mixer.stopAllAction()
    mixer.uncacheRoot(check.scene)
  }
  await writeFile(new URL(`${name}.glb`, destination), Buffer.from(result))
  report.assets[name] = { bytes: result.byteLength, before, after, bounds: { min: bounds.min.toArray(), max: bounds.max.toArray() }, animations: check.animations.map(c => ({ name: c.name, duration: c.duration })), hooks }
  console.log(`${name}: ${before.meshes} → ${after.meshes} meshes; ${(result.byteLength / 1024).toFixed(0)} KB; ${check.animations.length} clips verified`)
}

await prepare('factory', { adapt: true })
await prepare('hangar', { adapt: true })
await prepare('brain_inside')
await prepare('brain_inside', { name: 'brain_exterior', adapt: true })
await prepare('coffee_machine')
for (const name of ['plaza', 'career', 'library', 'bugs', 'lab', 'transport']) await prepare(name, { adapt: true })
await prepare('avatar')
await prepare('transport', { name: 'drone', extract: 'Drone_Idle' })
await prepare('transport', { name: 'train', extract: 'Monorail_Train' })
await prepare('lab', { name: 'lab_gateway', select: name => /^Lab_(Arch|CyanHeader|Title|Subtitle)/.test(name) })
const castSource = new URL('../art/kroquetita-city-v01/cast/exports/', import.meta.url)
await mkdir(new URL('cast/', destination), { recursive: true })
const cast = JSON.parse(await readFile(new URL('manifest.json', castSource), 'utf8'))
for (const actor of cast) await prepare(actor.id, { name: `cast/${actor.id}`, sourceRoot: castSource })
await writeFile(new URL('manifest.json', destination), JSON.stringify(report, null, 2) + '\n')
await writeFile(new URL('../src/world/blenderGeometry.ts', import.meta.url), `// Generated by npm run assets:city. Coordinates match the shipped GLBs.\nexport const blenderGeometry = ${JSON.stringify(mapGeometry, null, 2)} as const\n`)
await writeFile(new URL('../src/world/blenderAssembly.ts', import.meta.url), `// Generated from the original Blender assembly. Native metres, world-space district assets.\nexport const blenderAssembly = ${JSON.stringify(assemblyContract(), null, 2)} as const\n`)
