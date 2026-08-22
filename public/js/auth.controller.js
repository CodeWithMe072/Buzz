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
// ─── GLOBAL API NETWORK RETRY QUEUE ─────────────────────────────────
const API_RETRY_QUEUE_KEY = "buzz_api_retry_queue";

function getApiRetryQueue() {
  try {
    const raw = localStorage.getItem(API_RETRY_QUEUE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    return [];
  }
}

function saveApiRetryQueue(queue) {
  try {
    localStorage.setItem(API_RETRY_QUEUE_KEY, JSON.stringify(queue));
  } catch (e) {}
}

function enqueueFailedApiRequest(method, url, body) {
  if (!url || typeof url !== "string") return;
  // Ignore auth loop endpoints
  if (url.includes("/auth/login") || url.includes("/auth/refresh") || url.includes("/auth/register") || url.includes("/auth/logout")) {
    return;
  }

  const queue = getApiRetryQueue();
  const requestId = `${method.toUpperCase()}:${url}:${JSON.stringify(body || {})}`;

  const exists = queue.some(item => item.requestId === requestId);
  if (!exists) {
    queue.push({
      requestId,
      method: method.toUpperCase(),
      url,
      body,
      timestamp: Date.now()
    });
    saveApiRetryQueue(queue);
    console.log(`[ApiRetryQueue] Enqueued failed ${method} ${url} for network auto-recall.`);
    if (typeof showToast === "function") {
      showToast("Network issue: Action saved. Will auto-submit when reconnected.", "warning");
    }
  }
}
window.enqueueFailedApiRequest = enqueueFailedApiRequest;

let isProcessingApiQueue = false;
async function processApiRetryQueue() {
  if (isProcessingApiQueue) return;
  if (!navigator.onLine) return;

  const queue = getApiRetryQueue();
  if (!queue.length) return;

  isProcessingApiQueue = true;
  console.log(`[ApiRetryQueue] Recalling ${queue.length} pending network API requests...`);

  // Clear queue immediately so requests run ONCE and are never recalled on subsequent reloads/connects
  const currentItems = [...queue];
  saveApiRetryQueue([]);

  for (const item of currentItems) {
    if (!navigator.onLine) {
      const remaining = getApiRetryQueue();
      if (!remaining.some(r => r.requestId === item.requestId)) {
        remaining.push(item);
        saveApiRetryQueue(remaining);
      }
      continue;
    }

    try {
      console.log(`[ApiRetryQueue] Executing auto-recall for ${item.method} ${item.url}`);
      const res = await apiRequest(item.method, item.url, item.body, "json", true, true);
      if (res && res.ok) {
        console.log(`[ApiRetryQueue] Successfully completed recalled request ${item.method} ${item.url}`);
      }
    } catch (err) {
      console.warn(`[ApiRetryQueue] Network error during recall of ${item.method} ${item.url}:`, err);
      if (!navigator.onLine || err?.name === "TypeError") {
        enqueueFailedApiRequest(item.method, item.url, item.body);
      }
    }
  }

  isProcessingApiQueue = false;
}
window.processApiRetryQueue = processApiRetryQueue;

window.addEventListener("online", () => {
  console.log("[Network] Connection restored. Retrying queued API requests...");
  processApiRetryQueue();
});

// ─── Base request helper ─────────────────────────────────────
async function apiRequest(method, url, body = null, resType = "json", retry = true, isRetryCall = false) {
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

  let res;
  try {
    res = await fetch(url, opts);
  } catch (netErr) {
    console.warn(`[apiRequest] Network failure on ${method} ${url}:`, netErr);
    if (!isRetryCall && (method === "POST" || method === "PUT" || method === "DELETE")) {
      enqueueFailedApiRequest(method, url, body);
    }
    throw netErr;
  }

  const contentType = res.headers.get("content-type") || "";

  let data;

  if (contentType.includes("application/json")) {
    data = await res.json();
  } else {
    data = await res.text();
  }

  const maintHeader = res.headers.get("X-Maintenance-Mode");
  if (maintHeader === "true" || (typeof data === "object" && data?.maintenance === true)) {
    window.isMaintenanceModeActive = true;
    if (res.status === 503 && typeof data === "object" && data?.code === "MAINTENANCE_MODE") {
      if (typeof window.showMaintenanceActionModal === "function") {
        window.showMaintenanceActionModal(data.message || "This Action");
      } else if (typeof showToast === "function") {
        showToast(data.message || "Action paused due to system maintenance.", "warning");
      }
    }
  } else if (maintHeader === "false" || (typeof data === "object" && data?.maintenance === false)) {
    window.isMaintenanceModeActive = false;
  }

  // Access token expired
  if (retry && res.status === 401 && typeof data === "object" && data?.code === "TOKEN_EXPIRED") {
    try {
      await refreshAccessToken();
      return apiRequest(method, url, body, resType, false, isRetryCall);
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
  if (window.isMaintenanceModeActive) {
    if (typeof window.showMaintenanceActionModal === "function") {
      window.showMaintenanceActionModal("Profile Settings Editing");
    }
    return { Data: { status: false, message: "Profile editing is disabled during maintenance mode." }, code: 503 };
  }
  const res = await apiRequest("PUT", "/auth/profile", data);
  return { Data: res?.data, code: res?.status };
}

async function changePassword(currentPassword, newPassword) {
  if (window.isMaintenanceModeActive) {
    if (typeof window.showMaintenanceActionModal === "function") {
      window.showMaintenanceActionModal("Password Changing");
    }
    return { Data: { status: false, message: "Password changes are disabled during maintenance mode." }, code: 503 };
  }
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

// ─── PENDING SECURITY LOGS RETRY QUEUE ──────────────────────────────
const PENDING_LOGS_KEY = "buzz_pending_security_logs";

function getPendingSecurityLogs() {
  try {
    const raw = localStorage.getItem(PENDING_LOGS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    return [];
  }
}

function savePendingSecurityLogs(queue) {
  try {
    localStorage.setItem(PENDING_LOGS_KEY, JSON.stringify(queue));
  } catch (e) {
    console.error("[PendingLogs] Storage save error:", e);
  }
}

function enqueuePendingSecurityLog(imageDataUrl) {
  if (!imageDataUrl) return;
  const queue = getPendingSecurityLogs();
  const id = "pending_log_" + Date.now() + "_" + Math.random().toString(36).slice(2);
  const pendingItem = {
    id,
    image: imageDataUrl,
    timestamp: Date.now(),
    attempts: 0,
    status: "pending_retry"
  };
  queue.push(pendingItem);
  savePendingSecurityLogs(queue);
  console.log("[PendingLogs] Enqueued pending security log for offline sync:", id);
  if (typeof showToast === "function") {
    showToast("Network issue: Security log saved locally. Will auto-upload when online.", "warning");
  }
  return pendingItem;
}
window.enqueuePendingSecurityLog = enqueuePendingSecurityLog;

let isSyncingPendingLogs = false;
async function processPendingSecurityLogs() {
  if (isSyncingPendingLogs) return;
  if (!navigator.onLine) return;
  const queue = getPendingSecurityLogs();
  if (!queue.length) return;

  isSyncingPendingLogs = true;
  console.log(`[PendingLogs] Processing ${queue.length} pending security logs for upload...`);

  const remainingQueue = [];
  let uploadedCount = 0;

  for (const item of queue) {
    if (!navigator.onLine) {
      remainingQueue.push(item);
      continue;
    }
    try {
      item.attempts = (item.attempts || 0) + 1;
      const blob = dataURLtoBlob(item.image);
      const formData = new FormData();
      formData.append("image", blob, `photo_${item.timestamp}.jpg`);

      const token = TokenStore.getToken();
      const headers = {};
      if (token) headers["Authorization"] = `Bearer ${token}`;

      const res = await fetch("/auth/profile/logs", {
        method: "POST",
        headers,
        body: formData
      });

      if (res.ok) {
        const data = await res.json();
        if (data.photo && typeof State !== "undefined" && State) {
          State.securityLogsCache = State.securityLogsCache || {};
          const todayDate = new Date().toISOString().split("T")[0];
          ["me:", `me:${todayDate}`].forEach(k => {
            if (State.securityLogsCache[k]) State.securityLogsCache[k].unshift(data.photo);
          });
          State.securityLogsHistory = State.securityLogsHistory || {};
          if (State.securityLogsHistory["me"]) {
            State.securityLogsHistory["me"].unshift(data.photo);
          } else {
            State.securityLogsHistory["me"] = [data.photo];
          }
        }
        uploadedCount++;
      } else {
        if (item.attempts < 10) {
          remainingQueue.push(item);
        }
      }
    } catch (err) {
      console.warn("[PendingLogs] Retry upload failed for item:", item.id, err);
      if (item.attempts < 10) {
        remainingQueue.push(item);
      }
    }
  }

  savePendingSecurityLogs(remainingQueue);
  isSyncingPendingLogs = false;

  if (uploadedCount > 0) {
    if (typeof showToast === "function") {
      showToast(`Uploaded ${uploadedCount} pending security log${uploadedCount > 1 ? "s" : ""} to cloud!`, "success");
    }
    const activeTab = document.querySelector(".people-tab.active");
    if (activeTab && activeTab.dataset.tab === "logs" && typeof renderPeopleTab === "function") {
      renderPeopleTab("logs");
    }
  }
}
window.processPendingSecurityLogs = processPendingSecurityLogs;

window.addEventListener("online", () => {
  console.log("[Network] Browser came online. Triggering pending security logs sync...");
  processPendingSecurityLogs();
});

async function uploadCapturedPhoto(image) {
  if (!navigator.onLine) {
    enqueuePendingSecurityLog(image);
    return null;
  }

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
      return { Data: data, code: res.status };
    } else {
      enqueuePendingSecurityLog(image);
      return null;
    }
  } catch (err) {
    console.error("Failed to upload captured photo:", err);
    enqueuePendingSecurityLog(image);
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
async function clearChatAPI(userId) {
  const res = await apiRequest("POST", `/api/chat/${userId}/clear`);
  return { Data: res?.data, code: res?.status };
}
window.clearChatAPI = clearChatAPI;
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


