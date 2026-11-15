import assert from 'node:assert/strict'
import { registerHooks } from 'node:module'
import { getEventListeners } from 'node:events'
registerHooks({ resolve(specifier, context, next) {
  try { return next(specifier, context) } catch (error) {
    if (error.code === 'ERR_MODULE_NOT_FOUND' && specifier.startsWith('.') && !/\.[a-z]+$/i.test(specifier)) return next(specifier + '.ts', context)
    throw error
  }
} })
const p = await import('../src/dimensions/protocol.ts')
const { createDimensionController, createBrowserDimensionEnvironment, createDimensionWindowId } = await import('../src/dimensions/session.ts')
const motion = await import('../src/dimensions/windowMotion.ts')
const rect = (x = 0, y = 0, width = 1000, height = 700) => ({ x, y, width, height, outerX: x, outerY: y, outerWidth: width, outerHeight: height })
const identity = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]
const input = () => ({ position: [2, 5, 10], quaternion: [0, 0, 0, 1], matrixWorld: [...identity], projectionMatrix: [...identity],
  type: 'perspective', near: .1, far: 300, viewport: { width: 1000, height: 700 }, place: 'city' })

const hostRect = rect(-500, 120, 1000, 700), lensRect = rect(150, 220, 700, 600)
const overlap = p.dimensionOverlap(lensRect, hostRect)
assert.deepEqual(overlap.rect, { x: 150, y: 220, width: 350, height: 600 })
assert.deepEqual(overlap.localNormalized, { x: 0, y: 0, width: .5, height: 1 })
assert.deepEqual(overlap.hostNormalized, { x: .65, y: 100 / 700, width: .35, height: 600 / 700 })
for (const [local, host] of [[rect(), rect()], [lensRect, hostRect], [hostRect, lensRect], [rect(-1500, -100), rect(-1700, -300)]]) {
  const o = p.dimensionOverlap(local, host)
  if (!o.active) continue
  for (const [axis, size] of [['x', 'width'], ['y', 'height']]) {
    assert(Math.abs(local[axis] + o.localNormalized[axis] * local[size] - (host[axis] + o.hostNormalized[axis] * host[size])) < 1e-8)
    assert(Math.abs(o.localNormalized[size] * local[size] - o.hostNormalized[size] * host[size]) < 1e-8)
  }
}
assert(!p.dimensionOverlap(rect(), rect(1000)).active, 'touching edges have no x-ray area')
assert(!p.dimensionOverlap(rect(), rect(1500, 900)).active)
assert(p.dimensionOverlap(rect(), rect(100, 100, 300, 300)).active, 'full containment is a valid lens')
assert.deepEqual(p.dimensionOverlap(rect(300, 200, 800, 600), rect(), rect(100, 100, 500, 400)).rect,
  { x: 300, y: 200, width: 300, height: 300 }, 'deepest reveal is restricted to all three windows')
assert(!p.dimensionOverlap(rect(700, 200, 600, 400), rect(), rect(100, 100, 500, 400)).active,
  'third window overlapping host alone cannot reveal the third layer')
assert(!p.dimensionOverlap(rect(1300, 100, 700, 500), rect(), rect(1200, 100, 600, 500)).active,
  'second and third windows overlapping entirely outside host must reveal nothing')
assert.deepEqual(p.dimensionOverlap(rect(900, 600, 600, 500), rect(), rect(800, 500, 500, 400)).rect,
  { x: 900, y: 600, width: 100, height: 100 }, 'host bounds clip both axes of a partial three-window overlap')
assert.equal(p.electDimensionLeader([{ id: 'b', openedAt: 20 }, { id: 'a', openedAt: 20 }, { id: 'c', openedAt: 30 }]).id, 'a')
assert.equal(p.electDimensionLeader([{ id: 'a', openedAt: 20 }, { id: 'z', openedAt: 10 }]).id, 'z')
assert(!p.dimensionEligible('?dimension=guest&portalSession=anything'), 'duck guest must not join discovery')
assert(p.dimensionEligible('?utm_source=demo'))
assert(!p.validDimensionCameraInput({ ...input(), projectionMatrix: [1, 2, 3] }))
assert(!p.validDimensionCameraInput({ ...input(), quaternion: [0, NaN, 0, 1] }))
assert(!p.validDimensionCameraInput({ ...input(), far: 0 }))
console.log('PASS dimension geometry: overlap crops align in screen space, negative monitors, containment, election ties and duck-guest exclusion')

