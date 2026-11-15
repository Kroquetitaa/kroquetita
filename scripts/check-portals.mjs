import assert from 'node:assert/strict'
import { registerHooks } from 'node:module'
registerHooks({ resolve(specifier, context, next) {
  try { return next(specifier, context) } catch (error) {
    if (error.code === 'ERR_MODULE_NOT_FOUND' && specifier.startsWith('.') && !/\.[a-z]+$/i.test(specifier)) return next(specifier + '.ts', context)
    throw error
  }
} })
const protocol = await import('../src/portal/protocol.ts')
const { createPortalController, createBrowserPortalEnvironment, createPortalSessionId, openPortalGuest } = await import('../src/portal/session.ts')
const { portalTopology, contentRect, advancePortalStory, presentPortalTime, parsePortalQuery, validPortalMessage } = protocol
const SESSION = 'test-session-12345678'
const rect = (x = 0, y = 0, width = 700, height = 600) => ({ x, y, width, height, outerX: x, outerY: y, outerWidth: width, outerHeight: height })

for (const [position, edge, reverse] of [
  [[760, 80], 'right', 'left'], [[-760, -80], 'left', 'right'], [[80, 660], 'bottom', 'top'], [[-80, -660], 'top', 'bottom'],
]) {
  const a = rect(), b = rect(...position), topology = portalTopology(a, b), other = portalTopology(b, a)
  assert(topology.connected && other.connected, edge + ' connection')
  assert.equal(topology.edge, edge); assert.equal(other.edge, reverse)
  assert.equal(topology.gap, 60); assert.equal(topology.stretch, .5)
  // Independent screen-coordinate comparison: both windows draw the same perpendicular portal position.
  if (edge === 'left' || edge === 'right') assert.equal(a.y + topology.anchor * a.height, b.y + other.anchor * b.height)
  else assert.equal(a.x + topology.anchor * a.width, b.x + other.anchor * b.width)
}
assert(portalTopology(rect(), rect(820)).connected, '120 px gap is inclusive')
assert(!portalTopology(rect(), rect(821)).connected, '121 px gap is too far')
assert(portalTopology(rect(), rect(750, 500)).connected, '100 px overlap is inclusive')
assert(!portalTopology(rect(), rect(750, 501)).connected, '99 px overlap cannot form a doorway')
assert(!portalTopology(rect(), rect(20, 20)).connected, 'almost coincident windows are not adjacent')
assert(!portalTopology(rect(), rect(800, 700)).connected, 'diagonal windows with no common edge do not connect')
assert(portalTopology(rect(-1500), rect(-760)).connected, 'negative monitor coordinates work')
assert.equal(portalTopology(rect(), null, true).edge, 'right')
assert.equal(portalTopology(rect(), null, true, 'guest').edge, 'left')
assert.deepEqual(contentRect({ screenX: -800, screenY: 40, innerWidth: 700, innerHeight: 600, outerWidth: 716, outerHeight: 696 }),
  { x: -792, y: 128, width: 700, height: 600, outerX: -800, outerY: 40, outerWidth: 716, outerHeight: 696 })
assert.equal(parsePortalQuery('?dimension=guest&portalSession=bad'), null)
assert.equal(parsePortalQuery(`?dimension=host&portalSession=${SESSION}`), null)
assert.deepEqual(parsePortalQuery(`?dimension=guest&portalSession=${SESSION}`), { role: 'guest', sessionId: SESSION })
assert.equal(advancePortalStory(0, 1000, false).elapsed, 4, 'long disconnected tick stops at first gate')
assert.equal(advancePortalStory(10, 1000, false).elapsed, 10, 'outbound freezes in place')
assert.equal(advancePortalStory(14, 1000, false).elapsed, 18, 'catch can finish but return waits')
assert.equal(advancePortalStory(22, 1000, false).elapsed, 22, 'return freezes in place')
assert.equal(advancePortalStory(28, 1000, false).elapsed, 32, 'finale completes locally')
console.log('PASS portal geometry: four edges, shared anchors, 120/100 px thresholds, overlap, negative monitors, timeline gates')

