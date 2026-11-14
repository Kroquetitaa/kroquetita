import type { Localized } from './career'

/**
 * Sala de conceptos: una exposición, delante de la plaza, de ideas con las
 * que trabajo. Cada entrada es una instalación animada con su cartela.
 */
export type ConceptId = 'neural' | 'graph' | 'vectors' | 'attention' | 'rag' | 'agents' | 'descent'

export interface Concept {
  id: ConceptId
  title: Localized
  /** Rótulo corto sobre el título */
  tag: Localized
  /** Explicación en dos frases, sin jerga innecesaria */
  explain: Localized
  /** Qué pasa al pisar su plataforma */
  action: Localized
  color: string
}

export const concepts: Concept[] = [
  {
    id: 'neural',
    title: { es: 'Red neuronal', en: 'Neural network' },
    tag: { es: 'APRENDIZAJE PROFUNDO', en: 'DEEP LEARNING' },
    explain: {
      es: 'Capas de neuronas que se pasan señales: cada conexión tiene un peso, y aprender es ajustar esos pesos hasta acertar.',
      en: 'Layers of neurons passing signals along: every connection has a weight, and learning means tuning those weights until it gets things right.',
    },
    action: {
      es: 'Písala y verás una entrada cruzar la red hasta dar una respuesta.',
      en: 'Step on it and watch an input travel through the network to an answer.',
    },
    color: '#19e6ff',
  },
  {
    id: 'graph',
    title: { es: 'Grafo de conocimiento', en: 'Knowledge graph' },
    tag: { es: 'DATOS CONECTADOS', en: 'CONNECTED DATA' },
    explain: {
      es: 'Hechos guardados como nodos y relaciones: «Sergio — trabaja en → IA». Permite responder preguntas siguiendo caminos, no solo buscando palabras.',
      en: 'Facts stored as nodes and relations: "Sergio — works on → AI". It answers questions by following paths, not just matching words.',
    },
    action: {
      es: 'Písala y la consulta recorre el grafo de nodo en nodo.',
      en: 'Step on it and the query hops across the graph, node by node.',
    },
    color: '#3df2b0',
  },
  {
    id: 'vectors',
    title: { es: 'Base de datos vectorial', en: 'Vector database' },
    tag: { es: 'BÚSQUEDA POR SIGNIFICADO', en: 'SEARCH BY MEANING' },
    explain: {
      es: 'Cada texto se convierte en un punto del espacio: los que significan algo parecido quedan cerca. Buscar es encontrar los vecinos más próximos.',
      en: 'Every text becomes a point in space: things that mean something similar end up close. Searching is finding the nearest neighbours.',
    },
    action: {
      es: 'Muévete por la plataforma: tú eres la consulta y se iluminan tus vecinos.',
      en: 'Walk around the pad: you are the query, and your nearest neighbours light up.',
    },
    color: '#8b5cf6',
  },
  {
    id: 'attention',
    title: { es: 'Atención (Transformers)', en: 'Attention (Transformers)' },
    tag: { es: 'EL MOTOR DE LOS LLM', en: 'THE ENGINE OF LLMS' },
    explain: {
      es: 'Para entender una palabra, el modelo mira a todas las demás y decide cuáles importan. Ese «a qué presto atención» es lo que hizo posibles los LLM.',
      en: 'To understand one word, the model looks at all the others and decides which ones matter. That "what do I attend to" is what made LLMs possible.',
    },
    action: {
      es: 'Camina a lo largo de la frase: la palabra que tienes delante reparte su atención.',
      en: 'Walk along the sentence: the word in front of you spreads its attention.',
    },
    color: '#ff4d8d',
  },
  {
    id: 'rag',
    title: { es: 'RAG', en: 'RAG' },
    tag: { es: 'GENERACIÓN CON RECUPERACIÓN', en: 'RETRIEVAL-AUGMENTED GENERATION' },
    explain: {
      es: 'Antes de responder, el modelo busca documentos relevantes y contesta apoyándose en ellos. Menos inventar y más citar.',
      en: 'Before answering, the model looks up relevant documents and answers based on them. Less making things up, more citing.',
    },
    action: {
      es: 'Písala y sigue la pregunta: buscador, documentos, modelo y respuesta.',
      en: 'Step on it and follow the question: retriever, documents, model and answer.',
    },
    color: '#ffd60a',
  },
  {
    id: 'agents',
    title: { es: 'Agentes con LangGraph', en: 'Agents with LangGraph' },
    tag: { es: 'IA QUE ACTÚA', en: 'AI THAT ACTS' },
    explain: {
      es: 'Un agente es un modelo dentro de un bucle: planifica, usa una herramienta, mira el resultado y decide el siguiente paso. LangGraph dibuja ese bucle como un grafo de estados.',
      en: 'An agent is a model inside a loop: it plans, uses a tool, looks at the result and decides the next step. LangGraph draws that loop as a state graph.',
    },
    action: {
      es: 'Písala y lanza una ejecución: verás al agente dar vueltas hasta terminar.',
      en: 'Step on it to start a run: watch the agent loop until it is done.',
    },
    color: '#ff9f1c',
  },
  {
    id: 'descent',
    title: { es: 'Descenso del gradiente', en: 'Gradient descent' },
    tag: { es: 'CÓMO APRENDE UN MODELO', en: 'HOW A MODEL LEARNS' },
    explain: {
      es: 'El error del modelo es un paisaje con montañas y valles. Entrenar es bajar cuesta abajo, paso a paso, hasta el valle más profundo que se encuentre.',
      en: 'A model\'s error is a landscape of hills and valleys. Training means walking downhill, step by step, to the deepest valley it can find.',
    },
    action: {
      es: 'Písala y suelta una bola: rodará ladera abajo hasta un mínimo.',
      en: 'Step on it and drop a ball: it rolls downhill to a minimum.',
    },
    color: '#2f7bff',
  },
]
