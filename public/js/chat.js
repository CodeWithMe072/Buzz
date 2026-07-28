/**
 * chat.js — Chat list, chat window, message rendering, sending,
 *            reactions, replies, typing, mobile nav, and search.
 */

// =============================================================================
// CHAT SCREEN
// =============================================================================
function showChatScreen() {
  const loginScreen = document.getElementById("login-screen");
  if (loginScreen) loginScreen.classList.remove("active");
  const signupScreen = document.getElementById("signup-screen");
  if (signupScreen) signupScreen.classList.remove("active");
  const chatScreen = document.getElementById("chat-screen");
  if (chatScreen) chatScreen.classList.add("active");

  const currentUsername = document.getElementById("current-username");
  if (currentUsername) currentUsername.textContent = State.currentUser.username;
  const currentUserAvatar = document.getElementById("current-user-avatar");
  if (currentUserAvatar) {
    currentUserAvatar.innerHTML = `<span>${State.currentUser.avatar || State.currentUser.username.charAt(0).toUpperCase()}</span>`;
  }
  initChatWindow();
  initMobileNavigation();
  initAppNavigation();
}

// =============================================================================
// CHAT LIST — only accepted connections
// =============================================================================
function initChatList() {
  // Conversations are already built from contacts in auth.js bootstrapAfterLogin
  renderChatList();
  const logoutBtn = document.getElementById("logout-btn");
  if (logoutBtn) {
    logoutBtn.addEventListener("click", logout);
  }

  // Search bar filter
  const searchInput = document.getElementById("chat-search");
  searchInput.addEventListener("input", () => {
    renderChatList(searchInput.value.trim().toLowerCase());
  });
}

// =============================================================================
// LAST MESSAGE PREVIEW GENERATOR
// =============================================================================
function getLastMessageHTML(conv) {
  if (conv.messagesLoaded === false) {
    return `<span style="color: var(--text-secondary); opacity: 0.6;">Loading...</span>`;
  }

  const convMessages = State.messages[conv.id] || [];
  const lastMsg = convMessages[0];

  if (!lastMsg) {
    return `<span></span>`;
  }

  // 1. Determine if it is status reply
  let isStatusReply = false;
  let replyText = "";
  if (lastMsg.type === "text") {
    if (lastMsg.content && lastMsg.content.startsWith('{"isStatusReply":true')) {
      try {
        const data = JSON.parse(lastMsg.content);
        isStatusReply = true;
        replyText = data.replyText || "";
      } catch (e) {
        // fallback
      }
    }
  }

  // 2. Generate tick status icon if sent by "me"
  const isMe = lastMsg.sender === "me" || lastMsg.user?.toString() === (State.currentUser?.id || State.currentUser?._id)?.toString();
  let tickHTML = "";
  if (isMe) {
    const status = lastMsg.status || { sent: true, delivered: false, seen: false };
    let statusClass = "clock";
    let strokeColor = "rgba(255, 255, 255, 0.4)";
    let svgContent = "";

    if (status.seen) {
      statusClass = "seen";
      strokeColor = "#1da1f2";
      svgContent = `<polyline points="2 8 6 12 14 4"/><polyline points="5 8 9 12 17 4" style="transform:translate(-9px,0)"/>`;
    } else if (status.delivered) {
      statusClass = "delivered";
      strokeColor = "currentColor";
      svgContent = `<polyline points="2 8 6 12 14 4"/><polyline points="5 8 9 12 17 4" style="transform:translate(-9px,0)"/>`;
    } else if (status.sent) {
      statusClass = "sent";
      strokeColor = "currentColor";
      svgContent = `<polyline points="2 8 6 12 14 4"/>`;
    } else {
      statusClass = "clock";
      strokeColor = "currentColor";
      svgContent = `<circle cx="8" cy="8" r="6.5"/><polyline points="8 4 8 8 11 10"/>`;
    }

    tickHTML = `
      <svg class="status-icon ${statusClass}" viewBox="0 0 16 16" style="width: 16px; height: 12px; fill: none; stroke: ${strokeColor}; stroke-width: 2.5; stroke-linecap: round; stroke-linejoin: round; flex-shrink: 0; margin-right: 3px; vertical-align: middle; display: inline-block;">
        ${svgContent}
      </svg>
    `;
  }

  // 3. Generate icon & text preview
  let textPreview = "";
  let iconHTML = "";

  if (isStatusReply) {
    iconHTML = `
      <svg class="status-reply-icon" viewBox="0 0 24 24" style="width: 16px; height: 16px; fill: none; stroke: currentColor; stroke-width: 2.5; stroke-linecap: round; stroke-linejoin: round; flex-shrink: 0; margin-right: 4px; vertical-align: middle; display: inline-block;">
        <circle cx="12" cy="12" r="10" />
        <circle cx="12" cy="12" r="4" />
      </svg>
    `;
    textPreview = replyText;
  } else {
    if (lastMsg.type === "text") {
      textPreview = lastMsg.content || "";
    } else if (lastMsg.type === "image") {
      iconHTML = `<span style="margin-right: 4px; vertical-align: middle;">📷</span>`;
      textPreview = "Image";
    } else if (lastMsg.type === "video") {
      iconHTML = `<span style="margin-right: 4px; vertical-align: middle;">🎥</span>`;
      textPreview = "Video";
    } else if (lastMsg.type === "audio") {
      iconHTML = `<span style="margin-right: 4px; vertical-align: middle;">🎤</span>`;
      textPreview = "Voice message";
    } else if (lastMsg.type === "document") {
      iconHTML = `<span style="margin-right: 4px; vertical-align: middle;">📁</span>`;
      textPreview = lastMsg.fileName || "Document";
    } else if (lastMsg.type === "gif") {
      iconHTML = `<span style="margin-right: 4px; vertical-align: middle;">🎬</span>`;
      textPreview = "GIF";
    } else if (lastMsg.type === "sticker") {
      iconHTML = `<span style="margin-right: 4px; vertical-align: middle;">🖼️</span>`;
      textPreview = "Sticker";
    } else if (lastMsg.type === "call") {
      iconHTML = `<span style="margin-right: 4px; vertical-align: middle;">${lastMsg.callType === "video" ? "📹" : "📞"}</span>`;
      textPreview = lastMsg.callType === "video" ? "Video call" : "Voice call";
    } else {
      iconHTML = `<span style="margin-right: 4px; vertical-align: middle;">📷</span>`;
      textPreview = lastMsg.type || "Media";
    }
  }

  return `
    <div style="display: flex; align-items: center; width: 100%; overflow: hidden; white-space: nowrap; text-overflow: ellipsis;">
      ${tickHTML}
      ${iconHTML}
      <span style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${sanitizeInput(textPreview)}</span>
    </div>
  `;
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
        <div class="chat-item-preview ${conv.unread > 0 ? "unread" : ""} ${conv.messagesLoaded === false ? "loading-preview" : ""}">
          ${State.typingTimeouts && State.typingTimeouts[conv.id] ? `<span style="color: #25d366; font-weight: 500;">Typing...</span>` : getLastMessageHTML(conv)}
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
  if (window.liveVoiceState && window.liveVoiceState.isListening && window.liveVoiceState.targetId !== chatId) {
    if (typeof window.stopListeningToVoice === "function") {
      window.stopListeningToVoice();
    }
  }
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

  if (conv && conv.draft) {
    messageInput.value = conv.draft;
    const sendBtn = document.getElementById("send-btn");
    if (sendBtn) sendBtn.disabled = !conv.draft.trim();
    if (typeof window.updateInputContainerState === "function") {
      window.updateInputContainerState();
    }
  }

  const avatarEl = document.getElementById("chat-avatar");
  avatarEl.innerHTML = `<span>${conv.avatar}</span>`;
  avatarEl.className = "avatar"; // Reset classes

  // Clone element to reset previous click listeners
  const newAvatarEl = avatarEl.cloneNode(true);
  newAvatarEl.style.cursor = "default";
  avatarEl.parentNode.replaceChild(newAvatarEl, avatarEl);


  // Query and cache friend's moments
  if (typeof getFriendMoments === "function") {
    getFriendMoments(chatId).then(res => {
      if (res.code === 200) {
        const snapshotBtn = document.getElementById("chat-capture-snapshot-btn");
        if (res.Data?.allowed) {
          if (snapshotBtn) {
            snapshotBtn.style.display = "block";
            snapshotBtn.dataset.friendId = chatId;
            // Disable if friend is offline
            if (!conv.online) {
              snapshotBtn.disabled = true;
              snapshotBtn.style.opacity = "0.4";
              snapshotBtn.title = `${conv.username} is offline`;
            } else {
              snapshotBtn.disabled = false;
              snapshotBtn.style.opacity = "1";
              snapshotBtn.title = `Click Snapshot from ${conv.username}`;
            }
          }
        } else {
          if (snapshotBtn) snapshotBtn.style.display = "none";
        }

        if (res.Data?.moments?.length) {
          if (!State.friendMoments) State.friendMoments = {};
          State.friendMoments[chatId] = res.Data.moments;
          newAvatarEl.classList.add("has-moments");
        }
      }
    }).catch(() => { });
  }

  // Query and check live voice permission
  if (typeof checkLiveVoiceAllowed === "function") {
    checkLiveVoiceAllowed(chatId).then(res => {
      const liveVoiceBtn = document.getElementById("chat-live-voice-btn");
      const chatOptionLiveVoice = document.getElementById("chatOption-LiveVoice");
      if (res.code === 200 && res.Data?.allowed) {
        if (liveVoiceBtn) {
          liveVoiceBtn.classList.add("voice-allowed");
          liveVoiceBtn.dataset.friendId = chatId;
          if (!conv.online) {
            liveVoiceBtn.disabled = true;
            liveVoiceBtn.style.opacity = "0.4";
            liveVoiceBtn.title = `${conv.username} is offline`;
          } else {
            liveVoiceBtn.disabled = false;
            liveVoiceBtn.style.opacity = "1";
            liveVoiceBtn.title = `Listen to ${conv.username}'s Live Voice`;
          }
        }
        if (chatOptionLiveVoice) {
          chatOptionLiveVoice.classList.add("voice-allowed");
          chatOptionLiveVoice.dataset.friendId = chatId;
          if (!conv.online) {
            chatOptionLiveVoice.style.pointerEvents = "none";
            chatOptionLiveVoice.style.opacity = "0.4";
            chatOptionLiveVoice.title = `${conv.username} is offline`;
          } else {
            chatOptionLiveVoice.style.pointerEvents = "auto";
            chatOptionLiveVoice.style.opacity = "1";
            chatOptionLiveVoice.title = `Listen to ${conv.username}'s Live Voice`;
          }
        }
        if (typeof window.syncVoiceButtonState === "function") {
          window.syncVoiceButtonState(chatId);
        }
      } else {
        if (liveVoiceBtn) {
          liveVoiceBtn.classList.remove("voice-allowed");
        }
        if (chatOptionLiveVoice) {
          chatOptionLiveVoice.classList.remove("voice-allowed");
        }
      }
    }).catch(() => { });
  }

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
    // Hide navbar on mobile when chat is active
    const navbar = document.querySelector(".app-navbar");
    if (navbar) navbar.style.display = "none";
  }

  // Chat options panel
  const chatOptionEl = document.getElementById("chatOption");
  chatOptionEl.classList.remove("active");
  document.getElementById("chat-info-btn").onclick = (e) => {

    e.stopPropagation();
    chatOptionEl.classList.toggle("active");

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

  const conv = State.conversations.find(c => c.id === chatId);
  if (conv && conv.messagesLoaded === false) {
    const loadingEl = document.createElement("div");
    loadingEl.className = "chat-messages-loading";
    loadingEl.innerHTML = `
      <div class="spinner"></div>
      <p>Loading messages...</p>
    `;
    messagesContainer.appendChild(loadingEl);
    return;
  }

  const messages = State.messages[chatId] || [];
  for (let i = messages.length - 1; i >= 0; i--) {
    messagesContainer.appendChild(createMessageElement(messages[i]));
  }

  const messagesContainerEl = document.getElementById("messages-container");
  if (messagesContainerEl) {
    messagesContainerEl.scrollTop = 99999;
  }
  const scrollToBottomBtn = document.getElementById("scroll-to-bottom-btn");
  if (scrollToBottomBtn) {
    scrollToBottomBtn.style.display = "none";
    scrollToBottomBtn.style.opacity = "0";
  }
  if (typeof MediaViewer !== "undefined") {
    viewer = new MediaViewer(chatId);
  }
  attactEventOnMedia();
}