function simulation() {
  let now = 10000, serial = 0, blocked = () => false
  const peers = new Map(), timers = new Set(), messages = []
  const make = (openedAt, initial = rect(), eligible = true, scope = '/') => {
    const id = `dimension-window-${String(++serial).padStart(10, '0')}`
    const handle = { id, rect: initial, wake: null, leave: null, resume: null }
    const env = { id, openedAt, scope, eligible, now: () => now, monotonicNow: () => now, rect: () => ({ ...handle.rect }),
      connect(receive) {
        peers.set(id, { receive, scope })
        return { send(message) {
          messages.push(structuredClone(message))
          for (const [otherId, other] of [...peers]) if (id !== otherId && scope === other.scope && !blocked(id, otherId)) other.receive(structuredClone(message))
        }, close: () => peers.delete(id) }
      },
      every(callback, milliseconds) { const timer = { callback, milliseconds, at: now + milliseconds }; timers.add(timer); return () => timers.delete(timer) },
      onWake(callback) { handle.wake = callback; return () => { handle.wake = null } },
      onLeave(callback) { handle.leave = callback; return () => { handle.leave = null } },
      onResume(callback) { handle.resume = callback; return () => { handle.resume = null } },
    }
    const controller = createDimensionController(env)
    return Object.assign(handle, { env, controller, state: controller.getSnapshot })
  }
  return { make, peers, timers, messages, time: () => now, block: fn => { blocked = fn }, inject: (id, packet) => peers.get(id)?.receive(structuredClone(packet)),
    advance(milliseconds) {
      const end = now + milliseconds
      for (;;) {
        const due = [...timers].filter(timer => timer.at <= end).sort((a, b) => a.at - b.at)[0]
        if (!due) break
        now = due.at; due.at += due.milliseconds; due.callback()
      }
      now = end
    },
  }
}
const sim = simulation(), first = sim.make(100, hostRect)
first.controller.start(); first.controller.sendCamera(input()); sim.advance(100)
assert.equal(first.state().role, 'solo')
assert.deepEqual(first.state().camera.matrixWorld, identity, 'solo retains the last local camera for manual preview')
assert.equal(sim.messages.filter(m => m.type === 'camera').length, 0, 'no camera broadcasts with one window')
const second = sim.make(200, lensRect)
second.controller.start(); sim.advance(100)
assert.equal(first.state().role, 'host'); assert.equal(second.state().role, 'lens')
assert.equal(second.state().leaderId, first.id)
assert.deepEqual(second.state().camera.position, [2, 5, 10], 'new lens immediately receives the cached host camera')
assert.deepEqual(second.state().camera.rect, hostRect)
assert(second.state().overlap.active)
const camera = input(); camera.matrixWorld[12] = 14
first.controller.sendCamera(camera); camera.matrixWorld[12] = 999
sim.advance(100)
assert.equal(second.state().camera.matrixWorld[12], 14, 'camera arrays are snapshotted rather than shared mutable references')
first.controller.sendCamera({ ...input(), place: 'brain' }); sim.advance(100)
assert.equal(second.state().camera.place, 'brain', 'lens can suspend city alignment while host is inside brain')
const oldPacket = [...sim.messages].reverse().find(m => m.type === 'camera')
sim.inject(second.id, { ...oldPacket, seq: oldPacket.seq - 1, camera: { ...oldPacket.camera, place: 'city' } })
assert.equal(second.state().camera.place, 'brain', 'out-of-order camera packets are ignored')
sim.inject(second.id, { ...oldPacket, scope: '/other', seq: oldPacket.seq + 50 })
assert.equal(second.state().leaderId, first.id)
second.rect = rect(1800, 120); second.wake(); sim.advance(100)
assert(!second.state().overlap.active, 'moving a lens outside host removes the crop')
assert.equal(second.state().role, 'lens', 'separation does not re-elect the leader')

