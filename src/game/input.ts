/**
 * Estado de entrada compartido (teclado + joystick táctil).
 * Es mutable a propósito: se lee cada frame sin pasar por React.
 */
export const input = {
  /** Eje horizontal: -1 izquierda, 1 derecha */
  x: 0,
  /** Eje de profundidad: -1 hacia el fondo, 1 hacia la cámara */
  z: 0,
  run: false,
  /** Se pone a true al pulsar salto y lo consume el jugador */
  jumpQueued: false,
  /** Eje analógico del joystick táctil (tiene prioridad si no es cero) */
  stickX: 0,
  stickZ: 0,
}

const down = new Set<string>()

function refresh() {
  const left = down.has('KeyA') || down.has('ArrowLeft')
  const right = down.has('KeyD') || down.has('ArrowRight')
  const up = down.has('KeyW') || down.has('ArrowUp')
  const back = down.has('KeyS') || down.has('ArrowDown')
  input.x = (right ? 1 : 0) - (left ? 1 : 0)
  input.z = (back ? 1 : 0) - (up ? 1 : 0)
  input.run = down.has('ShiftLeft') || down.has('ShiftRight')
}

const GAME_KEYS = new Set(['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'])

/** ¿Se está escribiendo en un campo de texto (el terminal)? Entonces las teclas no son del juego. */
export const isTyping = (e: KeyboardEvent) =>
  e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement

export function bindKeyboard(isPlaying: () => boolean) {
  const onDown = (e: KeyboardEvent) => {
    if (isTyping(e)) return
    if (isPlaying() && GAME_KEYS.has(e.code)) e.preventDefault()
    if (e.repeat) return
    down.add(e.code)
    if (e.code === 'Space') input.jumpQueued = true
    refresh()
  }
  const onUp = (e: KeyboardEvent) => {
    down.delete(e.code)
    refresh()
  }
  const onBlur = () => {
    down.clear()
    refresh()
  }
  window.addEventListener('keydown', onDown)
  window.addEventListener('keyup', onUp)
  window.addEventListener('blur', onBlur)
  return () => {
    window.removeEventListener('keydown', onDown)
    window.removeEventListener('keyup', onUp)
    window.removeEventListener('blur', onBlur)
  }
}
