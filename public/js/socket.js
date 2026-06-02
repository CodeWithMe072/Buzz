/**
 * socket.js — Socket.io connection, all socket event handlers,
 *             connection banner, outbox/upload flush, and status helpers.
 */

// =============================================================================
// CONNECTION BANNER
// =============================================================================
function updateConnectionBanner(customMsg = null) {
    let banner = document.getElementById("connection-banner");
    if (!banner) {
        banner = document.createElement("div");
        banner.id = "connection-banner";
        banner.style.cssText = `
            position: fixed; top: 0; left: 0; right: 0; z-index: 9999;
            padding: 8px 16px; font-size: 13px; text-align: center;
            font-weight: 500; transition: all 0.3s ease; display: none;
        `;
        document.body.prepend(banner);
    }

    if (NetworkMonitor.canSend) {
        banner.style.display = "none";
    } else if (!NetworkMonitor.isOnline) {
        banner.textContent = "You are offline. Messages will send when you reconnect.";
        banner.style.background = "#e53e3e";
        banner.style.color = "#fff";
        banner.style.display = "block";
    } else {
        banner.textContent = customMsg || "Reconnecting to server...";
        banner.style.background = "#d69e2e";
        banner.style.color = "#fff";
        banner.style.display = "block";
    }
}

// =============================================================================
// STATUS ICON HELPER
// =============================================================================
function updateStatusIcon(tempId, status) {
    const msgEl = document.querySelector(`.message[data-message-id="${tempId}"] .message-bubble`);
    if (!msgEl) return;
    const statusEl = msgEl.querySelector(".message-status");
    if (!statusEl) return;

    if (status.seen) {
        statusEl.innerHTML = `<svg class="status-icon double seen" viewBox="0 0 16 16" style="transform:translateX(3px)">
            <polyline points="2 8 6 12 14 4"/>
            <polyline points="5 8 9 12 17 4" style="transform:translate(-9px,0)"/>
        </svg>`;
    } else if (status.delivered) {
        statusEl.innerHTML = `<svg class="status-icon double delivered" viewBox="0 0 16 16">
            <polyline points="2 8 6 12 14 4"/>
            <polyline points="5 8 9 12 17 4" style="transform:translate(-9px,0)"/>
        </svg>`;
    } else if (status.sent) {
        statusEl.innerHTML = `<svg class="status-icon single sent" viewBox="0 0 16 16">
            <polyline points="2 8 6 12 14 4"/>
        </svg>`;
    } else {
        statusEl.innerHTML = `<svg class="status-icon clock" viewBox="0 0 16 16">
            <circle cx="8" cy="8" r="6.5"/>
            <polyline points="8 4 8 8 11 10"/>
        </svg>`;
    }
}

// =============================================================================
// SEEN HELPERS
// =============================================================================
function markSeen(message) {
    if (!message?.status?.delivered || message.status.seen) return;
    message.status.seen = true;
    const id = message.id || message.tempId;
    const msgEl = document.querySelector(`.message[data-message-id="${id}"] .message-bubble`);
    if (!msgEl) return;
    const statusEl = msgEl.querySelector(".message-status");
    if (!statusEl) return;
    statusEl.innerHTML = `
        <svg class="status-icon double seen" viewBox="0 0 16 16">
            <polyline points="2 8 6 12 14 4"/>
            <polyline points="5 8 9 12 17 4" style="transform: translate(-9px,0px);"/>
        </svg>`;
}

function updateMessageSeenByTempId(chatId, tempId = null) {
    const msgs = State.messages[chatId] || [];
    if (tempId) {
        const msg = msgs.find(m => m.id == tempId || m.tempId == tempId);
        if (msg) markSeen(msg);
    } else {
        msgs.forEach(markSeen);
    }
}

// =============================================================================
// FLUSH OUTBOX — retry queued text messages after reconnect
// =============================================================================
function flushOutbox() {
    const pending = OutboxQueue.getAll();
    if (!pending.length) return;

    pending.forEach(item => {
        if (item.retries >= MAX_RETRIES) {
            updateMessageByTempId(item.tempId, { uploadStatus: "failed" });
            OutboxQueue.remove(item.tempId);
            showToast("A message could not be sent after multiple retries.", "error");
            return;
        }
        item.retries++;
        socket.emit("private_message", {
            message: {
                tempId: item.tempId,
                to: item.to,
                type: item.type,
                content: item.content,
                caption: item.caption,
                fileName: item?.fileName || null,
                fileSize: item?.fileSize || null,
                replyTo: item.replyTo,
                clientTime: item.clientTime
            }
        });
    });
}

