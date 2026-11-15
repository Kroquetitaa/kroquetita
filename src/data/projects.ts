import type { Localized } from './career'
import type { ConceptId } from './concepts'

/**
 * Demostraciones del hangar: máquinas que enseñan, en pequeño y de verdad,
 * cómo se resuelve un tipo de problema. Son demostraciones, no proyectos de
 * cliente: cuando haya un caso real que contar, va en `real`.
 */

export type DemoId = 'load' | 'agents' | 'data'

export interface Demo {
  id: DemoId
  title: Localized
  /** De qué va, en dos o tres palabras */
  tag: Localized
  summary: Localized
  /** Qué enseña la palanca: cómo estaba y cómo queda */
  before: Localized
  after: Localized
  /** Tecnologías relacionadas (como salen escritas en la trayectoria) y conceptos de la sala */
  skills: string[]
  concepts: ConceptId[]
  color: string
  /** Caso real, cuando lo haya */
  real?: { name: string; what: Localized; href?: string }
}

export const demos: Demo[] = [
  {
    id: 'load',
    title: { es: 'Arquitectura bajo carga', en: 'Architecture under load' },
    tag: { es: 'BACKEND QUE AGUANTA', en: 'A BACKEND THAT HOLDS' },
    summary: {
      es: 'Sube el tráfico y mira qué pasa con las colas, los tiempos de respuesta y los errores.',
      en: 'Turn the traffic up and watch what happens to queues, response times and errors.',
    },
    before: { es: 'Un solo servidor, sin caché', en: 'One server, no cache' },
    after: { es: 'Caché, cola y autoescalado', en: 'Cache, queue and autoscaling' },
    skills: ['Node.js', 'AWS', 'Docker', 'PostgreSQL', 'Redis'],
    concepts: [],
    color: '#38bdf8',
  },
  {
    id: 'agents',
    title: { es: 'Equipo de agentes', en: 'A team of agents' },
    tag: { es: 'IA QUE SE REPARTE EL TRABAJO', en: 'AI THAT SHARES THE WORK' },
    summary: {
      es: 'La misma tarea hecha por un agente solo o por un orquestador con especialistas y un revisor.',
      en: 'The same task done by a single agent or by an orchestrator with specialists and a reviewer.',
    },
    before: { es: 'Un agente lo hace todo en serie', en: 'One agent does it all in sequence' },
    after: { es: 'Orquestador, especialistas en paralelo y revisor', en: 'Orchestrator, parallel specialists and a reviewer' },
    skills: ['LangGraph', 'LangChain', 'Python', 'LLM'],
    concepts: ['agents', 'multiagent', 'mcp'],
    color: '#ff6a2b',
  },
  {
    id: 'data',
    title: { es: 'Datos con contrato', en: 'Data with a contract' },
    tag: { es: 'DATOS DE LOS QUE FIARSE', en: 'DATA YOU CAN TRUST' },
    summary: {
      es: 'Un flujo de datos con registros defectuosos: sin control llegan al final; con validación y trazabilidad, no.',
      en: 'A data pipeline with faulty records: unchecked they reach the end; with validation and lineage they do not.',
    },
    before: { es: 'Sin validar: lo que entra, sale', en: 'Unchecked: what goes in comes out' },
    after: { es: 'Contratos de datos, cuarentena y linaje', en: 'Data contracts, quarantine and lineage' },
    skills: ['Python', 'SQL', 'ETL', 'Blockchain'],
    concepts: ['graph', 'vectors'],
    color: '#a3e635',
  },
]