function attactEventOnMedia() {
  // Handled globally via event delegation in chat.js
}
window.attactEventOnMedia = attactEventOnMedia;

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
        (/[\u2600-\u27BF]/u.test(segment) && !/[0-9#*]/u.test(segment));
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
function renderStatusReplyBubble(statusData, footerHTML, message) {
  const isFailed = message.uploadStatus === "failed";

  const accentBorderHtml = `
    <div style="width: 4px; background: linear-gradient(135deg, #f58529, #dd2a7b); border-radius: 4px 0 0 4px; flex-shrink: 0;"></div>
  `;

  let typeIcon = "";
  if (statusData.statusType === "video") {
    typeIcon = `<svg viewBox="0 0 24 24" width="14" height="14" fill="rgba(255,255,255,0.7)" style="margin-right: 4px; flex-shrink: 0; display: inline-block; vertical-align: middle;"><path d="M17 10.5V7c0-.55-.45-1-1-1H4c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h12c.55 0 1-.45 1-1v-3.5l4 4v-11l-4 4z"/></svg>`;
  } else if (statusData.statusType === "image" || statusData.statusType === "photo") {
    typeIcon = `<svg viewBox="0 0 24 24" width="14" height="14" fill="rgba(255,255,255,0.7)" style="margin-right: 4px; flex-shrink: 0; display: inline-block; vertical-align: middle;"><path d="M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z"/></svg>`;
  }

  let thumbnailHtml = "";
  if (statusData.statusType === "text") {
    const textPreview = statusData.statusText.length > 20 ? statusData.statusText.slice(0, 20) + "..." : statusData.statusText;
    thumbnailHtml = `
      <div style="width: 45px; height: 45px; border-radius: 4px; background: ${statusData.statusBg || '#3f51b5'}; display: flex; align-items: center; justify-content: center; font-size: 6px; color: white; padding: 4px; box-sizing: border-box; text-align: center; font-weight: bold; overflow: hidden; line-height: 1.1; flex-shrink: 0;">
        ${sanitizeInput(textPreview)}
      </div>
    `;
  } else if (statusData.statusUrl) {
    if (statusData.statusType === "video") {
      thumbnailHtml = `
        <video src="${statusData.statusUrl}" style="width: 45px; height: 45px; object-fit: cover; border-radius: 4px; flex-shrink: 0; display: block;" muted playsinline></video>
      `;
    } else {
      thumbnailHtml = `
        <img src="${statusData.statusUrl}" style="width: 45px; height: 45px; object-fit: cover; border-radius: 4px; flex-shrink: 0; display: block;" />
      `;
    }
  }

  const previewBoxHtml = `
    <div class="status-reply-preview-box" style="display: flex; background: rgba(0, 0, 0, 0.18); border-radius: 6px; overflow: hidden; margin-bottom: 8px; font-size: 13px; align-items: stretch; cursor: pointer;">
      ${accentBorderHtml}
      <div style="flex: 1; min-width: 0; padding: 8px 10px; display: flex; flex-direction: column; justify-content: center; gap: 2px;">
        <div style="font-weight: 700; color: #ff8a65; font-size: 13px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
          ${sanitizeInput(statusData.senderName || "Status")} · Status
        </div>
        <div style="display: flex; align-items: center; color: rgba(255, 255, 255, 0.7); font-size: 12px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
          ${typeIcon}
          <span style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap; vertical-align: middle;">${sanitizeInput(statusData.statusText || "")}</span>
        </div>
      </div>
      <div style="padding: 6px; display: flex; align-items: center; justify-content: center; flex-shrink: 0;">
        ${thumbnailHtml}
      </div>
    </div>
  `;

  return `
    ${previewBoxHtml}
    <p class="messag-text" style="margin: 0; padding: 4px 10px 6px 10px; color: var(--text-primary); font-size: 14px; line-height: 1.4;">${makeLinksClickable(sanitizeInput(statusData.replyText || ""))}</p>
    ${footerHTML}
    ${isFailed ? `<div class="upload-fail-badge">Failed to send</div>` : ""}
  `;
}

window.openStatusViewerByStatusId = async (statusId) => {
  // 1. Search in own statuses
  if (State.myActiveStatuses) {
    const idx = State.myActiveStatuses.findIndex(s => s._id === statusId);
    if (idx !== -1) {
      if (typeof window.openStatusViewer === "function") {
        window.openStatusViewer({
          user: {
            id: State.currentUser._id || State.currentUser.id,
            username: "My Status",
            avatar: State.currentUser.avatar
          },
          moments: State.myActiveStatuses.map(s => ({
            _id: s._id,
            url: s.mediaUrl,
            type: s.mediaType,
            textContent: s.textContent,
            backgroundColor: s.backgroundColor,
            caption: s.caption,
            createdAt: s.createdAt,
            expiresAt: s.expiresAt,
            viewers: s.viewers
          }))
        }, idx);
      }
      return;
    }
  }

  // 2. Search in friends status feed
  if (State.statusFeed) {
    for (const group of State.statusFeed) {
      const idx = group.moments.findIndex(m => m._id === statusId);
      if (idx !== -1) {
        if (typeof window.openStatusViewer === "function") {
          window.openStatusViewer(group, idx);
        }
        return;
      }
    }
  }

  // 3. Fallback: Fetch feed and check
  try {
    const res = await apiRequest("GET", "/api/status/feed");
    const momentsObj = res?.data?.moments || {};
    const friendsSharing = Object.values(momentsObj);
    State.statusFeed = friendsSharing;

    for (const group of friendsSharing) {
      const idx = group.moments.findIndex(m => m._id === statusId);
      if (idx !== -1) {
        if (typeof window.openStatusViewer === "function") {
          window.openStatusViewer(group, idx);
        }
        return;
      }
    }

    // Check own status from API
    const myRes = await apiRequest("GET", "/api/status/me");
    const myActiveStatuses = myRes?.data?.data || [];
    State.myActiveStatuses = myActiveStatuses;
    const ownIdx = myActiveStatuses.findIndex(s => s._id === statusId);
    if (ownIdx !== -1) {
      if (typeof window.openStatusViewer === "function") {
        window.openStatusViewer({
          user: {
            id: State.currentUser._id || State.currentUser.id,
            username: "My Status",
            avatar: State.currentUser.avatar
          },
          moments: myActiveStatuses.map(s => ({
            _id: s._id,
            url: s.mediaUrl,
            type: s.mediaType,
            textContent: s.textContent,
            backgroundColor: s.backgroundColor,
            caption: s.caption,
            createdAt: s.createdAt,
            expiresAt: s.expiresAt,
            viewers: s.viewers
          }))
        }, ownIdx);
      }
      return;
    }
  } catch (e) {
    console.error("Failed to load status by ID:", e);
  }

  if (typeof showToast === "function") {
    showToast("This status has expired or is no longer available.", "warning");
  }
};

function createMessageElement(message) {
  const isMe = message.sender === "me" || message.user?.toString() === (State.currentUser.id || State.currentUser._id)?.toString();
  const msgEl = document.createElement("div");
  msgEl.className = `message ${isMe ? "self" : "other"}`;
  msgEl.dataset.messageId = message.id || message._id || message.tempId;

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

  if (message.isDisappearing) {
    bubbleEl.classList.add("disappearing-bubble");
    const isVideo = message.type === "video";
    const filterClass = message.cameraFilter ? `filter-${message.cameraFilter}` : "";
    const videoClass = filterClass;

    const coverUrl = message.cover || message.thumb;
    const mediaPreviewHTML = isVideo
      ? (coverUrl
        ? `<img src="${coverUrl}" class="${videoClass}" style="width: 100%; height: 100%; object-fit: cover; display: block; border-radius: inherit;" />`
        : `<div class="disappearing-video-placeholder ${videoClass}" style="width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; background: #1a1a1a; border-radius: inherit;"><svg viewBox="0 0 24 24" width="48" height="48" fill="rgba(255,255,255,0.4)"><path d="M8 5v14l11-7z"/></svg></div>`
      )
      : `<img src="${message.content}" alt="Disappearing Photo" style="width: 100%; height: 100%; object-fit: cover; display: block; border-radius: inherit;" />`;

    // Calculate overlay html for special Snapchat/Instagram filters
    let overlayHTML = "";
    if (isVideo && message.cameraFilter === "glasses") {
      overlayHTML = `
        <div style="position: absolute; z-index: 6; top: 40%; left: 50%; transform: translate(-50%, -50%); pointer-events: none; width: 90px; height: 27px;">
            <svg viewBox="0 0 200 60" width="100%" height="100%">
                <path d="M10 25 C10 10, 80 10, 85 25 C90 40, 15 40, 10 25 Z" fill="#181818" stroke="#d4af37" stroke-width="2.5" />
                <text x="47" y="30" fill="#fff" font-size="9" font-family="sans-serif" text-anchor="middle" font-weight="bold" letter-spacing="1.5">vibes</text>
                <path d="M115 25 C120 10, 190 10, 190 25 C185 40, 110 40, 115 25 Z" fill="#181818" stroke="#d4af37" stroke-width="2.5" />
                <text x="152" y="30" fill="#fff" font-size="9" font-family="sans-serif" text-anchor="middle" font-weight="bold" letter-spacing="1.5">vibes</text>
                <path d="M85 22 Q100 15 115 22" fill="none" stroke="#d4af37" stroke-width="3" />
                <path d="M10 22 C3 22, 1 12, 1 12" fill="none" stroke="#d4af37" stroke-width="2" />
                <path d="M190 22 C197 22, 199 12, 199 12" fill="none" stroke="#d4af37" stroke-width="2" />
            </svg>
        </div>
      `;
    } else if (isVideo && message.cameraFilter === "retro8mm") {
      overlayHTML = `
        <div style="position: absolute; inset: 0; pointer-events: none; z-index: 6; box-sizing: border-box; border: 8px solid #000; box-shadow: inset 0 0 15px rgba(0,0,0,0.85);">
            <div style="position: absolute; left: 2px; top: 0; bottom: 0; display: flex; flex-direction: column; justify-content: space-around; align-items: center; width: 4px; opacity: 0.8;">
                <div style="width: 3px; height: 5px; background: #222; border-radius: 0.5px;"></div>
                <div style="width: 3px; height: 5px; background: #222; border-radius: 0.5px;"></div>
                <div style="width: 3px; height: 5px; background: #222; border-radius: 0.5px;"></div>
            </div>
            <div style="position: absolute; right: 2px; top: 0; bottom: 0; display: flex; flex-direction: column; justify-content: space-around; align-items: center; width: 4px; opacity: 0.8;">
                <div style="width: 3px; height: 5px; background: #222; border-radius: 0.5px;"></div>
                <div style="width: 3px; height: 5px; background: #222; border-radius: 0.5px;"></div>
                <div style="width: 3px; height: 5px; background: #222; border-radius: 0.5px;"></div>
            </div>
        </div>
      `;
    } else if (isVideo && message.cameraFilter === "time") {
      const now = new Date(message.timestamp || Date.now());
      let hours = now.getHours();
      const ampm = hours >= 12 ? 'pm' : 'am';
      hours = hours % 12;
      hours = hours ? hours : 12;
      const minutes = now.getMinutes().toString().padStart(2, '0');
      const timeStr = `${hours}:${minutes} ${ampm}`;
      overlayHTML = `
        <div style="position: absolute; z-index: 6; top: 50%; left: 50%; transform: translate(-50%, -50%); color: #fff; font-family: 'Georgia', serif; font-size: 10px; font-style: italic; text-shadow: 0 1px 2px rgba(0,0,0,0.8); text-align: center; pointer-events: none; width: 100%;">
            life at ${timeStr} 🤍
        </div>
      `;
    } else if (isVideo && message.cameraFilter === "day") {
      const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
      const dayStr = days[new Date(message.timestamp || Date.now()).getDay()];
      overlayHTML = `
        <div style="position: absolute; z-index: 6; bottom: 45px; left: 50%; transform: translateX(-50%); color: #fff; font-family: 'Arial Black', sans-serif; font-size: 13px; font-weight: 900; letter-spacing: 1px; text-shadow: 0 1px 3px rgba(0,0,0,0.9); text-transform: uppercase; text-align: center; pointer-events: none; width: 100%;">
            ${dayStr}
        </div>
      `;
    }

    const badgeIconHTML = isVideo
      ? `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="margin-right: 4px; vertical-align: middle;">
           <polygon points="23 7 16 12 23 17 23 7"/>
           <rect x="1" y="5" width="15" height="14" rx="2" ry="2"/>
         </svg>`
      : `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="margin-right: 4px; vertical-align: middle;">
           <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
           <circle cx="12" cy="13" r="4"/>
         </svg>`;

    bubbleEl.innerHTML = `
      ${replyHTML}
      <div class="disappearing-preview-content" style="cursor: pointer; position: relative; width: 200px; height: 266px; border-radius: 16px; overflow: hidden; background: #0b0b0b; border: 1px solid rgba(255,255,255,0.08);">
         ${mediaPreviewHTML}
         ${overlayHTML}
         
         <!-- Disappearing Overlay Badge -->
         <div style="position: absolute; bottom: 8px; left: 8px; background: rgba(0, 0, 0, 0.65); backdrop-filter: blur(4px); -webkit-backdrop-filter: blur(4px); color: white; padding: 4px 8px; border-radius: 12px; font-size: 10px; font-weight: 600; display: flex; align-items: center; gap: 2px; border: 1px solid rgba(255,255,255,0.15); pointer-events: none; z-index: 5; text-transform: uppercase; letter-spacing: 0.5px;">
            ${badgeIconHTML}
            <span>${isVideo ? 'Video' : '10s Photo'}</span>
         </div>
      </div>
      ${footerHTML}
    `;

    const previewContainer = bubbleEl.querySelector(".disappearing-preview-content");
    if (previewContainer) {
      previewContainer.addEventListener("click", () => {
        const username = isMe ? 'You' : (State.conversations.find(c => c.id === State.activeChat)?.username || 'Friend');
        const avatar = isMe ? (State.currentUser.avatar || '/images/default-avatar.png') : (State.conversations.find(c => c.id === State.activeChat)?.avatar || '/images/default-avatar.png');
        if (typeof window.openDisappearingStoryViewer === "function") {
          window.openDisappearingStoryViewer({
            src: message.content,
            type: message.type,
            username: username,
            avatar: avatar,
            cameraFacing: message.cameraFacing,
            cameraFilter: message.cameraFilter,
            timestamp: message.timestamp || message.clientTime,
            fileSize: message.fileSize,
            id: message.id || message._id || message.tempId
          });
        } else {
          showToast("Story viewer loading...", "info");
        }
      });
    }

  } else if (message.type === "text") {
    let isStatusReply = false;
    let statusReplyData = null;
    if (message.content && message.content.startsWith('{"isStatusReply":true')) {
      try {
        statusReplyData = JSON.parse(message.content);
        isStatusReply = true;
      } catch (e) {
        console.error("Failed to parse status reply:", e);
      }
    }

    if (isStatusReply && statusReplyData) {
      bubbleEl.innerHTML = renderStatusReplyBubble(statusReplyData, footerHTML, message);

      // Bind click handler for status reply preview box
      setTimeout(() => {
        const previewBox = bubbleEl.querySelector(".status-reply-preview-box");
        if (previewBox) {
          previewBox.onclick = (e) => {
            e.stopPropagation();
            if (typeof window.openStatusViewerByStatusId === "function") {
              window.openStatusViewerByStatusId(statusReplyData.statusId);
            }
          };
        }
      }, 0);
    } else if (isEmojiOnly) {
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
    const isFailed = message.uploadStatus === "failed";
    bubbleEl.innerHTML = `
      ${replyHTML}
      <div class="message-media">
        ${src ? `<img src="${src}" alt="Image" loading="lazy">` : ""}
        ${isUploading ? `<div class="media-overlay"><div class="loader"></div></div>` : ""}
        ${isFailed ? `<div class="media-overlay"><button type="button" class="media-retry">↻</button></div>` : ""}
      </div>
      ${message.caption ? `<p class="messag-text caption">${sanitizeInput(message.caption)}</p>` : ""}
      ${footerHTML}`;

  } else if (message.type === "video") {
    const videoUrl = message.content;
    const coverUrl = message.cover || message.thumb;
    const isUploading = message.uploadStatus === "uploading";
    const isFailed = message.uploadStatus === "failed";
    bubbleEl.innerHTML = `
      ${replyHTML}
      <div class="message-media video-media">
        ${videoUrl ? `
          <img class="chat-video-preview video-thumb" src="${coverUrl || '/images/default-video-cover.png'}" alt="Video" loading="lazy" style="width:100%; max-height:350px; border-radius:inherit; object-fit:cover;">
          <div class="video-play-overlay-icon"><svg viewBox="0 0 24 24" width="28" height="28" fill="currentColor" style="display: block; margin-left: 3px;"><path d="M8 5v14l11-7z"/></svg></div>
        ` : (coverUrl ? `<img class="video-thumb" src="${coverUrl}" alt="Video">` : `<div class="video-placeholder">Video loading...</div>`)}
        ${isUploading ? `<div class="media-overlay"><div class="loader"></div></div>` : ""}
        ${isFailed ? `<div class="media-overlay"><button type="button" class="media-retry">↻</button></div>` : ""}
      </div>
      ${message.caption ? `<p class="messag-text caption">${sanitizeInput(message.caption)}</p>` : ""}
      ${footerHTML}`;

  } else if (message.type === "audio") {
    const audioEl = message.content
      ? createAudioPlayer(message.content, message.id || message._id || message.tempId)
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
    const isFailed = message.uploadStatus === "failed";
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
        : (isFailed
          ? `<div class="media-overlay"><button type="button" class="media-retry">↻</button></div>`
          : `<div class="doc-actions">${message.content ? `<a href="${message.content}" target="_blank" rel="noopener" class="doc-btn doc-open">Open</a><button class="doc-btn doc-save" onclick="forceDownload('${message.content}','${message.fileName || "document"}','${message.id || message._id || message.tempId}')">Save</button>` : ""}</div>`)}
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

    // If selection mode is active, handle selection toggling
    if (State.selectedMessageIds && State.selectedMessageIds.size > 0 && duration < 500) {
      e.preventDefault();
      e.stopPropagation();
      window.toggleMessageSelection(message, msgEl);
      return;
    }

    // Single-tap handler on media element: open media viewer (skip options popup)
    const targetMedia = e.target.closest(".message-media");
    if (targetMedia && duration < 500 && !isRecording && !State.isSwiping) {
      if (e.target.closest(".custom-video-controls") || e.target.closest(".video-center-play-overlay")) {
        return;
      }
      e.preventDefault();
      e.stopPropagation();
      const video = targetMedia.querySelector("video");
      if (video) {
        video.pause();
      }
      if (!viewer && State.activeChat) {
        viewer = new MediaViewer(State.activeChat);
      }
      if (viewer) viewer.open(msgEl.dataset.messageId, null, true);
    }
  }, { passive: false });

  // General click handler (desktop/mouse)
  msgEl.addEventListener("click", (e) => {
    if (State.selectedMessageIds && State.selectedMessageIds.size > 0) {
      e.preventDefault();
      e.stopPropagation();
      window.toggleMessageSelection(message, msgEl);
    }
  });

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

  // Handled globally via event delegation

  return msgEl;
}

// =============================================================================
// MESSAGE OPTIONS (reactions / reply)
// =============================================================================
function showMessageOptions(message, msgEl, event) {
  // Direct to mobile selection view if on mobile/tablet size
  if (window.innerWidth <= 768) {
    if (typeof window.selectMessageMobile === "function") {
      window.selectMessageMobile(message, msgEl);
      return;
    }
  }

  // Remove any existing popup
  document.querySelectorAll(".message-options-popup").forEach(p => p.remove());
  navigator.vibrate && navigator.vibrate(20);

  const isMe = msgEl.classList.contains("self");

  // Save as and open not show in gif
  const isMediaOrDoc = (message.type === "image" || message.type === "video" || message.type === "document");
  const isImageOrVideo = (message.type === "image" || message.type === "video");
  const statusHTML = isImageOrVideo ? `
    <button class="context-menu-item status-opt">
      <i class="ti ti-circle-dashed"></i>
      <span>Add to Status</span>
    </button>
  ` : '';
  
  const mediaDocHTML = isMediaOrDoc ? `
    <div class="context-menu-divider"></div>
    <button class="context-menu-item open-opt">
      <i class="ti ti-external-link"></i>
      <span>Open</span>
    </button>
    <button class="context-menu-item save-opt">
      <i class="ti ti-download"></i>
      <span>Save as</span>
    </button>
  ` : '';

  const popup = document.createElement("div");
  popup.className = `message-options-popup ${isMe ? "self-side" : "other-side"}`;
  popup.innerHTML = `
    <div class="whatsapp-emoji-bar">
      <button class="emoji-btn" data-emoji="👍">👍</button>
      <button class="emoji-btn" data-emoji="❤️">❤️</button>
      <button class="emoji-btn" data-emoji="😂">😂</button>
      <button class="emoji-btn" data-emoji="😮">😮</button>
      <button class="emoji-btn" data-emoji="😢">😢</button>
      <button class="emoji-btn" data-emoji="🙏">🙏</button>
      <button class="emoji-btn plus-btn" data-emoji="plus"><i class="ti ti-plus"></i></button>
    </div>
    <div class="whatsapp-context-menu">
      <button class="context-menu-item reply-opt">
        <i class="ti ti-arrow-back-up"></i>
        <span>Reply</span>
      </button>
      <button class="context-menu-item copy-opt">
        <i class="ti ti-copy"></i>
        <span>Copy</span>
      </button>
      <button class="context-menu-item forward-opt">
        <i class="ti ti-arrow-forward-up"></i>
        <span>Forward</span>
      </button>
      ${statusHTML}
      
      ${mediaDocHTML}
      
      <div class="context-menu-divider"></div>
      
      <button class="context-menu-item select-opt">
        <i class="ti ti-checkbox"></i>
        <span>Select</span>
      </button>
      
      <div class="context-menu-divider"></div>
      
      <button class="context-menu-item report-opt">
        <i class="ti ti-thumb-down"></i>
        <span>Report</span>
      </button>
      <button class="context-menu-item delete-opt" style="color: #ff453a;">
        <i class="ti ti-trash" style="color: #ff453a;"></i>
        <span>Delete</span>
      </button>
    </div>`;

  // Wire emoji reaction buttons
  popup.querySelectorAll(".emoji-btn:not(.plus-btn)").forEach(btn => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const msgId = message.id || message._id || message.tempId;
      socket.emit("react", { messageId: msgId, to: State.activeChat, emoji: btn.dataset.emoji });
      popup.remove();
    });
  });

  // Wire plus reaction button
  popup.querySelector(".plus-btn").addEventListener("click", (e) => {
    e.stopPropagation();
    const msgId = message.id || message._id || message.tempId;
    if (typeof window.openEmojiPickerModal === "function") {
      window.openEmojiPickerModal(msgId, State.activeChat);
    } else {
      showToast("More reactions coming soon!", "info");
    }
    popup.remove();
  });

  // Wire reply button
  popup.querySelector(".reply-opt").addEventListener("click", (e) => {
    e.stopPropagation();
    State.replyingTo = message.id || message._id || message.tempId;
    const preview = formatLastMessage(message);
    document.getElementById("reply-text").textContent = preview;
    document.getElementById("reply-preview").style.display = "flex";
    document.getElementById("message-input").focus();
    popup.remove();
  });

  // Wire copy button
  popup.querySelector(".copy-opt").addEventListener("click", (e) => {
    e.stopPropagation();
    const textToCopy = message.content || message.text || "";
    navigator.clipboard.writeText(textToCopy).then(() => {
      showToast("Copied to clipboard", "success");
    }).catch(() => {
      showToast("Failed to copy", "error");
    });
    popup.remove();
  });

  // Wire forward button
  popup.querySelector(".forward-opt").addEventListener("click", (e) => {
    e.stopPropagation();
    popup.remove();
    openForwardModal(message);
  });

  // Wire status button if applicable
  if (isImageOrVideo) {
    popup.querySelector(".status-opt").addEventListener("click", async (e) => {
      e.stopPropagation();
      popup.remove();
      
      const mediaUrl = message.content;
      if (!mediaUrl) {
        showToast("No media URL found to post to status", "error");
        return;
      }
      
      showToast("Preparing status update...", "info");
      
      try {
        const response = await fetch(mediaUrl);
        if (!response.ok) throw new Error("Failed to retrieve media file");
        const blob = await response.blob();
        
        if (typeof window.openStatusPreviewForBlob === "function") {
          await window.openStatusPreviewForBlob(blob, message.type);
        } else if (typeof window.handleStatusMediaUpload === "function") {
          const mimeType = message.type === "video" ? "video/mp4" : "image/jpeg";
          await window.handleStatusMediaUpload(blob, mimeType);
        } else {
          showToast("Status module not loaded. Please try again.", "error");
        }
      } catch (err) {
        console.error("[ContextMenu] Add to Status error:", err);
        showToast("Failed to prepare status media", "error");
      }
    });
  }

  // Wire select button
  popup.querySelector(".select-opt").addEventListener("click", (e) => {
    e.stopPropagation();
    showToast("Message selected", "info");
    popup.remove();
  });

  // Wire report button
  popup.querySelector(".report-opt").addEventListener("click", (e) => {
    e.stopPropagation();
    showToast("Message reported successfully", "success");
    popup.remove();
  });

  // Wire delete button
  popup.querySelector(".delete-opt").addEventListener("click", (e) => {
    e.stopPropagation();
    popup.remove();

    const msgId = message.id || message._id || message.tempId;
    const isMe = message.sender === "me" ||
      message.user?.toString() === (State.currentUser?.id || State.currentUser?._id)?.toString() ||
      message.from?.toString() === (State.currentUser?.id || State.currentUser?._id)?.toString();

    // Create and append the confirmation modal dynamically
    const modal = document.createElement("div");
    modal.className = "modal-overlay delete-message-modal";
    modal.style.zIndex = "2200";
    modal.innerHTML = `
      <div class="delete-confirm-box">
        <h3>Delete message?</h3>
        <div class="delete-confirm-actions">
          ${isMe ? '<button type="button" class="delete-btn everyone-btn">Delete for everyone</button>' : ''}
          <button type="button" class="delete-btn me-btn">Delete for me</button>
          <button type="button" class="delete-btn cancel-btn">Cancel</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);

    const cancelBtn = modal.querySelector(".cancel-btn");
    const meBtn = modal.querySelector(".me-btn");
    const everyoneBtn = modal.querySelector(".everyone-btn");

    cancelBtn.onclick = () => {
      modal.remove();
    };

    // Close on overlay click
    modal.onclick = (evt) => {
      if (evt.target === modal) modal.remove();
    };

    const performDelete = async (type) => {
      try {
        const res = await apiRequest("DELETE", `/api/message/${msgId}`, { type });
        if (res && res.status) {
          // Emit socket deletion sync event
          if (typeof socket !== "undefined" && socket.emit) {
            socket.emit("delete_message", { messageId: msgId, to: State.activeChat, type });
          }
          showToast("Message deleted", "success");
        } else {
          showToast("Failed to delete message", "error");
        }
      } catch (err) {
        console.error("Delete message error:", err);
        showToast("Error deleting message", "error");
      }
      modal.remove();
    };

    meBtn.onclick = () => performDelete("me");
    if (everyoneBtn) {
      everyoneBtn.onclick = () => performDelete("everyone");
    }
  });

  // Wire Open & Save as buttons if applicable
  if (isMediaOrDoc) {
    popup.querySelector(".open-opt").addEventListener("click", (e) => {
      e.stopPropagation();
      popup.remove();
      if (message.type === "document") {
        window.open(message.content, "_blank", "noopener,noreferrer");
      } else {
        const video = msgEl.querySelector("video");
        if (video) video.pause();
        if ((!viewer || viewer.chatId !== State.activeChat) && State.activeChat) {
          viewer = new MediaViewer(State.activeChat);
        }
        if (viewer) {
          viewer.open(msgEl.dataset.messageId, null, true);
        }
      }
    });

    popup.querySelector(".save-opt").addEventListener("click", (e) => {
      e.stopPropagation();
      popup.remove();
      const fileName = message.fileName || (message.type === "image" ? "image.jpg" : message.type === "video" ? "video.mp4" : "download");
      forceDownload(message.content, fileName, message.id || message._id || message.tempId);
    });
  }

  // ── Smart positioning ──
  // Append to messages-container (not msgEl) to avoid clipping
  const container = document.getElementById("messages-container");
  container.appendChild(popup);

  // Measure after append
  const popupRect = popup.getBoundingClientRect();
  const msgRect = msgEl.getBoundingClientRect();
  const contRect = container.getBoundingClientRect();
  const popW = Math.max(popupRect.width || 300, 300);
  const popH = Math.max(popupRect.height || 420, 420);

  // Vertical: prefer above the message, flip below if not enough space
  let top = msgRect.top - contRect.top + container.scrollTop - popH - 8;
  if (top < container.scrollTop + 8) {
    // Try below the message
    top = msgRect.bottom - contRect.top + container.scrollTop + 8;
    // If it also overflows the bottom of the viewport, adjust it to fit inside the visible chat window
    if (top + popH > container.scrollTop + contRect.height - 8) {
      top = container.scrollTop + contRect.height - popH - 8;
      if (top < container.scrollTop + 8) {
        top = container.scrollTop + 8;
      }
    }
  }

  // Horizontal: center relative to the click coordinate
  const clickX = (event && typeof event.clientX === "number") ? event.clientX : (msgRect.left + msgRect.width / 2);
  let left = clickX - contRect.left - (popW / 2);
  left = Math.max(12, Math.min(left, contRect.width - popW - 12));

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
// FORWARD MESSAGE MODAL
// =============================================================================
function openForwardModal(message) {
  // Resolve messages to forward
  let messagesToForward = [];

  let inputMessages = message;
  if (message instanceof Set) {
    inputMessages = Array.from(message);
  }

  const resolveSingleMessage = (m) => {
    if (!m) return null;
    if (typeof m === "string") {
      const chatId = State.messageIndex[m];
      if (chatId) {
        const found = (State.messages[chatId] || []).find(msg => (msg.id || msg._id || msg.tempId) === m);
        if (found) return found;
      }
      for (const cid in State.messages) {
        const found = State.messages[cid].find(msg => (msg.id || msg._id || msg.tempId) === m);
        if (found) return found;
      }
      return null;
    }
    return m;
  };

  if (Array.isArray(inputMessages)) {
    messagesToForward = inputMessages.map(resolveSingleMessage).filter(Boolean);
  } else {
    const resolved = resolveSingleMessage(inputMessages);
    if (resolved) {
      messagesToForward = [resolved];
    }
  }

  if (messagesToForward.length === 0) {
    showToast("No messages found to forward", "error");
    return;
  }

  // Sort messages chronologically
  messagesToForward.sort((a, b) => {
    const timeA = a.timestamp || a.clientTime || 0;
    const timeB = b.timestamp || b.clientTime || 0;
    return timeA - timeB;
  });

  // Remove existing modals if any
  document.querySelectorAll(".fwd-overlay").forEach(m => m.remove());

  const overlay = document.createElement("div");
  overlay.className = "fwd-overlay";
  overlay.id = "forwardModal";

  // Build conversations/chats list
  const chatListHTML = State.conversations.map(c => {
    const isLetterAvatar = c.avatar && c.avatar.length === 1;
    const avatarHTML = isLetterAvatar
      ? `<div class="fwd-avatar">${c.avatar}</div>`
      : `<img class="fwd-avatar" src="${c.avatar}" alt="${c.username}">`;

    return `
      <label class="fwd-item" data-chat-id="${c.id}">
        ${avatarHTML}
        <span class="fwd-name">${c.username}</span>
        <input type="checkbox" class="fwd-checkbox" value="${c.id}">
      </label>
    `;
  }).join("");

  overlay.innerHTML = `
    <div class="fwd-container">
      <div class="fwd-header">
        <h3 class="fwd-title">Forward Message to...</h3>
        <button class="fwd-close" id="fwdCloseBtn">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        </button>
      </div>
      <div class="fwd-search-container">
        <span class="fwd-search-icon">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="11" cy="11" r="8"></circle>
            <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
          </svg>
        </span>
        <input type="text" class="fwd-search-input" id="fwdSearchInput" placeholder="Search contacts...">
      </div>
      <div class="fwd-list" id="fwdList">
        <p class="fwd-section-title">Recent Chats</p>
        ${chatListHTML || '<p class="fwd-empty" style="text-align:center; color:var(--text-light); font-size:13px; margin: 20px 0;">No contacts available</p>'}
      </div>
      <div class="fwd-footer">
        <button class="fwd-btn" id="fwdSendBtn" disabled>Send</button>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);

  const searchInput = overlay.querySelector("#fwdSearchInput");
  const listItems = overlay.querySelectorAll(".fwd-item");
  const checkboxes = overlay.querySelectorAll(".fwd-checkbox");
  const sendBtn = overlay.querySelector("#fwdSendBtn");
  const closeBtn = overlay.querySelector("#fwdCloseBtn");

  // Search filter
  searchInput.addEventListener("input", (e) => {
    const q = e.target.value.toLowerCase().trim();
    listItems.forEach(item => {
      const name = item.querySelector(".fwd-name").textContent.toLowerCase();
      if (name.includes(q)) {
        item.style.display = "flex";
      } else {
        item.style.display = "none";
      }
    });
  });

  // Enable/Disable Send button based on selection
  const updateSendBtnState = () => {
    const selectedCount = Array.from(checkboxes).filter(cb => cb.checked).length;
    sendBtn.disabled = selectedCount === 0;
  };

  checkboxes.forEach(cb => {
    cb.addEventListener("change", updateSendBtnState);
  });

  // Close modal logic
  const closeModal = () => {
    overlay.remove();
  };

  closeBtn.addEventListener("click", closeModal);
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) closeModal();
  });

  // Escape key close
  const handleEsc = (e) => {
    if (e.key === "Escape") {
      closeModal();
      document.removeEventListener("keydown", handleEsc);
    }
  };
  document.addEventListener("keydown", handleEsc);

  // Send action
  sendBtn.addEventListener("click", () => {
    const selectedRecipients = Array.from(checkboxes)
      .filter(cb => cb.checked)
      .map(cb => cb.value);

    if (selectedRecipients.length === 0) return;

    selectedRecipients.forEach(recipientId => {
      messagesToForward.forEach(msg => {
        const tempId = generateId();

        // Construct message payload
        const forwardMsgPayload = {
          tempId,
          to: recipientId,
          type: msg.type,
          content: msg.content,
          caption: msg.caption || null,
          replyTo: null,
          fileName: msg.fileName || null,
          fileSize: msg.fileSize || null,
          clientTime: Date.now(),
          cover: msg.cover || null,
          thumb: msg.thumb || null,
          cameraFacing: msg.cameraFacing || null,
          cameraFilter: msg.cameraFilter || null,
          isDisappearing: msg.isDisappearing || false
        };

        // Add to local state messages array
        const localMsg = {
          tempId,
          id: tempId,
          type: msg.type,
          content: msg.content,
          cover: msg.cover || null,
          thumb: msg.thumb || null,
          fileName: msg.fileName || null,
          fileSize: msg.fileSize || null,
          caption: msg.caption || null,
          sender: "me",
          user: State.currentUser.id || State.currentUser._id,
          timestamp: Date.now(),
          replyTo: null,
          reactions: {},
          status: { sent: false, delivered: false, seen: false },
          cameraFacing: msg.cameraFacing || null,
          cameraFilter: msg.cameraFilter || null,
          isDisappearing: msg.isDisappearing || false
        };

        if (!State.messages[recipientId]) State.messages[recipientId] = [];
        State.messages[recipientId].unshift(localMsg);
        State.messageIndex[tempId] = recipientId;

        // Update conversations sidebar last message
        const conv = State.conversations.find(c => c.id === recipientId);
        if (conv) {
          conv.lastMessage = formatLastMessage(localMsg);
          conv.timestamp = Date.now();
        }

        // If active chat is this recipient, render message
        if (recipientId === State.activeChat) {
          const messagesEl = document.getElementById("messages");
          if (messagesEl) {
            messagesEl.appendChild(createMessageElement(localMsg));
          }
          const container = document.getElementById("messages-container");
          if (container) {
            container.scrollTop = 99999;
          }
        }

        // Queue in Outbox for reliability
        OutboxQueue.add({
          tempId,
          to: recipientId,
          type: msg.type,
          content: msg.content,
          caption: msg.caption || null,
          fileName: msg.fileName || null,
          fileSize: msg.fileSize || null,
          cover: msg.cover || null,
          thumb: msg.thumb || null,
          replyTo: null,
          clientTime: Date.now(),
          cameraFacing: msg.cameraFacing || null,
          cameraFilter: msg.cameraFilter || null,
          isDisappearing: msg.isDisappearing || false
        });

        // Send over socket connection
        if (socket && socket.connected) {
          socket.emit("private_message", {
            message: forwardMsgPayload
          });
        }
      });
    });

    // Refresh chat list order in sidebar
    renderChatList(document.getElementById("chat-search").value.trim().toLowerCase());

    closeModal();
    if (messagesToForward.length > 1) {
      showToast(`${messagesToForward.length} messages forwarded to ${selectedRecipients.length} chat(s)`, "success");
    } else {
      showToast(`Message forwarded to ${selectedRecipients.length} chat(s)`, "success");
    }
  });
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
    user: State.currentUser.id || State.currentUser._id,
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

  if (socket && socket.connected) {
    socket.emit("private_message", {
      message: {
        tempId, to: State.activeChat, type: "text", content,
        replyTo: State.replyingTo || null, clientTime: Date.now()
      }
    });
  }

  input.value = "";
  if (State.activeChat) {
    const conv = State.conversations.find(c => c.id === State.activeChat);
    if (conv) conv.draft = null;
    apiRequest("POST", "/api/chat/draft", { partnerId: State.activeChat, draftText: "" })
      .catch(err => console.error("[sendMessage] Failed to clear server draft:", err));
  }
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
      // Show navbar on mobile when swiped back
      const navbar = document.querySelector(".app-navbar");
      if (navbar) navbar.style.display = "flex";
    }
  }, { passive: true });
}

