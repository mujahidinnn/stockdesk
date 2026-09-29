// Node has no localStorage, and importing any hook file pulls in the supabase
// client, which reads it at module load. A plain in memory map is enough, the
// tests never authenticate.
const store = new Map<string, string>();

globalThis.localStorage = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, String(v)),
  removeItem: (k: string) => void store.delete(k),
  clear: () => store.clear(),
  key: (i: number) => [...store.keys()][i] ?? null,
  get length() {
    return store.size;
  },
} as Storage;
