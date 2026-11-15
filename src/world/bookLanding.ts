import { HALF, HEIGHT } from '../game/physics'
import { world } from './layout'

/** Use the exposed step: the centre of a book can be underneath the next book. */
export function bookLanding(index: number): [number, number, number] {
  const book = world.props.campus.books[index]
  const y = book.center[1] + book.size[1] / 2
  const offsets = [0, .5, -.5, 1, -1]
  for (const u of offsets) for (const v of offsets) {
    const x = book.center[0] + u * (book.size[0] / 2 - HALF - .08)
    const z = book.center[2] + v * (book.size[2] / 2 - HALF - .08)
    const blocked = world.colliders.some(b =>
      b.max[1] > y + .02 && b.min[1] < y + HEIGHT &&
      x + HALF > b.min[0] && x - HALF < b.max[0] &&
      z + HALF > b.min[2] && z - HALF < b.max[2])
    if (!blocked) return [x, y, z]
  }
  return [book.center[0], y, book.center[2]]
}