const third = sim.make(300, rect(200, 300))
third.controller.start(); sim.advance(100)
assert.equal(first.state().role, 'host'); assert.equal(third.state().role, 'lens')
assert.equal(first.state().layer, 0); assert.equal(second.state().layer, 1); assert.equal(third.state().layer, 2)
assert.equal(third.state().layerCount, 3)
assert.deepEqual(third.state().underlayRect, second.rect)
assert(!third.state().overlap.active, 'separated second window closes deepest secret even when third overlaps host')
second.rect = rect(-300, 200, 600, 400); second.wake(); sim.advance(100)
assert.deepEqual(third.state().overlap.rect, { x: 200, y: 300, width: 100, height: 300 })
const fourth = sim.make(400, rect(200, 300))
fourth.controller.start(); sim.advance(100)
assert.equal(fourth.state().role, 'solo'); assert.equal(fourth.state().layer, 0)
assert(fourth.state().limitReached && !fourth.state().overlap.active)
assert.equal(fourth.state().layerCount, 3); assert.equal(fourth.state().peerCount, 2)
third.controller.dispose(); sim.advance(100)
assert.equal(fourth.state().role, 'lens'); assert.equal(fourth.state().layer, 2)
assert(!fourth.state().limitReached, 'fourth document takes an available slot after a close')
third.controller.start(); sim.advance(100)
assert.equal(third.state().layer, 2); assert(fourth.state().limitReached, 'stable older document regains its layer on reactivation')
fourth.controller.dispose(); sim.advance(100)
assert.equal(first.state().peerRect.x, second.rect.x, 'host prefers the earliest lens as primary peer')
assert.equal(first.state().peerCount, 2)
const foreign = sim.make(1, rect(), true, '/another-route')
foreign.controller.start(); sim.advance(100)
assert.equal(foreign.state().role, 'solo', 'different page scope does not join')
const duckGuest = sim.make(0, rect(), false)
duckGuest.controller.start()
assert.equal(duckGuest.state().role, 'solo')
assert(!sim.peers.has(duckGuest.id), 'excluded popup opens neither channel nor timer')

const earliest = sim.make(50, rect(-1000))
earliest.controller.start(); earliest.controller.sendCamera(input()); sim.advance(100)
assert.equal(earliest.state().role, 'host', 'an older document discovered late becomes the stable leader')
assert.equal(first.state().role, 'lens'); assert.equal(third.state().leaderId, earliest.id)
assert.equal(first.state().layer, 1); assert.equal(second.state().layer, 2)
assert(third.state().limitReached && third.state().role === 'solo', 'only oldest three documents remain active')
const forgedNonLeader = { ...oldPacket, windowId: third.id, openedAt: 300, at: sim.time(), seq: 999999, camera: { ...oldPacket.camera, place: 'city', sentAt: sim.time() } }
sim.inject(second.id, forgedNonLeader)
assert.equal(second.state().leaderId, earliest.id, 'non-host camera cannot replace leader')
assert.equal(second.state().camera.rect.x, -1000)
earliest.controller.dispose(); sim.advance(100)
assert.equal(first.state().role, 'host', 'closing oldest promotes next live document')
assert.equal(second.state().leaderId, first.id)
const stableId = first.state().windowId
first.controller.dispose(); sim.advance(100)
assert.equal(second.state().role, 'host', 'suspending discovery releases authority')
first.controller.start(); sim.advance(100)
assert.equal(first.state().windowId, stableId)
assert.equal(first.state().role, 'host', 'reactivation preserves original identity and age')

first.controller.sendCamera(input()); sim.advance(100)
const cameraCount = sim.messages.filter(m => m.type === 'camera' && m.windowId === first.id).length
for (let i = 0; i < 120; i++) { first.controller.sendCamera(input()); sim.advance(1000 / 120) }
const sentCount = sim.messages.filter(m => m.type === 'camera' && m.windowId === first.id).length - cameraCount
assert(sentCount <= 21, 'render-rate camera inputs must be throttled to about 20 Hz')
sim.block((a, b) => a === first.id || b === first.id)
sim.advance(3200)
assert.equal(second.state().role, 'host', 'silent leader expires after three seconds')
const staleHeartbeat = [...sim.messages].reverse().find(m => m.windowId === first.id && m.type === 'heartbeat')
sim.inject(second.id, { ...staleHeartbeat, seq: staleHeartbeat.seq + 100, at: sim.time() - 4000 })
assert.equal(second.state().role, 'host', 'delayed heartbeat cannot resurrect a timed-out host')
sim.block(() => false); sim.advance(200)
assert.equal(second.state().role, 'lens'); assert.equal(second.state().leaderId, first.id)
first.controller.dispose(); first.controller.dispose(); first.controller.start(); first.controller.start()
assert.equal(sim.peers.size, 4, 'StrictMode restart has one channel per active document')
assert.equal(sim.timers.size, 4, 'StrictMode restart has one timer per active document')
foreign.controller.dispose(); third.controller.dispose(); first.controller.dispose(); sim.advance(100)
assert.equal(second.state().role, 'solo', 'last remaining lens gracefully returns to solo')
assert.equal(second.state().camera, null, 'old host camera is cleared after promotion')
second.controller.dispose()
assert.equal(sim.peers.size, 0); assert.equal(sim.timers.size, 0)
console.log('PASS dimension sessions: automatic discovery, stable three-layer order, triple overlap, fourth-window limit/recovery, camera authority/throttle/copy, suspend/resume, timeout, close and cleanup')

