import type { Localized } from './career'

/**
 * Sala de conceptos: una exposición, delante de la plaza, de ideas con las
 * que trabajo. Cada entrada es una instalación animada con su cartela.
 */
export type ConceptId =
  | 'neural'
  | 'graph'
  | 'vectors'
  | 'attention'
  | 'rag'
  | 'agents'
  | 'descent'
  | 'diffusion'
  | 'mcp'
  | 'multiagent'
  | 'rl'
  | 'lora'

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
  {
    id: 'diffusion',
    title: { es: 'Modelos de difusión', en: 'Diffusion models' },
    tag: { es: 'DEL RUIDO A LA IMAGEN', en: 'FROM NOISE TO IMAGE' },
    explain: {
      es: 'Se entrena a un modelo para quitar ruido poco a poco. Empezando por ruido puro y limpiando paso a paso, acaba apareciendo una imagen nueva.',
      en: 'A model is trained to remove noise a little at a time. Start from pure noise, clean it step by step, and a brand-new image appears.',
    },
    action: {
      es: 'Písala y verás el ruido ordenarse hasta formar un dibujo.',
      en: 'Step on it and watch the noise settle into a picture.',
    },
    color: '#e879f9',
  },
  {
    id: 'mcp',
    title: { es: 'MCP', en: 'MCP' },
    tag: { es: 'EL ENCHUFE DE LA IA', en: 'THE PLUG FOR AI' },
    explain: {
      es: 'Model Context Protocol: un estándar para conectar un modelo con herramientas y datos (ficheros, bases de datos, APIs) sin escribir una integración distinta para cada uno.',
      en: 'Model Context Protocol: a standard for connecting a model to tools and data (files, databases, APIs) without writing a different integration for each one.',
    },
    action: {
      es: 'Písala y las herramientas se enchufan al modelo una a una.',
      en: 'Step on it and the tools plug into the model one by one.',
    },
    color: '#a3e635',
  },
  {
    id: 'multiagent',
    title: { es: 'Sistemas multiagente', en: 'Multi-agent systems' },
    tag: { es: 'UN EQUIPO DE IAS', en: 'A TEAM OF AIS' },
    explain: {
      es: 'Un orquestador reparte el trabajo entre agentes especializados, que trabajan en paralelo y devuelven su parte. Como un equipo, pero sin reuniones.',
      en: 'An orchestrator splits the work between specialised agents, which work in parallel and hand back their part. Like a team, minus the meetings.',
    },
    action: {
      es: 'Písala y el orquestador reparte una tarea entre sus agentes.',
      en: 'Step on it and the orchestrator hands a task out to its agents.',
    },
    color: '#ff6a2b',
  },
  {
    id: 'rl',
    title: { es: 'Aprendizaje por refuerzo', en: 'Reinforcement learning' },
    tag: { es: 'APRENDER A BASE DE PREMIOS', en: 'LEARNING FROM REWARDS' },
    explain: {
      es: 'Un agente prueba acciones, recibe premios o castigos y se va quedando con lo que funciona. Así se aprende a jugar, a conducir o a mover un robot.',
      en: 'An agent tries actions, gets rewards or penalties and keeps what works. That is how machines learn to play, to drive or to move a robot.',
    },
    action: {
      es: 'Písala y el agente explora el tablero: cada intento encuentra un camino mejor.',
      en: 'Step on it and the agent explores the board: every attempt finds a better path.',
    },
    color: '#ef4444',
  },
  {
    id: 'lora',
    title: { es: 'Fine-tuning con LoRA', en: 'Fine-tuning with LoRA' },
    tag: { es: 'ESPECIALIZAR UN MODELO', en: 'SPECIALISING A MODEL' },
    explain: {
      es: 'En vez de reentrenar un modelo entero, se le añaden unas piezas pequeñas que se entrenan aparte. El modelo grande queda congelado y aprende una tarea nueva por muy poco.',
      en: 'Rather than retraining a whole model, you add a few small pieces and train only those. The big model stays frozen and learns a new task for very little.',
    },
    action: {
      es: 'Písala y verás encajar los adaptadores en el modelo congelado.',
      en: 'Step on it and watch the adapters slot into the frozen model.',
    },
    color: '#93c5fd',
  },
]
