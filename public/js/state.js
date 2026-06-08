/**
 * state.js — App-wide state, config, and queue managers
 */

const BACKEND_URL = "";

let socket = null;
let viewer = null;

const State = {
  currentUser:      null,   // { id, username, avatar, email }
  activeChat:       null,   // userId string of open chat
  conversations:    [],     // accepted connections with last-message info
  messages:         {},     // { [userId]: Message[] }
  typingTimeouts:   {},
  replyingTo:       null,
  longPressTimeout: null,
  touchStartX:      0,
  touchStartY:      0,
  isSwiping:        false,
  playTune:         true,
  messageIndex:     {},     // { [tempId/id]: userId }
  apiMessagesLoaded: false,

  // ── Connections ──────────────────────────────────────────
  pendingRequests:  [],   // incoming { connectionId, from, sentAt }
  sentRequests:     [],   // outgoing { connectionId, to, sentAt }
  contacts:         [],   // accepted { connectionId, user, since }
};

// ── Upload Manager ──────────────────────────────────────────
const UploadManager = {
  queue:     [],
  uploading: false,
  add(task)  { this.queue.push(task); this.process(); },
  async process() {
    if (this.uploading) return;
    const next = this.queue.shift();
    if (!next) return;
    this.uploading = true;
    try { await next(); } catch(e) { console.error("Upload failed:", e); }
    finally { this.uploading = false; this.process(); }
  }
};

const UploadControllers = {};

// ── Outbox Queue ────────────────────────────────────────────
const OutboxQueue = {
  _queue: [],
  add(msg)       { this._queue.push({ ...msg, retries: 0 }); },
  remove(tempId) { this._queue = this._queue.filter(m => m.tempId !== tempId); },
  getAll()       { return [...this._queue]; },
  has(tempId)    { return this._queue.some(m => m.tempId === tempId); }
};

// ── Upload Queue ────────────────────────────────────────────
const UploadQueue = {
  _queue: {},
  add(tempId, data)  { this._queue[tempId] = { ...data, retries: 0 }; },
  remove(tempId)     { delete this._queue[tempId]; },
  get(tempId)        { return this._queue[tempId] || null; },
  getAll()           { return Object.values(this._queue); }
};

// ── Network Monitor ─────────────────────────────────────────
const NetworkMonitor = {
  isOnline:         navigator.onLine,
  isSocketConnected: false,
  init() {
    window.addEventListener("online",  () => this._setOnline(true));
    window.addEventListener("offline", () => this._setOnline(false));
  },
  _setOnline(val) {
    this.isOnline = val;
    updateConnectionBanner();
    if (val && socket && !socket.connected) socket.connect();
  },
  get canSend() { return this.isOnline && this.isSocketConnected; }
};

// ── Audio / Recording ───────────────────────────────────────
let currentStream      = null;
let mediaRecorder      = null;
let audioChunks        = [];
let isRecording        = false;
let recordingStartTime = 0;
let recordingTimer     = null;
let audioContext       = null;
let analyser           = null;
let animationId        = null;
const audioPlayers     = new Map();

// ── Constants ───────────────────────────────────────────────
const EMOJI_LIST  = ["❤️","👍","😂","😮","😢","🙏","🔥","🎉","👏","💯","✨","💪","🤔","😍","🥳","😎"];
const MAX_RETRIES = 5;
