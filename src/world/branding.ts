import { blenderAssembly } from './blenderAssembly'

/** Each company's badge stays above its own building; THE CORE clears the skyline. */
export function companyLogoPosition(index: number): [number, number, number] {
  const tower = blenderAssembly.stages[index]
  return [tower.position[0], tower.propsTop + .78, tower.position[2] - .35]
}
