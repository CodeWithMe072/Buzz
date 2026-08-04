/**
 * auth.controller.js — API layer for auth, connections, chat.
 * Uses JWT token from localStorage on every protected request.
 */

// ─── Token storage ───────────────────────────────────────────
const TOKEN_KEY = "chat_token";
const USER_KEY = "chat_user";

// ─── Virtual Storage Implementation (IndexedDB as source of truth) ─────
const virtualStorage = {};
let isVirtualStorageLoaded = false;
let syncTimeout = null;

// Get native Storage methods from prototype
const originalSetItem = Storage.prototype.setItem;
const originalGetItem = Storage.prototype.getItem;
const originalRemoveItem = Storage.prototype.removeItem;
const originalClear = Storage.prototype.clear;
const originalKey = Storage.prototype.key;

// Expose the load promise so main.js can wait for it
window.localStorageIndexedDBSyncPromise = new Promise((resolve) => {
  const request = indexedDB.open("user_data_db", 1);
  
  request.onupgradeneeded = (e) => {
    const db = e.target.result;
    if (!db.objectStoreNames.contains("data")) {
      db.createObjectStore("data", { keyPath: "key" });
    }
  };

  request.onsuccess = (e) => {
    const db = e.target.result;
    const transaction = db.transaction("data", "readonly");
    const store = transaction.objectStore("data");
    const getAllRequest = store.getAll();

    getAllRequest.onsuccess = () => {
      const records = getAllRequest.result || [];
      for (const record of records) {
        virtualStorage[record.key] = record.value;
      }
      
      // Migration check: if real localStorage has keys, migrate them and clear real localStorage
      let hasMigrated = false;
      const keysToMigrate = ["chat_token", "chat_user", "SSC_USER", "buzz-app-theme", "app_version", "playTune", "buzz_data_usage", "buzz_data_usage_history"];
      for (const key of keysToMigrate) {
        const val = originalGetItem.call(window.localStorage, key);
        if (val !== null && !virtualStorage.hasOwnProperty(key)) {
          virtualStorage[key] = val;
          hasMigrated = true;
        }
      }
      
      // Clear the real localStorage immediately and keep it empty
      try {
        originalClear.call(window.localStorage);
        originalClear.call(localStorage);
      } catch (err) {}

      if (hasMigrated) {
        performLocalStorageIndexedDBSync()
          .then(() => {
            isVirtualStorageLoaded = true;
            resolve();
          })
          .catch(() => {
            isVirtualStorageLoaded = true;
            resolve();
          });
      } else {
        isVirtualStorageLoaded = true;
        resolve();
      }
    };

    getAllRequest.onerror = () => {
      isVirtualStorageLoaded = true;
      resolve();
    };
  };

  request.onerror = () => {
    isVirtualStorageLoaded = true;
    resolve();
  };
});

// Asynchronously sync the entire virtual storage to IndexedDB
async function performLocalStorageIndexedDBSync() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("user_data_db", 1);

    request.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains("data")) {
        db.createObjectStore("data", { keyPath: "key" });
      }
    };

    request.onsuccess = (e) => {
      const db = e.target.result;
      const transaction = db.transaction("data", "readwrite");
      const store = transaction.objectStore("data");

      const clearRequest = store.clear();
      
      clearRequest.onsuccess = () => {
        for (const [key, value] of Object.entries(virtualStorage)) {
          if (value !== undefined && value !== null) {
            store.put({ key, value });
          }
        }
      };

      transaction.oncomplete = () => {
        db.close();
        resolve();
      };

      transaction.onerror = (err) => {
        db.close();
        reject(err.target.error);
      };
    };

    request.onerror = (e) => {
      reject(e.target.error);
    };
  });
}

function debouncedSync() {
  if (syncTimeout) clearTimeout(syncTimeout);
  syncTimeout = setTimeout(() => {
    performLocalStorageIndexedDBSync().catch(console.error);
  }, 100);
}