function openMomentsCarousel(friendId, clickedSnapUrl = null) {
  const moments = State.friendMoments[friendId] || [];
  if (!moments.length) return;

  const oldLightbox = document.querySelector(".moments-lightbox");
  if (oldLightbox) oldLightbox.remove();

  const lightbox = document.createElement("div");
  lightbox.className = "moments-lightbox";

  const slidesHtml = moments.map((m) => {
    const timeStr = typeof formatRelativeTime === "function"
      ? formatRelativeTime(new Date(m.createdAt))
      : new Date(m.createdAt).toLocaleTimeString();
    return `
      <div class="moments-slide">
        <img src="${m.url}" alt="Moment Snapshot" class="moment-carousel-img">
        <div class="moment-slide-time">${timeStr}</div>
      </div>
    `;
  }).join("");

  const showNav = moments.length > 1;
  const navHtml = showNav ? `
    <button class="carousel-btn prev-btn">&larr;</button>
    <button class="carousel-btn next-btn">&rarr;</button>
  ` : "";

  lightbox.innerHTML = `
    <div class="moments-lightbox-close">&times;</div>
    <div class="moments-carousel-container">
      <div class="moments-carousel-track">
        ${slidesHtml}
      </div>
      ${navHtml}
    </div>
  `;

  document.body.appendChild(lightbox);

  const track = lightbox.querySelector(".moments-carousel-track");
  const slides = lightbox.querySelectorAll(".moments-slide");
  let currentIndex = 0;

  if (clickedSnapUrl) {
    const idx = moments.findIndex(m => m.url === clickedSnapUrl);
    if (idx >= 0) currentIndex = idx;
  }

  const updateSlide = () => {
    track.style.transform = `translateX(-${currentIndex * 100}%)`;
    const prevBtn = lightbox.querySelector(".prev-btn");
    const nextBtn = lightbox.querySelector(".next-btn");
    if (prevBtn && nextBtn) {
      prevBtn.style.display = currentIndex === 0 ? "none" : "flex";
      nextBtn.style.display = currentIndex === slides.length - 1 ? "none" : "flex";
    }
  };

  if (showNav) {
    lightbox.querySelector(".prev-btn").onclick = (e) => {
      e.stopPropagation();
      if (currentIndex > 0) {
        currentIndex--;
        updateSlide();
      }
    };
    lightbox.querySelector(".next-btn").onclick = (e) => {
      e.stopPropagation();
      if (currentIndex < slides.length - 1) {
        currentIndex++;
        updateSlide();
      }
    };
  }

  const handleKeyDown = (e) => {
    if (e.key === "Escape") {
      closeLightbox();
    } else if (e.key === "ArrowLeft" && showNav && currentIndex > 0) {
      currentIndex--;
      updateSlide();
    } else if (e.key === "ArrowRight" && showNav && currentIndex < slides.length - 1) {
      currentIndex++;
      updateSlide();
    }
  };
  document.addEventListener("keydown", handleKeyDown);

  const closeLightbox = () => {
    lightbox.classList.remove("active");
    document.removeEventListener("keydown", handleKeyDown);
    setTimeout(() => lightbox.remove(), 300);
  };

  lightbox.querySelector(".moments-lightbox-close").onclick = (e) => {
    e.stopPropagation();
    closeLightbox();
  };

  lightbox.onclick = (e) => {
    if (e.target === lightbox || e.target.classList.contains("moments-slide")) {
      closeLightbox();
    }
  };

  setTimeout(() => {
    lightbox.classList.add("active");
    updateSlide();
  }, 10);
}

