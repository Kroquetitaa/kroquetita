/** The opening vignette stays visible for one short chase, even with a warm cache. */
const openedAt = performance.now()
export const LOADING_VIGNETTE_MS = 3600
export const loadingTimeRemaining = () => Math.max(0, LOADING_VIGNETTE_MS - (performance.now() - openedAt))
