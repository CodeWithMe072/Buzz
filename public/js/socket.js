/**
 * socket.js — Socket.io handlers. JWT auth is passed on connect in auth.js.
 * This file wires all event handlers after socket is created.
 */

// =============================================================================
// CONNECTION BANNER
// =============================================================================
function updateConnectionBanner(customMsg = null) {
  let banner = document.getElementById("connection-banner");
  if (!banner) {
    banner = document.createElement("div");
    banner.id = "connection-banner";
    banner.style.cssText = `position:fixed;top:0;left:0;right:0;z-index:9999;
      padding:8px 16px;font-size:13px;text-align:center;font-weight:500;
      transition:all 0.3s ease;display:none;`;
    document.body.prepend(banner);
  }
  if (NetworkMonitor.canSend) {
    banner.style.display = "none";
  } else if (!NetworkMonitor.isOnline) {
    banner.textContent = "You are offline. Messages will send when you reconnect.";
    banner.style.cssText += "background:#e53e3e;color:#fff;display:block;";
  } else {
    banner.textContent = customMsg || "Reconnecting to server...";
    banner.style.cssText += "background:#d69e2e;color:#fff;display:block;";
  }
}

// =============================================================================
// STATUS ICON HELPER
// =============================================================================
function updateStatusIcon(tempId, status) {
  const msgEl = document.querySelector(`.message[data-message-id="${tempId}"] .message-bubble`);
  if (!msgEl) return;
  const wrap = msgEl.querySelector(".msg-status-wrap");
  if (!wrap) return;
  if (status.seen) {
    wrap.innerHTML = `<svg class="status-icon double seen" viewBox="0 0 16 16" style="transform:translateX(3px)"><polyline points="2 8 6 12 14 4"/><polyline points="5 8 9 12 17 4" style="transform:translate(-9px,0)"/></svg>`;
  } else if (status.delivered) {
    wrap.innerHTML = `<svg class="status-icon double delivered" viewBox="0 0 16 16"><polyline points="2 8 6 12 14 4"/><polyline points="5 8 9 12 17 4" style="transform:translate(-9px,0)"/></svg>`;
  } else if (status.sent) {
    wrap.innerHTML = `<svg class="status-icon single sent" viewBox="0 0 16 16"><polyline points="2 8 6 12 14 4"/></svg>`;
  } else {
    wrap.innerHTML = `<svg class="status-icon clock" viewBox="0 0 16 16"><circle cx="8" cy="8" r="6.5"/><polyline points="8 4 8 8 11 10"/></svg>`;
  }
}

// =============================================================================
// SEEN HELPERS
// =============================================================================
function markSeen(message) {
  if (!message) return;
  // Mark even if not yet "delivered" — seen implies delivered
  if (message.status?.seen) return;
  if (message.status) {
    message.status.seen      = true;
    message.status.delivered = true;
  }
  const id = message.id || message.tempId;
  const msgEl = document.querySelector(`.message[data-message-id="${id}"] .message-bubble`);
  if (!msgEl) return;
  const wrap = msgEl.querySelector(".msg-status-wrap");
  if (!wrap) return;
  wrap.innerHTML = `<svg class="status-icon double seen" viewBox="0 0 16 16"><polyline points="2 8 6 12 14 4"/><polyline points="5 8 9 12 17 4" style="transform:translate(-9px,0px);"/></svg>`;
}

// chatId = the conversation partner's userId
// tempId = optional specific message id
function updateMessageSeenByTempId(chatId, tempId = null) {
  const msgs = State.messages[chatId] || [];
  // only update messages WE sent (sender = "me")
  const mine = msgs.filter(m => m.sender === "me" || m.user?.toString() === State.currentUser?.id?.toString());
  if (tempId) {
    const msg = mine.find(m => m.id === tempId || m.tempId === tempId);
    if (msg && msg.status?.sent && msg.uploadStatus !== "uploading") markSeen(msg);
  } else {
    mine.forEach(m => {
      if (m.status?.sent && m.uploadStatus !== "uploading") {
        markSeen(m);
      }
    });
  }
}

// =============================================================================
// FLUSH OUTBOX
// =============================================================================
function flushOutbox() {
  OutboxQueue.getAll().forEach(item => {
    if (item.retries >= MAX_RETRIES) {
      updateMessageByTempId(item.tempId, { uploadStatus: "failed" });
      OutboxQueue.remove(item.tempId);
      showToast("A message could not be sent after multiple retries.", "error");
      return;
    }
    item.retries++;
    socket.emit("private_message", {
      message: {
        tempId: item.tempId, to: item.to, type: item.type,
        content: item.content, caption: item.caption,
        fileName: item.fileName || null, fileSize: item.fileSize || null,
        replyTo: item.replyTo, clientTime: item.clientTime
      }
    });
  });
}

