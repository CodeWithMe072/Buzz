/**
 * chat.js — Chat list, chat window, message rendering, sending,
 *            reactions, replies, typing, mobile nav, and search.
 */

// =============================================================================
// CHAT SCREEN
// =============================================================================
function showChatScreen() {
  document.getElementById("login-screen").classList.remove("active");
  document.getElementById("signup-screen").classList.remove("active");
  document.getElementById("chat-screen").classList.add("active");
  document.getElementById("current-username").textContent = State.currentUser.username;
  document.getElementById("current-user-avatar").innerHTML = `<span>${State.currentUser.avatar || State.currentUser.username.charAt(0).toUpperCase()}</span>`;
  initChatWindow();
  initMobileNavigation();
}

// =============================================================================
// CHAT LIST — only accepted connections
// =============================================================================
function initChatList() {
  // Conversations are already built from contacts in auth.js bootstrapAfterLogin
  renderChatList();
  document.getElementById("logout-btn").addEventListener("click", logout);

  // Search bar filter
  const searchInput = document.getElementById("chat-search");
  searchInput.addEventListener("input", () => {
    renderChatList(searchInput.value.trim().toLowerCase());
  });
}

function renderChatList(filter = "") {
  const chatList = document.getElementById("chat-list");
  chatList.innerHTML = "";

  let convs = [...State.conversations];
  // convs.sort((a, b) => b.timestamp - a.timestamp);

  // Apply filter
  if (filter) {
    convs = convs.filter(c => c.username.toLowerCase().includes(filter));
  }

  if (!convs.length) {
    chatList.innerHTML = filter
      ? `<div class="chat-list-empty">No results for "<strong>${sanitizeInput(filter)}</strong>"</div>`
      : `<div class="chat-list-empty">
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
          <p>No connections yet</p>
          <small>Search for people to add</small>
        </div>`;
    return;
  }
  convs = convs.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
  convs.forEach(conv => {
    const item = document.createElement("div");
    item.className = `chat-item ${State.activeChat === conv.id ? "active" : ""}`;
    item.dataset.convId = conv.id;
    item.innerHTML = `
      <div class="avatar ${conv.online ? "online" : ""}">
        <span>${conv.avatar}</span>
      </div>
      <div class="chat-item-content">
        <div class="chat-item-header">
          <span class="chat-item-username">${sanitizeInput(conv.username)}</span>
          <span class="chat-item-time">${conv.timestamp ? formatTime(conv.timestamp) : ""}</span>
        </div>
        <div class="chat-item-preview ${conv.unread > 0 ? "unread" : ""}">
          <span>${conv.lastMessage ? sanitizeInput(conv.lastMessage) : ""}</span>
        </div>
      </div>
      ${conv.unread > 0 ? `<span class="unread-badge">${conv.unread}</span>` : ""}`;
    item.addEventListener("click", () => openChat(conv.id));
    chatList.appendChild(item);
  });
}