// Close chatOption panel when clicking outside
document.addEventListener("click", (e) => {
  const chatOption = document.getElementById("chatOption");
  const chatInfoBtn = document.getElementById("chat-info-btn");

  if (chatOption && chatOption.classList.contains("active")) {
    if (!chatOption.contains(e.target) && chatInfoBtn && !chatInfoBtn.contains(e.target)) {

      chatOption.classList.remove("active");
    }
  }
});

// Global delegate click handler for media messages (open MediaViewer)
document.addEventListener("click", (e) => {
  const media = e.target.closest(".message-media, .message-audio");
  if (media) {
    // If the click is inside custom video player controls or audio play button, do not open the MediaViewer
    if (e.target.closest(".custom-video-controls") || e.target.closest(".video-center-play-overlay") || e.target.closest(".audio-play-btn")) {
      return;
    }


    // If inside a disappearing story preview, handle separately (it has its own listener on disappearing-preview-content)
    if (media.closest(".disappearing-preview-content")) {

      return;
    }

    // Pause any playing video in the chat bubble before opening the viewer
    const video = media.querySelector("video");
    if (video) {
      video.pause();
    }

    // Pause any playing audio in the chat bubble before opening the viewer
    const audioContainer = media.closest(".message-audio");
    if (audioContainer) {
      const audioId = audioContainer.dataset.audioId;
      if (audioId) {
        const audioObj = audioPlayers.get(audioId);
        if (audioObj) {
          audioObj.pause();
          const playBtn = audioContainer.querySelector('.audio-play-btn');
          if (playBtn) {
            playBtn.innerHTML = `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>`;
          }
        }
      }
    }

    const msgEl = media.closest(".message");

    if (!msgEl) return;
    if ((!viewer || viewer.chatId !== State.activeChat) && State.activeChat) {

      viewer = new MediaViewer(State.activeChat);
    }
    if (viewer) {

      viewer.open(msgEl.dataset.messageId, null, true);
    }
  }
});

