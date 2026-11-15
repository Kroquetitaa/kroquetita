/** Regression: a still-open guest navigated to the city must be restored, not merely focused. */
import assert from 'node:assert/strict'
import { registerHooks } from 'node:module'

registerHooks({ resolve(specifier, context, next) {
  try { return next(specifier, context) }
  catch (error) {
    if (error.code === 'ERR_MODULE_NOT_FOUND' && specifier.startsWith('.') && !/\.[a-z]+$/i.test(specifier)) return next(specifier + '.ts', context)
    throw error
  }
} })

const calls = { open: 0, focus: 0, close: 0, assigned: [] }
const popup = { closed: false, focus() { calls.focus++ }, close() { this.closed = true } }
globalThis.window = {
  opener: {},
  location: { href: 'http://127.0.0.1:5173/', origin: 'http://127.0.0.1:5173', pathname: '/',
    assign(url) { calls.assigned.push(url) } },
  matchMedia: () => ({ matches: false }),
  close() { calls.close++ },
  open(url, name) {
    calls.open++
    popup.closed = false
    Object.defineProperty(popup, 'location', { value: new URL(url), configurable: true, writable: true })
    popup.name = name
    return popup
  },
}
const { usePortalLaunch, leavePortalGuest } = await import('../src/portal/launch.ts')
usePortalLaunch.getState().launch()
const initialName = popup.name, sessionId = usePortalLaunch.getState().sessionId
usePortalLaunch.getState().reopen()
assert.equal(calls.open, 1, 'a healthy guest is focused without restarting its scene')
assert.equal(calls.focus, 1)

popup.location = new URL('http://127.0.0.1:5173/')
usePortalLaunch.getState().reopen()
assert.equal(calls.open, 2, 'a navigated guest must load the portal URL again')
assert.equal(popup.name, initialName, 'reuse the same named window')
assert.equal(popup.location.searchParams.get('dimension'), 'guest')
assert.equal(popup.location.searchParams.get('portalSession'), sessionId)

Object.defineProperty(popup, 'location', { configurable: true, get() { throw new Error('Cross-origin location') } })
usePortalLaunch.getState().reopen()
assert.equal(calls.open, 3, 'cross-origin navigation must also recover the named guest')
assert.equal(popup.location.searchParams.get('portalSession'), sessionId)

leavePortalGuest()
assert.equal(calls.close, 1, 'a popup with an opener closes')
assert.equal(calls.assigned.length, 0, 'a closing popup must not navigate to the city')
window.opener = null
leavePortalGuest()
assert.deepEqual(calls.assigned, ['/'], 'an independent guest tab returns to the city')
console.log('PASS: healthy guest focus, navigated/cross-origin guest recovery, popup exit, independent-tab exit.')
