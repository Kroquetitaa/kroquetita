import { create } from 'zustand'

type DimensionLaunch = {
  preview: boolean
  ignored: boolean
  blocked: boolean
  reveal: () => void
  leave: () => void
}
let ownedLens: Window | null = null

export function openNextDimension() {
  const url = new URL(window.location.href)
  url.searchParams.delete('dimension'); url.searchParams.delete('portalSession')
  const next = window.open(url.href, 'kroquetita-origen', 'popup=yes,width=760,height=700,resizable=yes,scrollbars=no')
  if (!next) useDimensionLaunch.setState({ preview: true, blocked: true })
}

export const useDimensionLaunch = create<DimensionLaunch>((set, get) => ({
  preview: false, ignored: false, blocked: false,
  reveal: () => {
    set({ ignored: false })
    if (window.matchMedia('(max-width:760px), (pointer:coarse)').matches) {
      set({ preview: true, blocked: false }); return
    }
    if (ownedLens && !ownedLens.closed) { ownedLens.focus(); return }
    const url = new URL(window.location.href)
    url.searchParams.delete('dimension'); url.searchParams.delete('portalSession')
    ownedLens = window.open(url.href, 'kroquetita-reverso', 'popup=yes,width=860,height=760,resizable=yes,scrollbars=no')
    if (!ownedLens) set({ preview: true, blocked: true })
  },
  leave: () => {
    const wasPreview = get().preview
    set({ preview: false, ignored: !wasPreview, blocked: false })
  },
}))
