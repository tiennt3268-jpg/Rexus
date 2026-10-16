const stores = new Map();
export function getStore(name){ const n = typeof name === 'string' ? name : name?.name; if(!stores.has(n)) stores.set(n, new Map()); const m = stores.get(n);
  return { async get(k, o){ const v = m.get(k); if(v===undefined) return null; return o?.type==='json'? JSON.parse(v) : v; }, async getWithMetadata(k){ const v=m.get(k); return v===undefined?null:{data:v,metadata:{}}; },
    async set(k, v){ m.set(k, v); }, async setJSON(k, v){ m.set(k, JSON.stringify(v)); }, async delete(k){ m.delete(k); }, async list(){ return { blobs: [...m.keys()].map(key=>({key})) }; } }; }
