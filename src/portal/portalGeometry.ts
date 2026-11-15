import { Raycaster, Vector2, Vector3, type Camera } from 'three'
import type { SceneEdge } from './portalStory'

/** A viewport seam intersects elevated space when a ground-level gate would sink. */
export function portalGatePoint(camera: Camera, edge: SceneEdge, anchor: number) {
  const a = Math.max(0, Math.min(1, Number.isFinite(anchor) ? anchor : .5))
  const u = edge === 'left' ? 0 : edge === 'right' ? 1 : a
  const v = edge === 'top' ? 0 : edge === 'bottom' ? 1 : a
  const ray = new Raycaster()
  ray.setFromCamera(new Vector2(u * 2 - 1, 1 - v * 2), camera)
  const point = ray.ray.at(-ray.ray.origin.z / ray.ray.direction.z, new Vector3())
  if (edge === 'top' || edge === 'bottom' || point.y < .6) ray.ray.at((2.8 - ray.ray.origin.y) / ray.ray.direction.y, point)
  return point
}