// =============================================================================
// FLUSH UPLOAD QUEUE
// =============================================================================
function flushUploadQueue() {
  UploadQueue.getAll().forEach(item => {
    if (item.retries >= MAX_RETRIES) {
      updateMessageByTempId(item.msgId, { uploadStatus: "failed" });
      UploadQueue.remove(item.msgId);
      showToast("A media upload failed after multiple retries.", "error");
      return;
    }
    item.retries++;
    if (item.type === "audio") uploadAudio(item.msgId, item.receiver, item.blob).catch(() => {});
    else uploadMedia(item.msgId, item.receiver, item.file).catch(() => {});
  });
}

// =============================================================================
// INIT SOCKET — all event handlers
// =============================================================================
function initSocket() {
  const tone = new Audio("/tone/notices.mp3");

  // ── Connection error (token expired/invalid) ──────────────
  socket.on("connect_error", (err) => {
    console.error("[Socket] connect_error:", err.message);
    if (err.message.includes("UNAUTHORIZED") || err.message.includes("TOKEN_EXPIRED")) {
      showToast("Session expired. Please log in again.", "error");
      // setTimeout(logout, 1500);
    }
    NetworkMonitor.isSocketConnected = false;
    updateConnectionBanner();
  });

  // ── Connected ─────────────────────────────────────────────
  socket.on("connect", () => {
    NetworkMonitor.isSocketConnected = true;
    updateConnectionBanner();
    // Only flush queues on reconnect (not first connect — nothing is queued yet)
    if (State.apiMessagesLoaded) {
      socket.emit("sync:delivered");
      flushOutbox();
      flushUploadQueue();
    }
  });

  socket.on("disconnect", () => {
    NetworkMonitor.isSocketConnected = false;
    updateConnectionBanner();
  });

  socket.on("reconnect", () => {
    NetworkMonitor.isSocketConnected = true;
    updateConnectionBanner();
    flushOutbox();
    flushUploadQueue();
  });

  // ── Online list ───────────────────────────────────────────
  socket.on("online:list", ({ users }) => {
    State.conversations.forEach(conv => {
      conv.online = users.includes(conv.id);
    });
    renderChatList(document.getElementById("chat-search")?.value.trim().toLowerCase() || "");
  });

  socket.on("user:online", ({ userId }) => {
    const conv = State.conversations.find(c => c.id === userId);
    if (conv) {
      conv.online = true;
      renderChatList();
    }
    if (State.activeChat === userId) {
      const statusEl = document.getElementById("online-status");
      if (statusEl) { statusEl.textContent = "Active now"; statusEl.className = "online-status online"; }
    }
  });

  socket.on("user:offline", ({ userId }) => {
    const conv = State.conversations.find(c => c.id === userId);
    if (conv) {
      conv.online  = false;
      conv.lastSeen = new Date();
      renderChatList();
    }
    if (State.activeChat === userId) {
      const statusEl = document.getElementById("online-status");
      if (statusEl) { statusEl.textContent = "Just now"; statusEl.className = "online-status"; }
    }
  });

  // ── Incoming private message ──────────────────────────────
  socket.on("private_message", (msg) => {
    // Normalize all IDs to strings
    const fromId = msg.from?.toString();
    const myId   = State.currentUser.id?.toString();

    if (State.playTune && fromId !== State.activeChat) {
      tone.currentTime = 0;
      tone.play().catch(() => {});
    }

    const message = {
      id:        msg.id?.toString(),
      type:      msg.type,
      content:   msg.content,
      cover:     msg.cover   || null,
      thumb:     msg.thumb   || null,
      fileName:  msg.fileName || null,
      fileSize:  msg.fileSize || null,
      caption:   msg.caption || null,
      sender:    fromId === myId ? "me" : "other",
      timestamp: msg.timestamp,
      user:      fromId,
      replyTo:   msg.replyTo || null,
      reactions: {},
      status:    { sent: true, delivered: true, seen: false },
      callType:  msg.callType,
      callStatus: msg.callStatus,
      callRoomId: msg.callRoomId,
      callExpiresAt: msg.callExpiresAt,
      callDuration: msg.callDuration
    };

    if (!State.messages[message.user]) State.messages[message.user] = [];

    const exists = State.messages[message.user].some(m =>
      m.id?.toString() === message.id || m.tempId?.toString() === message.id
    );
    if (exists) {
      socket.emit("message:received", { tempId: msg.id });
      return;
    }

    State.messages[message.user].unshift(message);
    State.messageIndex[message.id] = message.user;
    socket.emit("message:received", { tempId: msg.id });

    if (message.user === State.activeChat) {
      const mc = document.getElementById("messages");
      mc.appendChild(createMessageElement(message));
      document.getElementById("messages-container").scrollTop = 99999;
      if (message.type === "image" || message.type === "video") {
        attactEventOnMedia();
        if (viewer) viewer.addItem(message);
      }
      socket.emit("chat:seen", { from: message.user });
    }

    // Update chat list last message
    const conv = State.conversations.find(c => c.id === message.user);
    if (conv) {
      conv.lastMessage = message.type === "text" ? message.content : `📷 ${message.type}`;
      conv.timestamp   = message.timestamp;
      conv.unread = message.user !== State.activeChat ? (conv.unread || 0) + 1 : 0;
    }
    renderChatList(document.getElementById("chat-search")?.value.trim().toLowerCase() || "");
  });

  // ── Message ack / delivery / seen ────────────────────────
  socket.on("message_ack", ({ tempId, status }) => {
    OutboxQueue.remove(tempId);
    updateMessageByTempId(tempId, { status: { sent: true } });
    updateStatusIcon(tempId, { sent: true });
  });

  socket.on("message:delivered", ({ tempId }) => {
    // Find message in state and update it
    const chatId = State.messageIndex[tempId];
    if (chatId) {
      const msgs = State.messages[chatId] || [];
      const msg = msgs.find(m => m.id === tempId || m.tempId === tempId);
      if (msg && msg.status) msg.status.delivered = true;
    }
    updateStatusIcon(tempId, { delivered: true });
  });

  socket.on("message:seen", ({ by }) => {
    // "by" = the userId of the person who saw our messages
    updateMessageSeenByTempId(by);
  });

  socket.on("chat:seen_sync", ({ from }) => {
    // Our own other device tells us messages FROM "from" were seen
    updateMessageSeenByTempId(from);
  });

  // ── Media uploaded ────────────────────────────────────────
  socket.on("media:uploaded", ({ tempId, url, mediaType, cover, thumb }) => {
    updateMessageByTempId(tempId, { content: url, type: mediaType, cover, thumb, uploadStatus: "done" });
    updateReceivedMediaDOM(tempId, { content: url, cover, thumb, type: mediaType });
  });

  // ── Typing ────────────────────────────────────────────────
  socket.on("typing:start", ({ user }) => {
    if (user !== State.activeChat) return;
    const t = document.getElementById("typing-indicator");
    if (t) t.style.display = "flex";
    document.getElementById("messages-container").scrollTop = 99999;
    clearTimeout(State.typingTimeouts[user]);
    State.typingTimeouts[user] = setTimeout(() => { if (t) t.style.display = "none"; }, 3000);
  });

  socket.on("typing:stop", ({ user }) => {
    if (user !== State.activeChat) return;
    const t = document.getElementById("typing-indicator");
    if (t) t.style.display = "none";
  });

  // ── Reactions ─────────────────────────────────────────────
  socket.on("reaction", ({ messageId, userId, emoji }) => {
    const chatId = State.messageIndex[messageId];
    if (!chatId) return;
    const msg = (State.messages[chatId] || []).find(m => (m.id || m.tempId) === messageId);
    if (!msg) return;
    if (!msg.reactions) msg.reactions = {};
    msg.reactions[userId] = emoji;
    const msgEl = document.querySelector(`.message[data-message-id="${messageId}"]`);
    if (!msgEl) return;
    let reactionsEl = msgEl.querySelector(".message-reactions");
    if (!reactionsEl) {
      reactionsEl = document.createElement("div");
      reactionsEl.className = "message-reactions";
      msgEl.querySelector(".message-bubble")?.appendChild(reactionsEl);
    }
    const counts = {};
    Object.values(msg.reactions).forEach(e => { counts[e] = (counts[e] || 0) + 1; });
    reactionsEl.innerHTML = Object.entries(counts)
      .map(([e, n]) => `<span class="reaction-badge">${e}${n > 1 ? " " + n : ""}</span>`)
      .join("");
  });

  // ── Connection request notifications ─────────────────────
  socket.on("connection:new_request", async ({ from }) => {
    // Refresh from API to get the real connectionId (socket payload doesn't have it)
    await refreshPendingRequests();
    showToast(`${from.username} wants to connect with you!`, "info");
    // Update the tab badge inside people panel if open
    const tabBadge = document.getElementById("tab-pending-badge");
    if (tabBadge) tabBadge.textContent = State.pendingRequests.length || "";
  });

  socket.on("connection:accepted", async ({ by }) => {
    showToast(`${by.username} accepted your request!`, "success");
    // Refresh contacts list without recreating socket
    const connRes = await getMyConnections();
    if (connRes.code === 200) {
      State.contacts = connRes.Data.contacts || [];
      State.conversations = State.contacts.map(c => ({
        id: c.user.id,
        connectionId: c.connectionId,
        username: c.user.username,
        avatar: (c.user.avatar && c.user.avatar.length > 2)
          ? c.user.avatar
          : c.user.username.charAt(0).toUpperCase(),
        lastSeen: c.user.lastSeen,
        timestamp: 0,
        lastMessage: "",
        unread: 0,
        online: false,
      }));
      renderChatList();
    }
  });

  // ── Undelivered sync ──────────────────────────────────────
  socket.on("private_message_sync", (msg) => {
    // Sync from other devices — same handling as private_message
    const conv = State.conversations.find(c => c.id === msg.to);
    if (conv) {
      conv.lastMessage = msg.type === "text" ? msg.content : `📷 ${msg.type}`;
      conv.timestamp = msg.timestamp;
    }
    renderChatList();
  });
}
