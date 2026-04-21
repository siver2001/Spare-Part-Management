type CacheEntry<T> = {
  data: T;
  timestamp: number;
};

const CACHE_PREFIX = 'spare-manager-cache:';
const memoryCache = new Map<string, CacheEntry<unknown>>();

function getStorageKey(key: string) {
  return `${CACHE_PREFIX}${key}`;
}

function canUseStorage() {
  return typeof window !== 'undefined' && typeof window.sessionStorage !== 'undefined';
}

function readFromStorage<T>(key: string): CacheEntry<T> | null {
  if (!canUseStorage()) {
    return null;
  }

  try {
    const raw = window.sessionStorage.getItem(getStorageKey(key));
    if (!raw) {
      return null;
    }

    return JSON.parse(raw) as CacheEntry<T>;
  } catch {
    return null;
  }
}

function writeToStorage<T>(key: string, entry: CacheEntry<T>) {
  if (!canUseStorage()) {
    return;
  }

  try {
    window.sessionStorage.setItem(getStorageKey(key), JSON.stringify(entry));
  } catch {
    // Ignore quota/storage issues and keep memory cache only.
  }
}

export function peekClientCache<T>(key: string): T | null {
  const memoryEntry = memoryCache.get(key) as CacheEntry<T> | undefined;
  if (memoryEntry) {
    return memoryEntry.data;
  }

  const storageEntry = readFromStorage<T>(key);
  if (!storageEntry) {
    return null;
  }

  memoryCache.set(key, storageEntry as CacheEntry<unknown>);
  return storageEntry.data;
}

export function readClientCache<T>(key: string, ttlMs: number): T | null {
  const entry = (memoryCache.get(key) as CacheEntry<T> | undefined) ?? readFromStorage<T>(key);

  if (!entry) {
    return null;
  }

  if (Date.now() - entry.timestamp > ttlMs) {
    invalidateClientCache(key);
    return null;
  }

  memoryCache.set(key, entry as CacheEntry<unknown>);
  return entry.data;
}

export function writeClientCache<T>(key: string, data: T) {
  const entry: CacheEntry<T> = {
    data,
    timestamp: Date.now(),
  };

  memoryCache.set(key, entry as CacheEntry<unknown>);
  writeToStorage(key, entry);
}

export function invalidateClientCache(key: string) {
  memoryCache.delete(key);

  if (!canUseStorage()) {
    return;
  }

  try {
    window.sessionStorage.removeItem(getStorageKey(key));
  } catch {
    // Ignore storage failures.
  }
}

export function invalidateClientCacheByPrefix(prefix: string) {
  for (const key of memoryCache.keys()) {
    if (key.startsWith(prefix)) {
      memoryCache.delete(key);
    }
  }

  if (!canUseStorage()) {
    return;
  }

  try {
    for (let index = window.sessionStorage.length - 1; index >= 0; index -= 1) {
      const fullKey = window.sessionStorage.key(index);
      if (!fullKey) {
        continue;
      }

      if (fullKey.startsWith(getStorageKey(prefix))) {
        window.sessionStorage.removeItem(fullKey);
      }
    }
  } catch {
    // Ignore storage failures.
  }
}
