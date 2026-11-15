/** Native Blender assembly contract. Never depends on the legacy gameplay layout. */
import { readFile } from 'node:fs/promises'
import { Box3, Group, Matrix4, Vector3 } from 'three'

const native = JSON.parse(await readFile(new URL('../art/kroquetita-city-v01/exports/native-assembly.json', import.meta.url), 'utf8'))
const clean = value => JSON.parse(JSON.stringify(value, (_, item) => typeof item === 'number' ? Math.round(item * 1e7) / 1e7 : item))
export const blenderAssembly = {
  version: 2, source: 'art/kroquetita-city-v01/kroquetita-city.blend', restFrame: 150,
  units: 'metres', up: '+Y', districtAssetSpace: 'world', standaloneAssetSpace: 'local',
  districts: {}, standalone: clean(native.standalone), camera: clean(native.camera),
  stages: [], books: [], exhibits: [], breakables: [], hooks: {}, colliders: [], ramps: [], surfaces: [],
  spawn: clean(native.standalone.avatar.position), water: null,
}
export const mapGeometry = { colliders: blenderAssembly.colliders, breakables: blenderAssembly.breakables, hooks: blenderAssembly.hooks }
const xyz = object => object.getWorldPosition(new Vector3()).toArray()
const boxData = box => ({ min: box.min.toArray(), max: box.max.toArray(), center: box.getCenter(new Vector3()).toArray(), size: box.getSize(new Vector3()).toArray() })
const boundsOf = object => new Box3().setFromObject(object, true)
const find = (root, name) => root.getObjectByName(name) || root.getObjectByName(name.replaceAll(' ', '_'))
function groupMatching(root, name, pattern, position) {
  root.updateMatrixWorld(true)
  const members = root.children.filter(object => pattern.test(object.name))
  const group = new Group(); group.name = name; group.position.fromArray(position); root.add(group)
  root.updateMatrixWorld(true)
  members.forEach(object => group.attach(object))
  return group
}
function collider(name, district, box) {
  const data = boxData(box)
  if (data.size.some(value => value < .015)) return
  blenderAssembly.colliders.push({ name, district, min: data.min, max: data.max })
}