// =============================================================================
// FLUSH UPLOAD QUEUE — retry failed media uploads after reconnect
// =============================================================================
function flushUploadQueue() {
    const pending = UploadQueue.getAll();
    if (!pending.length) return;

    pending.forEach(item => {
        if (item.retries >= MAX_RETRIES) {
            updateMessageByTempId(item.msgId, { uploadStatus: "failed" });
            UploadQueue.remove(item.msgId);
            showToast("A media upload failed after multiple retries.", "error");
            return;
        }
        item.retries++;
        if (item.type === "audio") {
            uploadAudio(item.msgId, item.receiver, item.blob).catch(() => { });
        } else {
            uploadMedia(item.msgId, item.receiver, item.file).catch(() => { });
        }
    });
}

// =============================================================================
// INIT SOCKET — registers all socket event handlers
// =============================================================================
function initSocket() {
    const tone = new Audio("/tone/notices.mp3");

    /* ─── INCOMING PRIVATE MESSAGE ─── */
    socket.on("private_message", (msg) => {
        if (State.playTune && msg.from !== State.activeChat) {
            tone.currentTime = 0;
            tone.play().catch(() => { });
        }

        const message = {
            id: msg.id,
            type: msg.type,
            content: msg.content,
            cover: msg.cover || null,
            thumb: msg.thumb || null,
            fileName: msg.fileName || null,
            fileSize: msg.fileSize || null,
            caption: msg.caption,
            sender: "other",
            timestamp: msg.timestamp,
            user: msg.from,
            replyTo: msg.replyTo,
            reactions: {},
            status: { sent: true, delivered: true, seen: false }
        };

        if (!State.messages[message.user]) State.messages[message.user] = [];

        // Duplicate check — skip if already loaded from API
        const alreadyExists = State.messages[message.user].some(
            m => m.id === message.id || m.tempId === message.id
        );
        if (alreadyExists) {
            socket.emit("message:received", { tempId: msg.id });
            return;
        }

        State.messages[message.user].unshift(message);
        State.messageIndex[message.id] = message.user;
        socket.emit("message:received", { tempId: msg.id });

        if (message.user === State.activeChat) {
            const messagesContainer = document.getElementById('messages');
            messagesContainer.appendChild(createMessageElement(message));
            document.getElementById('messages-container').scrollTop = 99999;

            if (message.type === "image" || message.type === "video") {
                attactEventOnMedia();
                if (viewer && message.content) viewer.addItem(message);
            }
            socket.emit("chat:seen", { from: State.activeChat });
        }

        const conv = State.conversations.find(c => c.id === message.user);
        if (conv) {
            conv.lastMessage = message.type === 'text' ? message.content : `📷 ${message.type}`;
            conv.timestamp = message.timestamp;
            conv.unread = (State.activeChat === message.user) ? 0 : (conv.unread ? conv.unread + 1 : 1);
        }
        renderChatList();
    });

    /* ─── SYNC: message sent from another device ─── */
    socket.on("private_message_sync", (msg) => {
        if (!State.messages[msg.to]) State.messages[msg.to] = [];

        const exists = State.messages[msg.to].find(m => (m.tempId || m.id) === msg.tempId);
        if (exists) return;

        const message = {
            tempId: msg.tempId,
            type: msg.type,
            content: msg.content,
            cover: msg.cover || null,
            thumb: msg.thumb || null,
            caption: msg.caption,
            timestamp: msg.timestamp,
            user: State.currentUser.id,
            replyTo: null,
            reactions: {},
            status: { sent: true, delivered: false, seen: false }
        };

        State.messages[msg.to].unshift(message);
        State.messageIndex[msg.tempId] = msg.to;

        if (State.activeChat === msg.to) {
            const messagesContainer = document.getElementById('messages');
            messagesContainer.appendChild(createMessageElement(message));
            document.getElementById('messages-container').scrollTop = 99999;
        }

        const conv = State.conversations.find(c => c.id === msg.to);
        if (conv) {
            conv.lastMessage = msg.type === 'text' ? msg.content : `📷 ${msg.type}`;
            conv.timestamp = msg.timestamp;
        }
        renderChatList();
    });

    /* ─── MESSAGE ACK ─── */
    socket.on("message_ack", ({ tempId, status }) => {
        if (status === "sent") {
            OutboxQueue.remove(tempId);
            const chatId = State.messageIndex[tempId];
            if (!chatId) return;
            const msg = (State.messages[chatId] || []).find(m => (m.tempId || m.id) === tempId);
            if (msg) {
                msg.status = { ...msg.status, sent: true };
                updateStatusIcon(tempId, msg.status);
            }
        }
    });

    /* ─── MESSAGE SAVE FAILED ─── */
    socket.on("message_save_failed", ({ tempId }) => {
        updateMessageByTempId(tempId, { uploadStatus: "failed" });
        showToast("Message failed to save. Will retry automatically.", "error");
    });

    /* ─── DELIVERY CONFIRMED ─── */
    socket.on("message:delivered", ({ tempId }) => {
        updateMessageByTempId(tempId, { status: { sent: true, delivered: true, seen: false } });
    });

    /* ─── SEEN ─── */
    socket.on("message:seen", ({ by }) => {
        updateMessageSeenByTempId(by);
    });

    /* ─── TYPING ─── */
    socket.on("typing:start", ({ user }) => {
        if (user === State.activeChat) showTypingIndicator(true);
    });
    socket.on("typing:stop", ({ user }) => {
        if (user === State.activeChat) showTypingIndicator(false);
    });

    /* ─── ONLINE STATUS ─── */
    socket.on("online:list", ({ users }) => {
        State.conversations.forEach(conv => { conv.online = users.includes(conv.id); });
        renderChatList();
    });

    socket.on("user:online", ({ userId }) => {
        const conv = State.conversations.find(c => c.id === userId);
        if (!conv) return;
        conv.online = true;
        if (conv.id === State.activeChat) {
            const statusEl = document.getElementById('online-status');
            statusEl.textContent = 'Active now';
            statusEl.className = 'online-status online';
        }
        renderChatList();
    });

    socket.on("user:offline", ({ userId }) => {
        const conv = State.conversations.find(c => c.id === userId);
        if (!conv) return;
        conv.online = false;
        conv.lastSeen = Date.now();
        if (conv.id === State.activeChat) {
            const statusEl = document.getElementById('online-status');
            const lastseen = formatTime(conv.lastSeen);
            statusEl.textContent = lastseen === "Just now" ? "Just now" : `Last seen ${lastseen} ago`;
            statusEl.className = 'online-status';
        }
        renderChatList();
    });

    /* ─── MEDIA UPLOADED ─── */
    socket.on("media:uploaded", ({ tempId, url, cover, thumb, mediaType }) => {
        const chatId = State.messageIndex[tempId];
        if (!chatId) return;

        const msgs = State.messages[chatId] || [];
        const msg = msgs.find(m => (m.tempId || m.id) === tempId);
        if (!msg) return;

        msg.content = url;
        msg.cover = cover ?? null;
        msg.thumb = thumb ?? null;
        msg.type = mediaType;
        msg.uploadStatus = "uploaded";

        if (State.activeChat === chatId) {
            if (msg.user === State.currentUser.id || msg.user === State.currentUser.username) {
                updateMediaDOM(tempId, { content: url, cover, thumb, type: mediaType, uploadStatus: "uploaded" });
            } else {
                updateReceivedMediaDOM(tempId, { content: url, cover, thumb, type: mediaType });
            }
        }
    });

    /* ─── CONNECT ─── */
    socket.on("connect", () => {
        NetworkMonitor.isSocketConnected = true;
        updateConnectionBanner();
        setTimeout(() => {
            if (!State.apiMessagesLoaded) {
                socket.emit("sync:delivered");
            } else {
                State.apiMessagesLoaded = false;
            }
            flushOutbox();
            flushUploadQueue();
        }, 500);
    });

    /* ─── DISCONNECT ─── */
    socket.on("disconnect", (reason) => {
        NetworkMonitor.isSocketConnected = false;
        const hardDisconnect = reason === "io client disconnect" || reason === "io server disconnect";
        if (hardDisconnect) {
            updateConnectionBanner();
            return;
        }
        updateConnectionBanner();
    });

    socket.on("reconnect_attempt", (attempt) => {
        updateConnectionBanner(`Reconnecting... (attempt ${attempt})`);
    });

    socket.on("reconnect_failed", () => {
        updateConnectionBanner("Connection failed. Check your network.");
    });

    /* ─── PAGE VISIBILITY ─── */
    document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "visible" && socket && !socket.connected) {
            socket.connect();
        }
    });

    /* ─── BROWSER ONLINE/OFFLINE ─── */
    window.addEventListener("online", () => {
        if (socket && !socket.connected) socket.connect();
    });
    window.addEventListener("offline", () => { /* socket.io handles via ping timeout */ });
}

// Direct socket emit helper (kept for compatibility)
function sendsocketMessage(message) {
    socket.emit("private_message", { message });
}

function handleTyping() {
    const to = State.activeChat;
    if (!to) return;

    if (!State.typingTimeouts[to]) {
        State.typingTimeouts[to] = { isTyping: false, stopTimeout: null };
    }

    const typingState = State.typingTimeouts[to];

    if (!typingState.isTyping) {
        socket.emit("typing:start", { to });
        typingState.isTyping = true;
    }

    clearTimeout(typingState.stopTimeout);
    typingState.stopTimeout = setTimeout(() => {
        socket.emit("typing:stop", { to });
        typingState.isTyping = false;
    }, 1000);
}
