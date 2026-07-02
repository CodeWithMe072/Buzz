/**
 * indexeddb.queue.js — IndexedDB Service for persisting offline messages and media.
 */
const IndexedDBQueueService = {
  db: null,

  init() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open("BuzzOfflineQueue", 1);

      request.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains("outgoing_messages")) {
          db.createObjectStore("outgoing_messages", { keyPath: "localId" });
        }
      };

      request.onsuccess = (e) => {
        this.db = e.target.result;
        console.log("[IndexedDB] Database initialized successfully");
        resolve();
      };

      request.onerror = (e) => {
        console.error("[IndexedDB] Error initializing database:", e.target.error);
        reject(e.target.error);
      };
    });
  },

  getStore(mode = "readonly") {
    if (!this.db) throw new Error("IndexedDB is not initialized");
    const transaction = this.db.transaction("outgoing_messages", mode);
    return transaction.objectStore("outgoing_messages");
  },

  async saveMessage(msg) {
    return new Promise((resolve, reject) => {
      try {
        const store = this.getStore("readwrite");
        const request = store.put(msg);
        request.onsuccess = () => resolve();
        request.onerror = (e) => reject(e.target.error);
      } catch (err) {
        reject(err);
      }
    });
  },

  async deleteMessage(localId) {
    return new Promise((resolve, reject) => {
      try {
        const store = this.getStore("readwrite");
        const request = store.delete(localId);
        request.onsuccess = () => resolve();
        request.onerror = (e) => reject(e.target.error);
      } catch (err) {
        reject(err);
      }
    });
  },

  async getMessage(localId) {
    return new Promise((resolve, reject) => {
      try {
        const store = this.getStore("readonly");
        const request = store.get(localId);
        request.onsuccess = () => resolve(request.result || null);
        request.onerror = (e) => reject(e.target.error);
      } catch (err) {
        reject(err);
      }
    });
  },

  async getAllUnsent() {
    return new Promise((resolve, reject) => {
      try {
        const store = this.getStore("readonly");
        const request = store.getAll();
        request.onsuccess = () => {
          const all = request.result || [];
          const unsent = all
            .filter(msg => msg.status !== "sent")
            .sort((a, b) => a.createdAt - b.createdAt);
          resolve(unsent);
        };
        request.onerror = (e) => reject(e.target.error);
      } catch (err) {
        reject(err);
      }
    });
  }
};

// Expose globally so all scripts loaded after this can access it
window.IndexedDBQueueService = IndexedDBQueueService;

