/**
 * Contenido del portfolio. Edita este archivo para cambiar textos,
 * enlaces y etapas: la escena 3D se genera a partir de estos datos.
 */

export type Lang = 'es' | 'en'

/** Texto en los dos idiomas de la web */
export interface Localized<T = string> {
  es: T
  en: T
}

/** Disciplina de la etapa: decide el mini-escenario que lleva la caja encima */
export type Discipline = 'fullstack' | 'frontend' | 'mobile' | 'lead' | 'blockchain' | 'data' | 'ai'

export interface Stage {
  /** Empresa: título grande en la cara del bloque */
  title: string
  /** Puesto */
  role: string
  /** Primer mes, como 'AAAA-MM' */
  start: string
  /** Último mes (incluido), como 'AAAA-MM'. Sin él, la etapa sigue en curso */
  end?: string
  /** Mostrar solo los años (fechas aún sin concretar) */
  yearOnly?: boolean
  /** Color de acento (bordes, línea guía y luz) */
  color: string
  /** Rótulo corto de la etapa (se muestra en la ficha lateral) */
  part?: Localized
  /** Disciplina: elige el mini-escenario animado de la caja */
  discipline: Discipline
  /** Tecnologías, herramientas y lenguajes: salen como etiquetas en la ficha */
  stack: string[]
  /** Resumen de la etapa, en una o dos frases */
  summary?: Localized
  /** Dos o tres logros (frases cortas); salen en la ficha lateral */
  highlights?: Localized<string[]>
  /** Logo en /public/logos; se convierte en un emblema 3D de vóxeles */
  logo?: string
  /** Recorte [x0, y0, x1, y1] en fracciones (0..1) para usar solo el símbolo */
  logoCrop?: [number, number, number, number]
}

/** Nombre y lema de cada disciplina */
export const disciplines: Record<Discipline, { label: Localized; tagline: Localized }> = {
  fullstack: {
    label: { es: 'Full stack', en: 'Full stack' },
    tagline: { es: 'Frontend y backend', en: 'Frontend and backend' },
  },
  frontend: {
    label: { es: 'Frontend', en: 'Frontend' },
    tagline: { es: 'Interfaces web', en: 'Web interfaces' },
  },
  mobile: {
    label: { es: 'Móvil', en: 'Mobile' },
    tagline: { es: 'Aplicaciones móviles', en: 'Mobile apps' },
  },
  lead: {
    label: { es: 'Liderazgo', en: 'Leadership' },
    tagline: { es: 'Liderazgo técnico', en: 'Technical leadership' },
  },
  blockchain: {
    label: { es: 'Blockchain', en: 'Blockchain' },
    tagline: { es: 'Blockchain e IA', en: 'Blockchain and AI' },
  },
  data: {
    label: { es: 'Datos', en: 'Data' },
    tagline: { es: 'Arquitectura de datos', en: 'Data architecture' },
  },
  ai: {
    label: { es: 'IA', en: 'AI' },
    tagline: { es: 'Ingeniería de IA', en: 'AI engineering' },
  },
}

type Rich = Array<string | { strong: string }>

export const profile = {
  /** Marca de la cabecera: «brand by name» */
  brand: 'Kroquetita',
  name: 'Sergio Fuentes',
  headline: ['Head of AI /', 'VP of AI and Software Engineering'],
  intro: {
    es: [
      'Más de 5 años construyendo producto: ',
      { strong: 'frontend' },
      ', ',
      { strong: 'aplicaciones móviles' },
      ', ',
      { strong: 'backend' },
      ', ',
      { strong: 'arquitectura de datos' },
      ', ',
      { strong: 'blockchain' },
      ' e ',
      { strong: 'ingeniería de IA' },
      '.',
    ],
    en: [
      'Over 5 years building product: ',
      { strong: 'frontend' },
      ', ',
      { strong: 'mobile apps' },
      ', ',
      { strong: 'backend' },
      ', ',
      { strong: 'data architecture' },
      ', ',
      { strong: 'blockchain' },
      ' and ',
      { strong: 'AI engineering' },
      '.',
    ],
  } as Localized<Rich>,
  links: [{ label: 'LinkedIn', href: 'https://www.linkedin.com/in/sergiofuentes566/' }],
  /** Conocimientos: son los nodos con etiqueta del cerebro que flota sobre la escena */
  skills: [
    'IA',
    'LLM',
    'NLP',
    'Data Science',
    'Python',
    'Node',
    'React',
    'React Native',
    'Next.js',
    'Three.js',
    'Blockchain',
    'Swift',
  ],
  /** Imagen que se graba en las monedas */
  coinImage: '/avatar.png',
}

