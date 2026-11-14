import type { Localized } from './career'

/**
 * Formación, de la más antigua a la más reciente. En la escena es la
 * biblioteca de la izquierda: una escalera de libros gigantes, uno por título.
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
    color: '#2f7bff',
  },
  {
    school: 'Entelgy',
    title: { es: 'Certificado en Redes WAN (CEX)', en: 'WAN Networks Certificate (CEX)' },
    period: { es: 'Jun 2019 — Jul 2019', en: 'Jun 2019 — Jul 2019' },
    kind: { es: 'CERTIFICADO', en: 'CERTIFICATE' },
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
    color: '#ffd60a',
  },
  {
    school: 'Campus Emiral',
    title: { es: 'Campus de desarrollo con Sage X3', en: 'Sage X3 development campus' },
    period: { es: 'Ene 2022 — Feb 2022', en: 'Jan 2022 — Feb 2022' },
    kind: { es: 'CAMPUS', en: 'CAMPUS' },
    color: '#ff4d6d',
  },
  {
    school: 'NEOLAND',
    title: { es: 'Bootcamp Full Stack Developer', en: 'Full Stack Developer bootcamp' },
    period: { es: 'Jun 2022 — Actualidad', en: 'Jun 2022 — Present' },
    kind: { es: 'BOOTCAMP', en: 'BOOTCAMP' },
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
    color: '#ff6a2b',
    ongoing: true,
  },
]