// Reusable Global Emoji Reaction Picker Modal Helper
window.openEmojiPickerModal = function (messageId, chatId) {
  const modal = document.getElementById("emoji-modal");
  const grid = document.getElementById("emoji-grid");
  const closeBtn = document.getElementById("close-emoji");
  if (!modal || !grid) return;

  // Clear previous content
  grid.innerHTML = "";

  const emojiList = [
    // Smileys
    "😀", "😃", "😄", "😁", "😆", "😅", "😂", "🤣", "😊", "😇", "🙂", "🙃", "😉", "😌", "😍", "🥰", "😘", "😗", "😙", "😚", "😋", "😛", "😝", "😜", "🤪", "🤨", "🧐", "🤓", "😎", "🥸", "🤩", "🥳", "😏", "😒", "😞", "😔", "😟", "😕", "🙁", "☹️", "😣", "😖", "😫", "😩", "🥺", "😢", "😭", "😤", "😠", "😡", "🤬", "🤯", "😳", "🥵", "🥶", "😱", "😨", "😰", "😥", "😓", "🤗", "🤔", "🫣", "🤭", "🫢", "🫡", "🤫", "🤥", "😶", "😐", "😑", "😬", "🫠", "🙄", "😯", "😦", "😧", "😮", "😲", "🥱", "😴", "🤤", "😪", "😵", "😵‍💫", "🫥", "🤐", "🥴", "🤢", "🤮", "🤧", "😷", "🤒", "🤕", "🤠", "🤡", "👹", "👺", "👻", "💀", "☠️", "👽", "👾", "🤖", "💩",
    // Hearts & Symbols
    "❤️", "🧡", "💛", "💚", "💙", "💜", "🖤", "🤍", "🤎", "💔", "❣️", "💕", "💞", "💓", "💗", "💖", "💘", "💝", "💟",
    // Gestures & Hands
    "👋", "🤚", "🖐️", "✋", "🖖", "👌", "🤌", "🤏", "✌️", "🤞", "🫰", "🤟", "🤘", "🤙", "👈", "👉", "👆", "🖕", "👇", "☝️", "👍", "👎", "✊", "👊", "🤛", "🤜", "👏", "🙌", "🫶", "👐", "🤲", "🤝", "🙏", "💅", "🤳", "💪", "🧠", "👀", "💋"
  ];

  emojiList.forEach(emoji => {
    const btn = document.createElement("button");
    btn.className = "emoji-btn";
    btn.textContent = emoji;
    btn.addEventListener("click", () => {
      if (typeof socket !== "undefined" && socket.emit) {
        socket.emit("react", { messageId, to: chatId, emoji });
        showToast("Reaction sent", "success");
      }
      modal.style.display = "none";
    });
    grid.appendChild(btn);
  });

  // Ensure modal is displayed above all overlays (e.g. MediaViewer)
  modal.style.zIndex = "2200";
  modal.style.display = "flex";

  const closeHandler = () => {
    modal.style.display = "none";
    cleanup();
  };

  const outsideClickHandler = (e) => {
    if (e.target === modal) {
      modal.style.display = "none";
      cleanup();
    }
  };

  const cleanup = () => {
    if (closeBtn) closeBtn.removeEventListener("click", closeHandler);
    modal.removeEventListener("click", outsideClickHandler);
  };

  if (closeBtn) {
    closeBtn.addEventListener("click", closeHandler);
  }
  modal.addEventListener("click", outsideClickHandler);
};

window.animateAndDeleteMessageFromDom = function (messageId) {
  const msgEl = document.querySelector(`.message[data-message-id="${messageId}"]`);
  if (msgEl) {
    // Add deletion class to trigger transition/animation
    msgEl.classList.add("message-deleting");
    // Remove element from DOM after animation completes (400ms)
    setTimeout(() => {
      msgEl.remove();
    }, 400);

    // Also remove the message object from the local State.messages array to keep state in sync
    const chatId = State.messageIndex[messageId];
    if (chatId) {
      const msgs = State.messages[chatId] || [];
      const index = msgs.findIndex(m => String(m.id ?? m.tempId ?? m._id) === String(messageId));
      if (index !== -1) {
        msgs.splice(index, 1);
      }
    }
  }
};

