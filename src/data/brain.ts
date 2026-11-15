import { profile, stages, type Discipline, type Lang, type Localized } from './career'
import { concepts, type ConceptId } from './concepts'
import { education } from './education'
import { demos } from './projects'

/**
 * El cerebro por dentro: un grafo que une las tecnologías con las etapas en
 * que se usaron, la formación con la etapa donde se aplicó, los conceptos de
 * la sala con las tecnologías que los ponen en práctica y las demostraciones
 * del hangar con unas y otros.
 *
 * Todo sale de los datos (`career`, `education`, `concepts`, `projects`); lo
 * único escrito a mano es `CONCEPT_SKILLS` y `DISCIPLINE_SKILLS`. Es lógica
 * pura: se calcula una vez al importar, siempre con el mismo resultado.
 */

export type BrainKind = 'skill' | 'stage' | 'study' | 'concept' | 'demo'

export interface BrainNode {
  /** `skill:typescript`, `stage:3`, `study:0`, `concept:rag`, `demo:load` */
  id: string
  kind: BrainKind
  /** Posición en su lista de origen (`stages`, `education`, `concepts`, `demos`); en una tecnología, su orden de aparición */
  index: number
  /** Nombre corto: es la etiqueta de la neurona */
  label: Localized
  /** Posición dentro de una esfera de radio `BRAIN_RADIUS`, centrada en el origen */
  position: [number, number, number]
  /** Número de conexiones */
  degree: number
}

/** Qué une a dos neuronas */
export type BrainLink =
  | 'uses' // etapa ↔ tecnología
  | 'applied' // formación → etapa
  | 'explains' // concepto ↔ tecnología
  | 'builds' // demostración ↔ tecnología
  | 'shows' // demostración ↔ concepto

export interface BrainEdge {
  /** Índices en `brain.nodes`, con a < b */
  a: number
  b: number
  kind: BrainLink
}

/** Lo que se ilumina al elegir una tecnología: concepto → demostración → caso real */
export interface BrainRoute {
  skill: string
  concept: string | null
  demo: string | null
  /** La etapa más reciente que la usa */
  stage: string | null
  /** Los pasos que haya, en orden: concepto, demostración, etapa */
  steps: string[]
  /** Conexiones (reales, del grafo) que dibujan la ruta */
  links: Array<[string, string]>
}

export const BRAIN_RADIUS = 40

/** Orden en que se listan los tipos */
export const KIND_ORDER: BrainKind[] = ['stage', 'skill', 'concept', 'demo', 'study']

/** Sin mayúsculas ni acentos, y con los alias conocidos: así «Node» y «Node.js» son la misma neurona. */
const ALIASES: Record<string, string> = { node: 'node.js', nodejs: 'node.js', ai: 'ia' }

export const plain = (text: string) =>
  text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim()

export const skillKey = (name: string) => {
  const key = plain(name)
  return ALIASES[key] ?? key
}

export const skillId = (name: string) => `skill:${skillKey(name).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}`

/**
 * Con qué tecnologías se practica cada concepto, de la más propia a la menos
 * (el orden decide qué concepto encabeza la ruta de una tecnología). Solo
 * cuentan las que existen en la trayectoria o en el perfil: las que no, se
 * descartan al construir.
 */
const CONCEPT_SKILLS: Record<ConceptId, string[]> = {
  neural: ['IA', 'PyTorch', 'Hugging Face'],
  graph: ['Data Science', 'LangGraph'],
  vectors: ['pgvector', 'RAG', 'PostgreSQL'],
  attention: ['LLM', 'NLP', 'Hugging Face', 'OpenAI API', 'Claude API'],
  rag: ['RAG', 'LangChain', 'pgvector', 'LLM'],
  agents: ['LangGraph', 'LangChain', 'Claude API', 'MCP'],
  descent: ['PyTorch', 'MLflow', 'Data Science'],
  diffusion: ['Hugging Face', 'PyTorch'],
  mcp: ['MCP', 'Claude API'],
  multiagent: ['LangGraph', 'LangChain'],
  rl: ['PyTorch', 'IA'],
  lora: ['Hugging Face', 'PyTorch', 'vLLM'],
}

/** Conocimientos generales del perfil que no salen en ningún `stack`: se unen a las etapas de su disciplina. */
const DISCIPLINE_SKILLS: Partial<Record<Discipline, string[]>> = {
  blockchain: ['Blockchain'],
  data: ['Data Science'],
  ai: ['IA', 'LLM'],
}

