/**
 * indexeddb.queue.js — IndexedDB Service for persisting offline messages and media.
 */
const IndexedDBQueueService = {
  db: null,

  init() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open("BuzzOfflineQueue", 2);

      request.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains("outgoing_messages")) {
          db.createObjectStore("outgoing_messages", { keyPath: "localId" });
        }
        if (!db.objectStoreNames.contains("chat_input_drafts")) {
          db.createObjectStore("chat_input_drafts", { keyPath: "chatId" });
        }
      };

      request.onsuccess = (e) => {
        this.db = e.target.result;
        
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
    // If msg has a mediaBlob that is a Blob or File, serialize it to ArrayBuffer for persistence
    if (msg.mediaBlob && (msg.mediaBlob instanceof Blob || msg.mediaBlob instanceof File)) {
      try {
        const arrayBuffer = await msg.mediaBlob.arrayBuffer();
        msg.mediaArrayBuffer = arrayBuffer;
        msg.mediaMimeType = msg.mediaBlob.type;
        msg.mediaFileName = msg.mediaBlob.name || `capture-${Date.now()}`;
        delete msg.mediaBlob;
      } catch (err) {
        console.error("[IndexedDB] Failed to serialize Blob to ArrayBuffer:", err);
      }
    }

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
        request.onsuccess = () => {
          const msg = request.result || null;
          if (msg && msg.mediaArrayBuffer) {
            msg.mediaBlob = new File([msg.mediaArrayBuffer], msg.mediaFileName || "file", { type: msg.mediaMimeType });
          }
          resolve(msg);
        };
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
            .filter(msg => msg.status !== "sent" && msg.status !== "manual_draft" && msg.status !== "pending_preview" && !(typeof msg.status === "string" && msg.status.startsWith("status_")))
            .sort((a, b) => a.createdAt - b.createdAt);
          
          unsent.forEach(msg => {
            if (msg.mediaArrayBuffer) {
              msg.mediaBlob = new File([msg.mediaArrayBuffer], msg.mediaFileName || "file", { type: msg.mediaMimeType });
            }
          });
          resolve(unsent);
        };
        request.onerror = (e) => reject(e.target.error);
      } catch (err) {
        reject(err);
      }
    });
  },

  async getAllStatusUploads() {
    return new Promise((resolve, reject) => {
      try {
        const store = this.getStore("readonly");
        const request = store.getAll();
        request.onsuccess = () => {
          const all = request.result || [];
          const uploads = all
            .filter(msg => typeof msg.status === "string" && msg.status.startsWith("status_"))
            .sort((a, b) => a.createdAt - b.createdAt);
          
          uploads.forEach(msg => {
            if (msg.mediaArrayBuffer) {
              msg.mediaBlob = new File([msg.mediaArrayBuffer], msg.mediaFileName || "file", { type: msg.mediaMimeType });
            }
          });
          resolve(uploads);
        };
        request.onerror = (e) => reject(e.target.error);
      } catch (err) {
        reject(err);
      }
    });
  },

  async getAllDrafts() {
    return new Promise((resolve, reject) => {
      try {
        const store = this.getStore("readonly");
        const request = store.getAll();
        request.onsuccess = () => {
          const all = request.result || [];
          const drafts = all
            .filter(msg => ["pending_preview", "manual_draft"].includes(msg.status))
            .sort((a, b) => b.createdAt - a.createdAt); // newest first

          drafts.forEach(msg => {
            if (msg.mediaArrayBuffer) {
              msg.mediaBlob = new File([msg.mediaArrayBuffer], msg.mediaFileName || "file", { type: msg.mediaMimeType });
            }
          });
          resolve(drafts);
        };
        request.onerror = (e) => reject(e.target.error);
      } catch (err) {
        reject(err);
      }
    });
  },

  async deleteDraft(draftId) {
    return this.deleteMessage(draftId);
  },

  async saveInputDraft(chatId, text) {
    return new Promise((resolve, reject) => {
      try {
        if (!this.db || !chatId) { resolve(); return; }
        const transaction = this.db.transaction("chat_input_drafts", "readwrite");
        const store = transaction.objectStore("chat_input_drafts");
        if (!text || !text.trim()) {
          const request = store.delete(chatId);
          request.onsuccess = () => resolve();
          request.onerror = (e) => reject(e.target.error);
        } else {
          const request = store.put({ chatId, text, updatedAt: Date.now() });
          request.onsuccess = () => resolve();
          request.onerror = (e) => reject(e.target.error);
        }
      } catch (err) {
        reject(err);
      }
    });
  },

  async getInputDraft(chatId) {
    return new Promise((resolve, reject) => {
      try {
        if (!this.db) { resolve(null); return; }
        const transaction = this.db.transaction("chat_input_drafts", "readonly");
        const store = transaction.objectStore("chat_input_drafts");
        const request = store.get(chatId);
        request.onsuccess = () => resolve(request.result ? request.result.text : null);
        request.onerror = (e) => reject(e.target.error);
      } catch (err) {
        reject(err);
      }
    });
  },

  async deleteInputDraft(chatId) {
    return new Promise((resolve, reject) => {
      try {
        if (!this.db) { resolve(); return; }
        const transaction = this.db.transaction("chat_input_drafts", "readwrite");
        const store = transaction.objectStore("chat_input_drafts");
        const request = store.delete(chatId);
        request.onsuccess = () => resolve();
        request.onerror = (e) => reject(e.target.error);
      } catch (err) {
        reject(err);
      }
    });
  }
};

// Expose globally so all scripts loaded after this can access it
window.IndexedDBQueueService = IndexedDBQueueService;

