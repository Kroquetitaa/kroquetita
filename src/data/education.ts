import type { Localized } from './career'

/**
 * Formación, de la más antigua a la más reciente. En la escena es la
 * biblioteca de la izquierda: una escalera de libros gigantes, uno por título.
 * `learned` y `appliedAt` están deducidos del título (salvo el temario de Retamar): revísalos.
 */
export interface Study {
  /** Centro */
  school: string
  /** Título o curso */
  title: Localized
  /** Fechas, tal cual se muestran */
  period: Localized
  /** Tipo de formación (rótulo corto sobre el título) */
  kind: Localized
  /** Un apunte: nota, temario… */
  note?: Localized
  /** Lo aprendido, en tres frases cortas: es lo que hay escrito dentro del libro */
  learned: Localized<string[]>
  /** Empresa (título de la etapa en career.ts) donde se aplicó: hasta su caja llega un hilo de luz */
  appliedAt?: string
  /** Color del lomo del libro */
  color: string
  /** Sigue en curso */
  ongoing?: boolean
}

export const education: Study[] = [
  {
    school: 'INGLAN',
    title: {
      es: 'Formación profesional en electrónica y equipos eléctricos',
      en: 'Vocational training in electronics and electrical equipment',
    },
    period: { es: 'Jul 2015 — Ene 2016', en: 'Jul 2015 — Jan 2016' },
    kind: { es: 'FORMACIÓN PROFESIONAL', en: 'VOCATIONAL TRAINING' },
    learned: {
      es: ['Electrónica analógica y digital', 'Montaje y reparación de equipos', 'Medir antes de tocar'],
      en: ['Analog and digital electronics', 'Assembling and repairing equipment', 'Measure before you touch'],
    },
    appliedAt: 'Plexus Tech',
    color: '#ff9f1c',
  },
  {
    school: 'Andel Formación Profesional',
    title: {
      es: 'Grado Medio en Microrredes Informáticas',
      en: 'Intermediate degree in Computer Micro-networks',
    },
    period: { es: '2017 — 2019', en: '2017 — 2019' },
    kind: { es: 'CICLO DE GRADO MEDIO', en: 'INTERMEDIATE VOCATIONAL DEGREE' },
    learned: {
      es: ['Redes locales y cableado', 'Montaje y mantenimiento de equipos', 'Sistemas operativos y servidores'],
      en: ['Local networks and cabling', 'Building and maintaining computers', 'Operating systems and servers'],
    },
    appliedAt: 'Plexus Tech',
    color: '#2f7bff',
  },
  {
    school: 'Entelgy',
    title: { es: 'Certificado en Redes WAN (CEX)', en: 'WAN Networks Certificate (CEX)' },
    period: { es: 'Jun 2019 — Jul 2019', en: 'Jun 2019 — Jul 2019' },
    kind: { es: 'CERTIFICADO', en: 'CERTIFICATE' },
    learned: {
      es: ['Redes WAN y enrutamiento', 'Configuración de routers', 'Diagnóstico de incidencias de red'],
      en: ['WAN networks and routing', 'Router configuration', 'Troubleshooting network incidents'],
    },
    appliedAt: 'Plexus Tech',
    color: '#22d3ee',
  },
  {
    school: 'Colegio Retamar',
    title: {
      es: 'Grado Superior en Desarrollo de Aplicaciones Multiplataforma',
      en: 'Higher degree in Cross-Platform Application Development',
    },
    period: { es: '2019 — 2021', en: '2019 — 2021' },
    kind: { es: 'CICLO DE GRADO SUPERIOR', en: 'HIGHER VOCATIONAL DEGREE' },
    learned: {
      es: ['Java con Android Studio y JavaFX', 'Angular, PHP y bases de datos', 'Python'],
      en: ['Java with Android Studio and JavaFX', 'Angular, PHP and databases', 'Python'],
    },
    appliedAt: 'Plexus Tech',
    color: '#3df2b0',
  },
  {
    school: 'CES Juan Pablo II',
    title: {
      es: 'Grado Superior en Gestión Web y Multimedia',
      en: 'Higher degree in Web and Multimedia Management',
    },
    period: { es: '2021 — 2022', en: '2021 — 2022' },
    kind: { es: 'FP DE GRADO SUPERIOR', en: 'HIGHER VOCATIONAL DEGREE' },
    learned: {
      es: ['Desarrollo y gestión de sitios web', 'Contenido multimedia', 'Publicación y mantenimiento web'],
      en: ['Building and managing websites', 'Multimedia content', 'Publishing and maintaining the web'],
    },
    appliedAt: 'Dedeeit',
    color: '#ffd60a',
  },
  {
    school: 'Campus Emiral',
    title: { es: 'Campus de desarrollo con Sage X3', en: 'Sage X3 development campus' },
    period: { es: 'Ene 2022 — Feb 2022', en: 'Jan 2022 — Feb 2022' },
    kind: { es: 'CAMPUS', en: 'CAMPUS' },
    learned: {
      es: ['Desarrollo de aplicaciones con Sage X3', 'Procesos de negocio en un ERP', 'Trabajo con profesionales del sector'],
      en: ['Application development with Sage X3', 'Business processes in an ERP', 'Working with industry professionals'],
    },
    appliedAt: 'Emiral',
    color: '#ff4d6d',
  },
  {
    school: 'NEOLAND',
    title: { es: 'Bootcamp Full Stack Developer', en: 'Full Stack Developer bootcamp' },
    period: { es: 'Jun 2022 — Actualidad', en: 'Jun 2022 — Present' },
    kind: { es: 'BOOTCAMP', en: 'BOOTCAMP' },
    learned: {
      es: ['JavaScript de punta a punta', 'Frontend y backend en un mismo proyecto', 'Trabajo en equipo con Git'],
      en: ['JavaScript end to end', 'Frontend and backend in one project', 'Team work with Git'],
    },
    appliedAt: 'Sectorea IT',
    color: '#8b5cf6',
  },
  {
    school: 'Universidad Europea',
    title: {
      es: 'Ingeniería en Inteligencia Artificial (Computer Science)',
      en: 'Engineering degree in Artificial Intelligence (Computer Science)',
    },
    period: { es: 'Sep 2025 — Jul 2029', en: 'Sep 2025 — Jul 2029' },
    kind: { es: 'GRADO UNIVERSITARIO · EN CURSO', en: 'UNIVERSITY DEGREE · IN PROGRESS' },
    learned: {
      es: ['Fundamentos de inteligencia artificial', 'Matemáticas y algoritmia', 'Aprendizaje automático'],
      en: ['Foundations of artificial intelligence', 'Mathematics and algorithms', 'Machine learning'],
    },
    appliedAt: 'TheAIBusiness',
    color: '#ff6a2b',
    ongoing: true,
  },
]