// Clear current message selection
window.clearMessageSelection = function () {
  document.querySelectorAll(".message.selected").forEach(el => el.classList.remove("selected"));
  document.querySelectorAll(".mobile-emoji-bar").forEach(el => el.remove());

  const selectionHeader = document.getElementById("mobile-selection-header");
  const chatHeader = document.querySelector(".chat-header:not(.mobile-selection-header)");
  if (selectionHeader) selectionHeader.style.display = "none";
  if (chatHeader) chatHeader.style.display = "flex";

  const statusBtn = document.getElementById("status-selection-btn");
  if (statusBtn) statusBtn.style.display = "none";

  State.selectedMessageIds = null;
  State.selectedMessage = null;
  State.selectedMessageEl = null;

  if (window.activeOutsideClickSelectorHandler) {
    document.removeEventListener("click", window.activeOutsideClickSelectorHandler, true);
    window.activeOutsideClickSelectorHandler = null;
  }
};

// Toggle single message selection in multi-selection mode
window.toggleMessageSelection = function (message, msgEl) {
  const msgId = message.id || message._id || message.tempId;
  if (!State.selectedMessageIds) {
    State.selectedMessageIds = new Set();
  }

  if (State.selectedMessageIds.has(msgId)) {
    State.selectedMessageIds.delete(msgId);
    msgEl.classList.remove("selected");
  } else {
    State.selectedMessageIds.add(msgId);
    msgEl.classList.add("selected");
  }

  const count = State.selectedMessageIds.size;
  const countEl = document.getElementById("selection-count");
  if (countEl) {
    countEl.textContent = count;
  }

  // Update status-selection-btn visibility based on selection content
  const statusBtn = document.getElementById("status-selection-btn");
  if (statusBtn) {
    if (count === 1) {
      const selectedId = Array.from(State.selectedMessageIds)[0];
      const selectedChatId = State.messageIndex[selectedId];
      if (selectedChatId) {
        const msg = (State.messages[selectedChatId] || []).find(m => m && (m.id || m._id || m.tempId) === selectedId);
        if (msg && (msg.type === "image" || msg.type === "video")) {
          statusBtn.style.display = "flex";
        } else {
          statusBtn.style.display = "none";
        }
      } else {
        statusBtn.style.display = "none";
      }
    } else {
      statusBtn.style.display = "none";
    }
  }

  // Dismiss floating reactions bar if not exactly 1 message selected
  if (count !== 1) {
    document.querySelectorAll(".mobile-emoji-bar").forEach(el => el.remove());
  } else {
    // If count returned to exactly 1, show reactions bar for the single remaining message
    const remainingId = Array.from(State.selectedMessageIds)[0];
    const remainingEl = document.querySelector(`.message[data-message-id="${remainingId}"]`);
    if (remainingEl) {
      const remainingChatId = State.messageIndex[remainingId];
      if (remainingChatId) {
        const msg = (State.messages[remainingChatId] || []).find(m => m && (m.id || m._id || m.tempId) === remainingId);
        if (msg) {
          window.showMobileEmojiBarForMessage(msg, remainingEl);
        }
      }
    }
  }

  if (count === 0) {
    clearMessageSelection();
  }
};

// Helper to render mobile reactions bar
window.showMobileEmojiBarForMessage = function (message, msgEl) {
  document.querySelectorAll(".mobile-emoji-bar").forEach(el => el.remove());

  const bubble = msgEl.querySelector(".message-bubble");
  if (!bubble) return;

  const rect = bubble.getBoundingClientRect();
  const emojiBar = document.createElement("div");
  emojiBar.className = "whatsapp-emoji-bar mobile-emoji-bar";
  emojiBar.innerHTML = `
      <button class="emoji-btn" data-emoji="👍">👍</button>
      <button class="emoji-btn" data-emoji="❤️">❤️</button>
      <button class="emoji-btn" data-emoji="😂">😂</button>
      <button class="emoji-btn" data-emoji="😮">😮</button>
      <button class="emoji-btn" data-emoji="😢">😢</button>
      <button class="emoji-btn" data-emoji="🙏">🙏</button>
      <button class="emoji-btn reply-btn" data-emoji="reply" style="color: #a8a8a8;" title="Reply"><i class="ti ti-arrow-back-up"></i></button>
      <button class="emoji-btn plus-btn" data-emoji="plus" title="More reactions"><i class="ti ti-plus"></i></button>
  `;

  const barWidth = 300;
  const viewportWidth = window.innerWidth;

  emojiBar.style.position = "fixed";
  let left = rect.left + rect.width / 2 - barWidth / 2;
  left = Math.max(10, Math.min(viewportWidth - barWidth - 10, left));

  let top = rect.top - 55;
  if (top < 70) {
    top = rect.bottom + 8;
  }

  emojiBar.style.top = `${top}px`;
  emojiBar.style.left = `${left}px`;
  emojiBar.style.zIndex = "1100";
  document.body.appendChild(emojiBar);

  // Wire emojis
  emojiBar.querySelectorAll(".emoji-btn:not(.plus-btn):not(.reply-btn)").forEach(btn => {
    btn.onclick = (e) => {
      e.stopPropagation();
      const msgId = message.id || message._id || message.tempId;
      if (typeof socket !== "undefined" && socket.emit) {
        socket.emit("react", { messageId: msgId, to: State.activeChat, emoji: btn.dataset.emoji });
        showToast("Reaction sent", "success");
      }
      clearMessageSelection();
    };
  });

  // Wire reply
  const replyBtn = emojiBar.querySelector(".reply-btn");
  if (replyBtn) {
    replyBtn.onclick = (e) => {
      e.stopPropagation();
      const msgId = message.id || message._id || message.tempId;
      State.replyingTo = msgId;
      const preview = typeof formatLastMessage === "function" ? formatLastMessage(message) : "Media";
      const replyTextEl = document.getElementById("reply-text");
      const replyPreviewEl = document.getElementById("reply-preview");
      if (replyTextEl && replyPreviewEl) {
        replyTextEl.textContent = preview;
        replyPreviewEl.style.display = "flex";
      }
      const inputEl = document.getElementById("message-input");
      if (inputEl) inputEl.focus();
      clearMessageSelection();
    };
  }

  // Wire plus
  const plusBtn = emojiBar.querySelector(".plus-btn");
  if (plusBtn) {
    plusBtn.onclick = (e) => {
      e.stopPropagation();
      const msgId = message.id || message._id || message.tempId;
      clearMessageSelection();
      if (typeof window.openEmojiPickerModal === "function") {
        window.openEmojiPickerModal(msgId, State.activeChat);
      }
    };
  }
};

// Select a message (mobile/tablet view) and initialize selection mode
window.selectMessageMobile = function (message, msgEl) {
  const msgId = message.id || message._id || message.tempId;
  clearMessageSelection();

  State.selectedMessageIds = new Set([msgId]);
  State.selectedMessage = message;
  State.selectedMessageEl = msgEl;

  msgEl.classList.add("selected");

  // Show selection header
  const selectionHeader = document.getElementById("mobile-selection-header");
  const chatHeader = document.querySelector(".chat-header:not(.mobile-selection-header)");
  if (selectionHeader) {
    selectionHeader.style.display = "flex";
    document.getElementById("selection-count").textContent = "1";
  }
  if (chatHeader) chatHeader.style.display = "none";

  const statusBtn = document.getElementById("status-selection-btn");
  if (statusBtn) {
    if (message.type === "image" || message.type === "video") {
      statusBtn.style.display = "flex";
    } else {
      statusBtn.style.display = "none";
    }
  }

  // Show reactions bar
  window.showMobileEmojiBarForMessage(message, msgEl);

  if (window.activeOutsideClickSelectorHandler) {
    document.removeEventListener("click", window.activeOutsideClickSelectorHandler, true);
    window.activeOutsideClickSelectorHandler = null;
  }

  // Close selection on clicking outside
  setTimeout(() => {
    window.activeOutsideClickSelectorHandler = (e) => {
      if (State.selectedMessageIds && State.selectedMessageIds.size > 0) {
        const emojiBar = document.querySelector(".mobile-emoji-bar");
        const clickedInsideEmojiBar = emojiBar && emojiBar.contains(e.target);
        const clickedInsideMessage = e.target.closest(".message");
        const clickedInsideSelectionHeader = e.target.closest(".mobile-selection-header");
        const clickedInsideDropdown = e.target.closest(".selection-dropdown-menu");

        if (!clickedInsideEmojiBar && !clickedInsideMessage && !clickedInsideSelectionHeader && !clickedInsideDropdown) {
          clearMessageSelection();
        }
      } else {
        clearMessageSelection();
      }
    };
    document.addEventListener("click", window.activeOutsideClickSelectorHandler, true);
  }, 0);
};