/** Aleatorio determinista (mulberry32). */
function prng(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Iteraciones de la disposición por fuerzas */
const ITERATIONS = 140
/** Distancia de reposo entre neuronas, antes de ajustar al radio */
const REST = 10
/** Separación mínima entre dos neuronas, ya en la esfera: que no se monten una sobre otra */
const GAP = 3.4

/**
 * Disposición por fuerzas (Fruchterman-Reingold en 3D): todas las neuronas se
 * repelen, las conectadas se atraen y una gravedad suave las mantiene juntas.
 * Semilla e iteraciones fijas: sale siempre lo mismo.
 */
function arrange(nodes: BrainNode[], edges: BrainEdge[]) {
  const n = nodes.length
  const rand = prng(20260615)
  const p = new Float64Array(n * 3)
  const d = new Float64Array(n * 3)

  nodes.forEach((node, i) => {
    if (node.kind === 'stage') {
      // Las etapas parten de una hélice que sube con los años: la trayectoria tira del resto.
      const t = stages.length > 1 ? node.index / (stages.length - 1) : 0
      const angle = t * Math.PI * 1.6
      p[i * 3] = Math.cos(angle) * 20
      p[i * 3 + 1] = -16 + t * 32
      p[i * 3 + 2] = Math.sin(angle) * 20
      return
    }
    // El resto, repartido al azar dentro de una esfera.
    const u = rand() * 2 - 1
    const a = rand() * Math.PI * 2
    const r = 26 * Math.cbrt(rand())
    const s = Math.sqrt(1 - u * u)
    p[i * 3] = Math.cos(a) * s * r
    p[i * 3 + 1] = u * r
    p[i * 3 + 2] = Math.sin(a) * s * r
  })

  for (let step = 0; step < ITERATIONS; step++) {
    d.fill(0)
    // Repulsión entre todos.
    for (let i = 0; i < n; i++) {
      const ix = i * 3
      for (let j = i + 1; j < n; j++) {
        const jx = j * 3
        let x = p[ix] - p[jx]
        let y = p[ix + 1] - p[jx + 1]
        let z = p[ix + 2] - p[jx + 2]
        let sq = x * x + y * y + z * z
        if (sq < 0.01) {
          // Dos neuronas en el mismo punto: se separan en una dirección fija.
          x = 0.1 + (i % 3) * 0.05
          y = 0.1
          z = 0.1 + (j % 3) * 0.05
          sq = x * x + y * y + z * z
        }
        const f = (REST * REST) / sq
        x *= f
        y *= f
        z *= f
        d[ix] += x
        d[ix + 1] += y
        d[ix + 2] += z
        d[jx] -= x
        d[jx + 1] -= y
        d[jx + 2] -= z
      }
    }
    // Atracción a lo largo de cada conexión (más floja en las neuronas con muchas, para que no se apelmacen).
    for (const edge of edges) {
      const ix = edge.a * 3
      const jx = edge.b * 3
      const x = p[ix] - p[jx]
      const y = p[ix + 1] - p[jx + 1]
      const z = p[ix + 2] - p[jx + 2]
      const dist = Math.sqrt(x * x + y * y + z * z) + 1e-6
      const crowd = Math.sqrt(Math.max(nodes[edge.a].degree, nodes[edge.b].degree))
      const f = dist / REST / Math.max(1, crowd * 0.55)
      d[ix] -= x * f
      d[ix + 1] -= y * f
      d[ix + 2] -= z * f
      d[jx] += x * f
      d[jx + 1] += y * f
      d[jx + 2] += z * f
    }
    // Gravedad hacia el centro y avance limitado por una «temperatura» que va bajando.
    const heat = 5 * (1 - step / ITERATIONS) + 0.05
    for (let i = 0; i < n; i++) {
      const ix = i * 3
      const x = d[ix] - p[ix] * 0.035
      const y = d[ix + 1] - p[ix + 1] * 0.035
      const z = d[ix + 2] - p[ix + 2] * 0.035
      const len = Math.sqrt(x * x + y * y + z * z) + 1e-6
      const move = Math.min(len, heat) / len
      p[ix] += x * move
      p[ix + 1] += y * move
      p[ix + 2] += z * move
    }
  }

  // Centrado y ajustado a la esfera.
  const c = [0, 0, 0]
  for (let i = 0; i < n; i++) for (let k = 0; k < 3; k++) c[k] += p[i * 3 + k] / n
  let reach = 1e-6
  for (let i = 0; i < n; i++) {
    reach = Math.max(reach, Math.hypot(p[i * 3] - c[0], p[i * 3 + 1] - c[1], p[i * 3 + 2] - c[2]))
  }
  const scale = BRAIN_RADIUS / reach
  for (let i = 0; i < n; i++) for (let k = 0; k < 3; k++) p[i * 3 + k] = (p[i * 3 + k] - c[k]) * scale

  // Las que hayan quedado pegadas se separan lo justo (y ninguna sale de la esfera).
  for (let pass = 0; pass < 12; pass++) {
    for (let i = 0; i < n; i++) {
      const ix = i * 3
      for (let j = i + 1; j < n; j++) {
        const jx = j * 3
        const x = p[ix] - p[jx]
        const y = p[ix + 1] - p[jx + 1]
        const z = p[ix + 2] - p[jx + 2]
        const dist = Math.sqrt(x * x + y * y + z * z)
        if (dist >= GAP || dist < 1e-6) continue
        const push = (GAP - dist) / dist / 2
        p[ix] += x * push
        p[ix + 1] += y * push
        p[ix + 2] += z * push
        p[jx] -= x * push
        p[jx + 1] -= y * push
        p[jx + 2] -= z * push
      }
    }
    for (let i = 0; i < n; i++) {
      const r = Math.hypot(p[i * 3], p[i * 3 + 1], p[i * 3 + 2])
      if (r > BRAIN_RADIUS) for (let k = 0; k < 3; k++) p[i * 3 + k] *= BRAIN_RADIUS / r
    }
  }
  const round = (value: number) => Math.round(value * 1000) / 1000
  nodes.forEach((node, i) => {
    node.position = [round(p[i * 3]), round(p[i * 3 + 1]), round(p[i * 3 + 2])]
  })
}

function build() {
  const nodes: BrainNode[] = []
  const byId = new Map<string, number>()
  const edges: BrainEdge[] = []
  const linked = new Set<string>()

  const add = (id: string, kind: BrainKind, index: number, label: Localized) => {
    byId.set(id, nodes.length)
    nodes.push({ id, kind, index, label, position: [0, 0, 0], degree: 0 })
    return nodes.length - 1
  }
  /** Devuelve la neurona de esa tecnología; si no existía, la crea con ese nombre. */
  let skillCount = 0
  const skill = (name: string) => {
    const id = skillId(name)
    return byId.get(id) ?? add(id, 'skill', skillCount++, { es: name, en: name })
  }
  const link = (a: number, b: number, kind: BrainLink) => {
    if (a === b) return
    const lo = Math.min(a, b)
    const hi = Math.max(a, b)
    const key = `${lo}:${hi}`
    if (linked.has(key)) return
    linked.add(key)
    edges.push({ a: lo, b: hi, kind })
    nodes[lo].degree++
    nodes[hi].degree++
  }

  // Etapas y sus tecnologías (manda el nombre tal y como sale en el `stack`).
  const stageNodes = stages.map((stage, i) => add(`stage:${i}`, 'stage', i, { es: stage.title, en: stage.title }))
  stages.forEach((stage, i) => stage.stack.forEach((name) => link(stageNodes[i], skill(name), 'uses')))
  // Conocimientos del perfil: los que no estén ya, se crean; los generales se unen a las etapas de su disciplina.
  profile.skills.forEach(skill)
  stages.forEach((stage, i) => {
    for (const name of DISCIPLINE_SKILLS[stage.discipline] ?? []) link(stageNodes[i], skill(name), 'uses')
  })

  // Formación → etapa donde se aplicó.
  education.forEach((study, i) => {
    const node = add(`study:${i}`, 'study', i, { es: study.school, en: study.school })
    const at = study.appliedAt ? stages.findIndex((stage) => plain(stage.title) === plain(study.appliedAt!)) : -1
    if (at >= 0) link(node, stageNodes[at], 'applied')
  })

  // Conceptos ↔ tecnologías (solo las que existen).
  const conceptNodes = new Map<ConceptId, number>()
  concepts.forEach((concept, i) => {
    const node = add(`concept:${concept.id}`, 'concept', i, concept.title)
    conceptNodes.set(concept.id, node)
    for (const name of CONCEPT_SKILLS[concept.id] ?? []) {
      const at = byId.get(skillId(name))
      if (at !== undefined) link(node, at, 'explains')
    }
  })

  // Demostraciones ↔ tecnologías (si alguna no estaba en la trayectoria, se crea) y ↔ conceptos.
  demos.forEach((demo, i) => {
    const node = add(`demo:${demo.id}`, 'demo', i, demo.title)
    demo.skills.forEach((name) => link(node, skill(name), 'builds'))
    demo.concepts.forEach((id) => {
      const at = conceptNodes.get(id)
      if (at !== undefined) link(node, at, 'shows')
    })
  })

  arrange(nodes, edges)

  const adjacency: number[][] = nodes.map(() => [])
  const edgesOf: number[][] = nodes.map(() => [])
  edges.forEach((edge, i) => {
    adjacency[edge.a].push(edge.b)
    adjacency[edge.b].push(edge.a)
    edgesOf[edge.a].push(i)
    edgesOf[edge.b].push(i)
  })
  return { nodes, edges, byId, adjacency, edgesOf }
}

export const brain = build()

/** Por dónde se empieza: la etapa actual (la última de la trayectoria). */
export const BRAIN_START = `stage:${stages.length - 1}`

export const indexOf = (id: string) => brain.byId.get(id) ?? -1

export const nodeOf = (id: string): BrainNode | undefined => brain.nodes[indexOf(id)]

/** Vecinos de una neurona, ordenados por tipo y, dentro de cada tipo, como en su lista de origen. */
export function neighborsOf(id: string): BrainNode[] {
  const at = indexOf(id)
  if (at < 0) return []
  return brain.adjacency[at]
    .map((i) => brain.nodes[i])
    .sort((a, b) => KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind) || a.index - b.index)
}

