/**
 * Eventos de la analítica. Los comparten el navegador (que los envía) y la
 * función del servidor (que solo cuenta los que encajan aquí).
 *
 * No hay cookies ni identificadores: cada evento es un nombre, sin nada que
 * diga quién lo ha enviado. En el servidor solo se suman contadores por día.
 */

/** Primer tramo del nombre: `familia` o `familia:detalle` */
export const EVENT_FAMILIES = [
  'visit', // se ha cargado la página
  'lang', // lang:es | lang:en
  'device', // device:touch | device:desktop
  'time', // time:30s | time:2m | time:5m | time:10m (tiempo con la pestaña a la vista)
  'play', // se ha entrado a jugar
  'tour', // se ha empezado el recorrido
  'tour_done', // se ha terminado el recorrido
  'zone', // zone:<id> la primera vez que se pisa cada zona
  'coin', // primera moneda
  'coins', // todas las monedas
  'summit', // se ha llegado a la cima
  'boss', // jefe final vencido
  'medal', // medal:<id>
  'concept', // concept:<id>
  'smash', // smash:<id>
  'talk', // talk:<id>
  'panel', // panel:map | photo | train | scores
  'warp', // warp:<zona> (viaje rápido)
  'photo', // foto descargada
  'train', // train:<nivel> superado
  'score', // marca enviada a la tabla
  'install', // instalada como aplicación
  'retro', // modo 8 bits
  'secret', // secret:<id> (huevos de pascua)
  'terminal', // se ha abierto el terminal
  'link', // link:<destino> (LinkedIn, GitHub…)
  'brain', // se ha entrado en el cerebro; brain:<tipo de nodo>
  'factory', // factory:<resultado> (croqueta fabricada)
  'hangar', // hangar:<máquina>
  'era', // se ha usado la máquina del tiempo
  'mission', // mission:<paso>
  'memory', // recuerdo de la visita
] as const

const PATTERN = /^[a-z0-9_]{1,16}(:[a-z0-9_-]{1,24})?$/

export const isEvent = (name: unknown): name is string =>
  typeof name === 'string' &&
  PATTERN.test(name) &&
  (EVENT_FAMILIES as readonly string[]).includes(name.split(':')[0])

/** Como mucho, tantos eventos por envío */
export const EVENT_BATCH = 30
