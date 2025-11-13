import type { PlacedShape } from './types';

// Stable localStorage key used previously (legacy, used for old -> IDB migration)
const LOCAL_KEY = 'atelier:classrooms:v1';
// New localStorage target key for this migration (IDB -> localStorage)
const LOCAL_TARGET_KEY = 'atelier:classrooms:v2';
// Migration status key
const MIGRATION_STATUS_KEY = 'atelier:migration:idb-to-ls:v1:status';

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

export type ExportPayload = {
  format: 'atelier-classrooms';
  version: 1;
  source: 'idb' | 'localStorage';
  exportedAt: string;
  checksum: number;
  count: number;
  data: Classroom[];
};

// In-memory cache so most operations can stay synchronous from the app's POV
let cache: Classroom[] = [];
let initialized = false;
let initPromise: Promise<void> | null = null;
let useLocalBackend = false; // toggled to true after successful migration

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

function lsGet<T = unknown>(key: string): T | undefined {
  const raw = localStorage.getItem(key);
  return safeParse<T>(raw);
}

function lsSet<T = unknown>(key: string, value: T): void {
  localStorage.setItem(key, JSON.stringify(value));
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

function writeToLocalStorage(data: Classroom[]): void {
  try {
    lsSet(LOCAL_TARGET_KEY, data);
  } catch (e) {
    console.error('Failed to persist classrooms to localStorage', e);
  }
}

function shallowHash(str: string): number {
  // djb2
  let h = 5381;
  for (let i = 0; i < str.length; i++) h = (h * 33) ^ str.charCodeAt(i);
  return h >>> 0;
}

function jsonEqual(a: unknown, b: unknown): boolean {
  try {
    return JSON.stringify(a) === JSON.stringify(b);
  } catch {
    return false;
  }
}

async function clearIdbStore(): Promise<void> {
  const db = await openDB();
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const req = store.clear();
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

function markMigrationCompleted(meta: Record<string, unknown>) {
  const payload = { ...meta, completedAt: new Date().toISOString() };
  localStorage.setItem(MIGRATION_STATUS_KEY, JSON.stringify(payload));
}

function isMigrationCompleted(): boolean {
  try {
    const raw = localStorage.getItem(MIGRATION_STATUS_KEY);
    return !!(raw && JSON.parse(raw));
  } catch {
    return false;
  }
}

export async function needsIdbToLocalMigration(): Promise<boolean> {
  if (isMigrationCompleted()) return false;
  // Only suggest migration if there is meaningful data (at least one child)
  const data = await idbGet<Classroom[]>(CLASSROOMS_KEY);
  const idbHas = Array.isArray(data) && data.length > 0;
  if (!idbHas) return false;
  const totalChildren = (Array.isArray(data) ? data : []).reduce(
    (acc, c) => acc + ((c.children && Array.isArray(c.children)) ? c.children.length : 0),
    0
  );
  if (totalChildren === 0) return false;
  const lsData = lsGet<Classroom[]>(LOCAL_TARGET_KEY);
  if (!lsData) return true;
  return !jsonEqual(data, lsData);
}

/** Returns true if IndexedDB currently contains classrooms data. */
export async function hasIdbData(): Promise<boolean> {
  const data = await idbGet<Classroom[]>(CLASSROOMS_KEY);
  return Array.isArray(data) && data.length > 0;
}

/** Returns true if IndexedDB contains at least one child across classrooms (i.e., meaningful data). */
export async function hasNonEmptyIdbData(): Promise<boolean> {
  const data = await idbGet<Classroom[]>(CLASSROOMS_KEY);
  if (!Array.isArray(data) || data.length === 0) return false;
  const totalChildren = data.reduce((acc, c) => acc + ((c.children && Array.isArray(c.children)) ? c.children.length : 0), 0);
  return totalChildren > 0;
}

/** Build a JSON-friendly export payload of current IndexedDB classrooms. */
export async function buildIdbExportPayload(): Promise<ExportPayload> {
  const data = (await idbGet<Classroom[]>(CLASSROOMS_KEY)) as unknown as Classroom[] | undefined; // intentional type to guard
  const arr = Array.isArray(data) ? data : [];
  const checksum = shallowHash(JSON.stringify(arr));
  return {
    format: 'atelier-classrooms',
    version: 1,
    source: 'idb',
    exportedAt: new Date().toISOString(),
    checksum,
    count: arr.length,
    data: arr,
  };
}

/** Build an export payload from the current in-memory dataset (whatever backend is active). */
export function buildCurrentExportPayload(): ExportPayload {
  const arr = Array.isArray(cache) ? cache : [];
  const checksum = shallowHash(JSON.stringify(arr));
  return {
    format: 'atelier-classrooms',
    version: 1,
    source: useLocalBackend ? 'localStorage' : 'idb',
    exportedAt: new Date().toISOString(),
    checksum,
    count: arr.length,
    data: arr,
  };
}

export type MigrationResult =
  | { status: 'ok'; message: string }
  | { status: 'noop'; message: string }
  | { status: 'conflict'; message: string }
  | { status: 'error'; message: string; error?: unknown };

/**
 * Safely migrate classrooms from IndexedDB to localStorage.
 * - Writes a timestamped backup copy in localStorage before overwriting target key
 * - Verifies round-trip equality
 * - Clears IDB store only after verification
 * - Idempotent: if already migrated with identical data, no changes are made
 */
export async function migrateIdbToLocalStorage(options?: { forceOverwrite?: boolean }): Promise<MigrationResult> {
  try {
    const idbData = await idbGet<Classroom[]>(CLASSROOMS_KEY);
    const data: Classroom[] = Array.isArray(idbData) ? idbData : [];
    if (data.length === 0) {
      // nothing to migrate
      return { status: 'noop', message: 'Aucune donnée dans IndexedDB à migrer.' };
    }

    const existingLocal = lsGet<Classroom[]>(LOCAL_TARGET_KEY);
    if (existingLocal && !jsonEqual(existingLocal, data) && !options?.forceOverwrite) {
      return {
        status: 'conflict',
        message:
          "Des données existent déjà dans localStorage avec un contenu différent. Migration annulée pour éviter l'écrasement. (Utilisez le mode 'force' si vous confirmez.)",
      };
    }

    // backup both the existing local target (if any) and the IDB payload under timestamped keys
    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    const backupIdbKey = `atelier:classrooms:backup:idb:${ts}`;
    const backupLsKey = existingLocal ? `atelier:classrooms:backup:ls:${ts}` : null;
    try {
      lsSet(backupIdbKey, data);
      if (backupLsKey && existingLocal) lsSet(backupLsKey, existingLocal);
    } catch (e) {
      console.warn('Backup write failed (continuing for migration safety).', e);
    }

    // write to target key
    writeToLocalStorage(data);
    const roundTrip = lsGet<Classroom[]>(LOCAL_TARGET_KEY) ?? [];
    if (!jsonEqual(data, roundTrip)) {
      return { status: 'error', message: 'Vérification après écriture échouée: le contenu enregistré ne correspond pas.' };
    }

    // clear IDB store
    await clearIdbStore();

    // status & toggle backend
    const checksum = shallowHash(JSON.stringify(data));
    markMigrationCompleted({ source: 'idb', dest: 'localStorage', count: data.length, checksum });
    useLocalBackend = true;
    cache = data; // keep memory in sync

    return { status: 'ok', message: 'Migration effectuée avec succès. Les données sont désormais dans localStorage.' };
  } catch (error) {
    console.error('Migration error', error);
    return { status: 'error', message: 'Erreur pendant la migration. Voir la console pour plus de détails.', error };
  }
}

function isExportPayload(obj: any): obj is ExportPayload {
  return (
    obj &&
    obj.format === 'atelier-classrooms' &&
    typeof obj.version === 'number' &&
    (obj.source === 'idb' || obj.source === 'localStorage') &&
    Array.isArray(obj.data)
  );
}

/**
 * Import classrooms into localStorage from a JSON object (either ExportPayload or raw Classroom[]).
 * Performs checksum verification (when available), conflict detection, round-trip verification, and clears IndexedDB.
 */
export async function importLocalStorageFromJsonObject(input: unknown, options?: { forceOverwrite?: boolean }): Promise<MigrationResult> {
  try {
    let data: Classroom[] | undefined;
    if (isExportPayload(input)) {
      data = Array.isArray(input.data) ? (input.data as Classroom[]) : [];
      if (typeof input.checksum === 'number') {
        const computed = shallowHash(JSON.stringify(data));
        if (computed !== input.checksum) {
          return { status: 'error', message: 'Import annulé: le fichier est corrompu (checksum non valide).' };
        }
      }
    } else if (Array.isArray(input)) {
      data = input as Classroom[];
    } else if (input && typeof input === 'object' && Array.isArray((input as any).data)) {
      // tolerate minimal wrapper { data: [...] }
      data = (input as any).data as Classroom[];
    }

    if (!data) {
      return { status: 'error', message: 'Format de fichier non reconnu. Veuillez fournir un JSON exporté depuis cette application.' };
    }

    const existingLocal = lsGet<Classroom[]>(LOCAL_TARGET_KEY);
    if (existingLocal && !jsonEqual(existingLocal, data) && !options?.forceOverwrite) {
      return {
        status: 'conflict',
        message: "Des données différentes existent déjà dans localStorage. Import annulé pour éviter l'écrasement (utilisez le mode 'force' si vous confirmez).",
      };
    }

    // write and verify
    writeToLocalStorage(data);
    const roundTrip = lsGet<Classroom[]>(LOCAL_TARGET_KEY) ?? [];
    if (!jsonEqual(data, roundTrip)) {
      return { status: 'error', message: "Échec de vérification après import: le contenu enregistré ne correspond pas." };
    }

    // clear IDB so the app uses local backend and to keep single source of truth
    await clearIdbStore();
    const checksum = shallowHash(JSON.stringify(data));
    markMigrationCompleted({ source: 'import', dest: 'localStorage', count: data.length, checksum });
    useLocalBackend = true;
    cache = data;
    return { status: 'ok', message: 'Import terminé: données restaurées dans localStorage.' };
  } catch (error) {
    console.error('Import error', error);
    return { status: 'error', message: "Erreur pendant l'import. Voir la console pour plus de détails.", error };
  }
}

/**
 * TEST-ONLY helper: Import classrooms into IndexedDB directly from a JSON object.
 * This is intended to simulate a pre-migration state for manual testing.
 * By default, it clears the migration status flag so the app suggests migration on next load.
 */
export async function testImportToIndexedDBFromJsonObject(
  input: unknown,
  options?: { clearMigrationStatus?: boolean }
): Promise<MigrationResult> {
  try {
    let data: Classroom[] | undefined;
    if (isExportPayload(input)) {
      data = Array.isArray(input.data) ? (input.data as Classroom[]) : [];
      if (typeof input.checksum === 'number') {
        const computed = shallowHash(JSON.stringify(data));
        if (computed !== input.checksum) {
          return { status: 'error', message: 'Import annulé: fichier corrompu (checksum non valide).' };
        }
      }
    } else if (Array.isArray(input)) {
      data = input as Classroom[];
    } else if (input && typeof input === 'object' && Array.isArray((input as any).data)) {
      data = (input as any).data as Classroom[];
    }

    if (!data) {
      return { status: 'error', message: 'Format de fichier non reconnu. Fournissez un JSON exporté depuis cette application.' };
    }

    // Write to IDB (overwrite)
    await idbSet(CLASSROOMS_KEY, data);

    // Optionally clear migration completed status so the app suggests migration again
    const clearFlag = options?.clearMigrationStatus !== false;
    if (clearFlag) {
      try {
        localStorage.removeItem(MIGRATION_STATUS_KEY);
      } catch {}
    }

    // Do not switch backend; leave app state as-is. Caller may reload to see banner.
    return { status: 'ok', message: 'Données importées dans IndexedDB (test). Rechargez la page pour simuler un état avant migration.' };
  } catch (error) {
    console.error('Test import to IndexedDB error', error);
    return { status: 'error', message: "Erreur pendant l'import vers IndexedDB (test).", error };
  }
}

/**
 * Clear all data (IndexedDB + localStorage target keys) and start with a fresh empty dataset
 * initialized with one default classroom. Switches to localStorage backend.
 */
export async function clearAllDataAndStartFresh(defaultClassName = 'Classe 1'): Promise<MigrationResult> {
  try {
    // Clear persistent storages
    await clearIdbStore();
    try {
      localStorage.removeItem(LOCAL_TARGET_KEY);
      localStorage.removeItem(MIGRATION_STATUS_KEY);
      // Also clear legacy local key if present
      localStorage.removeItem(LOCAL_KEY);
    } catch (e) {
      console.warn('Failed to clear some localStorage keys', e);
    }

    // Switch to local backend and bootstrap a fresh classroom
    useLocalBackend = true;
    cache = [];
    const cls = addClassroom(defaultClassName);
    cache = [cls];

    const checksum = shallowHash(JSON.stringify(cache));
    markMigrationCompleted({ source: 'reset', dest: 'localStorage', count: cache.length, checksum });
    return { status: 'ok', message: 'Données effacées. Nouvelle classe créée.' };
  } catch (error) {
    console.error('Reset error', error);
    return { status: 'error', message: "Impossible d'effacer et réinitialiser les données.", error };
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
      // Decide backend:
      // - If migration already completed -> use localStorage
      // - Else if IDB has "meaningful" data (at least one child) -> keep using IDB and suggest migration in UI
      // - Else (no children in IDB) -> use localStorage only
      useLocalBackend = isMigrationCompleted();
      if (useLocalBackend) {
        cache = lsGet<Classroom[]>(LOCAL_TARGET_KEY) ?? [];
      } else {
        const idbData = await idbGet<Classroom[]>(CLASSROOMS_KEY);
        const hasMeaningful = Array.isArray(idbData) && idbData.some(c => Array.isArray(c.children) && c.children.length > 0);
        if (hasMeaningful) {
          cache = await loadFromIndexedDB();
          useLocalBackend = false;
        } else {
          // No children present in IDB: prioritize localStorage
          cache = lsGet<Classroom[]>(LOCAL_TARGET_KEY) ?? [];
          useLocalBackend = true;
        }
      }
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
  if (useLocalBackend) {
    writeToLocalStorage(cache);
  } else {
    void writeToIndexedDB(cache);
  }
}

export function addClassroom(name: string): Classroom {
  const c: Classroom = { id: makeId('class-'), name: name || `Classe ${cache.length + 1}`, children: [] };
  cache = [...cache, c];
  if (useLocalBackend) {
    writeToLocalStorage(cache);
  } else {
    void writeToIndexedDB(cache);
  }
  return c;
}

export function addChildToClassroom(classroomId: string, childName: string): Child | null {
  const idx = cache.findIndex(c => c.id === classroomId);
  if (idx === -1) return null;
  const cls = cache[idx];
  const child: Child = { id: makeId('child-'), name: childName || `Enfant ${cls.children.length + 1}`, history: [] };
  const updatedClass = { ...cls, children: [...cls.children, child] };
  cache = cache.map((c, i) => (i === idx ? updatedClass : c));
  if (useLocalBackend) {
    writeToLocalStorage(cache);
  } else {
    void writeToIndexedDB(cache);
  }
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
  if (useLocalBackend) {
    writeToLocalStorage(cache);
  } else {
    void writeToIndexedDB(cache);
  }
}

export function getChild(classroomId: string, childId: string): Child | null {
  const cls = cache.find(c => c.id === classroomId);
  if (!cls) return null;
  return cls.children.find(ch => ch.id === childId) || null;
}
