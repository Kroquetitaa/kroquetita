/**
 * Almacén clave-valor que usan la analítica y la tabla de récords.
 *
 * La lógica no sabe dónde se guardan las cosas: en Netlify es un almacén de
 * Blobs (`blobsKV`) y en desarrollo, o en las pruebas, uno en memoria
 * (`memoryKV`). Los valores son siempre JSON.
 */
export interface KV {
  get(key: string): Promise<unknown | null>
  set(key: string, value: unknown): Promise<void>
  /** Opcional: lectura con la versión del valor, para poder escribir solo si nadie lo ha tocado */
  read?(key: string): Promise<Versioned | null>
  /**
   * Opcional: escritura condicional. Con `version: null` solo escribe si la clave
   * no existe; con una versión, solo si sigue siendo esa. Devuelve false si otro se adelantó.
   */
  write?(key: string, value: unknown, version: string | null): Promise<boolean>
}

export interface Versioned {
  value: unknown
  /** Sin versión no se puede condicionar la escritura */
  version?: string
}

/** No se ha podido escribir porque otras peticiones se adelantaban una y otra vez */
export class Busy extends Error {}

/** Lo que devuelve un cambio: el valor nuevo (o `undefined` si no hay nada que escribir) y el resultado */
export type Change<T> = [next: unknown | undefined, result: T]

const ATTEMPTS = 5
const pause = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

/**
 * Leer, modificar y escribir. No hay incremento atómico, así que se escribe
 * con condición («solo si sigue como lo leí») y, si otra petición se ha colado
 * en medio, se vuelve a leer y se repite.
 *
 * `force`: si tras varios intentos sigue sin poder, escribe sin condición en
 * vez de fallar (vale para contadores, donde perder alguna suma no importa).
 */
export async function update<T>(
  kv: KV,
  key: string,
  change: (current: unknown | null) => Change<T>,
  force = false,
): Promise<T> {
  if (kv.read && kv.write) {
    for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
      const entry = await kv.read(key)
      const [next, result] = change(entry ? entry.value : null)
      if (next === undefined) return result
      if (entry && entry.version === undefined) {
        await kv.set(key, next)
        return result
      }
      const version = entry?.version ?? null
      if (await kv.write(key, next, version)) return result
      await pause(15 + Math.random() * 50 * (attempt + 1))
    }
    if (!force) throw new Busy()
  }
  const [next, result] = change(await kv.get(key))
  if (next !== undefined) await kv.set(key, next)
  return result
}

/** Almacén en memoria, con versiones, para desarrollo y pruebas. */
export function memoryKV(): KV {
  const data = new Map<string, { json: string; version: number }>()
  let counter = 0
  const put = (key: string, value: unknown) => {
    data.set(key, { json: JSON.stringify(value), version: ++counter })
  }
  return {
    get: async (key) => {
      const entry = data.get(key)
      return entry ? JSON.parse(entry.json) : null
    },
    set: async (key, value) => put(key, value),
    read: async (key) => {
      const entry = data.get(key)
      return entry ? { value: JSON.parse(entry.json), version: String(entry.version) } : null
    },
    write: async (key, value, version) => {
      const entry = data.get(key)
      if (version === null ? entry !== undefined : !entry || String(entry.version) !== version) return false
      put(key, value)
      return true
    },
  }
}

/**
 * Lo que se usa de un almacén de Netlify Blobs (`getStore()` de `@netlify/blobs`).
 * Está descrito aquí, sin importar el paquete, para que esta carpeta no dependa de Netlify.
 */
export interface BlobStore {
  getWithMetadata(
    key: string,
    options: { type: 'json'; consistency?: 'strong' | 'eventual' },
  ): Promise<{ data: unknown; etag?: string } | null>
  setJSON(
    key: string,
    value: unknown,
    options?: { onlyIfMatch: string } | { onlyIfNew: boolean },
  ): Promise<{ modified: boolean }>
}

/**
 * Adapta un almacén de Netlify Blobs. Lee con consistencia fuerte (para ver lo
 * que se acaba de escribir) y escribe con `onlyIfMatch` (el etag leído) o con
 * `onlyIfNew` si la clave aún no existía.
 */
export function blobsKV(store: BlobStore): KV {
  let consistency: 'strong' | 'eventual' = 'strong'

  const read = async (key: string): Promise<Versioned | null> => {
    let entry: Awaited<ReturnType<BlobStore['getWithMetadata']>>
    try {
      entry = await store.getWithMetadata(key, { type: 'json', consistency })
    } catch (error) {
      // Fuera del entorno de Netlify puede no haber lecturas fuertes: se sigue con las normales.
      const name = (error as { name?: unknown } | null)?.name
      if (consistency !== 'strong' || name !== 'BlobsConsistencyError') throw error
      consistency = 'eventual'
      entry = await store.getWithMetadata(key, { type: 'json', consistency })
    }
    return entry ? { value: entry.data, version: entry.etag || undefined } : null
  }

  return {
    read,
    get: async (key) => (await read(key))?.value ?? null,
    set: async (key, value) => {
      await store.setJSON(key, value)
    },
    write: async (key, value, version) => {
      const condition = version === null ? { onlyIfNew: true } : { onlyIfMatch: version }
      return (await store.setJSON(key, value, condition)).modified
    },
  }
}