/** Preserve every authored vertex; the only transform is its original assembly matrix. */
export function adaptCityMap(name, scene) {
  const metadata = native.districts[name]
  if (!metadata) throw new Error(`No native assembly for ${name}`)
  const root = scene.getObjectByName(metadata.root)
  if (!root) throw new Error(`Missing native root ${metadata.root}`)
  new Matrix4().fromArray(metadata.matrix).decompose(root.position, root.quaternion, root.scale)
  scene.updateMatrixWorld(true)
  const authoredBounds = boundsOf(scene)
  const expected = metadata.bounds
  const boundError = Math.max(...authoredBounds.min.toArray().map((x,i)=>Math.abs(x-expected.min[i])), ...authoredBounds.max.toArray().map((x,i)=>Math.abs(x-expected.max[i])))
  // Text/curve evaluated bounds in Blender may include a small outline margin.
  if (boundError > .08) throw new Error(`Native Blender bounds mismatch for ${name}: ${boundError}`)
  if (metadata.scale.some(value => Math.abs(value-1) > 1e-6)) throw new Error(`Non-native district scale in ${name}`)
  blenderAssembly.districts[name] = {
    asset: name === 'brain_inside' ? 'brain_exterior' : name,
    root: metadata.root, position: metadata.position, quaternion: metadata.quaternion,
    scale: metadata.scale, matrix: metadata.matrix, bounds: boxData(authoredBounds),
    validation: { comparedTo: 'kroquetita-city.blend frame 150', maxBoundsError: boundError },
  }

  if (name === 'plaza') {
    find(root, 'AvatarRoot')?.removeFromParent()
    find(root, 'CoffeeRoot')?.removeFromParent()
    find(root, 'Team_Engineer')?.removeFromParent()
    find(root, 'Team_Designer')?.removeFromParent()
  }
  if (name === 'transport') {
    const water = find(root, 'Reflecting lagoon')
    if (water) {
      blenderAssembly.water = boxData(boundsOf(water))
      water.removeFromParent()
    }
    const bridge = find(root, 'Brain bridge')
    if (bridge?.isMesh) {
      bridge.geometry.computeBoundingBox()
      const box = bridge.geometry.boundingBox
      const start = new Vector3(0, box.max.y, box.max.z).applyMatrix4(bridge.matrixWorld)
      const end = new Vector3(0, box.max.y, box.min.z).applyMatrix4(bridge.matrixWorld)
      blenderAssembly.ramps.push({ name: bridge.name, width: box.max.x-box.min.x, start: start.toArray(), end: end.toArray(), ...boxData(boundsOf(bridge)) })
    }
  }
  if (name === 'career') {
    groupMatching(root, 'Rig_Core', /^Career_(Core|Hemisphere|Cortex|Synapse|Brain|Corpus|Gyrus)/, [0,6.03,-1.74])
    root.children.filter(node=>/^Career_Stage_/.test(node.name)).forEach(node=>{
      const index=Number(node.name.slice(13,15))-1, number=String(index+1).padStart(2,'0')
      const tower=find(node,`Career_${number}_Tower`), roof=find(node,`Career_${number}_Roof`)
      const box=boundsOf(tower).union(boundsOf(roof))
      const hook=find(node,`Hook_Career_Stage_${number}`)
      const record={index,name:node.name,position:xyz(node),...boxData(box),roofY:boundsOf(roof).max.y,propsTop:boundsOf(node).max.y,hook:xyz(hook)}
      blenderAssembly.stages.push(record)
      collider(node.name,name,box)
    })
    blenderAssembly.stages.sort((a,b)=>a.index-b.index)
  }
  if (name === 'library') {
    root.children.filter(node=>/^Library_Book_/.test(node.name)).forEach(node=>{
      const index=Number(node.name.slice(-2))-1, box=new Box3()
      node.traverse(object=>{if(object.isMesh && /_(Pages|Spine|CoverBottom|CoverTop)$/.test(object.name)) box.union(boundsOf(object))})
      blenderAssembly.books.push({index,name:node.name,position:xyz(node),...boxData(box),top:box.max.y})
      collider(node.name,name,box)
    })
    blenderAssembly.books.sort((a,b)=>a.index-b.index)
  }
  if (name === 'lab') {
    const ids=[...new Set(root.children.map(node=>/^Exhibit_(.+)_Pedestal$/.exec(node.name)?.[1]).filter(Boolean))]
    for (const sourceId of ids) {
      const id=sourceId==='gradient'?'descent':sourceId
      const pedestal=find(root,`Exhibit_${sourceId}_Pedestal`), tray=find(root,`Exhibit_${sourceId}_Tray`)
      const position=pedestal.position.toArray();position[1]=0
      const anchor=groupMatching(root,`ExhibitRoot_${id}`,new RegExp(`^(Exhibit_${sourceId}_|Hook_Concept_${sourceId}$)`),position)
      const box=boundsOf(pedestal).union(boundsOf(tray))
      const hook=xyz(find(anchor,`Hook_Concept_${sourceId}`))
      blenderAssembly.exhibits.push({id,name:anchor.name,position:xyz(anchor),...boxData(box),bounds:boxData(boundsOf(anchor)),hook,pad:[hook[0],0,hook[2]+.35]})
      collider(anchor.name,name,box)
    }
  }
  const solidPatterns = {
    plaza: /^(Entry_pylon|Planter|Bench_seat|Time_console$|Photo_kiosk|Hologram_table|Training_arcade|Team_table)/,
    library: /^(East|West)_(Back|Pillar)|Library_Arch(Pillar|Foot)|Library_Chair(Base|Back|Arm)|Library_Lectern(Desk|Column)|Library_NookTable$/,
    bugs: /^(Bugs_BackWall|Bugs_PortalPillar|Bugs_BalconyDeck|Bugs_SideCurb|Restore_RelayCabinet)/,
    factory: /^(Factory_(BackWall|LeftWall|Pier|VisitorBench)|Conveyor_(Frame|Belt)|Retrieval_Rack|Output_Podium|Input_HopperStand)/,
    hangar: /^(Back_screen|Hangar_upright|Demo_plinth)/,
    lab: /^Lab_ArchPier/,
    career: /^Career_CoreDeck$/,
    transport: /^(Monorail_pillar|Canal_bollard|Station_(ESTE|OESTE|SUR|NORTE)$|Observatory_stilts)/,
    brain_inside: /^(Brain_.*(Platform|Deck|Floor)|Observatory_.*(Platform|Deck|Floor))/,
  }
  scene.updateMatrixWorld(true)
  scene.traverse(object=>{
    if (/Hook_|Socket/.test(object.name)) blenderAssembly.hooks[object.name]=xyz(object)
    if (/^Breakable_/.test(object.name)) blenderAssembly.breakables.push({id:object.name.slice(10),position:xyz(object),...boxData(boundsOf(object))})
    if (!object.isMesh) return
    if (solidPatterns[name]?.test(object.name)) collider(object.name,name,boundsOf(object))
    if (/^(Satin_floor|Foundation|Glossy_avenue|Glossy_east_west_street|Floating_city_base)/.test(object.name)) {
      const data=boxData(boundsOf(object));blenderAssembly.surfaces.push({name:object.name,district:name,...data})
      if (name==='brain_inside') collider(object.name,name,boundsOf(object))
    }
  })
  const floor = blenderAssembly.surfaces.find(surface=>surface.district===name && /^Satin_floor/.test(surface.name))
  if(floor) blenderAssembly.districts[name].floor=floor
  blenderAssembly.districts[name].shippedBounds=boxData(boundsOf(scene))
}

export function recordStandalone(name, scene) {
  const metadata = native.standalone[name]
  if (!metadata) return
  const probe = scene.clone(true)
  probe.applyMatrix4(new Matrix4().fromArray(metadata.matrix))
  probe.updateMatrixWorld(true)
  const hooks = {}
  probe.traverse(object => { if (/Hook_|Socket/.test(object.name)) hooks[object.name] = xyz(object) })
  Object.assign(blenderAssembly.hooks, hooks)
  blenderAssembly.standalone[name] = { ...metadata, localBounds: boxData(boundsOf(scene)), bounds: boxData(boundsOf(probe)), hooks }
}

export function assemblyContract() { return clean(blenderAssembly) }
