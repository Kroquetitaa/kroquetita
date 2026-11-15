import assert from 'node:assert/strict'
import { OrthographicCamera, Vector3 } from 'three'
import { portalGatePoint } from '../src/portal/portalGeometry.ts'
import { portalActorPose } from '../src/portal/portalStory.ts'

const edges = ['left', 'right', 'top', 'bottom']
let checked = 0
for (const [width, height] of [[390, 422], [600, 900], [1200, 800]]) {
  const camera = new OrthographicCamera(-width / 2, width / 2, height / 2, -height / 2, .1, 240)
  camera.zoom = Math.min(width / 12.6, height / 6.8)
  camera.position.set(0, 5.15, 10).normalize().multiplyScalar(80).add(new Vector3(0, .65, 0))
  camera.lookAt(0, .65, 0); camera.updateProjectionMatrix(); camera.updateMatrixWorld()
  for (const edge of edges) for (const anchor of [.1, .5, .9]) {
    const gate = portalGatePoint(camera, edge, anchor)
    const ndc = gate.clone().project(camera)
    assert(ndc.z > -1 && ndc.z < 1, `${edge}: gate is behind the camera or beyond its far plane`)
    const expectedX = edge === 'left' ? -1 : edge === 'right' ? 1 : anchor * 2 - 1
    const expectedY = edge === 'top' ? 1 : edge === 'bottom' ? -1 : 1 - anchor * 2
    assert(Math.abs(ndc.x - expectedX) < 1e-7 && Math.abs(ndc.y - expectedY) < 1e-7, `${edge}: portal misses the viewport seam`)
    if (edge === 'top' || edge === 'bottom') assert(Math.abs(gate.y - 2.8) < 1e-7)
    for (const side of ['day', 'night']) for (let actor = 0; actor < 6; actor++) {
      for (let t = 0; t <= 32; t += .025) {
        const pose = portalActorPose(side, t, actor, gate, edge)
        assert([pose.x, pose.y, pose.z, pose.yaw].every(Number.isFinite))
        assert(pose.y >= .025 - 1e-8, `${side}/${edge}/${actor}/${t}: actor below the floor`)
        checked++
      }
      for (const boundary of [4, 14, 18, 28]) {
        const before = portalActorPose(side, boundary - 1e-6, actor, gate, edge)
        const after = portalActorPose(side, boundary + 1e-6, actor, gate, edge)
        if (before.visible && after.visible) assert(Math.hypot(before.x - after.x, before.y - after.y, before.z - after.z) < .0001, `${side}/${edge}: discontinuity at ${boundary}`)
      }
    }
    const axis = edge === 'left' || edge === 'right' ? 'x' : 'z'
    const sign = edge === 'right' || edge === 'bottom' ? 1 : -1
    for (const [side, start] of [['day', 4], ['night', 18]]) {
      for (let t = start; t < start + 5.3; t += .05) {
        const duck = portalActorPose(side, t, 0, gate, edge)
        for (let actor = 1; actor < 6; actor++) {
          const follower = portalActorPose(side, t, actor, gate, edge)
          if (duck.visible && follower.visible) assert(sign * duck[axis] > sign * follower[axis], `${side}/${edge}/${t}: follower overtakes the duck`)
        }
      }
    }
    for (let actor = 0; actor < 6; actor++) {
      const crossing = 4 + actor * .6 + 3.4
      const day = portalActorPose('day', crossing, actor, gate, edge)
      const night = portalActorPose('night', crossing, actor, gate, edge)
      assert(Math.hypot(day.x - night.x, day.y - night.y, day.z - night.z) < 1e-7, `${edge}: crossing position disagrees`)
    }
  }
}
console.log(`PASS portal story: ${checked} poses above floor, 4 viewport edges, exact seams, phase continuity and duck-first formations`)