// De la más antigua a la más reciente. La última es la etapa actual: la torre más alta.
// `stack`, `summary` y `highlights` están redactados a partir del puesto: revísalos y corrígelos.
export const stages: Stage[] = [
  {
    title: 'Plexus Tech',
    role: 'FullStack Developer',
    start: '2021-03',
    end: '2021-06',
    color: '#19e6ff',
    part: { es: 'EL ARRANQUE', en: 'THE START' },
    discipline: 'fullstack',
    stack: [
      'JavaScript',
      'TypeScript',
      'React',
      'Node.js',
      'Express',
      'PostgreSQL',
      'REST',
      'Docker',
      'Git',
      'Jest',
      'Jira',
      'Scrum',
    ],
    summary: {
      es: 'Mis primeros pasos en consultoría: desarrollo full stack en un equipo ágil, del componente de React al endpoint en Node.',
      en: 'My first steps in consulting: full-stack development in an agile team, from the React component to the Node endpoint.',
    },
    highlights: {
      es: [
        'Componentes de React y APIs REST para aplicaciones de cliente',
        'Pruebas unitarias y revisión de código desde el primer día',
        'Trabajo en Scrum, con entregas cada dos semanas',
      ],
      en: [
        'React components and REST APIs for client applications',
        'Unit tests and code review from day one',
        'Scrum, shipping every two weeks',
      ],
    },
    logo: '/logos/plexus.png',
  },
  {
    title: 'Dedeeit',
    role: 'Frontend Developer',
    start: '2021-06',
    end: '2022-01',
    color: '#3df2b0',
    part: { es: 'LAS BASES', en: 'THE FOUNDATIONS' },
    discipline: 'frontend',
    stack: [
      'React',
      'Next.js',
      'TypeScript',
      'Redux Toolkit',
      'Tailwind CSS',
      'Sass',
      'Storybook',
      'Figma',
      'Webpack',
      'Jest',
      'Testing Library',
      'Cypress',
    ],
    summary: {
      es: 'Frontend a tiempo completo: interfaces rápidas y accesibles con React y Next.js, de la maqueta de Figma a producción.',
      en: 'Full-time frontend: fast, accessible interfaces with React and Next.js, from the Figma mock-up to production.',
    },
    highlights: {
      es: [
        'Sistema de diseño documentado en Storybook',
        'Renderizado en servidor y mejora de las Core Web Vitals',
        'Pruebas de extremo a extremo con Cypress',
      ],
      en: [
        'Design system documented in Storybook',
        'Server-side rendering and better Core Web Vitals',
        'End-to-end tests with Cypress',
      ],
    },
    logo: '/logos/dedeeit.jpg',
    logoCrop: [0, 0.14, 1, 0.55],
  },
  {
    title: 'Emiral',
    role: 'FullStack Developer',
    start: '2022-01',
    end: '2022-07',
    color: '#ffd60a',
    part: { es: 'COGIENDO RITMO', en: 'PICKING UP PACE' },
    discipline: 'fullstack',
    stack: [
      'TypeScript',
      'React',
      'Node.js',
      'NestJS',
      'GraphQL',
      'MongoDB',
      'Redis',
      'Docker',
      'AWS',
      'GitHub Actions',
      'Swagger',
      'Jest',
    ],
    summary: {
      es: 'Producto de punta a punta: API, base de datos y frontend, con el despliegue automatizado.',
      en: 'Product end to end: API, database and frontend, with automated deployment.',
    },
    highlights: {
      es: [
        'API en GraphQL con NestJS y MongoDB',
        'Integración y despliegue continuos con GitHub Actions y Docker',
        'Caché con Redis para acelerar las consultas más pesadas',
      ],
      en: [
        'GraphQL API with NestJS and MongoDB',
        'Continuous integration and delivery with GitHub Actions and Docker',
        'Redis caching to speed up the heaviest queries',
      ],
    },
    logo: '/logos/emiral.png',
  },
  {
    title: 'Sectorea IT',
    role: 'Mobile Software Engineer',
    start: '2022-10',
    end: '2023-05',
    color: '#2f7bff',
    part: { es: 'APPS MÓVILES', en: 'MOBILE APPS' },
    discipline: 'mobile',
    stack: [
      'React Native',
      'TypeScript',
      'Expo',
      'Swift',
      'Kotlin',
      'Redux Toolkit',
      'React Query',
      'Firebase',
      'Fastlane',
      'Detox',
      'App Store Connect',
      'Google Play',
    ],
    summary: {
      es: 'Apps móviles multiplataforma con React Native, con módulos nativos cuando hacía falta.',
      en: 'Cross-platform mobile apps with React Native, with native modules whenever they were needed.',
    },
    highlights: {
      es: [
        'Publicación en App Store y Google Play',
        'Notificaciones push y modo sin conexión',
        'Módulos nativos en Swift y Kotlin',
      ],
      en: [
        'Releases on the App Store and Google Play',
        'Push notifications and offline mode',
        'Native modules in Swift and Kotlin',
      ],
    },
    logo: '/logos/sectorea.png',
  },
  {
    title: 'Pepper Spain',
    role: 'Mobile Software Engineer',
    start: '2022-10',
    end: '2023-09',
    color: '#ff4d6d',
    part: { es: 'APPS MÓVILES', en: 'MOBILE APPS' },
    discipline: 'mobile',
    stack: [
      'React Native',
      'TypeScript',
      'Swift',
      'SwiftUI',
      'Kotlin',
      'GraphQL',
      'Apollo Client',
      'Reanimated',
      'Firebase',
      'Sentry',
      'Bitrise',
      'Jest',
    ],
    summary: {
      es: 'App de consumo: rendimiento, animaciones fluidas y versiones nuevas cada poco tiempo.',
      en: 'A consumer app: performance, smooth animations and frequent releases.',
    },
    highlights: {
      es: [
        'Optimización del arranque y de las listas largas',
        'Animaciones a 60 fps con Reanimated',
        'Monitorización con Sentry y entregas automáticas con Bitrise',
      ],
      en: [
        'Faster start-up and long lists',
        '60 fps animations with Reanimated',
        'Monitoring with Sentry and automated releases with Bitrise',
      ],
    },
    logo: '/logos/pepper.svg',
  },
  {
    title: 'Packar',
    role: 'Tech Lead',
    start: '2022-09',
    end: '2024-04',
    color: '#ff9f1c',
    part: { es: 'PRIMER EQUIPO A CARGO', en: 'FIRST TEAM TO LEAD' },
    discipline: 'lead',
    stack: [
      'React Native',
      'TypeScript',
      'Node.js',
      'NestJS',
      'PostgreSQL',
      'Prisma',
      'AWS',
      'Docker',
      'Terraform',
      'GitHub Actions',
      'Stripe',
      'Sentry',
    ],
    summary: {
      es: 'Mi primer equipo a cargo: arquitectura, hoja de ruta técnica y entrega de la app y de su backend.',
      en: 'My first team to lead: architecture, technical roadmap and delivery of the app and its backend.',
    },
    highlights: {
      es: [
        'Definición de la arquitectura y de los estándares de código',
        'Backend e infraestructura como código en AWS',
        'Mentoría, revisión de código y selección del equipo',
      ],
      en: [
        'Defined the architecture and the code standards',
        'Backend and infrastructure as code on AWS',
        'Mentoring, code review and hiring',
      ],
    },
    logo: '/logos/packar.png',
    logoCrop: [0.06, 0.34, 0.36, 0.67],
  },
  {
    title: 'Tyris Software',
    role: 'Frontend Developer & Mobile Software Engineer',
    start: '2024-04',
    end: '2026-04',
    color: '#8b5cf6',
    part: { es: 'FRONTEND Y MÓVIL', en: 'FRONTEND AND MOBILE' },
    discipline: 'frontend',
    stack: [
      'React',
      'Next.js',
      'TypeScript',
      'React Native',
      'Expo',
      'Three.js',
      'React Three Fiber',
      'Tailwind CSS',
      'Zustand',
      'TanStack Query',
      'Vite',
      'Playwright',
      'Storybook',
    ],
    summary: {
      es: 'Web y móvil a la vez: productos con React y Next.js, apps con React Native y experiencias 3D en el navegador.',
      en: 'Web and mobile at once: products with React and Next.js, apps with React Native and 3D experiences in the browser.',
    },
    highlights: {
      es: [
        'Librería de componentes compartida entre web y móvil',
        'Experiencias interactivas en 3D con Three.js',
        'Pruebas de extremo a extremo con Playwright',
      ],
      en: [
        'Component library shared between web and mobile',
        'Interactive 3D experiences with Three.js',
        'End-to-end tests with Playwright',
      ],
    },
    logo: '/logos/tyris.png',
  },
  {
    title: 'Sportian',
    role: 'Tech Lead',
    start: '2024-04',
    end: '2026-04',
    color: '#22d3ee',
    part: { es: 'LIDERAZGO', en: 'LEADERSHIP' },
    discipline: 'lead',
    stack: [
      'TypeScript',
      'React',
      'Next.js',
      'Node.js',
      'NestJS',
      'Kafka',
      'PostgreSQL',
      'Redis',
      'Kubernetes',
      'AWS',
      'Terraform',
      'Datadog',
      'GitHub Actions',
    ],
    summary: {
      es: 'Liderazgo técnico en producto digital para el deporte: equipos, arquitectura y plataformas preparadas para picos de tráfico.',
      en: 'Technical leadership in digital products for sport: teams, architecture and platforms ready for traffic peaks.',
    },
    highlights: {
      es: [
        'Microservicios y arquitectura orientada a eventos con Kafka',
        'Observabilidad y objetivos de nivel de servicio',
        'Hoja de ruta técnica y mentoría del equipo',
      ],
      en: [
        'Microservices and event-driven architecture with Kafka',
        'Observability and service level objectives',
        'Technical roadmap and team mentoring',
      ],
    },
    logo: '/logos/sportian.webp',
  },
  {
    title: 'Izertis',
    role: 'Blockchain and AI Engineer',
    start: '2024-01',
    end: '2026-01',
    yearOnly: true,
    color: '#e8454f',
    part: { es: 'BLOCKCHAIN E IA', en: 'BLOCKCHAIN AND AI' },
    discipline: 'blockchain',
    stack: [
      'Solidity',
      'Hardhat',
      'Ethers.js',
      'Hyperledger Fabric',
      'IPFS',
      'Python',
      'FastAPI',
      'LangChain',
      'OpenAI API',
      'Hugging Face',
      'PyTorch',
      'Docker',
      'Azure',
    ],
    summary: {
      es: 'Donde se cruzan blockchain e IA: contratos inteligentes, identidad digital y los primeros sistemas con LLM.',
      en: 'Where blockchain meets AI: smart contracts, digital identity and the first LLM-based systems.',
    },
    highlights: {
      es: [
        'Contratos inteligentes en Solidity, con sus pruebas y auditorías',
        'Trazabilidad e identidad digital sobre redes permisionadas',
        'Prototipos de RAG y asistentes con modelos de lenguaje',
      ],
      en: [
        'Smart contracts in Solidity, with their tests and audits',
        'Traceability and digital identity on permissioned networks',
        'RAG prototypes and assistants built on language models',
      ],
    },
    logo: '/logos/izertis.jpg',
  },
  {
    // Fechas provisionales
    title: 'Santander',
    role: 'Data Solutions AI Architecture Senior Associate',
    start: '2026-01',
    end: '2026-06',
    yearOnly: true,
    color: '#ec0000',
    part: { es: 'DATOS E IA A ESCALA', en: 'DATA AND AI AT SCALE' },
    discipline: 'data',
    stack: [
      'Python',
      'SQL',
      'Apache Spark',
      'Databricks',
      'Delta Lake',
      'Kafka',
      'Airflow',
      'dbt',
      'Snowflake',
      'AWS',
      'Terraform',
      'MLflow',
      'Power BI',
    ],
    summary: {
      es: 'Arquitectura de datos e IA a escala bancaria: plataformas, gobierno del dato y pipelines fiables que alimentan los modelos.',
      en: 'Data and AI architecture at banking scale: platforms, data governance and reliable pipelines that feed the models.',
    },
    highlights: {
      es: [
        'Diseño de arquitecturas lakehouse preparadas para IA',
        'Pipelines por lotes y en tiempo real',
        'Gobierno, calidad y linaje del dato',
      ],
      en: [
        'Lakehouse architectures designed to be AI-ready',
        'Batch and real-time pipelines',
        'Data governance, quality and lineage',
      ],
    },
    logo: '/logos/santander.png',
  },
  {
    // Fecha de inicio provisional
    title: 'TheAIBusiness',
    role: 'Tech Lead AI Engineer',
    start: '2026-06',
    yearOnly: true,
    color: '#ff6a2b',
    part: { es: 'INTELIGENCIA ARTIFICIAL', en: 'ARTIFICIAL INTELLIGENCE' },
    discipline: 'ai',
    stack: [
      'Python',
      'PyTorch',
      'LangChain',
      'LangGraph',
      'Claude API',
      'OpenAI API',
      'MCP',
      'RAG',
      'pgvector',
      'FastAPI',
      'Hugging Face',
      'vLLM',
      'Docker',
      'Kubernetes',
    ],
    summary: {
      es: 'Lidero el equipo que lleva la IA a producción: agentes, RAG y evaluación de modelos.',
      en: 'I lead the team that takes AI to production: agents, RAG and model evaluation.',
    },
    highlights: {
      es: [
        'Sistemas multiagente con herramientas propias (MCP)',
        'RAG con evaluación continua y barreras de seguridad',
        'Ajuste fino y despliegue de modelos abiertos',
      ],
      en: [
        'Multi-agent systems with their own tools (MCP)',
        'RAG with continuous evaluation and guardrails',
        'Fine-tuning and serving of open models',
      ],
    },
    logo: '/logos/theaibusiness.png',
  },
]

