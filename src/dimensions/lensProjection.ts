import { Matrix4 } from 'three'

export interface ScreenViewport { x: number; y: number; width: number; height: number }

/** Re-express host clip coordinates in the lens viewport, preserving depth. */
export function cropHostProjection(projection: readonly number[], host: ScreenViewport, lens: ScreenViewport, target = new Matrix4()) {
  if (![host.width, host.height, lens.width, lens.height].every(n => Number.isFinite(n) && n > 0)) throw new Error('Invalid dimension viewport')
  const sx = host.width / lens.width, sy = host.height / lens.height
  const tx = (2 * (host.x - lens.x) + host.width - lens.width) / lens.width
  const ty = (2 * (lens.y - host.y) + lens.height - host.height) / lens.height
  target.set(sx, 0, 0, tx, 0, sy, 0, ty, 0, 0, 1, 0, 0, 0, 0, 1)
  return target.multiply(new Matrix4().fromArray(projection))
}