// =============================================================================
// OPEN CHAT
// =============================================================================
function openChat(chatId) {
  State.activeChat = chatId;
  const conv = State.conversations.find(c => c.id === chatId);
  if (!conv) return;

  conv.unread = 0;
  renderChatList(document.getElementById("chat-search").value.trim().toLowerCase());
  socket.emit("chat:seen", { from: chatId });

  document.getElementById("chat-empty-state").style.display = "none";
  document.getElementById("active-chat").style.display = "flex";
  const messageInput = document.getElementById("message-input");
  messageInput.value = "";
  messageInput.focus();

  document.getElementById("chat-avatar").innerHTML = `<span>${conv.avatar}</span>`;
  document.getElementById("chat-username").textContent = conv.username;

  const statusEl = document.getElementById("online-status");
  const lastseen = formatTime(new Date(conv.lastSeen).getTime());
  statusEl.textContent = conv.online
    ? "Active now"
    : `${lastseen === "Just now" ? "Just now" : "Last seen " + lastseen + " ago"}`;
  statusEl.className = `online-status ${conv.online ? "online" : ""}`;

  renderMessages(chatId);

  if (window.innerWidth < 768) {
    document.getElementById("chat-list-sidebar").classList.add("hidden");
    document.getElementById("chat-window").classList.add("active");
  }

  // Chat options panel
  document.getElementById("chatOption").classList.remove("active");
  document.getElementById("chat-info-btn").onclick = () => {
    document.getElementById("chatOption").classList.add("active");
  };

  // Delete chat
  document.getElementById("chatOption-button").onclick = async () => {
    State.messages[State.activeChat] = [];
    renderMessages(State.activeChat);
    const c = State.conversations.find(cv => cv.id === State.activeChat);
    if (c) { c.lastMessage = ""; c.unread = 0; c.timestamp = 0; }
    renderChatList();
    document.getElementById("chatOption").classList.remove("active");
    await deleteChat(State.activeChat);
  };

  // Mute toggle
  const muteBtn = document.getElementById("chatOption-Mute");
  const newMuteBtn = muteBtn.cloneNode(true);
  muteBtn.parentNode.replaceChild(newMuteBtn, muteBtn);
  newMuteBtn.addEventListener("click", (e) => {
    document.getElementById("chatOption").classList.remove("active");
    const btn = e.currentTarget;
    const playing = btn.getAttribute("data-playTune") === "true";
    if (playing) {
      btn.setAttribute("data-playTune", "false");
      localStorage.setItem("playTune", "false");
      State.playTune = false;
      showToast("Chat Muted", "success");
      btn.innerHTML = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/></svg>Unmute`;
    } else {
      btn.setAttribute("data-playTune", "true");
      localStorage.setItem("playTune", "true");
      State.playTune = true;
      showToast("Chat Unmuted", "success");
      btn.innerHTML = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/></svg>Mute`;
    }
  });
}

// =============================================================================
// RENDER MESSAGES
// =============================================================================
function renderMessages(chatId) {
  const messagesContainer = document.getElementById("messages");
  messagesContainer.innerHTML = "";

  const messages = State.messages[chatId] || [];
  for (let i = messages.length - 1; i >= 0; i--) {
    messagesContainer.appendChild(createMessageElement(messages[i]));
  }

  document.getElementById("messages-container").scrollTop = 99999;
  viewer = new MediaViewer(chatId);
  attactEventOnMedia();
}

function attactEventOnMedia() {
  document.querySelectorAll(".message-media").forEach(media => {
    if (media.dataset.listenerAttached === "true") return;
    media.dataset.listenerAttached = "true";
    media.addEventListener("click", () => {
      const msgEl = media.closest(".message");
      if (!msgEl) return;
      if (!viewer && State.activeChat) {
        viewer = new MediaViewer(State.activeChat);
      }
      if (viewer) {
        viewer.open(msgEl.dataset.messageId);
      }
    });
  });
}

function playVideoInline(mediaContainer, videoUrl) {
  if (!videoUrl) return;
  mediaContainer.innerHTML = "";
  const video = document.createElement("video");
  video.src = videoUrl;
  video.controls = true;
  video.autoplay = true;
  video.playsInline = true;
  video.style.cssText = "width:100%;height:100%;border-radius:inherit;";
  mediaContainer.appendChild(video);
  mediaContainer.onclick = null;
  video.play().catch(() => { });
}

// =============================================================================
// CREATE MESSAGE ELEMENT
// =============================================================================
// =============================================================================
// STATUS ICON GENERATOR
// =============================================================================
function getStatusIconHTML(status) {
  if (!status) return `<svg class="status-icon clock" viewBox="0 0 16 16"><circle cx="8" cy="8" r="6.5"/><polyline points="8 4 8 8 11 10"/></svg>`;
  if (status.seen) {
    return `<svg class="status-icon double seen" viewBox="0 0 16 16" style="transform:translateX(3px)"><polyline points="2 8 6 12 14 4"/><polyline points="5 8 9 12 17 4" style="transform:translate(-9px,0)"/></svg>`;
  } else if (status.delivered) {
    return `<svg class="status-icon double delivered" viewBox="0 0 16 16"><polyline points="2 8 6 12 14 4"/><polyline points="5 8 9 12 17 4" style="transform:translate(-9px,0)"/></svg>`;
  } else if (status.sent) {
    return `<svg class="status-icon single sent" viewBox="0 0 16 16"><polyline points="2 8 6 12 14 4"/></svg>`;
  } else {
    return `<svg class="status-icon clock" viewBox="0 0 16 16"><circle cx="8" cy="8" r="6.5"/><polyline points="8 4 8 8 11 10"/></svg>`;
  }
}

