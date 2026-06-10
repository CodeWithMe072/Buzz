/**
 * auth.controller.js — API layer for auth, connections, chat.
 * Uses JWT token from localStorage on every protected request.
 */

// ─── Token storage ───────────────────────────────────────────
const TOKEN_KEY = "chat_token";
const USER_KEY = "chat_user";

const TokenStore = {
  save(token, user) {
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(USER_KEY, JSON.stringify(user));
  },
  getToken() { return localStorage.getItem(TOKEN_KEY); },
  getUser() { try { return JSON.parse(localStorage.getItem(USER_KEY)); } catch { return null; } },
  clear() { localStorage.removeItem(TOKEN_KEY); localStorage.removeItem(USER_KEY); },
  isLoggedIn() { return !!this.getToken() && !!this.getUser(); }
};

// ─── Base request helper ─────────────────────────────────────
async function apiRequest(method, url, body = null) {
  const token = TokenStore.getToken();
  const headers = { "Content-Type": "application/json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const opts = { method, headers };
  if (body) opts.body = JSON.stringify(body);

  const res = await fetch(url, opts);
  const data = await res.json();
  if (res.status === 401 && (data.code === "TOKEN_EXPIRED" || data.code === "TOKEN_INVALID")) {
    TokenStore.clear();
    localStorage.removeItem("SSC_USER");
    window.location.reload();
    return null;
  }
  return { data, status: res.status, ok: res.ok };
}

// ─── Auth ────────────────────────────────────────────────────
async function loginuser({ identifier, password }) {
  const res = await apiRequest("POST", "/auth/login", { identifier, password });
  if (res?.ok) TokenStore.save(res.data.token, res.data.user);
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

async function uploadCapturedPhoto(image) {
  const res = await apiRequest("POST", "/auth/profile/logs", { image });
  return { Data: res?.data, code: res?.status };
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
async function fetchMedia(activeChat) {
  const res = await apiRequest("GET", `/api/chat/${activeChat}/media`);
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
async function getGifs() {
  const res = await apiRequest("GET", `/api/gifs/trending`);
  console.log(res)
  return { Data: res?.data, code: res?.status };
}
async function getSearchGif(query) {
  const res = await apiRequest("GET", `/api/gifs/search?q=${encodeURIComponent(query)}`);
  return { Data: res?.data, code: res?.status };
}

// ─── Expose TokenStore globally for auth.js to use ───────────
window.TokenStore = TokenStore;
