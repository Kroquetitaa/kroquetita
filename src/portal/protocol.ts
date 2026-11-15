export const PORTAL_VERSION = 1
export const SESSION_QUERY = 'portalSession'
export const DIMENSION_QUERY = 'dimension'
export const PORTAL_DURATION = 32
export const PORTAL_HEARTBEAT_TIMEOUT = 3000
export const PORTAL_MAX_GAP = 120
export const PORTAL_MIN_OVERLAP = 100

export type PortalRole = 'host' | 'guest'
export type PortalPhase = 'theft' | 'outbound' | 'catch' | 'return' | 'finish'
export type PortalStatus = 'waiting' | 'connecting' | 'connected' | 'disconnected' | 'closed'
export type PortalEdge = 'left' | 'right' | 'top' | 'bottom'

/** Screen-space CSS pixels. x/y estimate the content origin below browser chrome. */
export interface PortalRect {
  x: number; y: number; width: number; height: number
  outerX: number; outerY: number; outerWidth: number; outerHeight: number
}

export interface PortalTopology {
  connected: boolean
  edge: PortalEdge | null
  gap: number | null
  overlap: number
  /** 0 = touching; 1 = maximum bridge length (120 CSS pixels). */
  stretch: number
  /** Position along the LOCAL edge, normalized 0..1. */
  anchor: number
  localAnchor: [number, number]
  peerAnchor: [number, number]
}

export interface PortalSnapshot {
  sessionId: string
  runId: number
  elapsed: number
  phase: PortalPhase
  paused: boolean
  connected: boolean
  sentAt: number
}

interface Envelope {
  version: typeof PORTAL_VERSION
  sessionId: string
  sender: string
  role: PortalRole
  seq: number
  at: number
  to?: string
}

export type PortalMessage = Envelope & (
  | { type: 'hello' | 'heartbeat'; rect: PortalRect; ready: boolean }
  | { type: 'snapshot'; snapshot: PortalSnapshot }
  | { type: 'restart' | 'bye' }
)

export const validPortalSessionId = (value: unknown): value is string =>
  typeof value === 'string' && /^[a-zA-Z0-9_-]{16,128}$/.test(value)

export function parsePortalQuery(search: string): { role: 'guest'; sessionId: string } | null {
  const query = new URLSearchParams(search)
  const sessionId = query.get(SESSION_QUERY)
  return query.get(DIMENSION_QUERY) === 'guest' && validPortalSessionId(sessionId) ? { role: 'guest', sessionId } : null
}

const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value)
const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object'
const unit = (value: number) => Math.max(0, Math.min(1, value))

export function validPortalRect(value: unknown): value is PortalRect {
  if (!record(value)) return false
  return ['x', 'y', 'width', 'height', 'outerX', 'outerY', 'outerWidth', 'outerHeight'].every(key => finite(value[key]))
    && (value.width as number) > 0 && (value.height as number) > 0
    && (value.outerWidth as number) > 0 && (value.outerHeight as number) > 0
}

/** There is no browser API for chrome height; borders are estimated symmetrically. */
export function contentRect(metrics: {
  screenX: number; screenY: number; innerWidth: number; innerHeight: number; outerWidth: number; outerHeight: number
}): PortalRect {
  const width = Math.max(1, metrics.innerWidth), height = Math.max(1, metrics.innerHeight)
  const outerWidth = Math.max(width, metrics.outerWidth), outerHeight = Math.max(height, metrics.outerHeight)
  const border = Math.min(16, Math.max(0, (outerWidth - width) / 2))
  const top = Math.max(0, outerHeight - height - border)
  return { x: metrics.screenX + border, y: metrics.screenY + top, width, height,
    outerX: metrics.screenX, outerY: metrics.screenY, outerWidth, outerHeight }
}

export function emptyTopology(): PortalTopology {
  return { connected: false, edge: null, gap: null, overlap: 0, stretch: 0,
    anchor: .5, localAnchor: [.5, .5], peerAnchor: [.5, .5] }
}