function simulation() {
  let now = 10000, nextId = 0
  const peers = new Map(), timers = new Set(), messages = []
  let blocked = () => false
  const make = (role, initial = role === 'host' ? rect() : rect(760), sessionId = SESSION, embedded = false) => {
    const id = `${role}-instance-${String(++nextId).padStart(10, '0')}`
    const handle = { id, role, rect: initial, closedGuest: false, wake: null, leave: null, closedCount: 0 }
    const env = {
      now: () => now, monotonicNow: () => now, randomId: () => id, rect: () => ({ ...handle.rect }),
      connect(receive) {
        peers.set(id, { receive, sessionId })
        return {
          send(message) {
            messages.push(structuredClone(message))
            for (const [otherId, other] of [...peers]) if (id !== otherId && other.sessionId === sessionId && !blocked(id, otherId)) other.receive(structuredClone(message))
          },
          close: () => peers.delete(id),
        }
      },
      every(callback, milliseconds) { const timer = { callback, milliseconds, at: now + milliseconds }; timers.add(timer); return () => timers.delete(timer) },
      onWake(callback) { handle.wake = callback; return () => { handle.wake = null } },
      onLeave(callback) { handle.leave = callback; return () => { handle.leave = null } },
      guestClosed: () => handle.closedGuest,
      closeGuest: () => { handle.closedCount++ },
    }
    const controller = createPortalController({ role, sessionId, embedded, environment: env })
    Object.assign(handle, { controller, state: controller.getSnapshot, env })
    return handle
  }
  return {
    make, messages, timers, peers, time: () => now,
    block: fn => { blocked = fn },
    inject: (id, message) => peers.get(id)?.receive(structuredClone(message)),
    advance(milliseconds) {
      const end = now + milliseconds
      for (;;) {
        const due = [...timers].filter(timer => timer.at <= end).sort((a, b) => a.at - b.at)[0]
        if (!due) break
        now = due.at; due.at += due.milliseconds; due.callback()
      }
      now = end
    },
    stall(milliseconds) {
      now += milliseconds
      for (const timer of [...timers]) { timer.at = now + timer.milliseconds; timer.callback() }
    },
  }
}

const sim = simulation(), host = sim.make('host')
host.controller.start()
sim.advance(5000)
assert.equal(host.state().snapshot.elapsed, 0, 'assets not ready: clock must remain at zero')
assert(host.state().snapshot.paused)
host.controller.setReady(true)
sim.advance(5000)
assert.equal(host.state().snapshot.elapsed, 4, 'host may steal while guest is loading, but cannot cross')
const guest = sim.make('guest')
guest.controller.start()
sim.advance(1000)
assert.equal(host.state().status, 'connected')
assert.equal(host.state().snapshot.elapsed, 4, 'connected but loading guest cannot receive actors')
guest.controller.setReady(true)
sim.advance(3000)
assert(Math.abs(host.state().snapshot.elapsed - 7) < 1e-8)
assert.equal(guest.state().snapshot.elapsed, host.state().snapshot.elapsed, 'guest consumes host snapshots')
const movingAt = host.state().snapshot.elapsed
host.controller.setReady(false)
sim.advance(2000)
assert.equal(host.state().snapshot.elapsed, movingAt, 'setReady(false) freezes every phase')
assert.equal(guest.state().snapshot.elapsed, movingAt)
host.controller.setReady(true)
sim.advance(100)
assert(host.state().snapshot.elapsed <= movingAt + .101, 'loading duration must not become deferred story time')
guest.controller.setReady(false)
sim.advance(1000)
const frozenForGuest = host.state().snapshot.elapsed
sim.advance(1000)
assert.equal(host.state().snapshot.elapsed, frozenForGuest, 'peer readiness loss pauses an active crossing')
guest.controller.setReady(true)
sim.advance(200)

guest.rect = rect(1300)
guest.wake()
const farAt = host.state().snapshot.elapsed
sim.advance(1000)
assert.equal(host.state().status, 'connecting')
assert.equal(host.state().snapshot.elapsed, farAt, 'moving windows apart freezes crossing')
guest.rect = rect(760, 100)
guest.wake()
sim.advance(200)
assert(host.state().snapshot.elapsed > farAt)
assert.equal(host.state().topology.anchor * host.rect.height, guest.rect.y + guest.state().topology.anchor * guest.rect.height)

