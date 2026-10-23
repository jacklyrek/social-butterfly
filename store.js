// Data layer. Two interchangeable backends with the same API:
//   - Firestore (shared between everyone with the link)
//   - localStorage (fallback when no Firebase config is set)
//
// Data shape:
//   pool:  { id, name, emoji, createdAt }
//   entry: { id, poolId, text, by, drawn, createdAt }

import { firebaseConfig } from "./firebase-config.js";

const DEFAULT_POOLS = [
  { name: "Questions", emoji: "💬" },
  { name: "Things to do", emoji: "🎉" },
];

export async function createStore() {
  if (firebaseConfig) {
    try {
      return await createFirestoreStore(firebaseConfig);
    } catch (err) {
      console.error("Firestore failed to load, falling back to local storage", err);
    }
  }
  return createLocalStore();
}

async function createFirestoreStore(config) {
  const v = "10.12.2";
  const { initializeApp } = await import(`https://www.gstatic.com/firebasejs/${v}/firebase-app.js`);
  const fs = await import(`https://www.gstatic.com/firebasejs/${v}/firebase-firestore.js`);

  const app = initializeApp(config);
  const db = fs.initializeFirestore(app, {
    localCache: fs.persistentLocalCache({ tabManager: fs.persistentMultipleTabManager() }),
  });
  const pools = fs.collection(db, "pools");
  const entries = fs.collection(db, "entries");

  const withId = (d) => ({ id: d.id, ...d.data() });

  // Seed the default pools the very first time anyone opens the app.
  const existing = await fs.getDocs(pools);
  if (existing.empty) {
    for (const [i, p] of DEFAULT_POOLS.entries()) {
      await fs.addDoc(pools, { ...p, createdAt: Date.now() + i });
    }
  }

  return {
    shared: true,
    subscribePools(cb) {
      return fs.onSnapshot(fs.query(pools, fs.orderBy("createdAt")), (snap) => cb(snap.docs.map(withId)));
    },
    subscribeEntries(cb) {
      return fs.onSnapshot(fs.query(entries, fs.orderBy("createdAt")), (snap) => cb(snap.docs.map(withId)));
    },
    addPool: (name, emoji) => fs.addDoc(pools, { name, emoji, createdAt: Date.now() }),
    async deletePool(poolId) {
      const snap = await fs.getDocs(fs.query(entries, fs.where("poolId", "==", poolId)));
      const batch = fs.writeBatch(db);
      snap.docs.forEach((d) => batch.delete(d.ref));
      batch.delete(fs.doc(pools, poolId));
      await batch.commit();
    },
    addEntry: (poolId, text, by) =>
      fs.addDoc(entries, { poolId, text, by, drawn: false, createdAt: Date.now() }),
    deleteEntry: (id) => fs.deleteDoc(fs.doc(entries, id)),
    setDrawn: (id, drawn) => fs.updateDoc(fs.doc(entries, id), { drawn }),
    async resetPool(poolId) {
      const snap = await fs.getDocs(fs.query(entries, fs.where("poolId", "==", poolId)));
      const batch = fs.writeBatch(db);
      snap.docs.forEach((d) => batch.update(d.ref, { drawn: false }));
      await batch.commit();
    },
  };
}

function createLocalStore() {
  const KEY = "social-butterfly-data";
  const listeners = { pools: new Set(), entries: new Set() };

  let data;
  try {
    data = JSON.parse(localStorage.getItem(KEY));
  } catch {}
  if (!data) {
    data = {
      pools: DEFAULT_POOLS.map((p, i) => ({ id: crypto.randomUUID(), ...p, createdAt: Date.now() + i })),
      entries: [],
    };
  }

  const save = () => {
    try {
      localStorage.setItem(KEY, JSON.stringify(data));
    } catch {}
    listeners.pools.forEach((cb) => cb([...data.pools]));
    listeners.entries.forEach((cb) => cb([...data.entries]));
  };

  const subscribe = (kind) => (cb) => {
    listeners[kind].add(cb);
    cb([...data[kind]]);
    return () => listeners[kind].delete(cb);
  };

  return {
    shared: false,
    subscribePools: subscribe("pools"),
    subscribeEntries: subscribe("entries"),
    async addPool(name, emoji) {
      data.pools.push({ id: crypto.randomUUID(), name, emoji, createdAt: Date.now() });
      save();
    },
    async deletePool(poolId) {
      data.pools = data.pools.filter((p) => p.id !== poolId);
      data.entries = data.entries.filter((e) => e.poolId !== poolId);
      save();
    },
    async addEntry(poolId, text, by) {
      data.entries.push({ id: crypto.randomUUID(), poolId, text, by, drawn: false, createdAt: Date.now() });
      save();
    },
    async deleteEntry(id) {
      data.entries = data.entries.filter((e) => e.id !== id);
      save();
    },
    async setDrawn(id, drawn) {
      const e = data.entries.find((e) => e.id === id);
      if (e) e.drawn = drawn;
      save();
    },
    async resetPool(poolId) {
      data.entries.forEach((e) => {
        if (e.poolId === poolId) e.drawn = false;
      });
      save();
    },
  };
}
