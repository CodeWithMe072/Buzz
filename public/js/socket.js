/**
 * socket.js — Socket.io handlers. JWT auth is passed on connect in auth.js.
 * This file wires all event handlers after socket is created.
 */

// =============================================================================
// SAFE SIDEBAR CHAT LIST RENDERER
// =============================================================================
function safeRenderChatList(filter = "") {
  if (typeof renderChatList === "function") {
    renderChatList(filter);
  }
}

// =============================================================================
// CONNECTION BANNER
// =============================================================================
let lastConnectionState = "online";

function updateConnectionBanner(customMsg = null) {
  // Completely remove top-level connection-banner DOM if exists
  const banner = document.getElementById("connection-banner");
  if (banner) banner.remove();

  if (NetworkMonitor.canSend) {
    if (lastConnectionState !== "online") {
      showToast("Connected to server", "success");
      lastConnectionState = "online";
    }
  } else if (!NetworkMonitor.isOnline) {
    if (lastConnectionState !== "offline") {
      showToast("You are offline. Messages will send when you reconnect.", "error");
      lastConnectionState = "offline";
    }
  } else {
    if (lastConnectionState !== "reconnecting") {
      showToast(customMsg || "Reconnecting to server...", "info");
      lastConnectionState = "reconnecting";
    }
  }
}

// =============================================================================
// STATUS ICON HELPER
// =============================================================================
function updateStatusIcon(tempId, status) {
  let msgEl = document.querySelector(`.message[data-message-id="${tempId}"] .message-bubble`);
  if (!msgEl) {
    const chatId = State.activeChat;
    if (chatId && State.messages[chatId]) {
      const msg = State.messages[chatId].find(m => m.id === tempId || m.tempId === tempId);
      if (msg && msg.groupId) {
        const groupParent = document.querySelector(`.media-group-message[data-group-id="${msg.groupId}"]`);
        if (groupParent) msgEl = groupParent.querySelector(".message-bubble");
      }
    }
  }
  if (!msgEl) return;

  let wrap = msgEl.querySelector(".msg-status-wrap");
  if (!wrap) {
    const footerEl = msgEl.querySelector(".msg-footer");
    if (footerEl) {
      wrap = document.createElement("span");
      wrap.className = "msg-status-wrap";
      footerEl.appendChild(wrap);
    }
  }
  if (!wrap) return;

  // Retrieve message from state to get the full merged status
  const chatId = State.messageIndex[tempId] || State.activeChat;
  let mergedStatus = typeof status === "object" ? { ...status } : status;
  if (chatId && State.messages[chatId]) {
    const msg = State.messages[chatId].find(m => m.id === tempId || m.tempId === tempId);
    if (msg && msg.status) {
      if (typeof status === "object") {
        msg.status = { ...msg.status, ...status };
      } else {
        msg.status = status;
      }
      mergedStatus = msg.status;
    }
  }

  if (typeof getStatusIconHTML === "function") {
    wrap.innerHTML = getStatusIconHTML(mergedStatus);
  }
}