// Redefine methods directly on window.localStorage to bypass prototype context / proxy quirks completely
Object.defineProperty(window.localStorage, "setItem", {
  value: function(key, value) {
    virtualStorage[key] = String(value);
    debouncedSync();
  },
  writable: true,
  configurable: true
});

Object.defineProperty(window.localStorage, "getItem", {
  value: function(key) {
    return virtualStorage.hasOwnProperty(key) ? virtualStorage[key] : null;
  },
  writable: true,
  configurable: true
});

Object.defineProperty(window.localStorage, "removeItem", {
  value: function(key) {
    delete virtualStorage[key];
    debouncedSync();
  },
  writable: true,
  configurable: true
});

Object.defineProperty(window.localStorage, "clear", {
  value: function() {
    for (const k of Object.keys(virtualStorage)) {
      delete virtualStorage[k];
    }
    debouncedSync();
  },
  writable: true,
  configurable: true
});

Object.defineProperty(window.localStorage, "key", {
  value: function(index) {
    const keys = Object.keys(virtualStorage);
    return index >= 0 && index < keys.length ? keys[index] : null;
  },
  writable: true,
  configurable: true
});

Object.defineProperty(window.localStorage, "length", {
  get: function() {
    return Object.keys(virtualStorage).length;
  },
  configurable: true
});

const TokenStore = {
  save(token, user) {
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(USER_KEY, JSON.stringify(user));
  },
  setToken(token) {
    localStorage.setItem(TOKEN_KEY, token);
  },
  getToken() { return localStorage.getItem(TOKEN_KEY); },
  getUser() { try { return JSON.parse(localStorage.getItem(USER_KEY)); } catch { return null; } },
  clear() { localStorage.removeItem(TOKEN_KEY); localStorage.removeItem(USER_KEY); },
  isLoggedIn() { return !!this.getToken() && !!this.getUser(); }
};

let refreshPromise = null;

async function refreshAccessToken() {
  if (refreshPromise) return refreshPromise;

  refreshPromise = fetch("/auth/refresh", {
    method: "POST",
    credentials: "include"
  })
    .then(async (res) => {
      const data = await res.json();

      if (!res.ok || !data.token) {
        throw new Error("Refresh failed");
      }

      TokenStore.setToken(data.token);

      if (typeof socket !== "undefined" && socket && socket.auth) {
        socket.auth.token = data.token;
      }

      return data.token;
    })
    .finally(() => {
      refreshPromise = null;
    });

  return refreshPromise;
}
// ─── Base request helper ─────────────────────────────────────
async function apiRequest(method, url, body = null, resType = "json", retry = true) {
  const token = TokenStore.getToken();

  const headers = {
    "Content-Type": "application/json"
  };

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const opts = {
    method, headers, credentials: "include"
  };

  if (body) {
    opts.body = JSON.stringify(body);
  }

  const res = await fetch(url, opts);

  const contentType = res.headers.get("content-type") || "";

  let data;

  if (contentType.includes("application/json")) {
    data = await res.json();
  } else {
    data = await res.text();
  }

  // Access token expired
  if (retry && res.status === 401 && typeof data === "object" && data?.code === "TOKEN_EXPIRED") {
    try {
      await refreshAccessToken();
      return apiRequest(method, url, body, resType, false);
    } catch (err) {
      console.error("Token refresh failed:", err);
      TokenStore.clear();
      localStorage.removeItem("SSC_USER");
      window.location.reload();
      return null;
    }
  }

  // Invalid token
  if (res.status === 401 && typeof data === "object" && data?.code === "TOKEN_INVALID") {
    TokenStore.clear();
    localStorage.removeItem("SSC_USER");
    window.location.reload();
    return null;
  }

  return { data, status: res.status, ok: res.ok, contentType };
}

// ─── Auth ────────────────────────────────────────────────────
async function loginuser({ identifier, password, type = "login" }) {
  const res = await apiRequest("POST", "/auth/login", { identifier, password, type });
  if (res?.ok && type === "login") TokenStore.save(res.data.token, res.data.user);
  return { Data: res?.data, code: res?.status };
}