const duplicate = sim.make('guest', rect(-760))
duplicate.controller.start(); duplicate.controller.setReady(true)
sim.advance(500)
assert.equal(host.state().peerRect.x, 760, 'a duplicate guest cannot replace the paired guest')
assert.notEqual(duplicate.state().status, 'connected')
const snapshotMessage = [...sim.messages].reverse().find(message => message.sender === host.id && message.type === 'snapshot')
const previous = guest.state().snapshot.elapsed
sim.inject(guest.id, { ...snapshotMessage, seq: snapshotMessage.seq - 1, snapshot: { ...snapshotMessage.snapshot, elapsed: 0, phase: 'theft' } })
assert.equal(guest.state().snapshot.elapsed, previous, 'out-of-order snapshots are ignored')
sim.inject(guest.id, { ...snapshotMessage, sessionId: 'another-session-1234', seq: snapshotMessage.seq + 50 })
assert.equal(guest.state().snapshot.elapsed, previous, 'foreign session snapshots are ignored')
sim.inject(host.id, { ...snapshotMessage, sender: guest.id, role: 'guest', seq: snapshotMessage.seq + 100 })
assert(!validPortalMessage({ ...snapshotMessage, snapshot: { ...snapshotMessage.snapshot, elapsed: NaN } }, SESSION))
assert(!validPortalMessage({ ...snapshotMessage, role: 'guest' }, SESSION), 'guest cannot author snapshots')
assert.equal(presentPortalTime({ ...guest.state().snapshot, paused: true }, sim.time() + 5000), previous)

duplicate.controller.close()
guest.controller.close()
assert.equal(host.state().status, 'disconnected', 'explicit guest close is detected without waiting three seconds')
const disconnectedAt = host.state().snapshot.elapsed
sim.advance(1500)
assert.equal(host.state().snapshot.elapsed, disconnectedAt)
const replacement = sim.make('guest')
replacement.controller.start(); replacement.controller.setReady(true)
sim.advance(200)
assert.equal(host.state().status, 'connected')
assert(host.state().snapshot.elapsed > disconnectedAt, 'fresh guest resumes existing story')
replacement.controller.restart()
assert.equal(host.state().snapshot.runId, 1)
assert.equal(host.state().snapshot.elapsed, 0)
assert(host.state().ready && host.state().peerReady, 'restart preserves loaded scene readiness')
assert.equal(replacement.state().snapshot.runId, 1)
sim.advance(5500)
sim.block(() => true)
sim.advance(2900)
assert.equal(replacement.state().status, 'connected', 'brief heartbeat jitter is tolerated')
sim.advance(200)
assert.equal(replacement.state().status, 'disconnected', 'silent host times out after three seconds')
assert(replacement.state().snapshot.paused)
assert.equal(host.state().status, 'disconnected')
const timeoutAt = host.state().snapshot.elapsed
const oldHeartbeat = [...sim.messages].reverse().find(message => message.sender === host.id && message.type === 'heartbeat')
sim.inject(replacement.id, { ...oldHeartbeat, at: sim.time() - 4000, seq: oldHeartbeat.seq + 1000 })
assert.equal(replacement.state().status, 'disconnected', 'queued stale heartbeat cannot resurrect a lost host')
sim.advance(1000)
assert.equal(host.state().snapshot.elapsed, timeoutAt)
sim.block(() => false)
sim.advance(300)
assert.equal(host.state().status, 'connected')
assert.equal(replacement.state().status, 'connected')
assert.equal(host.state().snapshot.elapsed, replacement.state().snapshot.elapsed)

