import { useEffect, useMemo, useSyncExternalStore } from 'react'
import {
  DIMENSION_QUERY, PORTAL_HEARTBEAT_TIMEOUT, PORTAL_VERSION, SESSION_QUERY,
  advancePortalStory, contentRect, emptyTopology, portalTopology, validPortalMessage, validPortalSessionId,
  type PortalMessage, type PortalRect, type PortalRole, type PortalSnapshot, type PortalStatus, type PortalTopology,
} from './protocol'
export { SESSION_QUERY, DIMENSION_QUERY, parsePortalQuery } from './protocol'

export interface PortalSessionState {
  snapshot: PortalSnapshot
  status: PortalStatus
  localRect: PortalRect
  peerRect: PortalRect | null
  topology: PortalTopology
  error: string | null
  ready: boolean
  peerReady: boolean
}

export interface PortalTransport {
  send: (message: PortalMessage) => void
  close: () => void
}

/** Injectable ports keep heartbeat, authority and reconnection testable without a browser. */
export interface PortalEnvironment {
  now: () => number
  monotonicNow: () => number
  randomId: () => string
  rect: () => PortalRect
  connect: (receive: (message: unknown) => void) => PortalTransport
  every: (callback: () => void, milliseconds: number) => () => void
  onWake: (callback: () => void) => () => void
  onLeave: (callback: () => void) => () => void
  guestClosed?: () => boolean
  closeGuest?: () => void
}

const popups = new Map<string, Window>()

export function createPortalSessionId() {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID()
  const bytes = crypto.getRandomValues(new Uint8Array(24))
  return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('')
}

/** Must be called synchronously inside the user's click/tap gesture. */
export function openPortalGuest(sessionId: string): Window | null {
  if (!validPortalSessionId(sessionId)) return null
  try {
    const url = new URL(window.location.href)
    url.searchParams.set(DIMENSION_QUERY, 'guest')
    url.searchParams.set(SESSION_QUERY, sessionId)
    const popup = window.open(url.href, `kroquetita-portal-${sessionId}`, 'popup=yes,width=720,height=700,resizable=yes,scrollbars=no')
    if (popup) popups.set(sessionId, popup)
    return popup
  } catch { return null }
}

export function createBrowserPortalEnvironment(sessionId: string): PortalEnvironment {
  return {
    now: () => Date.now(), monotonicNow: () => performance.now(), randomId: createPortalSessionId,
    rect: () => contentRect(window),
    connect(receive) {
      const key = `kroquetita.portal.v1:${sessionId}`
      try {
        if (typeof BroadcastChannel !== 'undefined') {
          const channel = new BroadcastChannel(key)
          channel.onmessage = event => receive(event.data)
          return { send: message => channel.postMessage(message), close: () => { channel.onmessage = null; channel.close() } }
        }
      } catch { /* Storage events are supported by older/partitioned browsers. */ }
      // Probe before subscribing so inaccessible storage becomes an explicit UI error.
      const probe = `${key}:probe`
      localStorage.setItem(probe, '1'); localStorage.removeItem(probe)
      const listener = (event: StorageEvent) => {
        if (event.storageArea !== localStorage || event.key !== key || !event.newValue) return
        try { receive(JSON.parse(event.newValue)) } catch { /* Ignore malformed/unrelated storage events. */ }
      }
      window.addEventListener('storage', listener)
      return { send: message => { localStorage.setItem(key, JSON.stringify(message)); localStorage.removeItem(key) },
        close: () => window.removeEventListener('storage', listener) }
    },
    every(callback, milliseconds) { const timer = window.setInterval(callback, milliseconds); return () => window.clearInterval(timer) },
    onWake(callback) {
      window.addEventListener('resize', callback)
      window.addEventListener('focus', callback)
      document.addEventListener('visibilitychange', callback)
      return () => { window.removeEventListener('resize', callback); window.removeEventListener('focus', callback); document.removeEventListener('visibilitychange', callback) }
    },
    onLeave(callback) { window.addEventListener('pagehide', callback); return () => window.removeEventListener('pagehide', callback) },
    guestClosed: () => {
      if (popups.get(sessionId)?.closed !== true) return false
      // A later guest opened from a copied/reloaded URL must be able to join again.
      popups.delete(sessionId)
      return true
    },
    closeGuest: () => { popups.get(sessionId)?.close(); popups.delete(sessionId) },
  }
}

