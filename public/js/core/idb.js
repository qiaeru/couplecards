// SPDX-License-Identifier: MIT
// Minimal IndexedDB wrapper. Three stores:
//   cards  (key = id)         — cached deck + version metadata
//   state  (key = kind)       — { banned: [...] } and { history: [...] }
//   outbox (key = autoinc)    — queued mutations pending server sync

const DB_NAME = 'couplecards';
const DB_VERSION = 1;

let dbPromise = null;

function openDb() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('cards')) db.createObjectStore('cards', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('state')) db.createObjectStore('state');
      if (!db.objectStoreNames.contains('outbox')) db.createObjectStore('outbox', { keyPath: 'id', autoIncrement: true });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function promisifyRequest(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function tx(store, mode, fn) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(store, mode);
    const objectStore = transaction.objectStore(store);
    const result = fn(objectStore);
    transaction.oncomplete = () => resolve(result);
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  });
}

export const idb = {
  async getCards() {
    return tx('cards', 'readonly', (store) => promisifyRequest(store.getAll()));
  },
  async putCards(cards, version) {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(['cards', 'state'], 'readwrite');
      const cardStore = transaction.objectStore('cards');
      const stateStore = transaction.objectStore('state');
      cardStore.clear();
      cards.forEach((c) => cardStore.put(c));
      stateStore.put(version, 'cardsVersion');
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
  },
  async getCardsVersion() {
    return tx('state', 'readonly', (store) => promisifyRequest(store.get('cardsVersion')));
  },
  async getState() {
    return tx('state', 'readonly', async (store) => ({
      banned: (await promisifyRequest(store.get('banned'))) || [],
      history: (await promisifyRequest(store.get('history'))) || [],
    }));
  },
  async setBanned(banned) {
    return tx('state', 'readwrite', (store) => promisifyRequest(store.put(banned, 'banned')));
  },
  async setHistory(history) {
    return tx('state', 'readwrite', (store) => promisifyRequest(store.put(history, 'history')));
  },
  async clearAll() {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(['cards', 'state', 'outbox'], 'readwrite');
      transaction.objectStore('cards').clear();
      transaction.objectStore('state').clear();
      transaction.objectStore('outbox').clear();
      transaction.oncomplete = resolve;
      transaction.onerror = () => reject(transaction.error);
    });
  },
  async enqueue(entry) {
    return tx('outbox', 'readwrite', (store) => promisifyRequest(store.add(entry)));
  },
  async listOutbox() {
    return tx('outbox', 'readonly', (store) => promisifyRequest(store.getAll()));
  },
  async removeOutbox(id) {
    return tx('outbox', 'readwrite', (store) => promisifyRequest(store.delete(id)));
  },
  async clearState() {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(['state', 'outbox'], 'readwrite');
      // Keep `cardsVersion`: the deck cache is not user state, and wiping the
      // version would force a full deck re-download on the next load.
      const state = transaction.objectStore('state');
      state.delete('banned');
      state.delete('history');
      transaction.objectStore('outbox').clear();
      transaction.oncomplete = resolve;
      transaction.onerror = () => reject(transaction.error);
    });
  },
};