const beforeStall = host.state().snapshot.elapsed
sim.stall(30000)
assert(host.state().snapshot.elapsed <= beforeStall + .251, 'background tab must not skip 30 seconds of choreography')
host.controller.dispose(); host.controller.dispose(); host.controller.start(); host.controller.start()
assert.equal(sim.timers.size, 2, 'StrictMode disposal/restart keeps exactly one timer per live session')
assert.equal(sim.peers.size, 2, 'StrictMode disposal/restart keeps exactly one channel per live session')
sim.advance(100)
assert.equal(host.state().status, 'connected')
host.controller.close()
assert.equal(host.state().status, 'closed')
assert.equal(host.closedCount, 1)
assert.equal(replacement.state().status, 'disconnected')
replacement.controller.close()
assert.equal(sim.timers.size, 0); assert.equal(sim.peers.size, 0)
console.log('PASS dual-window controller: readiness, host authority, movement pause, duplicate guest, stale packets, restart, close, heartbeat expiry/reconnect and StrictMode cleanup')

const embeddedSim = simulation(), embedded = embeddedSim.make('host', rect(), SESSION, true)
embedded.controller.start(); embeddedSim.advance(1000)
assert.equal(embedded.state().snapshot.elapsed, 0)
embedded.controller.setReady(true); embeddedSim.advance(12000)
embedded.controller.setReady(false); const pausedAt = embedded.state().snapshot.elapsed
embeddedSim.advance(8000); assert.equal(embedded.state().snapshot.elapsed, pausedAt)
embedded.controller.setReady(true); embeddedSim.advance(25000)
assert.equal(embedded.state().snapshot.elapsed, 32)
assert.equal(embedded.state().snapshot.phase, 'finish')
assert(embedded.state().snapshot.paused)
assert.equal(embeddedSim.peers.size, 0, 'embedded fallback needs no cross-window channel')
embedded.controller.close()
console.log('PASS embedded fallback: loading gate, explicit pause/resume and complete 32-second story')

// Exercise actual browser transport adapter with BroadcastChannel missing, without a DOM runner.
const saved = Object.fromEntries(['window', 'document', 'localStorage', 'BroadcastChannel'].map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]))
try {
  const fakeWindow = new EventTarget(), fakeDocument = new EventTarget(), stored = new Map(), writes = []
  const storage = { setItem(key, value) { stored.set(key, value); writes.push([key, value]) }, removeItem(key) { stored.delete(key) } }
  Object.assign(fakeWindow, { location: { href: 'http://127.0.0.1:5173/?keep=yes' } })
  let opened
  fakeWindow.open = (url, name, features) => { opened = { url, name, features }; return { closed: false, close() {} } }
  for (const [key, value] of Object.entries({ window: fakeWindow, document: fakeDocument, localStorage: storage, BroadcastChannel: undefined })) Object.defineProperty(globalThis, key, { configurable: true, writable: true, value })
  const received = [], env = createBrowserPortalEnvironment(SESSION), transport = env.connect(message => received.push(message))
  transport.send(snapshotMessage)
  const [key, value] = writes.at(-1)
  assert.equal(JSON.parse(value).sessionId, SESSION)
  const dispatch = () => { const event = new Event('storage'); Object.assign(event, { storageArea: storage, key, newValue: value }); fakeWindow.dispatchEvent(event) }
  dispatch(); assert.equal(received.length, 1)
  transport.close(); dispatch(); assert.equal(received.length, 1, 'storage listener removed on disposal')
  assert(openPortalGuest(SESSION))
  assert.equal(new URL(opened.url).searchParams.get('portalSession'), SESSION)
  assert.equal(new URL(opened.url).searchParams.get('dimension'), 'guest')
  assert(opened.features.includes('width=720') && opened.features.includes('height=700'))
  fakeWindow.open = () => null
  assert.equal(openPortalGuest(SESSION), null, 'blocked popup is exposed for in-page fallback')
  assert.equal(openPortalGuest('bad'), null)
  const first = createPortalSessionId(), second = createPortalSessionId()
  assert(protocol.validPortalSessionId(first) && first !== second, 'session capabilities are unique cryptographic IDs')
} finally {
  for (const [key, descriptor] of Object.entries(saved)) {
    if (descriptor) Object.defineProperty(globalThis, key, descriptor)
    else delete globalThis[key]
  }
}
console.log('PASS browser adapter: localStorage fallback, cleanup, popup URL/size/blocking and cryptographic session IDs')