// Wire up selection action listeners globally
document.addEventListener("click", (e) => {
  // Close / Back button
  if (e.target.closest("#close-selection-btn")) {
    clearMessageSelection();
    return;
  }

  // Status button
  if (e.target.closest("#status-selection-btn")) {
    if (State.selectedMessageIds && State.selectedMessageIds.size === 1) {
      const selectedId = Array.from(State.selectedMessageIds)[0];
      const selectedChatId = State.messageIndex[selectedId];
      if (selectedChatId) {
        const msg = (State.messages[selectedChatId] || []).find(m => m && (m.id || m._id || m.tempId) === selectedId);
        if (msg && (msg.type === "image" || msg.type === "video")) {
          (async () => {
            showToast("Preparing status update...", "info");
            try {
              const response = await fetch(msg.content);
              if (!response.ok) throw new Error("Failed to retrieve media file");
              const blob = await response.blob();
              
              if (typeof window.openStatusPreviewForBlob === "function") {
                await window.openStatusPreviewForBlob(blob, msg.type);
              } else if (typeof window.handleStatusMediaUpload === "function") {
                const mimeType = msg.type === "video" ? "video/mp4" : "image/jpeg";
                await window.handleStatusMediaUpload(blob, mimeType);
              } else {
                showToast("Status module not loaded. Please try again.", "error");
              }
            } catch (err) {
              console.error("[SelectionHeader] Add to Status error:", err);
              showToast("Failed to prepare status media", "error");
            }
          })();
        }
      }
    }
    clearMessageSelection();
    return;
  }

  // Forward button
  if (e.target.closest("#forward-selection-btn")) {
    if (State.selectedMessageIds && State.selectedMessageIds.size > 0) {
      if (typeof openForwardModal === "function") {
        openForwardModal(State.selectedMessageIds);
      }
    }
    clearMessageSelection();
    return;
  }

  // Copy / More button
  if (e.target.closest("#more-selection-btn")) {
    e.stopPropagation();

    // Remove any existing dropdown first
    document.querySelectorAll(".selection-dropdown-menu").forEach(el => el.remove());

    // Check if status is applicable (exactly 1 image/video selected)
    const isSingleImageOrVideo = (State.selectedMessageIds && State.selectedMessageIds.size === 1) && (() => {
      const selectedId = Array.from(State.selectedMessageIds)[0];
      const selectedChatId = State.messageIndex[selectedId];
      if (selectedChatId) {
        const msg = (State.messages[selectedChatId] || []).find(m => m && (m.id || m._id || m.tempId) === selectedId);
        return msg && (msg.type === "image" || msg.type === "video");
      }
      return false;
    })();

    const statusDropdownHTML = isSingleImageOrVideo ? `
        <button class="context-menu-item status-opt">
            <i class="ti ti-circle-dashed"></i>
            <span>Add to Status</span>
        </button>
    ` : '';

    const dropdown = document.createElement("div");
    dropdown.className = "whatsapp-context-menu selection-dropdown-menu";
    dropdown.innerHTML = `
        <button class="context-menu-item copy-opt">
            <i class="ti ti-copy"></i>
            <span>Copy</span>
        </button>
        <button class="context-menu-item forward-opt">
            <i class="ti ti-arrow-forward-up"></i>
            <span>Forward</span>
        </button>
        ${statusDropdownHTML}
        <button class="context-menu-item delete-opt" style="color: #ff453a;">
            <i class="ti ti-trash" style="color: #ff453a;"></i>
            <span>Delete</span>
        </button>
    `;

    const btn = e.target.closest("#more-selection-btn");
    const rect = btn.getBoundingClientRect();
    dropdown.style.position = "fixed";
    dropdown.style.top = `${rect.bottom + 8}px`;
    dropdown.style.right = `${window.innerWidth - rect.right}px`;
    dropdown.style.zIndex = "3100";
    document.body.appendChild(dropdown);

    // Bind options
    dropdown.querySelector(".copy-opt").onclick = (evt) => {
      evt.stopPropagation();
      dropdown.remove();
      if (State.selectedMessageIds && State.selectedMessageIds.size > 0) {
        const texts = [];
        for (const msgId of State.selectedMessageIds) {
          const chatId = State.messageIndex[msgId];
          if (chatId) {
            const msg = (State.messages[chatId] || []).find(m => m && (m.id || m._id || m.tempId) === msgId);
            if (msg && msg.content) {
              texts.push(msg.content);
            }
          }
        }
        if (texts.length > 0) {
          navigator.clipboard.writeText(texts.join("\n")).then(() => {
            showToast("Copied messages", "success");
          }).catch(err => {
            console.error("Failed to copy text: ", err);
          });
        } else {
          showToast("No text to copy", "info");
        }
      }
      clearMessageSelection();
    };

    dropdown.querySelector(".forward-opt").onclick = (evt) => {
      evt.stopPropagation();
      dropdown.remove();
      const fwdBtn = document.getElementById("forward-selection-btn");
      if (fwdBtn) fwdBtn.click();
    };

    if (isSingleImageOrVideo) {
      dropdown.querySelector(".status-opt").onclick = (evt) => {
        evt.stopPropagation();
        dropdown.remove();
        const statusBtn = document.getElementById("status-selection-btn");
        if (statusBtn) statusBtn.click();
      };
    }

    dropdown.querySelector(".delete-opt").onclick = (evt) => {
      evt.stopPropagation();
      dropdown.remove();
      const delBtn = document.getElementById("delete-selection-btn");
      if (delBtn) delBtn.click();
    };

    // Close on click outside
    setTimeout(() => {
      const closeDropdown = (ev) => {
        if (!dropdown.contains(ev.target)) {
          dropdown.remove();
          document.removeEventListener("click", closeDropdown, true);
        }
      };
      document.addEventListener("click", closeDropdown, true);
    }, 0);

    return;
  }

  // Delete button
  if (e.target.closest("#delete-selection-btn")) {
    if (State.selectedMessageIds && State.selectedMessageIds.size > 0) {
      let allMine = true;
      const msgIds = Array.from(State.selectedMessageIds);

      for (const msgId of msgIds) {
        const chatId = State.messageIndex[msgId];
        if (chatId) {
          const msg = (State.messages[chatId] || []).find(m => m && (m.id || m._id || m.tempId) === msgId);
          if (msg) {
            const isMe = msg.sender === "me" ||
              msg.user?.toString() === (State.currentUser?.id || State.currentUser?._id)?.toString() ||
              msg.from?.toString() === (State.currentUser?.id || State.currentUser?._id)?.toString();
            if (!isMe) {
              allMine = false;
            }
          }
        }
      }

      const modal = document.createElement("div");
      modal.className = "modal-overlay delete-message-modal";
      modal.style.zIndex = "2200";
      modal.innerHTML = `
        <div class="delete-confirm-box">
          <h3>Delete ${msgIds.length} message${msgIds.length > 1 ? 's' : ''}?</h3>
          <div class="delete-confirm-actions">
            ${allMine ? '<button type="button" class="delete-btn everyone-btn">Delete for everyone</button>' : ''}
            <button type="button" class="delete-btn me-btn">Delete for me</button>
            <button type="button" class="delete-btn cancel-btn">Cancel</button>
          </div>
        </div>
      `;
      document.body.appendChild(modal);

      const cancelBtn = modal.querySelector(".cancel-btn");
      const meBtn = modal.querySelector(".me-btn");
      const everyoneBtn = modal.querySelector(".everyone-btn");

      cancelBtn.onclick = () => {
        modal.remove();
        clearMessageSelection();
      };

      modal.onclick = (evt) => {
        if (evt.target === modal) {
          modal.remove();
          clearMessageSelection();
        }
      };

      const performDelete = async (type) => {
        try {
          for (const msgId of msgIds) {
            const res = await apiRequest("DELETE", `/api/message/${msgId}`, { type });
            if (res && res.status) {
              if (typeof socket !== "undefined" && socket.emit) {
                socket.emit("delete_message", { messageId: msgId, to: State.activeChat, type });
              }
            }
          }
          showToast(`Deleted ${msgIds.length} message${msgIds.length > 1 ? 's' : ''}`, "success");
        } catch (err) {
          console.error("Delete messages error:", err);
          showToast("Error deleting messages", "error");
        }
        modal.remove();
        clearMessageSelection();
      };

      meBtn.onclick = () => performDelete("me");
      if (everyoneBtn) {
        everyoneBtn.onclick = () => performDelete("everyone");
      }
    }
  }
});

function initAppNavigation() {
  const chatBtn = document.getElementById("nav-chat-btn");
  const statusBtn = document.getElementById("nav-status-btn");
  const avatarBtn = document.getElementById("nav-avatar-btn");
  const avatarText = document.getElementById("nav-avatar-text");

  const chatSidebar = document.getElementById("chat-list-sidebar");
  const statusSidebar = document.getElementById("status-sidebar");

  if (!chatBtn || !statusBtn) return;

  // Initialize avatar at bottom
  if (State.currentUser) {
    if (avatarText) {
      avatarText.textContent = State.currentUser.username.charAt(0).toUpperCase();
    }
    if (avatarBtn) {
      if (State.currentUser.avatar && State.currentUser.avatar.length > 2) {
        avatarBtn.innerHTML = `<img src="${State.currentUser.avatar}" style="width: 100%; height: 100%; object-fit: cover; border-radius: 50%;" />`;
      } else {
        avatarBtn.innerHTML = `<span style="font-weight: 700; color: white;">${State.currentUser.username.charAt(0).toUpperCase()}</span>`;
      }
    }
  }

  chatBtn.onclick = async () => {
    chatBtn.classList.add("active");
    statusBtn.classList.remove("active");

    if (chatSidebar) {
      chatSidebar.style.display = "flex";
      chatSidebar.classList.remove("hidden");
    }
    if (statusSidebar) {
      statusSidebar.style.display = "none";
      statusSidebar.classList.add("hidden");
    }

    // Restore Chat window if it was replaced by status empty state
    const chatWindowEl = document.getElementById("chat-window");
    if (chatWindowEl && !document.getElementById("active-chat")) {
      try {
        const messageWindowHtml = await ComponentLoader.load("chat/message-window");
        chatWindowEl.innerHTML = messageWindowHtml;
        if (typeof initChatWindow === "function") initChatWindow();
        if (typeof initShowMedia === "function") initShowMedia();
        if (State.activeChat) {
          const activeId = State.activeChat;
          State.activeChat = null; // force reload
          openChat(activeId);
        }
      } catch (err) {
        console.error("Failed to restore chat window:", err);
      }
    }
  };

  statusBtn.onclick = async () => {
    statusBtn.classList.add("active");
    chatBtn.classList.remove("active");

    if (chatSidebar) {
      chatSidebar.style.display = "none";
      chatSidebar.classList.add("hidden");
    }
    if (statusSidebar) {
      statusSidebar.style.display = "flex";
      statusSidebar.classList.remove("hidden");
    }

    // Show status empty state panel on right side
    const chatWindowEl = document.getElementById("chat-window");
    if (chatWindowEl) {
      chatWindowEl.innerHTML = `
        <div class="status-empty-panel">
          <div class="status-empty-icon">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="12" cy="12" r="10"></circle>
              <circle cx="12" cy="12" r="6"></circle>
              <circle cx="12" cy="12" r="2"></circle>
            </svg>
          </div>
          <h3>Share status updates</h3>
          <p>Share photos, videos and text that disappear after 24 hours.</p>
        </div>
      `;
    }

    // Fetch from API only on first open; after that render from in-memory State
    if (!State.statusInitialFetchDone) {
      await fetchAndCacheStatusData();
    } else {
      renderStatusSidebar();
    }
  };


  if (avatarBtn) {
    avatarBtn.onclick = () => {
      if (typeof openProfileModal === "function") {
        openProfileModal("account");
      }
    };
  }

  // Bind status header plus / composer button
  const statusComposerBtn = document.getElementById("status-composer-trigger-btn");
  if (statusComposerBtn) {
    statusComposerBtn.onclick = () => {
      if (typeof window.openStatusComposer === "function") {
        window.openStatusComposer();
      }
    };
  }

  const statusOptionsBtn = document.getElementById("status-options-btn");
  if (statusOptionsBtn) {
    statusOptionsBtn.onclick = () => {
      if (typeof showToast === "function") {
        showToast("Status privacy is set to: Mutual Connections", "info");
      }
    };
  }

  // Prime status data on app init (exactly once)
  fetchAndCacheStatusData();
}

function getStatusRingHtml(moments, size = 48, isOwn = false) {
  if (!moments || moments.length === 0) return "";

  const N = moments.length;
  const strokeWidth = 2.5;
  const radius = (size / 2) - (strokeWidth / 2) - 1.5;
  const cx = size / 2;
  const cy = size / 2;
  const circumference = 2 * Math.PI * radius;

  const gap = N > 1 ? 3 : 0;
  const totalGapSpace = N * gap;
  const segmentLength = (circumference - totalGapSpace) / N;

  let svgContent = `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" style="position: absolute; top: 0; left: 0; transform: rotate(-90deg); pointer-events: none; z-index: 1;">`;
  svgContent += `
    <defs>
      <linearGradient id="unseen-status-grad" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#f58529" />
        <stop offset="100%" stop-color="#dd2a7b" />
      </linearGradient>
    </defs>
  `;

  moments.forEach((m, i) => {
    const hasViewed = !isOwn && m.viewers && m.viewers.some(v => v.userId === State.currentUser._id);
    const strokeColor = hasViewed ? "#848487" : "url(#unseen-status-grad)";
    const offset = i * (segmentLength + gap);

    svgContent += `
      <circle
        cx="${cx}"
        cy="${cy}"
        r="${radius}"
        fill="none"
        stroke="${strokeColor}"
        stroke-width="${strokeWidth}"
        stroke-dasharray="${segmentLength} ${circumference - segmentLength}"
        stroke-dashoffset="${-offset}"
      />
    `;
  });

  svgContent += `</svg>`;
  return svgContent;
}

// ── Fetch from API and prime State — called ONCE on init and on reconnect ──────
async function fetchAndCacheStatusData() {
  try {
    const [myRes, feedRes] = await Promise.all([
      apiRequest("GET", "/api/status/me"),
      apiRequest("GET", "/api/status/feed"),
    ]);
    State.myActiveStatuses = myRes?.data?.data || [];
    State.statusFeed = Object.values(feedRes?.data?.moments || {});
    State.statusInitialFetchDone = true;
    renderStatusSidebar();
    updateStatusUnseenIndicator();
  } catch (e) {
    console.error("[fetchAndCacheStatusData]", e);
  }
}

