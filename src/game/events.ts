/** Canal mínimo para que los objetos del escenario hagan hablar al personaje. */
type Listener = (text: string) => void

const listeners = new Set<Listener>()

export function onPlayerSay(listener: Listener) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function playerSay(text: string) {
  listeners.forEach((listener) => listener(text))
}