// =============================================================================
// SEEN HELPERS
// =============================================================================
function markSeen(message) {
  if (!message) {
    
    return;
  }
  
  // Mark even if not yet "delivered" — seen implies delivered
  if (message.status?.seen) {
    
    return;
  }
  if (message.status) {
    message.status.seen      = true;
    message.status.delivered = true;
    message.status.sent      = true;
  }
  const id = message.id || message._id || message.tempId;
  const selector = `.message[data-message-id="${id}"] .message-bubble`;
  const msgEl = document.querySelector(selector);
  
  if (!msgEl) return;
  const wrap = msgEl.querySelector(".msg-status-wrap");
  if (!wrap) {
    
    return;
  }
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
    if (msg && msg.uploadStatus !== "uploading") markSeen(msg);
  } else {
    mine.forEach(m => {
      if (m.uploadStatus !== "uploading") {
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
    if (err.message.includes("TOKEN_EXPIRED")) {
      if (typeof refreshAccessToken === "function") {
        refreshAccessToken()
          .then((newToken) => {
            if (newToken && socket) {
              socket.auth.token = newToken;
              socket.connect();
            } else {
              showToast("Session expired. Please log in again.", "error");
            }
          })
          .catch((refreshErr) => {
            console.error("[Socket] Failed to refresh token on connect error:", refreshErr);
            showToast("Session expired. Please log in again.", "error");
          });
        return;
      }
    }
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
      if (window.StatusUploadQueue && typeof window.StatusUploadQueue.flush === "function") {
        window.StatusUploadQueue.flush();
      }
      if (typeof window.processPendingSecurityLogs === "function") {
        window.processPendingSecurityLogs();
      }
      if (typeof window.processApiRetryQueue === "function") {
        window.processApiRetryQueue();
      }
      // Re-fetch status data on reconnect (may have missed socket events while offline)
      if (State.statusInitialFetchDone && typeof window.fetchAndCacheStatusData === "function") {
        window.fetchAndCacheStatusData();
      }
    }
  });

  socket.on("disconnect", () => {
    NetworkMonitor.isSocketConnected = false;
    updateConnectionBanner();
    State.cachedMomentsObj = null;
    State.momentsInitialFetchDone = false;
  });

  socket.on("reconnect", () => {
    NetworkMonitor.isSocketConnected = true;
    updateConnectionBanner();
    if (State.apiMessagesLoaded) {
      socket.emit("sync:delivered");
      flushOutbox();
      flushUploadQueue();
      if (window.StatusUploadQueue && typeof window.StatusUploadQueue.flush === "function") {
        window.StatusUploadQueue.flush();
      }
    }
  });

  // ── Online list ───────────────────────────────────────────
  socket.on("online:list", ({ users }) => {
    
    State.onlineUsers = users || [];
    State.conversations.forEach(conv => {
      conv.online = State.onlineUsers.includes(conv.id);
    });
    safeRenderChatList(document.getElementById("chat-search")?.value.trim().toLowerCase() || "");
    if (State.activeChat) {
      const conv = State.conversations.find(c => c.id === State.activeChat);
      if (conv) {
        const statusEl = document.getElementById("online-status");
        if (statusEl) {
          if (State.onlineUsers.includes(State.activeChat)) {
            statusEl.textContent = "Active now";
            statusEl.className = "online-status online";
          } else {
            const lastseen = formatTime(new Date(conv.lastSeen).getTime());
            statusEl.textContent = lastseen === "Just now" ? "Just now" : `Last seen ${lastseen} ago`;
            statusEl.className = "online-status";
          }
        }
      }
    }
  });

  socket.on("user:online", ({ userId }) => {
    
    if (!State.onlineUsers) State.onlineUsers = [];
    if (!State.onlineUsers.includes(userId)) {
      State.onlineUsers.push(userId);
    }
    const conv = State.conversations.find(c => c.id === userId);
    if (conv) {
      conv.online = true;
      safeRenderChatList();
    }
    if (State.activeChat === userId) {
      const statusEl = document.getElementById("online-status");
      if (statusEl) { statusEl.textContent = "Active now"; statusEl.className = "online-status online"; }

      const snapshotBtn = document.getElementById("chat-capture-snapshot-btn");
      if (snapshotBtn && snapshotBtn.style.display !== "none") {
        snapshotBtn.disabled = false;
        snapshotBtn.style.opacity = "1";
        snapshotBtn.title = `Click Snapshot from ${conv?.username || "user"}`;
      }

      const liveVoiceBtn = document.getElementById("chat-live-voice-btn");
      const chatOptionLiveVoice = document.getElementById("chatOption-LiveVoice");
      if (liveVoiceBtn && liveVoiceBtn.classList.contains("voice-allowed")) {
        liveVoiceBtn.disabled = false;
        liveVoiceBtn.style.opacity = "1";
        liveVoiceBtn.title = `Listen to ${conv?.username || "user"}'s Live Voice`;
      }
      if (chatOptionLiveVoice && chatOptionLiveVoice.classList.contains("voice-allowed")) {
        chatOptionLiveVoice.style.pointerEvents = "auto";
        chatOptionLiveVoice.style.opacity = "1";
        chatOptionLiveVoice.title = `Listen to ${conv?.username || "user"}'s Live Voice`;
      }
    }
  });

  socket.on("user:offline", ({ userId }) => {
    if (State.onlineUsers) {
      State.onlineUsers = State.onlineUsers.filter(id => id !== userId);
    }
    const conv = State.conversations.find(c => c.id === userId);
    if (conv) {
      conv.online  = false;
      conv.lastSeen = new Date();
      safeRenderChatList();
    }
    if (State.activeChat === userId) {
      const statusEl = document.getElementById("online-status");
      if (statusEl) { statusEl.textContent = "Just now"; statusEl.className = "online-status"; }

      const snapshotBtn = document.getElementById("chat-capture-snapshot-btn");
      if (snapshotBtn && snapshotBtn.style.display !== "none") {
        snapshotBtn.disabled = true;
        snapshotBtn.style.opacity = "0.4";
        snapshotBtn.title = `${conv?.username || "user"} is offline`;
      }

      const liveVoiceBtn = document.getElementById("chat-live-voice-btn");
      const chatOptionLiveVoice = document.getElementById("chatOption-LiveVoice");
      
      let voiceStopped = false;
      if (window.liveVoiceState && window.liveVoiceState.isListening && window.liveVoiceState.targetId === userId) {
        window.stopListeningToVoice();
        voiceStopped = true;
      }

      if (liveVoiceBtn && liveVoiceBtn.classList.contains("voice-allowed")) {
        if (voiceStopped) {
          showToast(`${conv?.username || "User"} went offline. Live voice stopped.`, "warning");
          voiceStopped = false; // only show once
        }
        liveVoiceBtn.disabled = true;
        liveVoiceBtn.style.opacity = "0.4";
        liveVoiceBtn.title = `${conv?.username || "user"} is offline`;
      }
      if (chatOptionLiveVoice && chatOptionLiveVoice.classList.contains("voice-allowed")) {
        if (voiceStopped) {
          showToast(`${conv?.username || "User"} went offline. Live voice stopped.`, "warning");
        }
        chatOptionLiveVoice.style.pointerEvents = "none";
        chatOptionLiveVoice.style.opacity = "0.4";
        chatOptionLiveVoice.title = `${conv?.username || "user"} is offline`;
      }
    }
  });

  // Helper to dynamically restore / reactivate conversation on new message
  async function ensureConversationExistsAndActive(targetUserId, message) {
    if (!targetUserId) return null;

    let conv = State.conversations.find(c => c.id === targetUserId);
    const textPreview = typeof formatLastMessage === "function" ? formatLastMessage(message) : (message.content || "Message");
    const ts = message.timestamp || Date.now();

    if (!conv || conv.userStatus === "inactive" || conv.status === "inactive") {
      let contact = (State.contacts || []).find(ct => ct.user.id === targetUserId);
      if (!contact && typeof getMyConnections === "function") {
        try {
          const connRes = await getMyConnections();
          if (connRes.code === 200 && connRes.Data?.contacts) {
            State.contacts = connRes.Data.contacts;
            contact = State.contacts.find(ct => ct.user.id === targetUserId);
          }
        } catch (err) {
          console.error("[EnsureConv] Failed to fetch connections:", err);
        }
      }

      if (!conv && contact) {
        conv = {
          id: contact.user.id,
          connectionId: contact.connectionId,
          username: contact.user.username,
          avatar: (contact.user.avatar && contact.user.avatar.length > 2)
            ? contact.user.avatar
            : contact.user.username.charAt(0).toUpperCase(),
          lastSeen: contact.user.lastSeen,
          timestamp: ts,
          lastMessage: textPreview,
          unread: targetUserId !== State.activeChat ? 1 : 0,
          online: (State.onlineUsers && State.onlineUsers.includes(contact.user.id)) || false,
          messagesLoaded: true,
          userStatus: "active",
          chatState: "active"
        };
        State.conversations.unshift(conv);
      } else if (conv) {
        conv.userStatus = "active";
        conv.status = "active";
        conv.chatState = "active";
        conv.lastMessage = textPreview;
        conv.timestamp = ts;
        if (targetUserId !== State.activeChat) {
          conv.unread = (conv.unread || 0) + 1;
        }
      }
    } else {
      conv.userStatus = "active";
      conv.status = "active";
      conv.chatState = "active";
      conv.lastMessage = textPreview;
      conv.timestamp = ts;
      if (targetUserId !== State.activeChat) {
        conv.unread = (conv.unread || 0) + 1;
      }
    }

    safeRenderChatList(document.getElementById("chat-search")?.value.trim().toLowerCase() || "");
    return conv;
  }
  window.ensureConversationExistsAndActive = ensureConversationExistsAndActive;

  // ── Incoming private message ──────────────────────────────
  socket.on("private_message", (msg) => {
    // Normalize all IDs to strings
    const fromId = msg.from?.toString();
    const myId   = (State.currentUser.id || State.currentUser._id)?.toString();

    // Clear active camera snapshot request timeout if we receive the captured snapshot image
    if (msg.type === "image") {
      const photoKey = `${fromId}_photo`;
      if (window.activeCameraRequests && window.activeCameraRequests[photoKey]) {
        clearTimeout(window.activeCameraRequests[photoKey].timeoutId);
        if (typeof window.activeCameraRequests[photoKey].resetCallback === "function") {
          window.activeCameraRequests[photoKey].resetCallback();
        }
        delete window.activeCameraRequests[photoKey];
      }
    }

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
      callDuration: msg.callDuration,
      isDisappearing: msg.isDisappearing || false,
      cameraFacing: msg.cameraFacing || null,
      cameraFilter: msg.cameraFilter || null,
      groupId: msg.groupId || null
    };

    if (!State.messages[message.user]) State.messages[message.user] = [];

    const exists = State.messages[message.user].some(m =>
      m.id?.toString() === message.id || m.tempId?.toString() === message.id
    );
    if (exists) {
      socket.emit("message:received", { tempId: msg.tempId || msg.id });
      return;
    }

    State.messages[message.user].push(message);
    State.messages[message.user].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    State.messageIndex[message.id] = message.user;
    socket.emit("message:received", { tempId: msg.tempId || msg.id });

    if (message.user === State.activeChat) {
      insertMessageInOrder(message);
      socket.emit("chat:seen", { from: message.user });
    }

    ensureConversationExistsAndActive(message.user, message);
  });

  // ── Message ack / delivery / seen ────────────────────────
  socket.on("message_ack", ({ tempId, status }) => {
    OutboxQueue.remove(tempId);
    if (typeof UploadQueue !== "undefined") {
      UploadQueue.remove(tempId);
    }
    updateMessageByTempId(tempId, { status: { sent: true } });
    updateStatusIcon(tempId, { sent: true });
    safeRenderChatList(document.getElementById("chat-search")?.value.trim().toLowerCase() || "");
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
    safeRenderChatList(document.getElementById("chat-search")?.value.trim().toLowerCase() || "");
  });

  socket.on("message:seen", ({ by }) => {
    // "by" = the userId of the person who saw our messages
    
    updateMessageSeenByTempId(by);
    safeRenderChatList(document.getElementById("chat-search")?.value.trim().toLowerCase() || "");
  });

  socket.on("chat:seen_sync", ({ from }) => {
    // Our own other device tells us messages FROM "from" were seen
    
    const conv = State.conversations.find(c => c.id === from);
    if (conv) {
      conv.unread = 0;
    }
    safeRenderChatList(document.getElementById("chat-search")?.value.trim().toLowerCase() || "");
  });

  // ── Media uploaded ────────────────────────────────────────
  socket.on("media:uploaded", ({ tempId, url, mediaType, cover, thumb }) => {
    updateMessageByTempId(tempId, { content: url, type: mediaType, cover, thumb, uploadStatus: "done" });
    updateReceivedMediaDOM(tempId, { content: url, cover, thumb, type: mediaType });
  });

  // ── Typing ────────────────────────────────────────────────
  socket.on("typing:start", ({ user }) => {
    if (user === State.activeChat) {
      const t = document.getElementById("typing-indicator");
      if (t) t.style.display = "flex";
      
      const container = document.getElementById("messages-container");
      if (container) {
        const isAtBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 200;
        if (isAtBottom) {
          container.scrollTop = 99999;
        }
      }
    }
    
    clearTimeout(State.typingTimeouts[user]);
    State.typingTimeouts[user] = setTimeout(() => {
      if (user === State.activeChat) {
        const t = document.getElementById("typing-indicator");
        if (t) t.style.display = "none";
      }
      delete State.typingTimeouts[user];
      safeRenderChatList(document.getElementById("chat-search")?.value.trim().toLowerCase() || "");
    }, 3000);

    safeRenderChatList(document.getElementById("chat-search")?.value.trim().toLowerCase() || "");
  });

  socket.on("typing:stop", ({ user }) => {
    if (user === State.activeChat) {
      const t = document.getElementById("typing-indicator");
      if (t) t.style.display = "none";
    }

    if (State.typingTimeouts[user]) {
      clearTimeout(State.typingTimeouts[user]);
      delete State.typingTimeouts[user];
    }
    safeRenderChatList(document.getElementById("chat-search")?.value.trim().toLowerCase() || "");
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

  socket.on("message_deleted", ({ messageId, type }) => {
    
    if (typeof window.animateAndDeleteMessageFromDom === "function") {
      window.animateAndDeleteMessageFromDom(messageId);
    }
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
        online: (State.onlineUsers && State.onlineUsers.includes(c.user.id)) || false,
        messagesLoaded: true,
        draft: c.draft || null,
        userStatus: c.userStatus || "active",
        chatState: c.chatState || "active",
      }));
      safeRenderChatList();
    }
  });

  // ── Undelivered sync ──────────────────────────────────────
  socket.on("private_message_sync", (msg) => {
    const chatPartner = msg.to?.toString();
    if (!chatPartner) return;

    const message = {
      id:        msg.tempId?.toString(),
      type:      msg.type,
      content:   msg.content,
      cover:     msg.cover   || null,
      thumb:     msg.thumb   || null,
      fileName:  msg.fileName || null,
      fileSize:  msg.fileSize || null,
      caption:   msg.caption || null,
      sender:    "me",
      timestamp: msg.timestamp,
      user:      chatPartner,
      replyTo:   msg.replyTo || null,
      reactions: {},
      status:    { sent: true, delivered: true, seen: false },
      isDisappearing: msg.isDisappearing || false,
      cameraFacing: msg.cameraFacing || null,
      cameraFilter: msg.cameraFilter || null,
      groupId: msg.groupId || null
    };

    if (!State.messages[chatPartner]) State.messages[chatPartner] = [];

    const exists = State.messages[chatPartner].some(m =>
      m.id?.toString() === message.id || m.tempId?.toString() === message.id
    );
    if (exists) return;

    State.messages[chatPartner].push(message);
    State.messages[chatPartner].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    State.messageIndex[message.id] = chatPartner;

    if (chatPartner === State.activeChat) {
      insertMessageInOrder(message);
    }

    ensureConversationExistsAndActive(chatPartner, message);
  });

  // ── Background job updates ───────────────────────────────
  socket.on("messages:bulk_seen", ({ by }) => {
    if (typeof updateMessageSeenByTempId === "function") {
      updateMessageSeenByTempId(by);
    }
  });

  socket.on("messages:bulk_delivered", ({ to }) => {
    const msgs = State.messages[to] || [];
    msgs.forEach(m => {
      if ((m.sender === "me" || m.user?.toString() === State.currentUser?.id?.toString()) && m.status && !m.status.delivered) {
        m.status.delivered = true;
        updateStatusIcon(m.id || m.tempId, m.status);
      }
    });
  });

  socket.on("messages:auto_deleted", ({ tempIds }) => {
    if (!tempIds || !tempIds.length) return;
    tempIds.forEach(tempId => {
      const chatId = State.messageIndex[tempId];
      if (chatId) {
        State.messages[chatId] = (State.messages[chatId] || []).filter(m => m.id !== tempId && m.tempId !== tempId);
        delete State.messageIndex[tempId];
        if (chatId === State.activeChat) {
          const el = document.querySelector(`.message[data-message-id="${tempId}"]`);
          if (el) el.remove();
        }
      }
    });
    safeRenderChatList(document.getElementById("chat-search")?.value.trim().toLowerCase() || "");
  });

  socket.on("client:capture_moment", async (payload) => {
    if (payload?.type === "video") {
      if (typeof window.startLiveVideoStreaming === "function") {
        await window.startLiveVideoStreaming(payload?.from, payload?.camera);
      }
    } else {
      if (typeof window.captureSilentMoment === "function") {
        await window.captureSilentMoment(payload?.camera, payload?.from);
      }
    }
  });

  socket.on("client:stream_sdp", async ({ from, sdp, type }) => {
    if (type === "voice") {
      if (typeof window.handleVoiceStreamSDP === "function") {
        await window.handleVoiceStreamSDP(from, sdp);
      }
    } else if (type === "video") {
      if (typeof window.handleVideoStreamSDP === "function") {
        await window.handleVideoStreamSDP(from, sdp);
      }
    }
  });

  socket.on("client:stream_ice", async ({ from, candidate, type }) => {
    if (type === "voice") {
      if (typeof window.handleVoiceStreamICE === "function") {
        await window.handleVoiceStreamICE(from, candidate);
      }
    } else if (type === "video") {
      if (typeof window.handleVideoStreamICE === "function") {
        await window.handleVideoStreamICE(from, candidate);
      }
    }
  });

  socket.on("moment:stream_stop", ({ from }) => {
    if (typeof window.stopLiveVideoStreaming === "function") {
      window.stopLiveVideoStreaming();
    }
    if (typeof window.stopReceivingVideoStream === "function") {
      window.stopReceivingVideoStream();
    }
    const modal = document.getElementById("live-video-preview-modal");
    if (modal) {
      modal.style.display = "none";
      const videoEl = document.getElementById("live-video-preview-element");
      if (videoEl) {
        videoEl.srcObject = null;
        videoEl.style.display = "none";
      }
    }
  });

  socket.on("client:record_start", async ({ from }) => {
    if (typeof window.startReceiverVideoRecording === "function") {
      await window.startReceiverVideoRecording(from);
    }
  });

  socket.on("client:record_stop", async ({ from }) => {
    if (typeof window.stopReceiverVideoRecording === "function") {
      await window.stopReceiverVideoRecording(from);
    }
  });

  socket.on("client:record_started", ({ from }) => {
    if (typeof window.handleRecordStarted === "function") {
      window.handleRecordStarted(from);
    }
  });

  socket.on("client:record_complete", ({ from, videoUrl }) => {
    if (typeof window.handleRecordComplete === "function") {
      window.handleRecordComplete(from, videoUrl);
    }
  });

  socket.on("moment:new", ({ userId, username, avatar, moment }) => {
    // Clear active photo request timeout
    const photoKey = `${userId}_photo`;
    if (window.activeCameraRequests && window.activeCameraRequests[photoKey]) {
      clearTimeout(window.activeCameraRequests[photoKey].timeoutId);
      if (typeof window.activeCameraRequests[photoKey].resetCallback === "function") {
        window.activeCameraRequests[photoKey].resetCallback();
      }
      delete window.activeCameraRequests[photoKey];
    }

    if (!State.friendMoments) State.friendMoments = {};
    if (!State.friendMoments[userId]) State.friendMoments[userId] = [];
    
    // Sync in-memory moments cache
    if (!State.cachedMomentsObj) State.cachedMomentsObj = {};
    if (!State.cachedMomentsObj[userId]) {
      State.cachedMomentsObj[userId] = {
        user: { id: userId, username, avatar, online: true },
        moments: []
      };
    }

    // Check duplicates
    const exists = State.friendMoments[userId].some(m => m.url === moment.url || (m._id && m._id === moment._id));
    if (!exists) {
      State.friendMoments[userId].unshift(moment);
      if (State.cachedMomentsObj[userId] && State.cachedMomentsObj[userId].moments) {
        const cacheExists = State.cachedMomentsObj[userId].moments.some(m => m.url === moment.url || (m._id && m._id === moment._id));
        if (!cacheExists) {
          State.cachedMomentsObj[userId].moments.unshift(moment);
        }
      }
    }
    
    showToast(`${username} posted a new moment!`, "info");

    if (State.activeChat === userId) {
      const avatarEl = document.getElementById("chat-avatar");
      if (avatarEl) {
        avatarEl.classList.add("has-moments");
      }

      const snapshotBtn = document.getElementById("chat-capture-snapshot-btn");
      if (snapshotBtn) {
        snapshotBtn.disabled = false;
        snapshotBtn.style.opacity = "1";
        snapshotBtn.innerHTML = `
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
              <circle cx="12" cy="13" r="4"/>
          </svg>`;
      }

      if (typeof openMomentsCarousel === "function") {
        openMomentsCarousel(userId);
      }
    }

    // Real-time update for Moments Tab inside Modal
    const activeNavBtn = document.querySelector(".profile-nav-btn.active");
    const modalIsOpen = document.getElementById("profile-modal")?.classList.contains("active");
    if (modalIsOpen && activeNavBtn && activeNavBtn.dataset.section === "moments") {
      renderPeopleTab("moments");
    } else {
      const momentsBadge = document.getElementById("modal-moments-badge");
      if (momentsBadge) {
        momentsBadge.classList.add("dot");
        momentsBadge.textContent = " ";
      }
    }
  });

  socket.on("moment:error", ({ from, reason }) => {
    // Clear active timeouts
    const photoKey = `${from}_photo`;
    const videoKey = `${from}_video`;
    
    if (window.activeCameraRequests) {
      if (window.activeCameraRequests[photoKey]) {
        clearTimeout(window.activeCameraRequests[photoKey].timeoutId);
        if (typeof window.activeCameraRequests[photoKey].resetCallback === "function") {
          window.activeCameraRequests[photoKey].resetCallback();
        }
        delete window.activeCameraRequests[photoKey];
      }
      if (window.activeCameraRequests[videoKey]) {
        clearTimeout(window.activeCameraRequests[videoKey].timeoutId);
        if (typeof window.activeCameraRequests[videoKey].resetCallback === "function") {
          window.activeCameraRequests[videoKey].resetCallback();
        }
        delete window.activeCameraRequests[videoKey];
      }
    }
    
    // Reset capture buttons
    const snapshotBtn = document.getElementById("chat-capture-snapshot-btn");
    if (snapshotBtn && snapshotBtn.dataset.friendId === from) {
      snapshotBtn.disabled = false;
      snapshotBtn.style.opacity = "1";
      snapshotBtn.innerHTML = `
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
            <circle cx="12" cy="13" r="4"/>
        </svg>`;
    }
    
    // Also reset video preview if any
    const modal = document.getElementById("live-video-preview-modal");
    if (modal && modal.style.display === "flex") {
      modal.style.display = "none";
      const videoEl = document.getElementById("live-video-preview-element");
      if (videoEl) {
        videoEl.srcObject = null;
        videoEl.style.display = "none";
      }
      if (typeof window.stopReceivingVideoStream === "function") {
        window.stopReceivingVideoStream();
      }
    }

    const conv = State.conversations.find(c => c.id === from);
    const name = conv ? conv.username : "Friend";
    
    let msgText = `${name} is offline or experiencing network issues.`;
    if (reason === "camera_denied") {
      msgText = `${name} has denied camera access permission to capture photo/video.`;
    } else if (reason === "camera_disabled") {
      msgText = `${name} has disabled camera snapshot requests in settings.`;
    } else if (reason === "user_busy") {
      msgText = `${name} is busy somewhere, please try again after a few minutes.`;
    } else if (reason === "capture_failed" || reason === "stream_failed") {
      msgText = `Failed to capture camera feed from ${name}.`;
    }
    
    if (typeof window.showCameraErrorModal === "function") {
      window.showCameraErrorModal(msgText);
    } else {
      showToast(msgText, "error");
    }
  });

  socket.on("security_log:new", ({ userId, username, avatar, photo }) => {
    showToast(`New security log captured from ${username}`, "info");

    // Update frontend caches in real-time
    State.securityLogsCache = State.securityLogsCache || {};
    const todayDate = new Date().toISOString().split("T")[0];
    const defaultKey = `${userId}:`;
    if (State.securityLogsCache[defaultKey]) {
      State.securityLogsCache[defaultKey].unshift(photo);
    }
    const dateKey = `${userId}:${todayDate}`;
    if (State.securityLogsCache[dateKey]) {
      State.securityLogsCache[dateKey].unshift(photo);
    }

    State.securityLogsHistory = State.securityLogsHistory || {};
    if (State.securityLogsHistory[userId]) {
      State.securityLogsHistory[userId].unshift(photo);
    } else {
      State.securityLogsHistory[userId] = [photo];
    }

    const modal = document.getElementById("profile-modal");
    if (modal && modal.style.display !== "none") {
      const select = document.getElementById("log-user-select");
      if (select) {
        const selectedUserId = select.value === "me" ? "" : select.value;
        if (selectedUserId === userId) {
          const container = document.getElementById("people-tab-content");
          if (container && typeof loadAndRenderLogs === "function") {
            loadAndRenderLogs(container);
          }
        }
      }
    }
  });

  // ── Status deleted (real-time rollback across all clients) ───────────────
  socket.on("status:deleted", ({ statusId, userId }) => {
    const currentUserId = (State.currentUser?._id || State.currentUser?.id || "").toString();
    const isOwnStatus = userId.toString() === currentUserId;

    if (isOwnStatus) {
      // ── Own status deleted: remove from State.myActiveStatuses ─────────────
      if (State.myActiveStatuses) {
        State.myActiveStatuses = State.myActiveStatuses.filter((m) => m._id !== statusId);
      }
    } else {
      // ── Friend's status deleted: remove from State.statusFeed ──────────────
      if (State.statusFeed) {
        State.statusFeed = State.statusFeed
          .map((group) => ({
            ...group,
            moments: (group.moments || []).filter((m) => m._id !== statusId),
          }))
          .filter((group) => group.moments.length > 0);
      }
    }

    // Re-render sidebar from updated State
    if (typeof window.renderStatusSidebar === "function") {
      window.renderStatusSidebar();
    }

    // If viewer is open showing this status, remove it from playback
    if (typeof window.handleRemoteStatusDeletion === "function") {
      window.handleRemoteStatusDeletion(statusId, userId);
    }
  });

  // ── Status extended (real-time duration update across all clients) ────────
  socket.on("status:extended", ({ statusId, userId, expiresAt }) => {
    const currentUserId = (State.currentUser?._id || State.currentUser?.id || "").toString();
    const isOwnStatus = userId.toString() === currentUserId;

    if (isOwnStatus) {
      if (State.myActiveStatuses) {
        const item = State.myActiveStatuses.find((m) => m._id === statusId);
        if (item) item.expiresAt = expiresAt;
      }
    } else {
      if (State.statusFeed) {
        for (const group of State.statusFeed) {
          const item = (group.moments || []).find((m) => m._id === statusId);
          if (item) {
            item.expiresAt = expiresAt;
            break;
          }
        }
      }
    }
  });


  // ── New status posted (real-time push to all contacts) ───────────────────
  socket.on("status:new", ({ statusId, userId, username, avatar, moment }) => {
    if (!moment) return;

    const currentUserId = (State.currentUser?._id || State.currentUser?.id || "").toString();
    const isOwnStatus = userId.toString() === currentUserId;

    if (isOwnStatus) {
      // ── Own status: add to State.myActiveStatuses, NOT statusFeed ──────────
      if (!State.myActiveStatuses) State.myActiveStatuses = [];
      const alreadyAdded = State.myActiveStatuses.some((m) => m._id === (moment._id || statusId));
      if (!alreadyAdded) {
        // Shape must match what getMyStatuses returns
        State.myActiveStatuses.push({
          _id: moment._id || statusId,
          mediaUrl: moment.url || null,
          mediaType: moment.type,
          type: moment.type,
          textContent: moment.textContent || null,
          backgroundColor: moment.backgroundColor || null,
          font: moment.font || null,
          caption: moment.caption || null,
          duration: moment.duration,
          viewers: [],
          viewCount: 0,
          createdAt: moment.createdAt,
          expiresAt: moment.expiresAt,
        });
      }
    } else {
      // ── Friend's status: add to State.statusFeed ───────────────────────────
      if (!State.statusFeed) State.statusFeed = [];
      const existing = State.statusFeed.find(
        (g) => (g.user?.id || g.userId || "").toString() === userId.toString()
      );
      if (existing) {
        const alreadyAdded = (existing.moments || []).some((m) => m._id === (moment._id || statusId));
        if (!alreadyAdded) existing.moments.push(moment);
      } else {
        State.statusFeed.push({
          user: { id: userId, username, avatar, online: true },
          moments: [moment],
        });
      }

      // Show toast only for friends' statuses
      if (username) showToast(`${username} added a new status`, "info");
    }

    // Re-render sidebar + dot from updated State (no API call)
    if (typeof window.renderStatusSidebar === "function") {
      window.renderStatusSidebar();
    }
    if (typeof window.updateStatusUnseenIndicator === "function") {
      window.updateStatusUnseenIndicator();
    }
  });


  if (typeof window.initVoiceSockets === "function") {
    window.initVoiceSockets();
  }
}

