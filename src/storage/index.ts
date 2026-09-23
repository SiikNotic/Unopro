const PREFIX = 'carta.';

function buildKey(key: string): string {
  return key.startsWith(PREFIX) ? key : PREFIX + key;
}

export const storage = {
  get<T>(key: string): T | null {
    try {
      const raw = localStorage.getItem(buildKey(key));
      if (raw === null) return null;
      return JSON.parse(raw) as T;
    } catch {
      return null;
    }
  },

  getOrDefault<T>(key: string, defaultValue: T): T {
    const value = storage.get<T>(key);
    return value === null ? defaultValue : value;
  },

  set<T>(key: string, value: T): void {
    try {
      localStorage.setItem(buildKey(key), JSON.stringify(value));
    } catch {
      // storage may be full or unavailable — fail silently
    }
  },

  remove(key: string): void {
    try {
      localStorage.removeItem(buildKey(key));
    } catch {
      // no-op
    }
  },

  clear(): void {
    try {
      const keysToRemove: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.startsWith(PREFIX)) keysToRemove.push(k);
      }
      keysToRemove.forEach((k) => localStorage.removeItem(k));
    } catch {
      // no-op
    }
  },

  has(key: string): boolean {
    try {
      return localStorage.getItem(buildKey(key)) !== null;
    } catch {
      return false;
    }
  },
};
