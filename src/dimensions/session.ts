import { useEffect, useMemo, useSyncExternalStore } from 'react'
import {
  DIMENSION_POLL_MS, DIMENSION_TIMEOUT, DIMENSION_VERSION, dimensionContentRect, dimensionEligible, dimensionOverlap,
  electDimensionLeader, emptyDimensionOverlap, validDimensionCameraInput, validDimensionMessage,
  type DimensionCamera, type DimensionCameraInput, type DimensionMessage, type DimensionPeer, type DimensionRect, type DimensionSessionState,
} from './protocol'
export type { DimensionCamera, DimensionCameraInput, DimensionRect, DimensionSessionState } from './protocol'

export interface DimensionTransport { send: (message: DimensionMessage) => void; close: () => void }
export interface DimensionEnvironment {
  id: string; openedAt: number; scope: string; eligible: boolean
  now: () => number; monotonicNow: () => number; rect: () => DimensionRect
  connect: (receive: (data: unknown) => void) => DimensionTransport
  every: (callback: () => void, milliseconds: number) => () => void
  onWake: (callback: () => void) => () => void
  onLeave: (callback: () => void) => () => void
  onResume?: (callback: () => void) => () => void
}
let identity: { id: string; openedAt: number } | null = null
export function createDimensionWindowId() {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID()
  return Array.from(crypto.getRandomValues(new Uint8Array(24)), n => n.toString(16).padStart(2, '0')).join('')
}
export function createBrowserDimensionEnvironment(): DimensionEnvironment {
  // One identity per document/module lifetime; duplicated tabs never inherit it from sessionStorage.
  identity ??= { id: createDimensionWindowId(), openedAt: performance.timeOrigin }
  const scope = window.location.pathname
  return { ...identity, scope, eligible: dimensionEligible(window.location.search),
    now: () => Date.now(), monotonicNow: () => performance.now(), rect: () => dimensionContentRect(window),
    connect(receive) {
      const key = `kroquetita.dimensions.v1:${scope}`
      try {
        if (typeof BroadcastChannel !== 'undefined') {
          const channel = new BroadcastChannel(key)
          channel.onmessage = event => receive(event.data)
          return { send: message => channel.postMessage(message), close: () => { channel.onmessage = null; channel.close() } }
        }
      } catch { /* Fall through to same-origin storage events. */ }
      localStorage.setItem(`${key}:probe`, '1'); localStorage.removeItem(`${key}:probe`)
      const onStorage = (event: StorageEvent) => {
        if (event.storageArea !== localStorage || event.key !== key || !event.newValue) return
        try { receive(JSON.parse(event.newValue)) } catch { /* Ignore malformed storage events. */ }
      }
      window.addEventListener('storage', onStorage)
      return { send: message => { localStorage.setItem(key, JSON.stringify(message)); localStorage.removeItem(key) }, close: () => window.removeEventListener('storage', onStorage) }
    },
    every(callback, milliseconds) { const timer = window.setInterval(callback, milliseconds); return () => window.clearInterval(timer) },
    onWake(callback) {
      window.addEventListener('resize', callback); window.addEventListener('focus', callback); document.addEventListener('visibilitychange', callback)
      return () => { window.removeEventListener('resize', callback); window.removeEventListener('focus', callback); document.removeEventListener('visibilitychange', callback) }
    },
    onLeave(callback) { window.addEventListener('pagehide', callback); return () => window.removeEventListener('pagehide', callback) },
    onResume(callback) { window.addEventListener('pageshow', callback); return () => window.removeEventListener('pageshow', callback) },
  }
}
type Payload = { type: 'hello' | 'heartbeat'; rect: DimensionRect } | { type: 'camera'; camera: DimensionCamera } | { type: 'bye' }