/** 'AAAA-MM' → meses desde el año 0 (para restar fechas) */
export const monthIndex = (date: string) => {
  const [year, month] = date.split('-').map(Number)
  return year * 12 + (month - 1)
}

const today = new Date()
/** Mes actual, en la misma escala que `monthIndex` */
export const NOW = today.getFullYear() * 12 + today.getMonth()

/** Duración de una etapa en meses (las fechas son inclusivas) */
export const monthsOf = (stage: Stage) =>
  Math.max(1, (stage.end ? monthIndex(stage.end) : NOW) - monthIndex(stage.start) + 1)

const MONTHS: Localized<string[]> = {
  es: ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'],
  en: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
}

/** «Mar 2021 — Jun 2021», «2024 — 2026», «2026 — Hoy»… */
export function periodOf(stage: Stage, lang: Lang) {
  const label = (date: string) => {
    const [year, month] = date.split('-').map(Number)
    return stage.yearOnly ? String(year) : `${MONTHS[lang][month - 1]} ${year}`
  }
  const from = label(stage.start)
  const to = stage.end ? label(stage.end) : lang === 'es' ? 'Hoy' : 'Today'
  return from === to ? from : `${from} — ${to}`
}

/** «8 meses», «1 año y 8 meses», «En curso»… */
export function durationOf(stage: Stage, lang: Lang) {
  if (!stage.end) return lang === 'es' ? 'En curso' : 'Ongoing'
  const months = monthsOf(stage)
  const years = Math.floor(months / 12)
  const rest = months % 12
  const es = [
    years ? `${years} ${years === 1 ? 'año' : 'años'}` : '',
    rest ? `${rest} ${rest === 1 ? 'mes' : 'meses'}` : '',
  ].filter(Boolean)
  const en = [
    years ? `${years} ${years === 1 ? 'year' : 'years'}` : '',
    rest ? `${rest} ${rest === 1 ? 'month' : 'months'}` : '',
  ].filter(Boolean)
  return lang === 'es' ? es.join(' y ') : en.join(' ')
}

/** Logros de una etapa para la ficha lateral (ninguno si aún no se han escrito) */
export const linesOf = (stage: Stage, lang: Lang) => stage.highlights?.[lang]?.slice(0, 3) ?? []
