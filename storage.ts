import type { PlacedShape } from './types';

// Stable localStorage key used previously (for one-time migration)
const LOCAL_KEY = 'atelier:classrooms:v1';

// IndexedDB configuration
const DB_NAME = 'atelier-des-formes-db';
const DB_VERSION = 1;
const STORE_NAME = 'kv'; // simple key/value store
const CLASSROOMS_KEY = 'classrooms';

export type House = { body: PlacedShape; roof: PlacedShape };

export type Child = {
  id: string;
  name: string;
  history: House[]; // ordered history of houses built by this child
};

export type Classroom = {
  id: string;
  name: string;
  children: Child[];
};

// In-memory cache so most operations can stay synchronous from the app's POV
let cache: Classroom[] = [];
let initialized = false;
let initPromise: Promise<void> | null = null;

function makeId(prefix = '') {
  return `${prefix}${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'key' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idbGet<T = unknown>(key: string): Promise<T | undefined> {
  const db = await openDB();
  return new Promise<T | undefined>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const req = store.get(key);
    req.onsuccess = () => {
      resolve(req.result ? (req.result.value as T) : undefined);
    };
    req.onerror = () => reject(req.error);
  });
}

async function idbSet<T = unknown>(key: string, value: T): Promise<void> {
  const db = await openDB();
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const req = store.put({ key, value });
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

function safeParse<T>(raw: string | null): T | undefined {
  try {
    if (!raw) return undefined;
    return JSON.parse(raw) as T;
  } catch (e) {
    console.warn('Failed to parse stored classrooms from localStorage', e);
    return undefined;
  }
}

async function migrateFromLocalStorageIfNeeded(): Promise<Classroom[] | null> {
  // If IndexedDB already has data, don't migrate
  const existing = await idbGet<Classroom[]>(CLASSROOMS_KEY);
  if (existing && Array.isArray(existing) && existing.length > 0) return null;

  const raw = localStorage.getItem(LOCAL_KEY);
  const parsed = safeParse<Classroom[]>(raw);
  if (parsed && Array.isArray(parsed)) {
    await idbSet(CLASSROOMS_KEY, parsed);
    // Optionally keep localStorage as a backup; we won't delete to be safe.
    return parsed;
  }
  return null;
}

async function loadFromIndexedDB(): Promise<Classroom[]> {
  const migrated = await migrateFromLocalStorageIfNeeded();
  if (migrated) return migrated;
  const data = await idbGet<Classroom[]>(CLASSROOMS_KEY);
  return Array.isArray(data) ? data : [];
}

async function writeToIndexedDB(data: Classroom[]): Promise<void> {
  try {
    await idbSet(CLASSROOMS_KEY, data);
  } catch (e) {
    console.error('Failed to persist classrooms to IndexedDB', e);
  }
}

/**
 * Initialize the storage cache by loading from IndexedDB.
 * Call this once on app startup before the first read.
 */
export async function init(): Promise<void> {
  if (initialized) return;
  if (initPromise) return initPromise;
  initPromise = (async () => {
    try {
      cache = await loadFromIndexedDB();
    } finally {
      initialized = true;
    }
  })();
  return initPromise;
}

/**
 * Returns the in-memory classrooms array. Ensure init() has run.
 */
export function loadClassrooms(): Classroom[] {
  return cache;
}

/**
 * Replace the in-memory classrooms and persist to IndexedDB asynchronously.
 */
export function saveClassrooms(classrooms: Classroom[]) {
  cache = classrooms;
  // Fire-and-forget persistence
  void writeToIndexedDB(cache);
}

export function addClassroom(name: string): Classroom {
  const c: Classroom = { id: makeId('class-'), name: name || `Classe ${cache.length + 1}`, children: [] };
  cache = [...cache, c];
  void writeToIndexedDB(cache);
  return c;
}

export function addChildToClassroom(classroomId: string, childName: string): Child | null {
  const idx = cache.findIndex(c => c.id === classroomId);
  if (idx === -1) return null;
  const cls = cache[idx];
  const child: Child = { id: makeId('child-'), name: childName || `Enfant ${cls.children.length + 1}`, history: [] };
  const updatedClass = { ...cls, children: [...cls.children, child] };
  cache = cache.map((c, i) => (i === idx ? updatedClass : c));
  void writeToIndexedDB(cache);
  return child;
}

export function updateChildHistory(classroomId: string, childId: string, history: House[]) {
  const clsIdx = cache.findIndex(c => c.id === classroomId);
  if (clsIdx === -1) return;
  const cls = cache[clsIdx];
  const childIdx = cls.children.findIndex(ch => ch.id === childId);
  if (childIdx === -1) return;
  const child = { ...cls.children[childIdx], history };
  const updatedClass = {
    ...cls,
    children: cls.children.map((ch, i) => (i === childIdx ? child : ch)),
  };
  cache = cache.map((c, i) => (i === clsIdx ? updatedClass : c));
  void writeToIndexedDB(cache);
}

export function getChild(classroomId: string, childId: string): Child | null {
  const cls = cache.find(c => c.id === classroomId);
  if (!cls) return null;
  return cls.children.find(ch => ch.id === childId) || null;
}