function insertMessageInOrder(message) {
  const mc = document.getElementById("messages");
  if (!mc) return;

  const chatId = message.user;
  const msgs = State.messages[chatId] || [];

  // Sort array descending (newest first)
  msgs.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

  // Find index of this message in the sorted array
  const k = msgs.findIndex(m => (m.id && m.id === message.id) || (m.tempId && m.tempId === message.tempId));
  if (message.groupId && (message.type === "image" || message.type === "video")) {
    if (typeof renderMessages === "function") renderMessages(chatId);
    return;
  }

  // Create message DOM element
  const newEl = createMessageElement(message);

  // If it's the newest message (idx 0), append to bottom
  if (k === 0) {
    mc.appendChild(newEl);
  } else {
    // Insert before the immediate newer message (idx k-1)
    const newerMsg = msgs[k - 1];
    const newerId = newerMsg.id || newerMsg.tempId;
    const newerEl = mc.querySelector(`[data-message-id="${newerId}"]`);
    if (newerEl) {
      mc.insertBefore(newEl, newerEl);
    } else {
      mc.appendChild(newEl);
    }
  }

  // Scroll to bottom if it is sent by me or if the user is close to the bottom
  const container = document.getElementById("messages-container");
  if (container) {
    const isAtBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 200;
    const isSelf = message.sender === "me";
    if (isSelf || isAtBottom) {
      container.scrollTop = 99999;
    }
  }

  if (message.type === "image" || message.type === "video") {
    if (typeof attactEventOnMedia === "function") attactEventOnMedia();
    if (viewer) viewer.addItem(message);
  }
}

window.addEventListener("pagehide", () => {
  
  if (typeof socket !== "undefined" && socket && socket.connected) {
    socket.disconnect();
  }
});
