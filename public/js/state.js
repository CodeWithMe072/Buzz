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
  onlineUsers:      [],

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
  async init() {
    if (window.IndexedDBQueueService) {
      try {
        const unsent = await IndexedDBQueueService.getAllUnsent();
        this._queue = unsent
          .filter(m => m.status !== "uploading" && !m.mediaBlob)
          .map(m => ({
            tempId: m.localId,
            to: m.conversationId,
            type: m.type,
            content: m.payload,
            caption: m.mediaMeta?.caption || null,
            fileName: m.mediaMeta?.fileName || null,
            fileSize: m.mediaMeta?.fileSize || null,
            cover: m.mediaMeta?.cover || null,
            thumb: m.mediaMeta?.thumb || null,
            replyTo: m.mediaMeta?.replyTo || null,
            clientTime: m.createdAt,
            cameraFacing: m.mediaMeta?.cameraFacing || null,
            cameraFilter: m.mediaMeta?.cameraFilter || null,
            isDisappearing: m.mediaMeta?.isDisappearing || false,
            retries: m.retryCount || 0
          }));
      } catch (err) {
        console.error("OutboxQueue init failed:", err);
      }
    }
  },
  add(msg) {
    const item = { ...msg, retries: msg.retries || 0 };
    // Prevent duplicates in memory
    if (!this.has(msg.tempId)) {
      this._queue.push(item);
    }
    if (window.IndexedDBQueueService) {
      IndexedDBQueueService.saveMessage({
        localId: msg.tempId,
        conversationId: msg.to,
        type: msg.type,
        payload: msg.content,
        mediaBlob: null,
        mediaMeta: {
          fileName: msg.fileName || null,
          fileSize: msg.fileSize || null,
          replyTo: msg.replyTo || null,
          caption: msg.caption || null,
          cover: msg.cover || null,
          thumb: msg.thumb || null,
          isDisappearing: msg.isDisappearing || false,
          cameraFacing: msg.cameraFacing || null,
          cameraFilter: msg.cameraFilter || null
        },
        status: "pending",
        createdAt: msg.clientTime || Date.now(),
        retryCount: item.retries
      }).catch(console.error);
    }
  },
  remove(tempId) {
    this._queue = this._queue.filter(m => m.tempId !== tempId);
    if (window.IndexedDBQueueService) {
      IndexedDBQueueService.deleteMessage(tempId).catch(console.error);
    }
  },
  getAll()       { return [...this._queue]; },
  has(tempId)    { return this._queue.some(m => m.tempId === tempId); }
};

// ── Upload Queue ────────────────────────────────────────────
const UploadQueue = {
  _queue: {},
  async init() {
    if (window.IndexedDBQueueService) {
      try {
        const unsent = await IndexedDBQueueService.getAllUnsent();
        const mediaUnsent = unsent.filter(m => m.status === "uploading" || m.status === "queued" || m.status === "failed_upload" || (m.status === "pending" && m.mediaBlob));
        for (const m of mediaUnsent) {
          this._queue[m.localId] = {
            msgId: m.localId,
            tempId: m.localId,
            receiver: m.conversationId,
            file: m.mediaBlob,
            blob: m.mediaBlob,
            type: m.type,
            fileId: m.fileId || null,
            retries: m.retryCount || 0,
            isDisappearing: m.mediaMeta?.isDisappearing || false,
            cameraFacing: m.mediaMeta?.cameraFacing || null,
            cameraFilter: m.mediaMeta?.cameraFilter || null
          };
        }
      } catch (err) {
        console.error("UploadQueue init failed:", err);
      }
    }
  },
  add(tempId, data)  {
    const fileId = data.fileId || `${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const retries = data.retries || 0;
    this._queue[tempId] = { ...data, fileId, retries };
    if (window.IndexedDBQueueService) {
      const isAudio = data.type === "audio";
      IndexedDBQueueService.saveMessage({
        localId: tempId,
        conversationId: data.receiver,
        type: data.type,
        payload: null,
        mediaBlob: data.file || data.blob,
        fileId: fileId,
        mediaMeta: {
          fileName: data.file?.name || (isAudio ? "voice.webm" : "file"),
          fileSize: data.file?.size || data.blob?.size || 0,
          mimeType: data.file?.type || data.blob?.type || (isAudio ? "audio/webm" : ""),
          replyTo: data.replyTo || null,
          caption: data.caption || null,
          cover: data.cover || null,
          thumb: data.thumb || null,
          duration: data.duration || null,
          fileId: fileId,
          isDisappearing: data.isDisappearing || false,
          cameraFacing: data.cameraFacing || null,
          cameraFilter: data.cameraFilter || null
        },
        status: "uploading",
        chunkTotal: data.file ? Math.ceil(data.file.size / (2 * 1024 * 1024)) : null,
        chunksAcked: [],
        createdAt: Date.now(),
        retryCount: retries
      }).catch(console.error);
    }
  },
  remove(tempId)     {
    delete this._queue[tempId];
    if (window.IndexedDBQueueService) {
      IndexedDBQueueService.deleteMessage(tempId).catch(console.error);
    }
  },
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