// ── Render sidebar from in-memory State — NO API calls inside ─────────────────
function renderStatusSidebar() {
  if (typeof window.initStatusModule === "function") {
    window.initStatusModule();
  }
  const listEl = document.getElementById("status-sidebar-list");
  if (!listEl) return;

  // 1. Render own status card from State
  const myStatusCard = document.getElementById("my-status-item");
  console.log("----------------", myStatusCard)
  if (myStatusCard && State.currentUser) {
    const avatarContainer = myStatusCard.querySelector(".avatar-container");
    const myStatusSubtext = myStatusCard.querySelector(".my-status-subtext");
    const myActiveStatuses = State.myActiveStatuses || [];

    try {

      if (myActiveStatuses.length > 0) {
        const latestStatus = myActiveStatuses[myActiveStatuses.length - 1];
        const timeStr = typeof formatRelativeTime === "function"
          ? formatRelativeTime(new Date(latestStatus.createdAt))
          : new Date(latestStatus.createdAt).toLocaleTimeString();
        if (myStatusSubtext) {
          myStatusSubtext.textContent = `Today at ${timeStr} (${myActiveStatuses.length} update${myActiveStatuses.length > 1 ? "s" : ""})`;
        }

        if (avatarContainer) {
          avatarContainer.className = "avatar-container status-avatar-ring";
          avatarContainer.removeAttribute("style");
          avatarContainer.style.position = "relative";
          avatarContainer.style.width = "48px";
          avatarContainer.style.height = "48px";

          let innerHtml = "";
          if (latestStatus.mediaType === "image" || latestStatus.mediaType === "photo") {
            innerHtml = `<img src="${latestStatus.mediaUrl}" style="width: 100%; height: 100%; object-fit: cover; border-radius: 50%;" />`;
          } else if (latestStatus.mediaType === "video") {
            innerHtml = `<video src="${latestStatus.mediaUrl}" style="width: 100%; height: 100%; object-fit: cover; border-radius: 50%; pointer-events: none;" muted playsinline></video>`;
          } else if (latestStatus.mediaType === "text") {
            innerHtml = `<div style="width: 100%; height: 100%; border-radius: 50%; background: ${latestStatus.backgroundColor || '#3f51b5'}; display: flex; align-items: center; justify-content: center; font-size: 8px; color: white; padding: 4px; box-sizing: border-box; text-align: center; overflow: hidden; font-weight: 700; line-height: 1.1;">${latestStatus.textContent}</div>`;
          }

          avatarContainer.innerHTML = `
            ${getStatusRingHtml(myActiveStatuses, 48, true)}
            <div class="avatar-inner" style="position: absolute; top: 4px; left: 4px; width: 40px; height: 40px; border: 2px solid var(--primary-bg, #000); border-radius: 50%; box-sizing: border-box; z-index: 2; overflow: hidden;">
              ${innerHtml}
            </div>
            <span class="status-add-badge">+</span>
          `;
        }

        myStatusCard.onclick = (e) => {
          if (e && e.target && (e.target.classList.contains("status-add-badge") || e.target.closest(".status-add-badge"))) {
            if (e.stopPropagation) e.stopPropagation();
            if (typeof window.openStatusComposer === "function") {
              window.openStatusComposer();
            }
            return;
          }
          if (typeof window.openStatusViewer === "function") {
            window.openStatusViewer({
              user: {
                id: State.currentUser._id || State.currentUser.id,
                username: "My Status",
                avatar: State.currentUser.avatar,
              },
              moments: myActiveStatuses.map((s) => ({
                _id: s._id,
                url: s.mediaUrl,
                type: s.mediaType,
                textContent: s.textContent,
                backgroundColor: s.backgroundColor,
                caption: s.caption,
                createdAt: s.createdAt,
                expiresAt: s.expiresAt,
                viewers: s.viewers,
              })),
            });
          }
        };
      } else {
        if (myStatusSubtext) myStatusSubtext.textContent = "Click to add status update";
        if (avatarContainer) {
          avatarContainer.className = "avatar-container";
          avatarContainer.setAttribute("style", "position: relative; width: 48px; height: 48px; border-radius: 50%; background: var(--elevated-bg); border: 2px solid var(--border-color); display: flex; align-items: center; justify-content: center; color: white; font-weight: 700; font-size: 14px; flex-shrink: 0;");
          if (State.currentUser.avatar && State.currentUser.avatar.length > 2) {
            avatarContainer.innerHTML = `<img src="${State.currentUser.avatar}" style="width: 100%; height: 100%; object-fit: cover; border-radius: 50%;" /><span class="status-add-badge">+</span>`;
          } else {
            avatarContainer.innerHTML = `<span style="font-weight: 700; color: white;">${State.currentUser.username.charAt(0).toUpperCase()}</span><span class="status-add-badge">+</span>`;
          }
        }
        myStatusCard.onclick = () => {
          if (typeof window.openStatusComposer === "function") {
            window.openStatusComposer();
          }
        };
      }

      if (typeof window.isStatusUploading === "function") {
        window.isStatusUploading().then(isUploading => {
          if (isUploading && typeof window.showStatusSendingState === "function") {
            window.showStatusSendingState();
          }
        });
      }
    } catch (e) {
      console.error("[renderStatusSidebar] own status card error:", e);
      if (myStatusCard) {
        const myStatusSubtext = myStatusCard.querySelector(".my-status-subtext");
        if (myStatusSubtext) myStatusSubtext.textContent = "Click to add status update";
      }
    }
  }

  // 2. Render friends' feed from State (no API call)
  try {
    let friendsSharing = State.statusFeed || [];

    const recentTitle = document.getElementById("status-recent-title");

    if (friendsSharing.length === 0) {
      if (recentTitle) recentTitle.style.display = "none";
      listEl.innerHTML = `
        <div style="text-align: center; color: var(--text-light); font-size: 13px; padding: 40px 20px; display: flex; flex-direction: column; align-items: center; gap: 12px;">
          <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="opacity: 0.4; color: var(--text-light);">
            <circle cx="12" cy="12" r="10"></circle>
            <circle cx="12" cy="12" r="6"></circle>
          </svg>
          <span>No recent status updates from friends</span>
        </div>
      `;
      return;
    }

    if (recentTitle) recentTitle.style.display = "none";
    listEl.innerHTML = "";

    // Sort by newest status createdAt desc
    friendsSharing = friendsSharing.sort((a, b) => {
      const timeA = new Date(a.moments[a.moments.length - 1].createdAt);
      const timeB = new Date(b.moments[b.moments.length - 1].createdAt);
      return timeB - timeA;
    });

    const recentGroups = [];
    const viewedGroups = [];

    friendsSharing.forEach((group) => {
      const momentsList = group.moments || [];
      if (momentsList.length === 0) return;

      const unseenMoments = momentsList.filter(m => {
        return !m.viewers.some(v => {
          const vId = v?.userId?._id ? v.userId._id.toString() : (v?.userId ? v.userId.toString() : "");
          const currentId = State.currentUser?._id ? State.currentUser._id.toString() : (State.currentUser?.id ? State.currentUser.id.toString() : "");
          return vId && currentId && vId === currentId;
        });
      });
      const isUnseen = unseenMoments.length > 0;

      if (isUnseen) {
        recentGroups.push(group);
      } else {
        viewedGroups.push(group);
      }
    });

    window.allStatusGroups = [...recentGroups, ...viewedGroups];

    function createStatusItemElement(group, isUnseen) {
      const friend = group.user;
      const momentsList = group.moments || [];

      const itemEl = document.createElement("div");
      itemEl.className = "status-item";

      const letter = friend.username.charAt(0).toUpperCase();
      const latestMoment = momentsList[momentsList.length - 1];
      const relativeTime = typeof formatRelativeTime === "function"
        ? formatRelativeTime(new Date(latestMoment.createdAt))
        : new Date(latestMoment.createdAt).toLocaleTimeString();

      // Determine status thumbnail preview
      let thumbnailInner = "";
      if (latestMoment.type === "image" || latestMoment.type === "photo") {
        thumbnailInner = `<img src="${latestMoment.url}" style="width: 100%; height: 100%; object-fit: cover; border-radius: 50%;" />`;
      } else if (latestMoment.type === "video") {
        thumbnailInner = `<video src="${latestMoment.url}" style="width: 100%; height: 100%; object-fit: cover; border-radius: 50%; pointer-events: none;" muted playsinline></video>`;
      } else if (latestMoment.type === "text") {
        thumbnailInner = `<div style="width: 100%; height: 100%; border-radius: 50%; background: ${latestMoment.backgroundColor || '#3f51b5'}; display: flex; align-items: center; justify-content: center; font-size: 8px; color: white; padding: 4px; box-sizing: border-box; text-align: center; overflow: hidden; font-weight: 700; line-height: 1.1;">${latestMoment.textContent}</div>`;
      }

      itemEl.innerHTML = `
        <div class="status-avatar-ring" style="width: 48px; height: 48px; position: relative;">
          ${getStatusRingHtml(momentsList, 48, false)}
          <div class="avatar-inner" style="position: absolute; top: 4px; left: 4px; width: 40px; height: 40px; border: 2px solid var(--primary-bg, #000); border-radius: 50%; box-sizing: border-box; z-index: 2; overflow: hidden;">
            ${thumbnailInner}
          </div>
          ${friend.online ? `<span style="position: absolute; bottom: 2px; right: 2px; width: 10px; height: 10px; background: var(--status-online, #44d362); border-radius: 50%; border: 1.5px solid var(--primary-bg); z-index: 3;"></span>` : ""}
        </div>
        <div style="flex: 1; min-width: 0; margin-left: 8px;">
          <div style="font-weight: ${isUnseen ? "700" : "600"}; font-size: 14px; color: var(--text-primary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${sanitizeInput(friend.username)}</div>
          <div style="font-size: 12px; color: var(--text-light); margin-top: 2px;">Today at ${relativeTime}</div>
        </div>
      `;

      itemEl.onclick = () => {
        if (typeof window.openStatusViewer === "function") {
          window.openStatusViewer(group);
        }
      };

      return itemEl;
    }

    // 1. Render Recent Updates
    if (recentGroups.length > 0) {
      const titleDiv = document.createElement("div");
      titleDiv.className = "recent-updates-title";
      titleDiv.textContent = "Recent updates";
      listEl.appendChild(titleDiv);

      recentGroups.forEach((group) => {
        listEl.appendChild(createStatusItemElement(group, true));
      });
    }

    // 2. Render Viewed Updates
    if (viewedGroups.length > 0) {
      const titleDiv = document.createElement("div");
      titleDiv.className = "recent-updates-title";
      titleDiv.setAttribute("style", "border-top: 1px solid rgba(255,255,255,0.05); margin-top: 12px; padding-top: 16px;");
      titleDiv.textContent = "Viewed updates";
      listEl.appendChild(titleDiv);

      viewedGroups.forEach((group) => {
        listEl.appendChild(createStatusItemElement(group, false));
      });
    }
  } catch (err) {
    console.error("[renderStatusSidebar]", err);
    listEl.innerHTML = `<div style="text-align: center; color: var(--text-secondary); font-size: 13px; padding: 20px;">Error loading status updates</div>`;
  }
}

// Reads from State — zero API calls
function updateStatusUnseenIndicator() {
  const dot = document.getElementById("nav-status-dot");
  if (!dot) return;

  const feed = State.statusFeed || [];
  const currentId = State.currentUser?._id
    ? State.currentUser._id.toString()
    : State.currentUser?.id
      ? State.currentUser.id.toString()
      : "";

  const hasUnseen = feed.some((group) =>
    (group.moments || []).some((m) =>
      !m.viewers.some((v) => {
        const vId = v?.userId?._id
          ? v.userId._id.toString()
          : v?.userId
            ? v.userId.toString()
            : "";
        return vId && currentId && vId === currentId;
      })
    )
  );

  dot.style.display = hasUnseen ? "block" : "none";
}

// Global event delegation for status sidebar header buttons to ensure they work even after DOM replacement/unlocks
document.addEventListener("click", (e) => {
  const triggerBtn = e.target.closest("#status-composer-trigger-btn");
  if (triggerBtn) {
    e.preventDefault();
    console.log("Status composer button clicked", e.target);
    if (typeof window.openStatusComposer === "function") {
      window.openStatusComposer();
    } else {
      console.warn("window.openStatusComposer is not available yet");
    }
    return;
  }

  const optionsBtn = e.target.closest("#status-options-btn");
  if (optionsBtn) {
    e.preventDefault();
    if (typeof showToast === "function") {
      showToast("Status privacy is set to: Mutual Connections", "info");
    }
    return;
  }
});

window.fetchAndCacheStatusData = fetchAndCacheStatusData;
window.renderStatusSidebar = renderStatusSidebar;
window.updateStatusUnseenIndicator = updateStatusUnseenIndicator;

