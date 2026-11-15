import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { Box3, Raycaster, Vector3 } from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'

const here = path.dirname(fileURLToPath(import.meta.url))
const project = path.resolve(here, '../../..')
const result = []
let total = 0
for (const [name, manifestFile] of [['underworld', 'manifest.json'], ['origin', 'origin-manifest.json']]) {
  const manifest = JSON.parse(await fs.readFile(path.join(here, manifestFile), 'utf8'))
  const bytes = await fs.readFile(path.join(project, 'public', manifest.file))
  const gltf = await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '')
  gltf.scene.updateMatrixWorld(true)
  assert.equal(gltf.animations.length, 0, `${name}: runtime owns animations`)
  assert.equal(bytes.byteLength, manifest.bytes)
  for (const [hookName, target] of Object.entries(manifest.hooks)) {
    const node = gltf.scene.getObjectByName(hookName)
    assert.ok(node, `${name}: missing ${hookName}`)
    const actual = node.getWorldPosition(new Vector3())
    assert.ok(actual.distanceTo(new Vector3(...target)) < 0.001, `${hookName}: export coordinate mismatch`)
    if (hookName.includes('Actor')) {
      const ray = new Raycaster(actual.clone().add(new Vector3(0, 0.08, 0)), new Vector3(0, -1, 0), 0, 0.18)
      const hits = ray.intersectObject(gltf.scene, true)
      assert.ok(hits.length, `${hookName}: no floor within 10 cm below feet`)
    }
  }
  for (const [pivotName, target] of Object.entries(manifest.pivots)) {
    const node = gltf.scene.getObjectByName(pivotName)
    assert.ok(node, `${name}: missing animation pivot ${pivotName}`)
    if (Array.isArray(target)) {
      assert.ok(node.getWorldPosition(new Vector3()).distanceTo(new Vector3(...target)) < 0.001, `${pivotName}: world pivot mismatch`)
    } else {
      assert.equal(node.parent.name, target.parent)
      assert.ok(node.position.distanceTo(new Vector3(...target.position)) < 0.001, `${pivotName}: local pivot mismatch`)
    }
  }
  for (const item of manifest.conveyor?.items ?? []) {
    assert.equal(gltf.scene.getObjectByName(item)?.parent.name, 'Conveyor')
  }
  let triangles = 0, meshes = 0
  gltf.scene.traverse(node => {
    if (!node.isMesh) return
    meshes++
    triangles += (node.geometry.index?.count ?? node.geometry.attributes.position.count) / 3
  })
  assert.equal(triangles, manifest.triangles)
  const box = new Box3().setFromObject(gltf.scene, true)
  assert.ok(box.min.x >= -32 && box.max.x <= 32 && box.min.z >= -31 && box.max.z <= 31, `${name}: geometry escaped native city footprint`)
  assert.ok(box.min.y >= -6 && box.max.y <= 4, `${name}: unexpected depth/height after glTF axis conversion`)
  total += bytes.byteLength
  result.push({ name, bytes: bytes.byteLength, triangles, meshes, bounds: { min: box.min.toArray(), max: box.max.toArray() }, hooks: Object.keys(manifest.hooks).length })
}
assert.ok(total < 3_000_000, 'Both dimension assets must fit in 3 MB')
console.log(JSON.stringify({ ok: true, totalBytes: total, assets: result }, null, 2))