type Payload = { type: 'hello' | 'heartbeat'; rect: PortalRect; ready: boolean } | { type: 'snapshot'; snapshot: PortalSnapshot } | { type: 'restart' | 'bye' }

export function createPortalController(options: {
  role: PortalRole; sessionId: string; embedded?: boolean; environment?: PortalEnvironment
}) {
  const { role, sessionId, embedded = false } = options
  if (!validPortalSessionId(sessionId)) throw new Error('Invalid portal session')
  const env = options.environment ?? createBrowserPortalEnvironment(sessionId)
  const sender = env.randomId()
  let sequence = 0, peerId: string | null = null, lastPeer = -Infinity, lastTick = env.monotonicNow()
  let everPeer = false, running = false, closed = false
  const seenSequence = new Map<string, number>()
  let transport: PortalTransport | null = null
  let cleanup: (() => void)[] = []
  const listeners = new Set<() => void>()
  let state: PortalSessionState = {
    snapshot: { sessionId, runId: 0, elapsed: 0, phase: 'theft', paused: true, connected: false, sentAt: env.now() },
    status: embedded ? 'connected' : 'waiting', localRect: env.rect(), peerRect: null,
    topology: embedded ? portalTopology(env.rect(), null, true, role) : emptyTopology(), error: null, ready: false, peerReady: false,
  }
  const publish = () => { for (const listener of listeners) listener() }
  const send = (payload: Payload, target: string | null = peerId) => {
    if (!transport) return
    try { transport.send({ ...payload, version: PORTAL_VERSION, sessionId, sender, role, seq: sequence++, at: env.now(), ...(target ? { to: target } : {}) }) }
    catch { state = { ...state, error: 'No se ha podido comunicar con la otra ventana.' } }
  }
  const peerAlive = (now: number) => peerId !== null && now - lastPeer <= PORTAL_HEARTBEAT_TIMEOUT
  const refresh = (delta = 0) => {
    const now = env.monotonicNow(), localRect = env.rect()
    const alive = peerAlive(now) && !(role === 'host' && env.guestClosed?.())
    if (!alive && peerId) peerId = null
    const topology = portalTopology(localRect, alive ? state.peerRect : null, embedded, role)
    const status: PortalStatus = closed ? 'closed' : embedded || (alive && topology.connected) ? 'connected' : alive ? 'connecting' : everPeer ? 'disconnected' : 'waiting'
    let snapshot = state.snapshot
    const connected = topology.connected && (embedded || (alive && state.peerReady)) && !closed
    if (role === 'host') snapshot = { ...snapshot, ...advancePortalStory(snapshot.elapsed, state.ready && !closed ? delta : 0, connected),
      ...(state.ready && !closed ? {} : { paused: true }), connected, sentAt: env.now() }
    // Guests never advance the authoritative clock, and freeze their last frame on loss.
    else if (!alive) snapshot = { ...snapshot, paused: true, connected: false }
    state = { ...state, snapshot, status, localRect, topology, peerRect: alive ? state.peerRect : null, peerReady: alive && state.peerReady }
  }
  const restart = () => {
    if (closed) return
    if (role === 'guest') { send({ type: 'restart' }); return }
    state = { ...state, snapshot: { sessionId, runId: state.snapshot.runId + 1, elapsed: 0, phase: 'theft', paused: !state.ready,
      connected: state.topology.connected && (embedded || state.peerReady), sentAt: env.now() } }
    lastTick = env.monotonicNow()
    send({ type: 'snapshot', snapshot: state.snapshot }); publish()
  }
  const receive = (data: unknown) => {
    if (!running || closed || !validPortalMessage(data, sessionId) || data.sender === sender || data.role === role || (data.to && data.to !== sender)) return
    // A queued heartbeat from before a suspended tab/closed peer must not revive it.
    if (env.now() - data.at > PORTAL_HEARTBEAT_TIMEOUT || data.seq <= (seenSequence.get(data.sender) ?? -1)) return
    const now = env.monotonicNow()
    // A second guest cannot steal an established connection. After timeout/reload a fresh peer can join.
    if (peerId && data.sender !== peerId && peerAlive(now)) return
    if (data.sender !== peerId) {
      if (data.type !== 'hello' && data.type !== 'heartbeat') return
      peerId = data.sender
    }
    seenSequence.set(data.sender, data.seq)
    if (data.type === 'bye') {
      peerId = null; lastPeer = -Infinity
      refresh(); publish(); return
    }
    lastPeer = now; everPeer = true
    if (data.type === 'hello' || data.type === 'heartbeat') state = { ...state, peerRect: data.rect, peerReady: data.ready }
    if (data.type === 'snapshot' && role === 'guest') state = { ...state, snapshot: data.snapshot }
    refresh()
    if (data.type === 'hello') {
      send({ type: 'heartbeat', rect: state.localRect, ready: state.ready })
      if (role === 'host') send({ type: 'snapshot', snapshot: state.snapshot })
    }
    if (data.type === 'restart' && role === 'host') restart()
    publish()
  }
  const tick = () => {
    if (!running || closed) return
    const now = env.monotonicNow()
    // Throttled/background tabs resume smoothly; hidden time never skips a whole crossing.
    const delta = Math.min(.25, Math.max(0, (now - lastTick) / 1000))
    lastTick = now
    refresh(delta)
    send({ type: peerId ? 'heartbeat' : 'hello', rect: state.localRect, ready: state.ready })
    if (role === 'host') send({ type: 'snapshot', snapshot: state.snapshot })
    publish()
  }
  const dispose = () => {
    if (!running) return
    send({ type: 'bye' })
    running = false
    for (const stop of cleanup) stop()
    cleanup = []
    transport?.close(); transport = null
  }
  const close = () => {
    if (closed) return
    dispose(); closed = true
    if (role === 'host') env.closeGuest?.()
    state = { ...state, status: 'closed', topology: emptyTopology(), snapshot: { ...state.snapshot, connected: false, paused: true } }
    publish()
  }
  const start = () => {
    if (running || closed) return
    running = true; lastTick = env.monotonicNow()
    if (!embedded) {
      try { transport = env.connect(receive) }
      catch { state = { ...state, error: 'Este navegador no permite conectar las ventanas.' } }
    }
    cleanup = [env.every(tick, 100), env.onWake(tick), env.onLeave(dispose)]
    tick()
  }
  const setReady = (ready: boolean) => {
    if (closed || state.ready === ready) return
    state = { ...state, ready }
    // Loading/embedded reconnection time must never become deferred story time.
    lastTick = env.monotonicNow()
    refresh()
    send({ type: 'heartbeat', rect: state.localRect, ready })
    if (role === 'host') send({ type: 'snapshot', snapshot: state.snapshot })
    publish()
  }
  return { start, dispose, close, restart, setReady, getSnapshot: () => state,
    subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener) } } }
}

export function usePortalSession(role: PortalRole, sessionId: string, embedded = false) {
  const controller = useMemo(() => createPortalController({ role, sessionId, embedded }), [role, sessionId, embedded])
  const state = useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot)
  useEffect(() => { controller.start(); return controller.dispose }, [controller])
  return { ...state, restart: controller.restart, close: controller.close, setReady: controller.setReady }
}
