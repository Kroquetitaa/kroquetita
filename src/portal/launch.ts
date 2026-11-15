import { create } from 'zustand'
import { createPortalSessionId, openPortalGuest } from './session'
import { parsePortalQuery } from './protocol'

type LaunchState = {
  active: boolean
  sessionId: string
  embedded: boolean
  blocked: boolean
  launch: () => void
  embed: () => void
  reopen: () => void
  leave: () => void
}
let guestWindow: Window | null = null

/** Script-opened guests return control to their host; independent tabs return to the city. */
export function leavePortalGuest() {
  if (window.opener) { window.close(); return }
  window.location.assign(window.location.pathname)
}

/** Only an explicit button gesture opens a window; the city remains the return point. */
export const usePortalLaunch = create<LaunchState>((set, get) => ({
  active: false, sessionId: '', embedded: false, blocked: false,
  launch: () => {
    if (get().active) return
    const sessionId = createPortalSessionId()
    const compact = window.matchMedia('(max-width: 760px), (pointer: coarse)').matches
    guestWindow = compact ? null : openPortalGuest(sessionId)
    set({ active: true, sessionId, embedded: compact || !guestWindow, blocked: !compact && !guestWindow })
  },
  embed: () => {
    guestWindow?.close(); guestWindow = null
    set({ embedded: true, blocked: false })
  },
  reopen: () => {
    if (guestWindow && !guestWindow.closed) {
      try {
        const url = new URL(guestWindow.location.href)
        if (url.origin === window.location.origin && parsePortalQuery(url.search)?.sessionId === get().sessionId) {
          guestWindow.focus(); return
        }
      } catch { /* A navigated guest may now be cross-origin: reopen its named window below. */ }
    }
    guestWindow = openPortalGuest(get().sessionId)
    if (guestWindow) { guestWindow.focus(); set({ embedded: false, blocked: false }) }
    else set({ embedded: true, blocked: true })
  },
  leave: () => {
    guestWindow?.close(); guestWindow = null
    set({ active: false, blocked: false })
  },
}))