// =============================================================================
// EMOJI HELPERS FOR ANIMATED SINGLE EMOJIS
// =============================================================================
function getSingleEmoji(text) {
  if (!text) return null;
  const trimmed = text.trim();
  if (!trimmed) return null;
  try {
    const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
    const segments = [...segmenter.segment(trimmed)];
    if (segments.length === 1) {
      const segment = segments[0].segment;
      const isEmoji = /\p{Emoji_Presentation}/u.test(segment) || 
                      ( /[\u2600-\u27BF]/u.test(segment) && !/[0-9#*]/u.test(segment) );
      if (isEmoji) return segment;
    }
  } catch (e) {
    const emojiRegex = /^[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F900}-\u{1F9FF}\u{1F3FB}-\u{1F3FF}]+$/u;
    if (emojiRegex.test(trimmed) && trimmed.length <= 8) {
      return trimmed;
    }
  }
  return null;
}

function getEmojiAnimationClass(emoji) {
  const heartEmojis = ["❤️", "💖", "💕", "🖤", "💛", "💙", "💜", "💚", "🧡", "🤍", "🤎", "💔", "❣", "💕", "💞", "💓", "💗", "💖", "💝"];
  const laughEmojis = ["😂", "🤣", "😆", "😅", "😄", "😃", "😀"];
  const fireEmojis = ["🔥", "⚡", "✨", "💥"];
  const thumbsEmojis = ["👍", "👎", "ok", "👌"];
  const partyEmojis = ["🎉", "🥳", "🎊", "🎈"];
  const cryEmojis = ["😭", "😢", "🥺", "😓", "😿", "💔"];
  const angryEmojis = ["😡", "😠", "🤬", "👿", "👿"];
  const ghostEmojis = ["👻", "👽", "🛸", "🎃"];

  if (heartEmojis.includes(emoji)) return "emoji-pulse";
  if (laughEmojis.includes(emoji)) return "emoji-bounce-laugh";
  if (fireEmojis.includes(emoji)) return "emoji-flicker";
  if (thumbsEmojis.some(t => emoji.includes(t))) return "emoji-thumbs-up";
  if (partyEmojis.includes(emoji)) return "emoji-party";
  if (cryEmojis.includes(emoji)) return "emoji-cry";
  if (angryEmojis.includes(emoji)) return "emoji-shake";
  if (ghostEmojis.includes(emoji)) return "emoji-float";

  return "emoji-bounce";
}

// =============================================================================
// CREATE MESSAGE ELEMENT
// =============================================================================
function createMessageElement(message) {
  const isMe = message.sender === "me" || message.user?.toString() === State.currentUser.id?.toString();
  const msgEl = document.createElement("div");
  msgEl.className = `message ${isMe ? "self" : "other"}`;
  msgEl.dataset.messageId = message.id || message.tempId;

  const bubbleEl = document.createElement("div");
  bubbleEl.className = "message-bubble";

  let isEmojiOnly = false;
  let emojiChar = "";
  let animationClass = "";
  if (message.type === "text") {
    emojiChar = getSingleEmoji(message.content);
    if (emojiChar) {
      isEmojiOnly = true;
      animationClass = getEmojiAnimationClass(emojiChar);
      bubbleEl.classList.add("emoji-bubble");
    }
  }

  // Reply preview
  let replyHTML = "";
  if (message.replyTo) {
    const replyMsg = State.messages[State.activeChat].find(
      m => m.id === message.replyTo || m.tempId === message.replyTo
    );
    console.log(State.messages[State.activeChat])
    console.log(message.replyTo)
    console.log(replyMsg)
    const replyText = replyMsg
      ? (replyMsg.type === "text"
        ? (replyMsg.content.length > 50
          ? replyMsg.content.slice(0, 50) + "..."
          : replyMsg.content)
        : "📷 " + replyMsg.type)
      : "Original message";
    replyHTML = `<div class="message-reply-preview"><div class="reply-text">${sanitizeInput(replyText)}</div></div>`;
  }

  // Footer: time + status icon
  const statusSVG = isMe ? `<span class="msg-status-wrap">${getStatusIconHTML(message.status)}</span>` : "";
  const footerHTML = `<div class="msg-footer"><span class="message-time">${formatTime(message.timestamp)}</span>${statusSVG}</div>`;

  if (message.type === "text") {
    if (isEmojiOnly) {
      bubbleEl.innerHTML = `
        ${replyHTML}
        <div class="messag-text animated-emoji ${animationClass}">${emojiChar}</div>
        ${footerHTML}
        ${message.uploadStatus === "failed" ? `<div class="upload-fail-badge">Failed to send</div>` : ""}`;
    } else {
      bubbleEl.innerHTML = `
        ${replyHTML}
        <p class="messag-text">${makeLinksClickable(sanitizeInput(message.content || ""))}</p>
        ${footerHTML}
        ${message.uploadStatus === "failed" ? `<div class="upload-fail-badge">Failed to send</div>` : ""}`;
    }

  } else if (message.type === "sticker") {
    bubbleEl.classList.add("sticker-bubble");
    bubbleEl.innerHTML = `
      ${replyHTML}
      <div class="message-sticker">
        <img src="${message.content}" alt="Sticker" loading="lazy">
      </div>
      ${footerHTML}`;

  } else if (message.type === "gif") {
    const urlLower = (message.content || "").toLowerCase();
    const isVideo = urlLower.endsWith(".mp4") || urlLower.endsWith(".m4v") || urlLower.endsWith(".m4bb");
    const mediaHTML = isVideo
      ? `<video src="${message.content}" muted autoplay loop playsinline style="width: 100%; height: 100%; border-radius: inherit; object-fit: cover; display: block;"></video>`
      : `<img src="${message.content}" alt="GIF" loading="lazy">`;

    bubbleEl.innerHTML = `
      ${replyHTML}
      <div class="message-media gif-media">
        ${mediaHTML}
      </div>
      ${footerHTML}`;

  } else if (message.type === "image") {
    const src = message.cover || message.thumb || message.content;
    const isUploading = message.uploadStatus === "uploading";
    bubbleEl.innerHTML = `
      ${replyHTML}
      <div class="message-media">
        ${src ? `<img src="${src}" alt="Image" loading="lazy">` : ""}
        ${isUploading ? `<div class="media-overlay"><div class="loader"></div></div>` : ""}
      </div>
      ${message.caption ? `<p class="messag-text caption">${sanitizeInput(message.caption)}</p>` : ""}
      ${footerHTML}`;

  } else if (message.type === "video") {
    const videoUrl = message.content;
    const coverUrl = message.cover || message.thumb;
    const isUploading = message.uploadStatus === "uploading";
    bubbleEl.innerHTML = `
      ${replyHTML}
      <div class="message-media video-media">
        ${videoUrl ? `
          <video class="chat-video-preview" src="${videoUrl}" poster="${coverUrl || ''}" controls playsinline preload="metadata" style="width:100%; max-height:350px; border-radius:inherit; object-fit:cover;"></video>
        ` : (coverUrl ? `<img class="video-thumb" src="${coverUrl}" alt="Video">` : `<div class="video-placeholder">Video loading...</div>`)}
        ${isUploading ? `<div class="media-overlay"><div class="loader"></div></div>` : ""}
      </div>
      ${message.caption ? `<p class="messag-text caption">${sanitizeInput(message.caption)}</p>` : ""}
      ${footerHTML}`;

  } else if (message.type === "audio") {
    const audioEl = message.content
      ? createAudioPlayer(message.content, message.id || message.tempId)
      : (() => { const d = document.createElement("div"); d.className = "message-audio loading"; d.textContent = "Loading..."; return d; })();
    bubbleEl.appendChild(audioEl);
    const footer = document.createElement("div");
    footer.className = "msg-footer";
    footer.innerHTML = `<span class="message-time">${formatTime(message.timestamp)}</span>${statusSVG}`;
    bubbleEl.appendChild(footer);

  } else if (message.type === "call") {
    const callType = message.callType || "audio";
    const callStatus = message.callStatus || "missed";
    const icon = callType === "video" ? "📹" : "📞";
    const expiresAt = message.callExpiresAt ? new Date(message.callExpiresAt) : null;
    const isExpired = expiresAt && expiresAt < new Date();
    const isActive = callStatus === "active" && !isExpired;
    const isMe = message.sender === "me" || message.user?.toString() === State.currentUser?.id?.toString();

    let statusLabel = "";
    if (callStatus === "missed") statusLabel = "Missed call";
    if (callStatus === "declined") statusLabel = "Declined";
    if (callStatus === "ended") statusLabel = message.callDuration > 0 ? `${String(Math.floor(message.callDuration / 60)).padStart(2, "0")}:${String(message.callDuration % 60).padStart(2, "0")}` : "Call ended";
    if (callStatus === "active" && !isExpired) statusLabel = "Tap to join";
    if (callStatus === "active" && isExpired) statusLabel = isMe ? "No answer" : "Missed call";

    bubbleEl.innerHTML = `
      <div class="call-message ${isActive && !isMe ? "joinable" : ""}" 
           data-room-id="${message.callRoomId || ""}"
           data-peer-id="${isMe ? (message.callPeerId || "") : (message.user || "")}"
           data-call-type="${callType}">
        <span class="call-msg-icon">${icon}</span>
        <div class="call-msg-info">
          <span class="call-msg-label">${callType === "video" ? "Video call" : "Voice call"}</span>
          <span class="call-msg-status ${callStatus === "missed" && !isMe ? "missed" : ""}">${statusLabel}</span>
        </div>
        ${isActive && !isMe ? `<button class="call-msg-join-btn">Join</button>` : ""}
      </div>
      ${footerHTML}`;

    // Wire join button & restore click
    setTimeout(() => {
      const msgDiv = bubbleEl.querySelector(".call-message");
      if (!msgDiv) return;

      msgDiv.addEventListener("click", (e) => {
        if (typeof CallManager !== "undefined" && CallManager.getCallState() !== "idle") {
          CallManager.restore();
          return;
        }

        // If not already in the call, allow joining if it's active
        if (isActive && !isMe) {
          const roomId = msgDiv.dataset.roomId;
          const peerId = msgDiv.dataset.peerId || message.user;
          const cType = msgDiv.dataset.callType;
          CallManager.rejoin(roomId, peerId, cType);
        }
      });

      const joinBtn = bubbleEl.querySelector(".call-msg-join-btn");
      joinBtn?.addEventListener("click", (e) => {
        e.stopPropagation();
        const roomId = msgDiv.dataset.roomId;
        const peerId = msgDiv.dataset.peerId || message.user;
        const cType = msgDiv.dataset.callType;
        CallManager.rejoin(roomId, peerId, cType);
      });
    }, 0);

  } else if (message.type === "document") {
    const { icon, color } = getFileIcon(message.fileName || "");
    const isUploading = message.uploadStatus === "uploading";
    bubbleEl.innerHTML = `
      ${replyHTML}
      <div class="message-document">
        <div class="doc-icon-wrap"><i class="ti ${icon}" style="color:${color};font-size:28px;"></i></div>
        <div class="doc-info">
          <span class="doc-filename">${sanitizeInput(message.fileName || "Document")}</span>
          <span class="doc-meta">${message.fileSize ? formatFileSize(message.fileSize) : ""}</span>
        </div>
        ${isUploading
        ? `<div class="media-overlay"><div class="loader"></div></div>`
        : `<div class="doc-actions">${message.content ? `<a href="${message.content}" target="_blank" rel="noopener" class="doc-btn doc-open">Open</a><button class="doc-btn doc-save" onclick="forceDownload('${message.content}','${message.fileName || "document"}')">Save</button>` : ""}</div>`}
      </div>
      ${footerHTML}`;
  }

  // Reactions
  if (message.reactions && Object.keys(message.reactions).length) {
    const reactionsEl = document.createElement("div");
    reactionsEl.className = "message-reactions";
    const counts = {};
    Object.values(message.reactions).forEach(e => { counts[e] = (counts[e] || 0) + 1; });
    reactionsEl.innerHTML = Object.entries(counts)
      .map(([e, n]) => `<span class="reaction-badge">${e}${n > 1 ? " " + n : ""}</span>`)
      .join("");
    bubbleEl.appendChild(reactionsEl);
  }

  msgEl.appendChild(bubbleEl);

  // Wire reply preview click to scroll to target message
  const replyPreviewEl = bubbleEl.querySelector(".message-reply-preview");
  if (replyPreviewEl && message.replyTo) {
    replyPreviewEl.addEventListener("click", (e) => {
      e.stopPropagation();
      const targetEl = document.querySelector(`.message[data-message-id="${message.replyTo}"]`);
      if (targetEl) {
        targetEl.scrollIntoView({ behavior: "smooth", block: "center" });
        targetEl.classList.add("highlight-pulse");
        setTimeout(() => targetEl.classList.remove("highlight-pulse"), 1500);
      } else {
        showToast("Original message not found in history", "info");
      }
    });
  }

  // ── Interaction: touch events on mobile, mouse events on desktop ──
  let touchStartTime = 0;
  let touchStartX = 0;
  let touchStartY = 0;
  let optionsTriggered = false;
  const isMediaMsg = (message.type === "image" || message.type === "video");

  // Prevent drag options conflicts on mobile with custom tap/longpress detection
  msgEl.addEventListener("touchstart", (e) => {
    touchStartTime = Date.now();
    touchStartX = e.touches[0].clientX;
    touchStartY = e.touches[0].clientY;
    optionsTriggered = false;

    // Start long press timer
    State.longPressTimeout = setTimeout(() => {
      optionsTriggered = true;
      showMessageOptions(message, msgEl, e.touches[0]);
    }, 600);
  }, { passive: true });

  msgEl.addEventListener("touchmove", (e) => {
    const dx = e.touches[0].clientX - touchStartX;
    const dy = e.touches[0].clientY - touchStartY;
    if (Math.abs(dx) > 10 || Math.abs(dy) > 10) {
      clearTimeout(State.longPressTimeout);
    }
  }, { passive: true });

  msgEl.addEventListener("touchend", (e) => {
    clearTimeout(State.longPressTimeout);
    const duration = Date.now() - touchStartTime;

    // If options were already triggered by the timeout, prevent any click
    if (optionsTriggered) {
      e.preventDefault();
      return;
    }

    // Single-tap handler on media element: open media viewer (skip options popup)
    const targetMedia = e.target.closest(".message-media");
    if (targetMedia && duration < 500 && !isRecording && !State.isSwiping) {
      e.preventDefault();
      e.stopPropagation();
      if (!viewer && State.activeChat) {
        viewer = new MediaViewer(State.activeChat);
      }
      if (viewer) viewer.open(msgEl.dataset.messageId);
    }
  }, { passive: false });

  // Desktop: right-click
  msgEl.addEventListener("contextmenu", (e) => {
    e.preventDefault();
    showMessageOptions(message, msgEl, e);
  });

  // Desktop: double-click (disabled for media to prevent conflict with viewer clicks)
  if (!isMediaMsg) {
    msgEl.addEventListener("dblclick", (e) => {
      showMessageOptions(message, msgEl, e);
    });
  }

  return msgEl;
}

// =============================================================================
// MESSAGE OPTIONS (reactions / reply)
// =============================================================================
function showMessageOptions(message, msgEl, event) {
  // Remove any existing popup
  document.querySelectorAll(".message-options-popup").forEach(p => p.remove());
  navigator.vibrate && navigator.vibrate(20);

  const isMe = msgEl.classList.contains("self");

  const popup = document.createElement("div");
  popup.className = `message-options-popup ${isMe ? "self-side" : "other-side"}`;
  popup.innerHTML = `
    <div class="reaction-row">
      ${EMOJI_LIST.slice(0, 8).map(e => `<button class="emoji-quick-btn" data-emoji="${e}">${e}</button>`).join("")}
    </div>
    <div class="options-row">
      <button class="option-btn reply-opt">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="9 17 4 12 9 7"/><path d="M20 18v-2a4 4 0 0 0-4-4H4"/></svg>
        Reply
      </button>
    </div>`;

  // Wire emoji buttons
  popup.querySelectorAll(".emoji-quick-btn").forEach(btn => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const msgId = message.id || message.tempId;
      socket.emit("react", { messageId: msgId, to: State.activeChat, emoji: btn.dataset.emoji });
      popup.remove();
    });
  });

  // Wire reply button
  popup.querySelector(".reply-opt").addEventListener("click", (e) => {
    e.stopPropagation();
    State.replyingTo = message.id || message.tempId;
    const preview = message.type === "text" ? message.content : `📷 ${message.type}`;
    document.getElementById("reply-text").textContent = preview;
    document.getElementById("reply-preview").style.display = "flex";
    document.getElementById("message-input").focus();
    popup.remove();
  });

  // ── Smart positioning ──
  // Append to messages-container (not msgEl) to avoid clipping
  const container = document.getElementById("messages-container");
  container.appendChild(popup);

  // Measure after append
  const popupRect = popup.getBoundingClientRect();
  const msgRect = msgEl.getBoundingClientRect();
  const contRect = container.getBoundingClientRect();
  const popW = popupRect.width || 240;
  const popH = popupRect.height || 90;

  // Vertical: prefer above the message, flip below if not enough space
  let top = msgRect.top - contRect.top + container.scrollTop - popH - 8;
  if (top < container.scrollTop + 4) {
    top = msgRect.bottom - contRect.top + container.scrollTop + 8;
  }

  // Horizontal: align to message side
  let left = isMe
    ? msgRect.right - contRect.left - popW        // right-align for sent
    : msgRect.left - contRect.left;               // left-align for received
  left = Math.max(4, Math.min(left, contRect.width - popW - 4));

  popup.style.position = "absolute";
  popup.style.top = `${top}px`;
  popup.style.left = `${left}px`;

  // ── Close on outside click — use setTimeout to skip current event ──
  setTimeout(() => {
    const close = (e) => {
      if (!popup.contains(e.target)) {
        popup.remove();
        document.removeEventListener("click", close, true);
        document.removeEventListener("touchstart", close, true);
      }
    };
    document.addEventListener("click", close, true);
    document.addEventListener("touchstart", close, true);
  }, 150);
}