// A fourth city's local camera must never become an authoritative lens frame on promotion.
// The host is deliberately not ticking/rendering: promotion must request its cached camera.
const promotion = simulation(), promoted = [100, 200, 300, 400].map(age => promotion.make(age))
promoted.forEach(h => h.controller.start())
const hostCamera = input(); hostCamera.position[0] = 1
const localCamera = input(); localCamera.position[0] = 999
promoted[0].controller.sendCamera(hostCamera); promoted[3].controller.sendCamera(localCamera)
assert.equal(promoted[3].state().camera.position[0], 999)
const unsubscribe = promoted[3].controller.subscribe(() => {
  const state = promoted[3].state()
  if (state.role === 'lens' && state.camera) assert.equal(state.camera.position[0], 1, 'promotion exposed the fourth window local camera')
})
promoted[2].controller.dispose()
assert.equal(promoted[3].state().role, 'lens')
assert.equal(promoted[3].state().camera.position[0], 1, 'promotion requests cached host camera without waiting for another render')
promoted[2].controller.start(); promoted[3].controller.sendCamera(localCamera); promotion.advance(100)
promotion.block((from, to) => from === promoted[0].id && to === promoted[3].id)
promoted[2].controller.dispose()
assert.equal(promoted[3].state().camera, null, 'promotion waits with no camera when the host reply has not arrived')
unsubscribe(); promoted.forEach(h => h.controller.dispose())

const bfcache = simulation(), cachedHost = bfcache.make(100), cachedLens = bfcache.make(200)
cachedHost.controller.start(); cachedLens.controller.start()
cachedHost.leave()
assert.equal(cachedLens.state().role, 'solo')
assert.equal(bfcache.timers.size, 1); assert.equal(bfcache.peers.size, 1)
assert(cachedHost.resume && cachedHost.leave, 'pagehide must retain lifecycle listeners for BFCache return')
cachedHost.resume(); cachedHost.resume()
assert.equal(cachedHost.state().role, 'host'); assert.equal(cachedLens.state().role, 'lens')
assert.equal(bfcache.timers.size, 2); assert.equal(bfcache.peers.size, 2)
cachedHost.leave(); const queuedResume = cachedHost.resume
cachedHost.controller.dispose(); queuedResume()
assert.equal(cachedHost.resume, null); assert.equal(cachedHost.leave, null)
assert.equal(bfcache.timers.size, 1, 'real React cleanup prevents even a queued pageshow from reviving the controller')
cachedLens.controller.dispose()
assert.equal(bfcache.timers.size, 0); assert.equal(bfcache.peers.size, 0)
console.log('PASS promotion/BFCache regressions: no local-camera flash, cached host request, pagehide/pageshow resume and real-unmount cleanup')

const metrics = { x: 0, y: 0, width: 1000, height: 700, fullscreen: false, reducedMotion: false }
let sample = motion.sampleWindowMotion(motion.createWindowMotionSample(), metrics, 0)
for (let i = 1; i <= 30; i++) sample = motion.sampleWindowMotion(sample, { ...metrics, x: i * 80, y: -i * 40 }, i * 1000 / 15)
assert(sample.velocity.x > .95 && sample.velocity.y < -.45)
assert(sample.strength > .8 && sample.strength <= 1)
const stopped = { ...metrics, x: 2400, y: -1200 }
for (let i = 31; i <= 90; i++) {
  sample = motion.sampleWindowMotion(sample, stopped, i * 1000 / 15)
  assert(Math.abs(sample.velocity.x) <= 1 && Math.abs(sample.acceleration.x) <= 1 && sample.strength <= 1)
}
assert(sample.strength < .001, 'motion strength decays after the window stops')
sample = motion.sampleWindowMotion(sample, { ...stopped, x: -100000 }, 91 * 1000 / 15)
assert(Number.isFinite(sample.strength) && sample.strength <= 1, 'large screen jumps stay bounded')
for (const changed of [{ ...stopped, width: 1100 }, { ...stopped, fullscreen: true }, { ...stopped, reducedMotion: true }]) {
  const reset = motion.sampleWindowMotion(sample, changed, 92 * 1000 / 15)
  assert.equal(reset.strength, 0); assert.equal(reset.velocity.x, 0); assert.equal(reset.acceleration.y, 0)
}
sample = motion.sampleWindowMotion(sample, { ...stopped, x: NaN }, 92 * 1000 / 15)
sample = motion.sampleWindowMotion(sample, stopped, 93 * 1000 / 15)
assert.equal(sample.strength, 0); assert(Number.isFinite(sample.velocity.x), 'invalid metrics recover safely')
assert.equal(motion.sampleWindowMotion(sample, { ...stopped, x: 100 }, 20000).strength, 0, 'long background gap resets momentum')
assert.equal(motion.sampleWindowMotion(sample, stopped, 1).strength, 0, 'nonmonotonic clocks reset momentum')
console.log('PASS window motion: direction, bounded velocity/acceleration, decay, resize/fullscreen/reduced-motion reset and invalid-input recovery')