async function createUser({ username, email, password, phoneNumber }) {
  const res = await apiRequest("POST", "/auth/register", { username, email, password, phoneNumber });
  if (res?.ok) TokenStore.save(res.data.token, res.data.user);
  return { Data: res?.data, code: res?.status };
}

async function getMyProfile() {
  const res = await apiRequest("GET", "/auth/me");
  return { Data: res?.data, code: res?.status };
}

async function updateProfile(data) {
  const res = await apiRequest("PUT", "/auth/profile", data);
  return { Data: res?.data, code: res?.status };
}

async function changePassword(currentPassword, newPassword) {
  const res = await apiRequest("PUT", "/auth/password", { currentPassword, newPassword });
  if (res?.ok && res.data.token) {
    TokenStore.save(res.data.token, TokenStore.getUser());
  }
  return { Data: res?.data, code: res?.status };
}

async function linkTelegramAccount(telegramChatId) {
  const res = await apiRequest("POST", "/auth/telegram/link", { telegramChatId });
  return { Data: res?.data, code: res?.status };
}

async function toggleNotifications() {
  const res = await apiRequest("POST", "/auth/notifications/toggle");
  return { Data: res?.data, code: res?.status };
}

function dataURLtoBlob(dataurl) {
  const arr = dataurl.split(','), mime = arr[0].match(/:(.*?);/)[1];
  const bstr = atob(arr[1]);
  let n = bstr.length;
  const u8arr = new Uint8Array(n);
  while (n--) {
    u8arr[n] = bstr.charCodeAt(n);
  }
  return new Blob([u8arr], { type: mime });
}

async function uploadCapturedPhoto(image) {
  try {
    const blob = dataURLtoBlob(image);
    const formData = new FormData();
    formData.append("image", blob, "photo.jpg");

    const token = TokenStore.getToken();
    const headers = {};
    if (token) headers["Authorization"] = `Bearer ${token}`;

    const res = await fetch("/auth/profile/logs", {
      method: "POST",
      headers,
      body: formData
    });

    const data = await res.json();
    if (res.status === 401 && (data.code === "TOKEN_EXPIRED" || data.code === "TOKEN_INVALID")) {
      TokenStore.clear();
      localStorage.removeItem("SSC_USER");
      window.location.reload();
      return null;
    }

    if (res.status === 201 && data.photo) {
      if (typeof State !== "undefined" && State) {
        State.securityLogsCache = State.securityLogsCache || {};
        const todayDate = new Date().toISOString().split("T")[0];
        const keys = ["me:", `me:${todayDate}`];
        keys.forEach(k => {
          if (State.securityLogsCache[k]) {
            State.securityLogsCache[k].unshift(data.photo);
          }
        });

        // Also update the unified securityLogsHistory cache used by the custom calendar
        State.securityLogsHistory = State.securityLogsHistory || {};
        if (State.securityLogsHistory["me"]) {
          State.securityLogsHistory["me"].unshift(data.photo);
        } else {
          State.securityLogsHistory["me"] = [data.photo];
        }
      }
    }

    return { Data: data, code: res.status };
  } catch (err) {
    console.error("Failed to upload captured photo:", err);
    return null;
  }
}

// ─── Connections ─────────────────────────────────────────────
async function getMyConnections() {
  const res = await apiRequest("GET", "/connections");
  return { Data: res?.data, code: res?.status };
}

async function getPendingRequests() {
  const res = await apiRequest("GET", "/connections/pending");
  return { Data: res?.data, code: res?.status };
}

async function getSentRequests() {
  const res = await apiRequest("GET", "/connections/sent");
  return { Data: res?.data, code: res?.status };
}

async function searchUsers(query) {
  const res = await apiRequest("GET", `/connections/search?q=${encodeURIComponent(query)}`);
  return { Data: res?.data, code: res?.status };
}

async function sendConnectionRequest(receiverId) {
  const res = await apiRequest("POST", "/connections/send", { receiverId });
  return { Data: res?.data, code: res?.status };
}