// =============================================================================
// SEND MESSAGE
// =============================================================================
function sendMessage() {
  const input = document.getElementById("message-input");
  const content = input.value.trim();
  if (!content || !State.activeChat) return;

  const tempId = generateId();
  const message = {
    tempId,
    id: tempId,
    type: "text",
    content,
    sender: "me",
    user: State.currentUser.id,
    timestamp: Date.now(),
    replyTo: State.replyingTo || null,
    reactions: {},
    status: { sent: false, delivered: false, seen: false },
  };

  if (!State.messages[State.activeChat]) State.messages[State.activeChat] = [];
  State.messages[State.activeChat].unshift(message);
  State.messageIndex[tempId] = State.activeChat;

  const conv = State.conversations.find(c => c.id === State.activeChat);
  if (conv) { conv.lastMessage = content; conv.timestamp = Date.now(); }
  renderChatList(document.getElementById("chat-search").value.trim().toLowerCase());

  document.getElementById("messages").appendChild(createMessageElement(message));
  document.getElementById("messages-container").scrollTop = 99999;

  OutboxQueue.add({
    tempId, to: State.activeChat, type: "text", content,
    replyTo: State.replyingTo || null, clientTime: Date.now()
  });

  socket.emit("private_message", {
    message: {
      tempId, to: State.activeChat, type: "text", content,
      replyTo: State.replyingTo || null, clientTime: Date.now()
    }
  });

  input.value = "";
  document.getElementById("send-btn").disabled = true;
  State.replyingTo = null;
  document.getElementById("reply-preview").style.display = "none";
}

// =============================================================================
// TYPING
// =============================================================================
let typingTimer = null;
function handleTyping() {
  socket.emit("typing:start", { to: State.activeChat });
  clearTimeout(typingTimer);
  typingTimer = setTimeout(() => {
    socket.emit("typing:stop", { to: State.activeChat });
  }, 2000);
}

// =============================================================================
// MOBILE NAV
// =============================================================================
function initMobileNavigation() {
  if (window.innerWidth >= 768) return;
  const chatWindow = document.getElementById("chat-window");
  let startX = 0;
  chatWindow.addEventListener("touchstart", e => { startX = e.changedTouches[0].screenX; }, { passive: true });
  chatWindow.addEventListener("touchend", e => {
    const dx = e.changedTouches[0].screenX - startX;
    if (dx > 80 && !State.isSwiping) {
      document.getElementById("chat-list-sidebar").classList.remove("hidden");
      chatWindow.classList.remove("active");
      State.activeChat = null;
    }
  }, { passive: true });
}
