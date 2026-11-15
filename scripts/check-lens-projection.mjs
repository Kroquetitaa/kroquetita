import assert from 'node:assert/strict'
import { Matrix4, OrthographicCamera, PerspectiveCamera, Vector3 } from 'three'
import { cropHostProjection } from '../src/dimensions/lensProjection.ts'

let checked = 0
for (const host of [{ x: 8, y: 86, width: 1280, height: 800 }, { x: -1340, y: 30, width: 1100, height: 900 }]) {
  for (const lens of [{ x: 300, y: 180, width: 700, height: 640 }, { x: -1200, y: 250, width: 820, height: 500 }, { x: 30, y: 60, width: 390, height: 844 }]) {
    for (const camera of [new PerspectiveCamera(44, host.width / host.height, .1, 300), new OrthographicCamera(-28, 28, 18, -18, .1, 300)]) {
      camera.position.set(12, 43, 56); camera.lookAt(0, -1, -4); camera.updateProjectionMatrix(); camera.updateMatrixWorld(true)
      const crop = cropHostProjection(camera.projectionMatrix.toArray(), host, lens)
      const lensViewProjection = crop.clone().multiply(camera.matrixWorldInverse)
      for (let i = 0; i < 150; i++) {
        const point = new Vector3(Math.sin(i * 1.3) * 24, -3 + i % 8, Math.cos(i * .73) * 26)
        const fromHost = point.clone().project(camera), fromLens = point.clone().applyMatrix4(lensViewProjection)
        const hostPixel = [host.x + (fromHost.x + 1) * host.width / 2, host.y + (1 - fromHost.y) * host.height / 2]
        const lensPixel = [lens.x + (fromLens.x + 1) * lens.width / 2, lens.y + (1 - fromLens.y) * lens.height / 2]
        assert(Math.hypot(hostPixel[0] - lensPixel[0], hostPixel[1] - lensPixel[1]) < 1e-8, 'Lens world point does not map to the same screen pixel')
        assert(Math.abs(fromHost.z - fromLens.z) < 1e-10, 'Crop changed clip depth')
        checked++
      }
      const identity = cropHostProjection(camera.projectionMatrix.toArray(), host, host)
      assert(identity.equals(camera.projectionMatrix), 'Preview crop must preserve the supplied projection')
      assert(Number.isFinite(new Matrix4().copy(crop).invert().determinant()))
    }
  }
}
console.log(`PASS lens projection: ${checked} points map to the same screen pixels for perspective/orthographic cameras, negative monitor coordinates and resized/mobile lenses`)