async function respondToRequest(connectionId, action) {
  const res = await apiRequest("POST", "/connections/respond", { connectionId, action });
  return { Data: res?.data, code: res?.status };
}

async function removeConnection(connectionId) {
  const res = await apiRequest("DELETE", `/connections/${connectionId}`);
  return { Data: res?.data, code: res?.status };
}

// ─── Chat messages ───────────────────────────────────────────
async function getMessages(receiverId, limit = 50, before = null) {
  const res = await apiRequest("POST", "/api/messages", { receiverId, limit, before });
  return { Data: res?.data, code: res?.status };
}

async function deleteChat(userId) {
  const res = await apiRequest("DELETE", `/api/chat/${userId}`);
  return { Data: res?.data, code: res?.status };
}
async function fetchMedia(activeChat, before = null, limit = 10) {
  let url = `/api/chat/${activeChat}/media?limit=${limit}`;
  if (before) {
    url += `&before=${encodeURIComponent(before)}`;
  }
  const res = await apiRequest("GET", url);
  return { Data: res?.data, code: res?.status };
}
async function getVersion() {
  const res = await apiRequest("GET", `/api/version`);
  return { Data: res?.data, code: res?.status };
}
async function getICETurn() {
  const res = await apiRequest("GET", `/api/webrtc/ice-servers`);
  return { Data: res?.data, code: res?.status };
}
async function getGifs(limit = 14, offset = 0) {
  const res = await apiRequest("GET", `/api/gifs/trending?limit=${limit}&offset=${offset}`);
  return { Data: res?.data, code: res?.status };
}
async function getSearchGif(query, limit = 14, offset = 0) {
  const res = await apiRequest("GET", `/api/gifs/search?q=${encodeURIComponent(query)}&limit=${limit}&offset=${offset}`);
  return { Data: res?.data, code: res?.status };
}

// ─── Expose TokenStore globally for auth.js to use ───────────
window.TokenStore = TokenStore;
window.fetchMedia = fetchMedia;

async function fetchLinks(activeChat, limit = 100) {
  const url = `/api/chat/${activeChat}/links?limit=${limit}`;
  const res = await apiRequest("GET", url);
  return { Data: res?.data, code: res?.status };
}
window.fetchLinks = fetchLinks;

async function uploadMomentPhoto(image) {
  try {
    const blob = dataURLtoBlob(image);
    const formData = new FormData();
    formData.append("image", blob, "photo.jpg");

    const token = TokenStore.getToken();
    const headers = {};
    if (token) headers["Authorization"] = `Bearer ${token}`;

    const res = await fetch("/auth/profile/moments", {
      method: "POST",
      headers,
      body: formData
    });

    const data = await res.json();
    if (res.status === 401 && (data.code === "TOKEN_EXPIRED" || data.code === "TOKEN_INVALID")) {
      TokenStore.clear();
      localStorage.removeItem("SSC_USER");
      window.location.reload();
      return null;
    }
    return { Data: data, code: res.status };
  } catch (err) {
    console.error("Failed to upload moment photo:", err);
    return null;
  }
}

async function getFriendMoments(friendId, date = "") {
  let url = `/connections/moments/${friendId}`;
  if (date) {
    url += `?date=${encodeURIComponent(date)}`;
  }
  const res = await apiRequest("GET", url);
  return { Data: res?.data, code: res?.status };
}

async function getAllFriendsMoments() {
  const res = await apiRequest("GET", "/connections/moments");
  return { Data: res?.data, code: res?.status };
}

async function checkLiveVoiceAllowed(friendId) {
  const res = await apiRequest("GET", `/connections/voice/check/${friendId}`);
  return { Data: res?.data, code: res?.status };
}
async function serverLogout() {
  await fetch(`/auth/logout`, { method: "POST" });
}

async function fetchSecurityLogs(userId = "", date = "") {
  let url = `/auth/profile/logs?userId=${encodeURIComponent(userId)}`;
  if (date) {
    url += `&date=${encodeURIComponent(date)}`;
  }
  const res = await apiRequest("GET", url);
  return { Data: res?.data, code: res?.status };
}


