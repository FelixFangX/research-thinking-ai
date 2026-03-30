const DB_NAME = 'copilot_db'
const DB_VERSION = 2

const STORE_SESSIONS = 'sessions'
const STORE_ITERATIONS = 'iterations'

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = (event) => {
      const db = req.result
      const oldVersion = event.oldVersion

      if (oldVersion < 1) {
        db.createObjectStore(STORE_SESSIONS, { keyPath: 'id' })
        db.createObjectStore(STORE_ITERATIONS, { keyPath: 'id' })
      }

      if (oldVersion < 2) {
        const sessionStore = req.transaction!.objectStore(STORE_SESSIONS)
        if (!sessionStore.indexNames.contains('userId')) {
          sessionStore.createIndex('userId', 'userId', { unique: false })
        }
        const iterStore = req.transaction!.objectStore(STORE_ITERATIONS)
        if (!iterStore.indexNames.contains('userId')) {
          iterStore.createIndex('userId', 'userId', { unique: false })
        }
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

function tx(
  storeName: string,
  mode: IDBTransactionMode,
): Promise<{ store: IDBObjectStore; done: Promise<void> }> {
  return open().then((db) => {
    const t = db.transaction(storeName, mode)
    const store = t.objectStore(storeName)
    const done = new Promise<void>((resolve, reject) => {
      t.oncomplete = () => resolve()
      t.onerror = () => reject(t.error)
    })
    return { store, done }
  })
}

function reqToPromise<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

export async function getAll<T>(storeName: string): Promise<T[]> {
  const { store } = await tx(storeName, 'readonly')
  return reqToPromise<T[]>(store.getAll())
}

export async function getByIndex<T>(storeName: string, indexName: string, key: string): Promise<T[]> {
  const { store } = await tx(storeName, 'readonly')
  const index = store.index(indexName)
  return reqToPromise<T[]>(index.getAll(key))
}

export async function getById<T>(storeName: string, id: string): Promise<T | undefined> {
  const { store } = await tx(storeName, 'readonly')
  return reqToPromise<T | undefined>(store.get(id))
}

export async function put<T>(storeName: string, value: T): Promise<void> {
  const { store, done } = await tx(storeName, 'readwrite')
  store.put(value)
  await done
}

export async function putAll<T>(storeName: string, values: T[]): Promise<void> {
  const { store, done } = await tx(storeName, 'readwrite')
  for (const v of values) store.put(v)
  await done
}

export async function remove(storeName: string, id: string): Promise<void> {
  const { store, done } = await tx(storeName, 'readwrite')
  store.delete(id)
  await done
}

export async function clearStore(storeName: string): Promise<void> {
  const { store, done } = await tx(storeName, 'readwrite')
  store.clear()
  await done
}

export const STORES = { SESSIONS: STORE_SESSIONS, ITERATIONS: STORE_ITERATIONS } as const