export function createDimensionController(env: DimensionEnvironment = createBrowserDimensionEnvironment()) {
  const peers = new Map<string, DimensionPeer>(), sequences = new Map<string, number>()
  const listeners = new Set<() => void>()
  let running = false, seq = 0, transport: DimensionTransport | null = null
  let cleanup: (() => void)[] = [], lifecycleCleanup: (() => void)[] = [], resumeAfterPageShow = false, lastCameraAt = -Infinity
  let latestInput: DimensionCameraInput | null = null, pendingCamera = false
  const localRect = env.rect()
  let state: DimensionSessionState = { role: 'solo', layer: 0, layerCount: 1, limitReached: false, windowId: env.id, leaderId: null, localRect, hostRect: localRect,
    peerRect: null, underlayRect: null, peerCount: 0, overlap: emptyDimensionOverlap(), camera: null, error: null }
  const publish = () => { for (const listener of listeners) listener() }
  const send = (payload: Payload) => {
    if (!transport) return
    try { transport.send({ ...payload, version: DIMENSION_VERSION, scope: env.scope, windowId: env.id, openedAt: env.openedAt, seq: seq++, at: env.now() }) }
    catch { state = { ...state, error: 'La conexión entre ventanas no está disponible.' } }
  }
  const refresh = () => {
    const now = env.monotonicNow()
    for (const [id, peer] of peers) if (now - peer.lastSeen > DIMENSION_TIMEOUT) peers.delete(id)
    const rect = env.rect()
    const self: DimensionPeer = { id: env.id, openedAt: env.openedAt, rect, lastSeen: now }
    const active = [self, ...peers.values()].sort((a, b) => a.openedAt - b.openedAt || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)).slice(0, 3)
    const leader = electDimensionLeader(active)!
    const index = active.findIndex(peer => peer.id === env.id), limited = index < 0
    const role = limited || active.length === 1 ? 'solo' : index === 0 ? 'host' : 'lens'
    const layer = (limited ? 0 : index) as 0 | 1 | 2
    const peer = role === 'lens' ? leader : role === 'host' ? active[1] : null
    const underlayRect = layer === 2 ? active[1].rect : null
    state = { ...state, role, layer, layerCount: active.length, limitReached: limited, leaderId: running ? leader.id : null,
      localRect: rect, hostRect: limited ? rect : leader.rect,
      peerRect: peer?.rect ?? null, underlayRect, peerCount: Math.min(2, active.filter(p => p.id !== env.id).length),
      overlap: peer ? dimensionOverlap(rect, leader.rect, underlayRect ?? peer.rect) : emptyDimensionOverlap(),
      camera: state.leaderId === leader.id && (state.role === 'lens') === (role === 'lens') ? state.camera : null }
  }
  const flushCamera = (force = false) => {
    if (!running || state.role === 'lens' || !latestInput || (!pendingCamera && !force)) return
    const now = env.monotonicNow()
    if (!force && now - lastCameraAt < 50) return
    const camera: DimensionCamera = { ...latestInput, rect: env.rect(), sentAt: env.now() }
    lastCameraAt = now; pendingCamera = false
    state = { ...state, camera }
    if (state.role === 'host') send({ type: 'camera', camera })
  }
  const requestHostCamera = (previousRole: DimensionSessionState['role'], previousLeader: string | null) => {
    if (state.role === 'lens' && (previousRole !== 'lens' || previousLeader !== state.leaderId)) {
      // Promotion may happen while the host's render loop is occluded. Ask for its cached frame now.
      send({ type: 'hello', rect: state.localRect })
    }
  }
  const receive = (data: unknown) => {
    if (!running || !validDimensionMessage(data, env.scope) || data.windowId === env.id
      || env.now() - data.at > DIMENSION_TIMEOUT || data.seq <= (sequences.get(data.windowId) ?? -1)) return
    // Only the elected host may supply a camera; rejected senders must not poison heartbeat sequence state.
    if (data.type === 'camera' && (state.role !== 'lens' || data.windowId !== state.leaderId)) return
    const known = peers.get(data.windowId)
    if (known && known.openedAt !== data.openedAt) return
    sequences.set(data.windowId, data.seq)
    const beforeRole = state.role, beforeLeader = state.leaderId
    if (data.type === 'bye') {
      peers.delete(data.windowId); refresh(); requestHostCamera(beforeRole, beforeLeader); flushCamera(true); publish(); return
    }
    peers.set(data.windowId, { id: data.windowId, openedAt: data.openedAt, rect: data.type === 'camera' ? data.camera.rect : data.rect, lastSeen: env.monotonicNow() })
    refresh()
    if (data.type === 'camera' && state.role === 'lens' && data.windowId === state.leaderId) state = { ...state, camera: data.camera }
    if (data.type === 'hello') send({ type: 'heartbeat', rect: state.localRect })
    requestHostCamera(beforeRole, beforeLeader)
    if (data.type === 'hello' || beforeRole !== state.role) flushCamera(true)
    publish()
  }
  const tick = () => {
    if (!running) return
    const previous = state.role, previousLeader = state.leaderId
    refresh()
    requestHostCamera(previous, previousLeader)
    send({ type: 'heartbeat', rect: state.localRect })
    flushCamera(previous !== state.role)
    publish()
  }
  const stop = () => {
    if (!running) return
    running = false; send({ type: 'bye' })
    cleanup.forEach(stop => stop()); cleanup = []
    transport?.close(); transport = null; peers.clear()
    state = { ...state, role: 'solo', layer: 0, layerCount: 1, limitReached: false, leaderId: null, peerRect: null, underlayRect: null, peerCount: 0, camera: null, overlap: emptyDimensionOverlap() }
    publish()
  }
  const dispose = () => {
    resumeAfterPageShow = false
    stop()
    lifecycleCleanup.forEach(remove => remove()); lifecycleCleanup = []
  }
  const start = () => {
    if (running || !env.eligible) return
    running = true; resumeAfterPageShow = false
    try { transport = env.connect(receive); state = { ...state, error: null } }
    catch { state = { ...state, error: 'Este navegador no permite conectar las ventanas.' } }
    cleanup = [env.every(tick, DIMENSION_POLL_MS), env.onWake(tick)]
    if (!lifecycleCleanup.length) lifecycleCleanup = [
      env.onLeave(() => { resumeAfterPageShow = true; stop() }),
      ...(env.onResume ? [env.onResume(() => { if (resumeAfterPageShow) start() })] : []),
    ]
    refresh(); send({ type: 'hello', rect: state.localRect }); flushCamera(); publish()
  }
  const sendCamera = (input: DimensionCameraInput) => {
    if (!validDimensionCameraInput(input)) return
    latestInput = { ...input, position: [...input.position], quaternion: [...input.quaternion], matrixWorld: [...input.matrixWorld], projectionMatrix: [...input.projectionMatrix], viewport: { ...input.viewport } }
    pendingCamera = true
    flushCamera()
  }
  return { start, dispose, sendCamera, getSnapshot: () => state,
    subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener) } } }
}

export function useDimensionSession(enabled = true) {
  const controller = useMemo(() => createDimensionController(), [])
  const state = useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot)
  useEffect(() => { if (enabled) controller.start(); else controller.dispose(); return controller.dispose }, [controller, enabled])
  return { ...state, sendCamera: controller.sendCamera }
}