const saved = Object.fromEntries(['window', 'document', 'localStorage', 'BroadcastChannel'].map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]))
try {
  const win = new EventTarget(), doc = new EventTarget(), media = new EventTarget(), intervals = new Map(), writes = []
  let intervalId = 0
  Object.assign(media, { matches: false })
  Object.assign(win, { location: { pathname: '/', search: '' }, screenX: -800, screenY: 0, innerWidth: 700, innerHeight: 600, outerWidth: 716, outerHeight: 696,
    matchMedia: () => media, setInterval(callback) { intervals.set(++intervalId, callback); return intervalId }, clearInterval(id) { intervals.delete(id) } })
  Object.assign(doc, { fullscreenElement: null })
  const storage = { setItem(key, value) { writes.push([key, value]) }, removeItem() {} }
  for (const [key, value] of Object.entries({ window: win, document: doc, localStorage: storage, BroadcastChannel: undefined })) Object.defineProperty(globalThis, key, { configurable: true, writable: true, value })
  const env1 = createBrowserDimensionEnvironment(), env2 = createBrowserDimensionEnvironment()
  assert.equal(env1.id, env2.id, 'hook/controller remount preserves document identity')
  assert.notEqual(createDimensionWindowId(), createDimensionWindowId(), 'new document IDs are cryptographic, never cloned storage values')
  win.location.search = '?dimension=guest'
  const excluded = createDimensionController(createBrowserDimensionEnvironment()); excluded.start()
  assert.equal(intervals.size, 0)
  win.location.search = ''
  const received = [], transport = env1.connect(message => received.push(message))
  transport.send(staleHeartbeat)
  const [key, value] = writes.at(-1)
  const fire = () => { const event = new Event('storage'); Object.assign(event, { key, newValue: value, storageArea: storage }); win.dispatchEvent(event) }
  fire(); assert.equal(received.length, 1)
  transport.close(); fire(); assert.equal(received.length, 1)
  const restored = createDimensionController(env1)
  restored.start()
  assert.equal(intervals.size, 1); assert.equal(getEventListeners(win, 'pageshow').length, 1)
  win.dispatchEvent(new Event('pagehide'))
  assert.equal(intervals.size, 0); assert.equal(getEventListeners(win, 'pageshow').length, 1)
  win.dispatchEvent(new Event('pageshow')); win.dispatchEvent(new Event('pageshow'))
  assert.equal(intervals.size, 1); assert.equal(getEventListeners(win, 'pagehide').length, 1)
  restored.dispose(); win.dispatchEvent(new Event('pageshow'))
  assert.equal(intervals.size, 0)
  assert.equal(getEventListeners(win, 'pageshow').length, 0); assert.equal(getEventListeners(win, 'pagehide').length, 0)
  const releaseA = motion.acquireWindowMotion(), releaseB = motion.acquireWindowMotion()
  assert.equal(intervals.size, 1); assert.equal(getEventListeners(win, 'resize').length, 1)
  motion.windowMotion.strength = .9
  const releaseReduced = motion.acquireWindowMotion(true)
  assert.equal(motion.windowMotion.strength, 0)
  releaseReduced(); releaseA(); assert.equal(intervals.size, 1)
  releaseB(); releaseB()
  assert.equal(intervals.size, 0); assert.equal(getEventListeners(win, 'resize').length, 0)
  assert.equal(getEventListeners(doc, 'fullscreenchange').length, 0)
  assert.equal(getEventListeners(media, 'change').length, 0)
  assert.equal(motion.windowMotion.strength, 0)
} finally {
  for (const [key, descriptor] of Object.entries(saved)) if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key]
}
console.log('PASS browser adapters: document identity, guest exclusion, storage fallback, shared 15 Hz motion poller and full listener cleanup')