export function portalTopology(local: PortalRect, peer: PortalRect | null, embedded = false, role: PortalRole = 'host'): PortalTopology {
  if (embedded) return { connected: true, edge: role === 'host' ? 'right' : 'left', gap: 0,
    overlap: local.height, stretch: 0, anchor: .5,
    localAnchor: [role === 'host' ? 1 : 0, .5], peerAnchor: [role === 'host' ? 0 : 1, .5] }
  if (!peer || !validPortalRect(local) || !validPortalRect(peer)) return emptyTopology()
  const overlapY = Math.max(0, Math.min(local.y + local.height, peer.y + peer.height) - Math.max(local.y, peer.y))
  const overlapX = Math.max(0, Math.min(local.x + local.width, peer.x + peer.width) - Math.max(local.x, peer.x))
  const right = peer.x + peer.width / 2 >= local.x + local.width / 2
  const below = peer.y + peer.height / 2 >= local.y + local.height / 2
  const candidates = [
    { edge: (right ? 'right' : 'left') as PortalEdge, gap: right ? peer.x - local.x - local.width : local.x - peer.x - peer.width, overlap: overlapY },
    { edge: (below ? 'bottom' : 'top') as PortalEdge, gap: below ? peer.y - local.y - local.height : local.y - peer.y - peer.height, overlap: overlapX },
  ]
  // Prefer usable edges, then the shortest bridge. Deeply overlapping windows never connect.
  candidates.sort((a, b) => Number(b.overlap >= PORTAL_MIN_OVERLAP) - Number(a.overlap >= PORTAL_MIN_OVERLAP) || Math.abs(a.gap) - Math.abs(b.gap))
  const best = candidates[0]
  const horizontal = best.edge === 'left' || best.edge === 'right'
  const shared = horizontal
    ? (Math.max(local.y, peer.y) + Math.min(local.y + local.height, peer.y + peer.height)) / 2
    : (Math.max(local.x, peer.x) + Math.min(local.x + local.width, peer.x + peer.width)) / 2
  const anchor = unit(horizontal ? (shared - local.y) / local.height : (shared - local.x) / local.width)
  const other = unit(horizontal ? (shared - peer.y) / peer.height : (shared - peer.x) / peer.width)
  const side = best.edge === 'right' || best.edge === 'bottom' ? 1 : 0
  return { ...best, connected: Math.abs(best.gap) <= PORTAL_MAX_GAP && best.overlap >= PORTAL_MIN_OVERLAP,
    stretch: unit(Math.max(0, best.gap) / PORTAL_MAX_GAP), anchor,
    localAnchor: horizontal ? [side, anchor] : [anchor, side],
    peerAnchor: horizontal ? [1 - side, other] : [other, 1 - side] }
}

export function portalPhase(elapsed: number): PortalPhase {
  return elapsed < 4 ? 'theft' : elapsed < 14 ? 'outbound' : elapsed < 18 ? 'catch' : elapsed < 28 ? 'return' : 'finish'
}

export function portalPaused(elapsed: number, connected: boolean) {
  return elapsed >= PORTAL_DURATION || (!connected && ((elapsed >= 4 && elapsed < 14) || (elapsed >= 18 && elapsed < 28)))
}

/** Advances to a gate, never past it while disconnected, even after a long timer delay. */
export function advancePortalStory(elapsed: number, delta: number, connected: boolean) {
  let next = Math.max(0, Math.min(PORTAL_DURATION, elapsed))
  const dt = finite(delta) ? Math.max(0, delta) : 0
  if (!portalPaused(next, connected)) {
    const ceiling = connected ? PORTAL_DURATION : next < 4 ? 4 : next < 18 ? 18 : PORTAL_DURATION
    next = Math.min(ceiling, next + dt)
  }
  return { elapsed: next, phase: portalPhase(next), paused: portalPaused(next, connected) }
}

/** Optional rendering interpolation between authoritative 10 Hz snapshots. */
export function presentPortalTime(snapshot: PortalSnapshot, now = Date.now()) {
  if (snapshot.paused) return snapshot.elapsed
  return advancePortalStory(snapshot.elapsed, Math.min(.15, Math.max(0, (now - snapshot.sentAt) / 1000)), snapshot.connected).elapsed
}

export function validPortalMessage(value: unknown, sessionId: string): value is PortalMessage {
  if (!record(value) || value.version !== PORTAL_VERSION || value.sessionId !== sessionId
    || !validPortalSessionId(value.sender) || (value.role !== 'host' && value.role !== 'guest')
    || !Number.isSafeInteger(value.seq) || (value.seq as number) < 0 || !finite(value.at)
    || (value.to !== undefined && !validPortalSessionId(value.to))) return false
  if (value.type === 'hello' || value.type === 'heartbeat') return validPortalRect(value.rect) && typeof value.ready === 'boolean'
  if (value.type === 'bye' || value.type === 'restart') return true
  if (value.type !== 'snapshot' || value.role !== 'host' || !record(value.snapshot)) return false
  const s = value.snapshot
  return s.sessionId === sessionId && Number.isSafeInteger(s.runId) && (s.runId as number) >= 0
    && finite(s.elapsed) && s.elapsed >= 0 && s.elapsed <= PORTAL_DURATION && s.phase === portalPhase(s.elapsed)
    && typeof s.paused === 'boolean' && typeof s.connected === 'boolean' && finite(s.sentAt)
    && (!portalPaused(s.elapsed, s.connected) || s.paused)
}
