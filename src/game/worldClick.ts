/** R3F still emits click after an OrbitControls drag; delta is pointer travel in CSS pixels. */
export function isWorldClick(event: { delta: number; stopPropagation: () => void }) {
  if (event.delta <= 5) return true
  // Do not let a rejected drag activate another intersected object or ancestor.
  event.stopPropagation()
  return false
}