export const areLinked = (a: string, b: string) => {
  const i = indexOf(a)
  return i >= 0 && brain.adjacency[i].includes(indexOf(b))
}

/**
 * Ruta de una tecnología: el concepto que la explica → la demostración que la
 * enseña → la etapa más reciente que la usa. Devuelve lo que haya (puede
 * faltar cualquier paso) o null si la neurona no es una tecnología.
 */
export function routeOf(id: string): BrainRoute | null {
  const node = nodeOf(id)
  if (!node || node.kind !== 'skill') return null
  const around = neighborsOf(id)
  const stage = around.filter((n) => n.kind === 'stage').pop() ?? null
  const shows = around.filter((n) => n.kind === 'demo')
  // Conceptos, del más propio de esta tecnología al menos (según su puesto en `CONCEPT_SKILLS`).
  const rank = (concept: BrainNode) => {
    const at = CONCEPT_SKILLS[concepts[concept.index].id].findIndex((name) => skillId(name) === id)
    return at < 0 ? 99 : at
  }
  const ideas = around.filter((n) => n.kind === 'concept').sort((a, b) => rank(a) - rank(b))
  const best = ideas.filter((c) => rank(c) === rank(ideas[0]))
  // Entre los más propios, mejor el que además esté unido a una demostración de esta tecnología.
  const concept = best.find((c) => shows.some((d) => areLinked(c.id, d.id))) ?? best[0] ?? null
  // La demostración: la suya que enseñe ese concepto; si no, la suya; si no tiene, la del concepto.
  const demo =
    (concept && shows.find((d) => areLinked(concept.id, d.id))) ||
    shows[0] ||
    (concept && neighborsOf(concept.id).find((n) => n.kind === 'demo')) ||
    null

  const links: Array<[string, string]> = []
  if (concept) links.push([id, concept.id])
  if (demo) links.push(concept && areLinked(concept.id, demo.id) ? [concept.id, demo.id] : [id, demo.id])
  if (stage) links.push([id, stage.id])
  const steps = [concept, demo, stage].filter((n): n is BrainNode => n !== null).map((n) => n.id)
  return { skill: id, concept: concept?.id ?? null, demo: demo?.id ?? null, stage: stage?.id ?? null, steps, links }
}

/** Busca neuronas por nombre (sin mayúsculas ni acentos): primero las que empiezan por lo escrito. */
export function searchNodes(query: string, lang: Lang, limit = 8): BrainNode[] {
  const q = plain(query)
  if (!q) return []
  const found: Array<{ node: BrainNode; rank: number }> = []
  for (const node of brain.nodes) {
    const name = plain(node.label[lang])
    const at = name.indexOf(q)
    if (at >= 0) found.push({ node, rank: (at === 0 ? 0 : 1000) + name.length })
  }
  return found
    .sort((a, b) => a.rank - b.rank)
    .slice(0, limit)
    .map((entry) => entry.node)
}
