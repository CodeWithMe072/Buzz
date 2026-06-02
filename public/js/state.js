/**
 * state.js — App-wide state, config, and queue managers
 * Shared across all modules via globals.
 */

// =============================================================================
// CONFIG
// =============================================================================
const BACKEND_URL = "";

// =============================================================================
// APP STATE
// =============================================================================
let socket = null;
let viewer = null;

const State = {
    currentUser: null,
    activeChat: null,
    conversations: [],
    messages: {},
    typingTimeouts: {},
    replyingTo: null,
    longPressTimeout: null,
    touchStartX: 0,
    touchStartY: 0,
    isSwiping: false,
    allusers: [],
    playTune: true,
    messageIndex: {},
    apiMessagesLoaded: false
};

// =============================================================================
// UPLOAD MANAGER — serial queue for media uploads
// =============================================================================
const UploadManager = {
    queue: [],
    uploading: false,

    add(task) {
        this.queue.push(task);
        this.process();
    },

    async process() {
        if (this.uploading) return;
        const next = this.queue.shift();
        if (!next) return;
        this.uploading = true;
        try {
            await next();
        } catch (err) {
            console.error("Upload failed:", err);
        } finally {
            this.uploading = false;
            this.process();
        }
    }
};

const UploadControllers = {};

// =============================================================================
// OUTBOX QUEUE — unsent text messages, retried on reconnect
// =============================================================================
const OutboxQueue = {
    _queue: [],

    add(msg) {
        this._queue.push({ ...msg, retries: 0 });
    },
    remove(tempId) {
        this._queue = this._queue.filter(m => m.tempId !== tempId);
    },
    getAll() {
        return [...this._queue];
    },
    has(tempId) {
        return this._queue.some(m => m.tempId === tempId);
    }
};

// =============================================================================
// UPLOAD QUEUE — pending media blobs, retried on reconnect
// =============================================================================
const UploadQueue = {
    _queue: {},

    add(tempId, data) {
        this._queue[tempId] = { ...data, retries: 0 };
    },
    remove(tempId) {
        delete this._queue[tempId];
    },
    get(tempId) {
        return this._queue[tempId] || null;
    },
    getAll() {
        return Object.values(this._queue);
    }
};

// =============================================================================
// NETWORK MONITOR
// =============================================================================
const NetworkMonitor = {
    isOnline: navigator.onLine,
    isSocketConnected: false,

    init() {
        window.addEventListener('online', () => this._setOnline(true));
        window.addEventListener('offline', () => this._setOnline(false));
    },

    _setOnline(val) {
        this.isOnline = val;
        updateConnectionBanner();
        if (val && socket && !socket.connected) socket.connect();
    },

    get canSend() {
        return this.isOnline && this.isSocketConnected;
    }
};

// =============================================================================
// AUDIO RECORDING STATE
// =============================================================================
let currentStream = null;
let mediaRecorder = null;
let audioChunks = [];
let isRecording = false;
let recordingStartTime = 0;
let recordingTimer = null;
let audioContext = null;
let analyser = null;
let animationId = null;

const audioPlayers = new Map();

// =============================================================================
// CONSTANTS
// =============================================================================
const EMOJI_LIST = ['❤️', '👍', '😂', '😮', '😢', '🙏', '🔥', '🎉', '👏', '💯', '✨', '💪', '🤔', '😍', '🥳', '😎'];
const MAX_RETRIES = 5;
