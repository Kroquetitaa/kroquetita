export const DIMENSION_VERSION = 1
export const DIMENSION_TIMEOUT = 3000
export const DIMENSION_POLL_MS = 1000 / 15
export type DimensionRole = 'solo' | 'host' | 'lens'
export interface DimensionRect {
  x: number; y: number; width: number; height: number
  outerX: number; outerY: number; outerWidth: number; outerHeight: number
}
export interface NormalizedRect { x: number; y: number; width: number; height: number }
export interface DimensionOverlap {
  active: boolean
  rect: NormalizedRect | null
  localNormalized: NormalizedRect
  hostNormalized: NormalizedRect
}
export interface DimensionCameraInput {
  position: [number, number, number]
  quaternion: [number, number, number, number]
  matrixWorld: number[]
  projectionMatrix: number[]
  type: 'perspective' | 'orthographic'
  near: number
  far: number
  viewport: { width: number; height: number }
  place: 'city' | 'brain'
}
export interface DimensionCamera extends DimensionCameraInput { rect: DimensionRect; sentAt: number }
export interface DimensionPeer { id: string; openedAt: number; rect: DimensionRect; lastSeen: number }
export interface DimensionSessionState {
  role: DimensionRole
  layer: 0 | 1 | 2
  layerCount: number
  limitReached: boolean
  windowId: string
  leaderId: string | null
  localRect: DimensionRect
  hostRect: DimensionRect
  peerRect: DimensionRect | null
  underlayRect: DimensionRect | null
  peerCount: number
  overlap: DimensionOverlap
  camera: DimensionCamera | null
  error: string | null
}
interface Envelope { version: typeof DIMENSION_VERSION; scope: string; windowId: string; openedAt: number; seq: number; at: number }
export type DimensionMessage = Envelope & (
  | { type: 'hello' | 'heartbeat'; rect: DimensionRect }
  | { type: 'camera'; camera: DimensionCamera }
  | { type: 'bye' }
)

const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value)
const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object'
export const validDimensionId = (value: unknown): value is string => typeof value === 'string' && /^[a-zA-Z0-9_-]{16,128}$/.test(value)
export const dimensionEligible = (search: string) => new URLSearchParams(search).get('dimension') !== 'guest'

/** CSS screen coordinates; chrome height is estimated from the outer/inner difference. */
export function dimensionContentRect(metrics: { screenX: number; screenY: number; innerWidth: number; innerHeight: number; outerWidth: number; outerHeight: number }): DimensionRect {
  const width = Math.max(1, metrics.innerWidth), height = Math.max(1, metrics.innerHeight)
  const outerWidth = Math.max(width, metrics.outerWidth), outerHeight = Math.max(height, metrics.outerHeight)
  const border = Math.min(16, Math.max(0, (outerWidth - width) / 2))
  return { x: metrics.screenX + border, y: metrics.screenY + Math.max(0, outerHeight - height - border), width, height,
    outerX: metrics.screenX, outerY: metrics.screenY, outerWidth, outerHeight }
}
export function validDimensionRect(value: unknown): value is DimensionRect {
  if (!record(value)) return false
  return ['x', 'y', 'width', 'height', 'outerX', 'outerY', 'outerWidth', 'outerHeight'].every(key => finite(value[key]) && Math.abs(value[key] as number) < 1e7)
    && (value.width as number) > 0 && (value.height as number) > 0 && (value.outerWidth as number) > 0 && (value.outerHeight as number) > 0
}
const emptyRect = (): NormalizedRect => ({ x: 0, y: 0, width: 0, height: 0 })
export const emptyDimensionOverlap = (): DimensionOverlap => ({ active: false, rect: null, localNormalized: emptyRect(), hostNormalized: emptyRect() })

/** local/host normalized crops refer to the same intersection in screen coordinates. */
export function dimensionOverlap(local: DimensionRect, host: DimensionRect, intersectWith: DimensionRect = host): DimensionOverlap {
  const x = Math.max(local.x, host.x, intersectWith.x), y = Math.max(local.y, host.y, intersectWith.y)
  const width = Math.min(local.x + local.width, host.x + host.width, intersectWith.x + intersectWith.width) - x
  const height = Math.min(local.y + local.height, host.y + host.height, intersectWith.y + intersectWith.height) - y
  if (width <= 0 || height <= 0) return emptyDimensionOverlap()
  const rect = { x, y, width, height }
  const normalized = (base: DimensionRect): NormalizedRect => ({ x: (x - base.x) / base.width, y: (y - base.y) / base.height, width: width / base.width, height: height / base.height })
  return { active: true, rect, localNormalized: normalized(local), hostNormalized: normalized(host) }
}

/** Oldest document wins, with a deterministic ID tie-break; never uses storage-cloned identity. */
export function electDimensionLeader<T extends { id: string; openedAt: number }>(peers: readonly T[]): T | null {
  let leader: T | null = null
  for (const peer of peers) if (!leader || peer.openedAt < leader.openedAt || (peer.openedAt === leader.openedAt && peer.id < leader.id)) leader = peer
  return leader
}

const numericArray = (value: unknown, length: number) => Array.isArray(value) && value.length === length && value.every(finite)
export function validDimensionCameraInput(value: unknown): value is DimensionCameraInput {
  if (!record(value) || !record(value.viewport)) return false
  return numericArray(value.position, 3) && numericArray(value.quaternion, 4) && numericArray(value.matrixWorld, 16) && numericArray(value.projectionMatrix, 16)
    && (value.type === 'perspective' || value.type === 'orthographic') && finite(value.near) && finite(value.far) && value.near >= 0 && value.far > value.near
    && finite(value.viewport.width) && finite(value.viewport.height) && value.viewport.width > 0 && value.viewport.height > 0
    && (value.place === 'city' || value.place === 'brain')
}
export function validDimensionMessage(value: unknown, scope: string): value is DimensionMessage {
  if (!record(value) || value.version !== DIMENSION_VERSION || value.scope !== scope || !validDimensionId(value.windowId)
    || !finite(value.openedAt) || value.openedAt < 0 || !finite(value.at) || !Number.isSafeInteger(value.seq) || (value.seq as number) < 0) return false
  if (value.type === 'hello' || value.type === 'heartbeat') return validDimensionRect(value.rect)
  if (value.type === 'bye') return true
  return value.type === 'camera' && validDimensionCameraInput(value.camera) && record(value.camera)
    && validDimensionRect(value.camera.rect) && finite(value.camera.sentAt)
}
