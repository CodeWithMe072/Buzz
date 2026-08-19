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
  if (window.updateGlobalUserAvatarUI) {
    window.updateGlobalUserAvatarUI();
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

  let convs = [...State.conversations].filter(c => c.userStatus !== "inactive" && c.status !== "inactive");

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
  convs = convs.sort((a, b) => {
    if (a.isPinned && !b.isPinned) return -1;
    if (!a.isPinned && b.isPinned) return 1;
    return new Date(b.timestamp) - new Date(a.timestamp);
  });
  convs.forEach(conv => {
    const item = document.createElement("div");
    const isSelected = State.selectedChatIds && State.selectedChatIds.has(conv.id);
    item.className = `chat-item ${State.activeChat === conv.id ? "active" : ""} ${isSelected ? "selected" : ""}`;
    item.dataset.convId = conv.id;
    item.dataset.id = conv.id;
    const isLetterAvatar = conv.avatar && conv.avatar.length === 1;
    const thumbAvatar = typeof getAvatarVersion === "function" ? getAvatarVersion(conv.avatar, "thumb") : conv.avatar;
    const avatarHTML = isLetterAvatar
      ? `<span>${conv.avatar}</span>`
      : `<img src="${thumbAvatar}" onerror="this.style.display='none'; if(this.nextElementSibling) this.nextElementSibling.style.display='inline';" style="width:100%; height:100%; object-fit:cover; border-radius:50%;" /><span style="display:none;">${conv.username.charAt(0).toUpperCase()}</span>`;

    const pinBadgeHTML = conv.isPinned ? `<span class="pin-badge" style="margin-left:4px; color:#a8a8a8;"><svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M12 17l-5.5 5.5v-13h11v13z"/></svg></span>` : "";
    const muteBadgeHTML = conv.isMuted ? `<span class="mute-badge" style="margin-left:4px; color:#888;"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M13.73 21a2 2 0 0 1-3.46 0M18.63 13A17.89 17.89 0 0 1 18 8A6 6 0 0 0 6 8c0 .7-.08 1.38-.24 2.03M2 2l20 20M10.3 4.3A6 6 0 0 1 18 8v5"/></svg></span>` : "";
    const favBadgeHTML = conv.isFavourite ? `<span class="fav-badge" style="margin-left:4px; color:#eab308;"><svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg></span>` : "";

    item.innerHTML = `
      <div class="avatar ${conv.online ? "online" : ""}" style="cursor: pointer;" title="View ${sanitizeInput(conv.username)}'s profile">
        ${avatarHTML}
      </div>
      <div class="chat-item-content">
        <div class="chat-item-header">
          <span class="chat-item-username">${sanitizeInput(conv.username)}${pinBadgeHTML}${favBadgeHTML}${muteBadgeHTML}</span>
          <span class="chat-item-time">${conv.timestamp ? formatTime(conv.timestamp) : ""}</span>
        </div>
        <div class="chat-item-preview ${conv.unread > 0 ? "unread" : ""} ${conv.messagesLoaded === false ? "loading-preview" : ""}">
          ${State.typingTimeouts && State.typingTimeouts[conv.id] ? `<span style="color: #25d366; font-weight: 500;">Typing...</span>` : getLastMessageHTML(conv)}
        </div>
      </div>
      ${conv.unread > 0 ? `<span class="unread-badge">${conv.unread}</span>` : ""}`;

    const avatarItemEl = item.querySelector(".avatar");
    if (avatarItemEl) {
      avatarItemEl.addEventListener("click", (e) => {
        e.stopPropagation();
        if (window.innerWidth <= 768 && State.selectedChatIds && State.selectedChatIds.size > 0) {
          toggleChatSelectionMobile(conv.id);
          return;
        }
        openContactProfilePreview(conv);
      });
    }

    item.addEventListener("click", (e) => {
      if (window.__isMobileChatLongPressing || item.dataset.longPressed === "true") {
        e.preventDefault();
        e.stopPropagation();
        return;
      }
      if (window.innerWidth <= 768 && State.selectedChatIds && State.selectedChatIds.size > 0) {
        toggleChatSelectionMobile(conv.id);
        return;
      }
      openChat(conv.id);
    });

    // Desktop: Right-Click Context Menu
    item.addEventListener("contextmenu", (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (window.innerWidth <= 768) {
        toggleChatSelectionMobile(conv.id);
        return;
      }
      showChatItemContextMenu(conv, e, e.clientX, e.clientY);
    });

    // Mobile: Touch Long-Press Context Menu (500ms)
    let longPressTimer = null;
    let startX = 0, startY = 0;

    item.addEventListener("touchstart", (e) => {
      if (e.touches.length > 1) return;
      const touch = e.touches[0];
      startX = touch.clientX;
      startY = touch.clientY;

      longPressTimer = setTimeout(() => {
        longPressTimer = null;
        item.dataset.longPressed = "true";
        window.__isMobileChatLongPressing = true;
        if (window.innerWidth <= 768) {
          toggleChatSelectionMobile(conv.id);
        } else {
          showChatItemContextMenu(conv, e, startX, startY);
        }
      }, 500);
    }, { passive: true });

    item.addEventListener("touchmove", (e) => {
      if (!longPressTimer) return;
      const touch = e.touches[0];
      if (Math.abs(touch.clientX - startX) > 10 || Math.abs(touch.clientY - startY) > 10) {
        clearTimeout(longPressTimer);
        longPressTimer = null;
      }
    }, { passive: true });

    item.addEventListener("touchend", (e) => {
      if (longPressTimer) {
        clearTimeout(longPressTimer);
        longPressTimer = null;
      }
      if (item.dataset.longPressed === "true") {
        e.preventDefault();
        e.stopPropagation();
        item.dataset.longPressed = "false";
        setTimeout(() => {
          window.__isMobileChatLongPressing = false;
        }, 300);
      }
    });

    item.addEventListener("touchcancel", () => {
      if (longPressTimer) {
        clearTimeout(longPressTimer);
        longPressTimer = null;
      }
      item.dataset.longPressed = "false";
      window.__isMobileChatLongPressing = false;
    });

    chatList.appendChild(item);
  });

  // Bind top current user profile avatar click to open user's account profile
  const currentUserAvatar = document.getElementById("current-user-avatar");
  if (currentUserAvatar && !currentUserAvatar.dataset.profileListenerBound) {
    currentUserAvatar.dataset.profileListenerBound = "true";
    currentUserAvatar.style.cursor = "pointer";
    currentUserAvatar.addEventListener("click", (e) => {
      e.stopPropagation();
      if (typeof openProfileModal === "function") {
        openProfileModal("account", true);
      }
    });
  }

  // Bind mobile chat selection bar buttons
  bindMobileChatSelectionBarEvents();
  updateMobileChatSelectionBarUI();
}

State.selectedChatIds = State.selectedChatIds || new Set();

function toggleChatSelectionMobile(convId) {
  if (!convId) return;

  if (State.selectedChatIds.has(convId)) {
    State.selectedChatIds.delete(convId);
    const itemEl = document.querySelector(`.chat-item[data-conv-id="${convId}"]`);
    if (itemEl) itemEl.classList.remove("selected");
  } else {
    State.selectedChatIds.add(convId);
    const itemEl = document.querySelector(`.chat-item[data-conv-id="${convId}"]`);
    if (itemEl) itemEl.classList.add("selected");
  }

  safeVibrate(30);
  updateMobileChatSelectionBarUI();
}

function safeVibrate(pattern) {
  try {
    if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") {
      if (navigator.userActivation && navigator.userActivation.hasBeenActive === false) {
        return;
      }
      navigator.vibrate(pattern);
    }
  } catch (e) {}
}
window.safeVibrate = safeVibrate;

function updateMobileChatSelectionBarUI() {
  const bar = document.getElementById("mobile-chat-selection-bar");
  const countEl = document.getElementById("mobile-chat-selection-count");
  const userProfile = document.querySelector(".chat-list-header .user-profile");
  const headerActions = document.querySelector(".chat-list-header .header-actions");

  if (!State.selectedChatIds || State.selectedChatIds.size === 0) {
    if (bar) bar.style.display = "none";
    if (userProfile) {
      userProfile.style.display = "flex";
      userProfile.style.visibility = "visible";
    }
    if (headerActions) {
      headerActions.style.display = "flex";
      headerActions.style.visibility = "visible";
    }
    document.querySelectorAll(".chat-item.selected").forEach(el => el.classList.remove("selected"));
    return;
  }

  if (bar) {
    bar.style.display = "flex";
    bar.style.width = "100%";
    bar.style.justifyContent = "space-between";
  }
  if (userProfile) {
    userProfile.style.display = "none";
    userProfile.style.visibility = "hidden";
  }
  if (headerActions) {
    headerActions.style.display = "none";
    headerActions.style.visibility = "hidden";
  }
  if (countEl) countEl.textContent = State.selectedChatIds.size;
}

function clearMobileChatSelection() {
  if (State.selectedChatIds) State.selectedChatIds.clear();
  updateMobileChatSelectionBarUI();
}
window.clearMobileChatSelection = clearMobileChatSelection;

function bindMobileChatSelectionBarEvents() {
  const closeBtn = document.getElementById("close-chat-selection-btn");
  if (closeBtn && !closeBtn.dataset.bound) {
    closeBtn.dataset.bound = "true";
    closeBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      clearMobileChatSelection();
    });
  }

  const clearBtn = document.getElementById("mobile-chat-clear-btn");
  if (clearBtn && !clearBtn.dataset.bound) {
    clearBtn.dataset.bound = "true";
    clearBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      if (!State.selectedChatIds || State.selectedChatIds.size === 0) return;
      const count = State.selectedChatIds.size;
      showCustomConfirmModal({
        title: "Clear Selected Chat Messages?",
        message: `Clear all messages in ${count} selected chat${count > 1 ? "s" : ""}?`,
        confirmText: "Clear",
        cancelText: "Cancel",
        isDanger: true,
        onConfirm: () => {
          State.selectedChatIds.forEach(chatId => {
            State.messages[chatId] = [];
            const conv = (State.conversations || []).find(c => c.id === chatId);
            if (conv) {
              conv.chatState = "nochat";
              conv.lastMessage = "";
              conv.timestamp = 0;
            }
            if (State.activeChat === chatId) {
              const listEl = document.getElementById("messages-list");
              if (listEl) listEl.innerHTML = "";
            }
            if (typeof window.clearChatAPI === "function") {
              window.clearChatAPI(chatId).catch(console.error);
            }
          });
          showToast(`Cleared messages in ${count} chat${count > 1 ? "s" : ""}`, "info");
          clearMobileChatSelection();
          initChatList();
        }
      });
    });
  }

  const deleteBtn = document.getElementById("mobile-chat-delete-btn");
  if (deleteBtn && !deleteBtn.dataset.bound) {
    deleteBtn.dataset.bound = "true";
    deleteBtn.addEventListener("click", async (e) => {
      e.stopPropagation();
      if (!State.selectedChatIds || State.selectedChatIds.size === 0) return;
      const count = State.selectedChatIds.size;
      showCustomConfirmModal({
        title: `Delete ${count} Selected Chat${count > 1 ? "s" : ""}?`,
        message: "This action cannot be undone.",
        confirmText: "Delete",
        cancelText: "Cancel",
        isDanger: true,
        onConfirm: () => {
          const chatsToDelete = Array.from(State.selectedChatIds);
          chatsToDelete.forEach(chatId => {
            const conv = (State.conversations || []).find(c => c.id === chatId);
            if (conv) {
              conv.userStatus = "inactive";
              conv.status = "inactive";
              conv.chatState = "nochat";
            }
            State.conversations = State.conversations.filter(c => c.id !== chatId);
            delete State.messages[chatId];
            const itemEl = document.querySelector(`.chat-item[data-conv-id="${chatId}"]`);
            if (itemEl) itemEl.remove();
            if (State.activeChat === chatId) {
              State.activeChat = null;
              const activeChatWin = document.getElementById("active-chat");
              const emptyState = document.getElementById("chat-empty-state");
              if (activeChatWin) activeChatWin.style.display = "none";
              if (emptyState) emptyState.style.display = "flex";
            }
            if (typeof deleteChat === "function") {
              deleteChat(chatId).catch(console.error);
            }
          });
          showToast(`Deleted ${count} chat${count > 1 ? "s" : ""}`, "info");
          clearMobileChatSelection();
          initChatList();
        }
      });
    });
  }
}

// =============================================================================
// WHATSAPP-STYLE CONTACT PROFILE PREVIEW MODAL
// =============================================================================
function openContactProfilePreview(conv) {
  if (!conv) return;
  const modal = document.getElementById("contact-profile-preview-modal");
  const usernameEl = document.getElementById("cpp-username");
  const avatarImg = document.getElementById("cpp-avatar-img");
  const avatarLetter = document.getElementById("cpp-avatar-letter");
  const avatarContainer = document.getElementById("cpp-avatar-container");
  const btnChat = document.getElementById("cpp-action-chat");
  const btnAudio = document.getElementById("cpp-action-audio");
  const btnVideo = document.getElementById("cpp-action-video");
  const btnInfo = document.getElementById("cpp-action-info");

  if (!modal) return;

  if (usernameEl) usernameEl.textContent = conv.username || "User";

  const isLetter = !conv.avatar || conv.avatar.length === 1;
  if (isLetter) {
    if (avatarImg) avatarImg.style.display = "none";
    if (avatarLetter) {
      avatarLetter.style.display = "flex";
      avatarLetter.textContent = (conv.avatar || conv.username?.charAt(0) || "U").toUpperCase();
    }
  } else {
    if (avatarLetter) avatarLetter.style.display = "none";
    if (avatarImg) {
      avatarImg.src = typeof getAvatarVersion === "function" ? getAvatarVersion(conv.avatar, "mid") : conv.avatar;
      avatarImg.style.display = "block";
    }
  }

  if (btnChat) {
    btnChat.onclick = (e) => {
      e.stopPropagation();
      closeContactProfilePreview();
      openChat(conv.id);
    };
  }

  if (btnAudio) {
    btnAudio.onclick = (e) => {
      e.stopPropagation();
      closeContactProfilePreview();
      openChat(conv.id);
      if (window.CallManager && typeof window.CallManager.open === "function") {
        window.CallManager.open("audio");
      }
    };
  }

  if (btnVideo) {
    btnVideo.onclick = (e) => {
      e.stopPropagation();
      closeContactProfilePreview();
      openChat(conv.id);
      if (window.CallManager && typeof window.CallManager.open === "function") {
        window.CallManager.open("video");
      }
    };
  }

  if (btnInfo) {
    btnInfo.onclick = (e) => {
      e.stopPropagation();
      openFullProfilePhotoViewer(conv.avatar, conv.username);
    };
  }

  if (avatarContainer) {
    avatarContainer.onclick = (e) => {
      e.stopPropagation();
      openFullProfilePhotoViewer(conv.avatar, conv.username);
    };
  }

  modal.style.display = "flex";
}

function openFullProfilePhotoViewer(avatarUrl, username) {
  closeContactProfilePreview();

  const modal = document.getElementById("profile-photo-viewer-modal");
  const usernameEl = document.getElementById("ppv-username");
  const imgEl = document.getElementById("ppv-img");
  const letterEl = document.getElementById("ppv-letter-fallback");
  const backBtn = document.getElementById("ppv-back-btn");

  if (!modal) return;

  if (usernameEl) usernameEl.textContent = username || "User";

  const isLetter = !avatarUrl || avatarUrl.length === 1;
  if (isLetter) {
    if (imgEl) imgEl.style.display = "none";
    if (letterEl) {
      letterEl.style.display = "flex";
      letterEl.textContent = (avatarUrl || username?.charAt(0) || "U").toUpperCase();
    }
  } else {
    if (letterEl) letterEl.style.display = "none";
    if (imgEl) {
      imgEl.src = typeof getAvatarVersion === "function" ? getAvatarVersion(avatarUrl, "original") : avatarUrl;
      imgEl.style.display = "block";
    }
  }

  if (backBtn) {
    backBtn.onclick = () => closeFullProfilePhotoViewer();
  }

  modal.style.display = "flex";
}

function closeFullProfilePhotoViewer() {
  const modal = document.getElementById("profile-photo-viewer-modal");
  if (modal) modal.style.display = "none";
}

window.openFullProfilePhotoViewer = openFullProfilePhotoViewer;
window.closeFullProfilePhotoViewer = closeFullProfilePhotoViewer;

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    closeFullProfilePhotoViewer();
  }
});

function closeContactProfilePreview() {
  const modal = document.getElementById("contact-profile-preview-modal");
  if (modal) modal.style.display = "none";
}

window.openContactProfilePreview = openContactProfilePreview;
window.closeContactProfilePreview = closeContactProfilePreview;
window.openFullProfilePhotoViewer = openFullProfilePhotoViewer;

document.addEventListener("click", (e) => {
  const modal = document.getElementById("contact-profile-preview-modal");
  if (modal && modal.style.display === "flex" && e.target === modal) {
    closeContactProfilePreview();
  }
});

// =============================================================================
// OPEN CHAT
// =============================================================================
function openChat(chatId, options = {}) {
  const { updateUrl = true } = options;
  if (!chatId) return;

  const conv = State.conversations.find(c => c.id === chatId || c.username === chatId);
  if (!conv) return;

  chatId = conv.id;
  State.activeChat = chatId;

  if (updateUrl && window.Router && !window.Router.isNavigatingFromRouter) {
    window.Router.navigate(`/inbox/${chatId}`, { silent: true });
  }

  // Update active class in sidebar chat list
  document.querySelectorAll(".chat-item").forEach(item => {
    item.classList.toggle("active", item.dataset.convId === chatId || item.dataset.id === chatId);
  });

  if (window.liveVoiceState && window.liveVoiceState.isListening && window.liveVoiceState.targetId !== chatId) {
    if (typeof window.stopListeningToVoice === "function") {
      window.stopListeningToVoice();
    }
  }

  conv.unread = 0;
  renderChatList(document.getElementById("chat-search").value.trim().toLowerCase());
  socket.emit("chat:seen", { from: chatId });

  document.getElementById("chat-empty-state").style.display = "none";
  document.getElementById("active-chat").style.display = "flex";
  if (typeof closeContactInfoSidebar === "function") closeContactInfoSidebar();
  if (typeof initContactInfoSidebar === "function") initContactInfoSidebar();
  const messageInput = document.getElementById("message-input");
  messageInput.value = "";
  if (window.isMaintenanceModeActive) {
    messageInput.readOnly = true;
    messageInput.placeholder = "System under maintenance — message sending disabled";
    messageInput.blur();
    const sendBtn = document.getElementById("send-btn");
    if (sendBtn) {
      sendBtn.disabled = true;
      sendBtn.style.opacity = "0.4";
      sendBtn.style.cursor = "not-allowed";
    }
  } else {
    messageInput.readOnly = false;
    messageInput.placeholder = "Type a message...";
    messageInput.focus();
  }

  if (window.IndexedDBQueueService && typeof window.IndexedDBQueueService.getInputDraft === "function") {
    window.IndexedDBQueueService.getInputDraft(chatId).then(savedDraft => {
      const draftText = savedDraft || (conv && conv.draft) || "";
      if (draftText && messageInput) {
        if (conv) conv.draft = draftText;
        messageInput.value = draftText;
        const sendBtn = document.getElementById("send-btn");
        if (sendBtn) sendBtn.disabled = !draftText.trim();
        if (typeof window.updateInputContainerState === "function") {
          window.updateInputContainerState();
        }
        if (typeof window.adjustMessageInputHeight === "function") {
          window.adjustMessageInputHeight();
        }
      }
    }).catch(console.error);
  } else if (conv && conv.draft) {
    messageInput.value = conv.draft;
    const sendBtn = document.getElementById("send-btn");
    if (sendBtn) sendBtn.disabled = !conv.draft.trim();
    if (typeof window.updateInputContainerState === "function") {
      window.updateInputContainerState();
    }
  }

  if (typeof window.adjustMessageInputHeight === "function") {
    window.adjustMessageInputHeight();
  }

  const avatarEl = document.getElementById("chat-avatar");
  const isLetterAvatar = conv.avatar && conv.avatar.length === 1;
  const thumbAvatar = typeof getAvatarVersion === "function" ? getAvatarVersion(conv.avatar, "thumb") : conv.avatar;
  const avatarHTML = isLetterAvatar
    ? `<span>${conv.avatar}</span>`
    : `<img src="${thumbAvatar}" onerror="this.style.display='none'; if(this.nextElementSibling) this.nextElementSibling.style.display='inline';" style="width:100%; height:100%; object-fit:cover; border-radius:50%;" /><span style="display:none;">${conv.username.charAt(0).toUpperCase()}</span>`;
  avatarEl.innerHTML = avatarHTML;
  avatarEl.className = "avatar"; // Reset classes

  // Clone element to reset previous click listeners
  const newAvatarEl = avatarEl.cloneNode(true);
  newAvatarEl.style.cursor = "pointer";
  newAvatarEl.title = `View ${sanitizeInput(conv.username)}'s profile`;
  newAvatarEl.addEventListener("click", (e) => {
    e.stopPropagation();
    openContactProfilePreview(conv);
  });
  avatarEl.parentNode.replaceChild(newAvatarEl, avatarEl);


  // Query and cache friend's moments
  if (typeof getFriendMoments === "function") {
    getFriendMoments(chatId).then(res => {
      if (State.activeChat !== chatId) return;
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
      if (State.activeChat !== chatId) return;
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
  if (typeof window.applyHeaderMaintenanceStyles === "function") {
    window.applyHeaderMaintenanceStyles();
  }

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
  const grouped = [];
  let currentGroup = null;
  let currentGroupId = null;

  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    const isGroupable = msg.groupId && (msg.type === "image" || msg.type === "video");
    
    if (isGroupable) {
      if (currentGroupId === msg.groupId) {
        currentGroup.push(msg);
      } else {
        if (currentGroup) {
          grouped.push({ type: "group", messages: currentGroup });
        }
        currentGroup = [msg];
        currentGroupId = msg.groupId;
      }
    } else {
      if (currentGroup) {
        grouped.push({ type: "group", messages: currentGroup });
        currentGroup = null;
        currentGroupId = null;
      }
      grouped.push({ type: "single", message: msg });
    }
  }
  if (currentGroup) {
    grouped.push({ type: "group", messages: currentGroup });
  }

  grouped.forEach(item => {
    if (item.type === "group") {
      messagesContainer.appendChild(createGroupMessageElement(item.messages));
    } else {
      messagesContainer.appendChild(createMessageElement(item.message));
    }
  });

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

  const isSeen = (typeof status === "object" && status.seen) || status === "seen";
  const isDelivered = (typeof status === "object" && status.delivered) || status === "delivered";
  const isSent = (typeof status === "object" && status.sent) || status === "sent" || status === "success" || status === "completed";

  if (isSeen) {
    return `<svg class="status-icon double seen" viewBox="0 0 16 16" style="transform:translateX(3px)"><polyline points="2 8 6 12 14 4"/><polyline points="5 8 9 12 17 4" style="transform:translate(-9px,0)"/></svg>`;
  } else if (isDelivered) {
    return `<svg class="status-icon double delivered" viewBox="0 0 16 16"><polyline points="2 8 6 12 14 4"/><polyline points="5 8 9 12 17 4" style="transform:translate(-9px,0)"/></svg>`;
  } else if (isSent) {
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

function getMessageSenderName(replyMsg) {
  if (!replyMsg) return "User";
  const myId = State.currentUser?.id || State.user?.id || State.currentUser?._id;
  const replySenderId = replyMsg.sender || replyMsg.userId || replyMsg.from;

  if (myId && replySenderId && String(myId) === String(replySenderId)) {
    return "You";
  }

  if (replyMsg.senderName) return replyMsg.senderName;
  if (replyMsg.username) return replyMsg.username;

  // Check active conversation
  const conv = State.conversations?.find(c => c.id === State.activeChat);
  if (conv) {
    if (conv.username) return conv.username;
    if (conv.user?.username) return conv.user.username;
  }

  const headerUsernameEl = document.getElementById("chat-username");
  if (headerUsernameEl && headerUsernameEl.textContent) {
    return headerUsernameEl.textContent.trim();
  }

  return "User";
}

async function updateReplyPreviewBar(message) {
  const replyPreviewEl = document.getElementById("reply-preview");
  const replyTextEl = document.getElementById("reply-text");
  if (!replyPreviewEl || !replyTextEl || !message) return;

  const senderName = getMessageSenderName(message);

  let contentHTML = "";
  if (message.type === "text") {
    let text = message.content || "";
    if (text.startsWith('{"isStatusReply":true')) {
      try {
        const parsed = JSON.parse(text);
        text = `💬 Status reply: ${parsed.replyText || ""}`;
      } catch (e) {}
    }
    contentHTML = `<span style="font-size:13px; color:rgba(255,255,255,0.85); font-weight:400;">${sanitizeInput(text)}</span>`;
  } else if (message.type === "document") {
    const docName = message.fileName || "Document";
    const ext = (docName || "").split(".").pop().toUpperCase();
    const extTag = ext && ext.length <= 4 ? ext : "DOC";
    const fileInfo = typeof getFileIcon === "function" ? getFileIcon(docName) : { color: "#3b82f6" };
    const badgeColor = fileInfo.color || "#3b82f6";

    contentHTML = `
      <div style="display:flex; align-items:center; gap:6px; margin-top:2px;">
        <span style="display:inline-flex; align-items:center; justify-content:center; background:${badgeColor}; color:#fff; font-size:9px; font-weight:800; padding:2px 5px; border-radius:3px; flex-shrink:0; text-transform:uppercase; font-family:sans-serif; line-height:1;">${extTag}</span>
        <span style="font-size:13px; font-weight:500; color:var(--text-primary); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:260px;">${sanitizeInput(docName)}</span>
      </div>`;
  } else if (message.type === "image" || message.type === "video") {
    let mediaUrl = message.thumb || message.cover || message.content;
    if (typeof getDecryptedStreamUrl === "function" && mediaUrl) {
      mediaUrl = await getDecryptedStreamUrl(mediaUrl, message.id);
    }
    const mediaLabel = message.type === "image" ? "Photo" : "Video";
    contentHTML = `
      <div style="display:flex; align-items:center; gap:8px; margin-top:3px;">
        <div style="width:36px; height:36px; border-radius:5px; overflow:hidden; background:#000; flex-shrink:0; border:1px solid rgba(255,255,255,0.15);">
          ${message.type === "video" 
            ? `<video src="${mediaUrl}" style="width:100%; height:100%; object-fit:cover; display:block;"></video>` 
            : `<img src="${mediaUrl}" style="width:100%; height:100%; object-fit:cover; display:block;" onerror="this.style.display='none'" />`}
        </div>
        <span style="font-size:13px; font-weight:500; color:var(--text-primary);">${mediaLabel}</span>
      </div>`;
  } else if (message.type === "audio") {
    contentHTML = `<span style="font-size:13px; color:var(--text-primary);">🎤 Voice message</span>`;
  } else {
    contentHTML = `<span style="font-size:13px; color:var(--text-primary);">📷 ${message.type}</span>`;
  }

  replyTextEl.innerHTML = `
    <div style="display:flex; flex-direction:column; gap:2px;">
      <span style="font-size:12px; font-weight:700; color:#c084fc;">${sanitizeInput(senderName)}</span>
      ${contentHTML}
    </div>`;

  replyPreviewEl.style.display = "flex";
}
window.updateReplyPreviewBar = updateReplyPreviewBar;

  // Reply preview
  let replyHTML = "";
  if (message.replyTo) {
    const replyMsg = State.messages[State.activeChat]?.find(
      m => m.id === message.replyTo || m.tempId === message.replyTo
    );

    if (replyMsg) {
      const senderName = getMessageSenderName(replyMsg);
      
      let replyContentHTML = "";
      if (replyMsg.type === "text") {
        const text = replyMsg.content.length > 50 ? replyMsg.content.slice(0, 50) + "..." : replyMsg.content;
        replyContentHTML = `<div class="reply-text">${sanitizeInput(text)}</div>`;
      } else if (replyMsg.type === "document") {
        const docName = replyMsg.fileName || "Document";
        const ext = (docName || "").split(".").pop().toUpperCase();
        const extTag = ext && ext.length <= 4 ? ext : "DOC";
        const fileInfo = typeof getFileIcon === "function" ? getFileIcon(docName) : { color: "#3b82f6" };
        const badgeColor = fileInfo.color || "#3b82f6";
        const shortName = docName.length > 25 ? docName.slice(0, 25) + "..." : docName;

        replyContentHTML = `
          <div class="reply-media-row" style="display:flex; align-items:center; gap:6px; margin-top:2px;">
            <span style="display:inline-flex; align-items:center; justify-content:center; background:${badgeColor}; color:#fff; font-size:9px; font-weight:800; padding:2px 4px; border-radius:3px; flex-shrink:0; text-transform:uppercase; font-family:sans-serif; line-height:1;">${extTag}</span>
            <span class="reply-text" style="font-weight: 500;">${sanitizeInput(shortName)}</span>
          </div>`;
      } else if (replyMsg.type === "image" || replyMsg.type === "video") {
        const thumbUrl = replyMsg.thumb || replyMsg.cover || replyMsg.content;
        const mediaLabel = replyMsg.type === "image" ? "Photo" : "Video";
        replyContentHTML = `
          <div class="reply-media-row" style="display:flex; align-items:center; gap:8px; margin-top:2px;">
            <div class="reply-media-thumb" style="width:36px; height:36px; border-radius:4px; overflow:hidden; background:rgba(0,0,0,0.3); flex-shrink:0;">
              ${replyMsg.type === "video" 
                ? `<video src="${thumbUrl}" style="width:100%; height:100%; object-fit:cover; display:block;"></video>` 
                : `<img src="${thumbUrl}" style="width:100%; height:100%; object-fit:cover; display:block;" onerror="this.style.display='none'" />`}
            </div>
            <span class="reply-text">${mediaLabel}</span>
          </div>`;
      } else if (replyMsg.type === "audio") {
        replyContentHTML = `<div class="reply-text">🎤 Voice message</div>`;
      } else {
        replyContentHTML = `<div class="reply-text">📷 ${replyMsg.type}</div>`;
      }

      replyHTML = `
        <div class="message-reply-preview">
          <div class="reply-username" style="font-size:12px; font-weight:700; color:#c084fc; margin-bottom:2px;">${sanitizeInput(senderName)}</div>
          ${replyContentHTML}
        </div>`;
    } else {
      replyHTML = `<div class="message-reply-preview"><div class="reply-text">Original message</div></div>`;
    }
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
    const safeName = sanitizeInput(message.fileName || "Document");
    const hasContent = Boolean(message.content);
    bubbleEl.innerHTML = `
      ${replyHTML}
      <div class="message-document">
        <div class="doc-header-row">
          <div class="doc-icon-wrap" style="background:${color}18; border-color:${color}35;">
            <i class="ti ${icon}" style="color:${color};font-size:26px;"></i>
          </div>
          <div class="doc-info">
            <span class="doc-filename" title="${safeName}">${safeName}</span>
            <span class="doc-meta">${message.fileSize ? formatFileSize(message.fileSize) : (isUploading ? "Uploading..." : "Document")}</span>
          </div>
        </div>
        ${isUploading ? `<div class="media-overlay"><div class="loader"></div></div>` : ""}
        ${isFailed ? `<div class="media-overlay"><button type="button" class="media-retry">↻</button></div>` : ""}
        <div class="doc-actions" style="${(isUploading || isFailed || !hasContent) ? "display:none;" : "display:flex;"}">
          ${hasContent ? `<button type="button" class="doc-btn doc-open" onclick="openDocument('${message.content}','${message.fileName || "document"}','${message.id || message._id || message.tempId}', this)"><i class="ti ti-external-link"></i><span>Open</span></button><button type="button" class="doc-btn doc-save" onclick="forceDownload('${message.content}','${message.fileName || "document"}','${message.id || message._id || message.tempId}', this)"><i class="ti ti-download"></i><span>Save</span></button>` : ""}
        </div>
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
  let justLongPressed = false;
  const isMediaMsg = (message.type === "image" || message.type === "video");

  // Prevent drag options conflicts on mobile with custom tap/longpress detection
  msgEl.addEventListener("touchstart", (e) => {
    touchStartTime = Date.now();
    touchStartX = e.touches[0].clientX;
    touchStartY = e.touches[0].clientY;
    optionsTriggered = false;
    justLongPressed = false;

    // Start long press timer
    State.longPressTimeout = setTimeout(() => {
      optionsTriggered = true;
      justLongPressed = true;
      msgEl.dataset.justLongPressed = "true";
      window.__justLongPressedTime = Date.now();
      showMessageOptions(message, msgEl, e.touches[0]);
    }, 500);
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
    if (optionsTriggered || justLongPressed || msgEl.dataset.justLongPressed === "true") {
      e.preventDefault();
      setTimeout(() => {
        justLongPressed = false;
        msgEl.dataset.justLongPressed = "false";
      }, 400);
      return;
    }

    // If selection mode is active, handle selection toggling
    if (State.selectedMessageIds && State.selectedMessageIds.size > 0 && duration < 500) {
      e.preventDefault();
      e.stopPropagation();
      msgEl.dataset.touchHandledSelection = "true";
      setTimeout(() => {
        msgEl.dataset.touchHandledSelection = "false";
      }, 400);
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
    if (optionsTriggered || justLongPressed || msgEl.dataset.justLongPressed === "true" || (Date.now() - (window.__justLongPressedTime || 0) < 400)) {
      e.preventDefault();
      e.stopPropagation();
      msgEl.dataset.justLongPressed = "false";
      optionsTriggered = false;
      return;
    }
    if (msgEl.dataset.touchHandledSelection === "true") {
      e.preventDefault();
      e.stopPropagation();
      msgEl.dataset.touchHandledSelection = "false";
      return;
    }
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

function createGroupMessageElement(groupMessages) {
  const firstMsg = groupMessages[0];
  const isMe = firstMsg.sender === "me" || firstMsg.user?.toString() === (State.currentUser.id || State.currentUser._id)?.toString();
  const groupId = firstMsg.groupId;
  
  const msgEl = document.createElement("div");
  msgEl.className = `message ${isMe ? "self" : "other"} media-group-message`;
  msgEl.dataset.groupId = groupId;
  msgEl.dataset.messageId = firstMsg.id || firstMsg._id || firstMsg.tempId;

  const bubbleEl = document.createElement("div");
  bubbleEl.className = "message-bubble";

  // Build the reply preview if any (from the first message)
  let replyHTML = "";
  if (firstMsg.replyTo) {
    const replyMsg = State.messages[State.activeChat]?.find(
      m => m.id === firstMsg.replyTo || m.tempId === firstMsg.replyTo
    );
    if (replyMsg) {
      const senderName = getMessageSenderName(replyMsg);
      let replyContentHTML = "";
      if (replyMsg.type === "text") {
        const text = replyMsg.content.length > 50 ? replyMsg.content.slice(0, 50) + "..." : replyMsg.content;
        replyContentHTML = `<div class="reply-text">${sanitizeInput(text)}</div>`;
      } else if (replyMsg.type === "document") {
        const docName = replyMsg.fileName || "Document";
        const ext = (docName || "").split(".").pop().toUpperCase();
        const extTag = ext && ext.length <= 4 ? ext : "DOC";
        const fileInfo = typeof getFileIcon === "function" ? getFileIcon(docName) : { color: "#3b82f6" };
        const badgeColor = fileInfo.color || "#3b82f6";
        const shortName = docName.length > 25 ? docName.slice(0, 25) + "..." : docName;
        replyContentHTML = `
          <div class="reply-media-row" style="display:flex; align-items:center; gap:6px; margin-top:2px;">
            <span style="display:inline-flex; align-items:center; justify-content:center; background:${badgeColor}; color:#fff; font-size:9px; font-weight:800; padding:2px 4px; border-radius:3px; flex-shrink:0; text-transform:uppercase; font-family:sans-serif; line-height:1;">${extTag}</span>
            <span class="reply-text" style="font-weight: 500;">${sanitizeInput(shortName)}</span>
          </div>`;
      } else if (replyMsg.type === "image" || replyMsg.type === "video") {
        const thumbUrl = replyMsg.thumb || replyMsg.cover || replyMsg.content;
        const mediaLabel = replyMsg.type === "image" ? "Photo" : "Video";
        replyContentHTML = `
          <div class="reply-media-row" style="display:flex; align-items:center; gap:8px; margin-top:2px;">
            <div class="reply-media-thumb" style="width:36px; height:36px; border-radius:4px; overflow:hidden; background:rgba(0,0,0,0.3); flex-shrink:0;">
              ${replyMsg.type === "video" 
                ? `<video src="${thumbUrl}" style="width:100%; height:100%; object-fit:cover; display:block;"></video>` 
                : `<img src="${thumbUrl}" style="width:100%; height:100%; object-fit:cover; display:block;" onerror="this.style.display='none'" />`}
            </div>
            <span class="reply-text">${mediaLabel}</span>
          </div>`;
      } else if (replyMsg.type === "audio") {
        replyContentHTML = `<div class="reply-text">🎤 Voice message</div>`;
      } else {
        replyContentHTML = `<div class="reply-text">📷 ${replyMsg.type}</div>`;
      }

      replyHTML = `
        <div class="message-reply-preview">
          <div class="reply-username" style="font-size:12px; font-weight:700; color:#c084fc; margin-bottom:2px;">${sanitizeInput(senderName)}</div>
          ${replyContentHTML}
        </div>`;
    }
  }

  // Build the collage grid
  const collageEl = document.createElement("div");
  const count = groupMessages.length;
  const layoutClass = count === 2 ? "count-2" : count === 3 ? "count-3" : count === 4 ? "count-4" : "count-more";
  collageEl.className = `message-media-group ${layoutClass}`;
  collageEl.dataset.groupId = groupId;

  // Limit rendering to 4 items max
  const itemsToRender = groupMessages.slice(0, 4);
  itemsToRender.forEach((msg, idx) => {
    const itemEl = document.createElement("div");
    itemEl.className = "media-group-item";
    itemEl.dataset.messageId = msg.id || msg._id || msg.tempId;

    const previewSrc = msg.cover || msg.thumb || msg.content;
    const isImage = msg.type === "image";
    const isVideo = msg.type === "video";

    if (previewSrc) {
      if (isImage) {
        const img = document.createElement("img");
        img.src = previewSrc;
        img.alt = "Collage Image";
        img.loading = "lazy";
        itemEl.appendChild(img);
      } else if (isVideo) {
        const video = document.createElement("video");
        video.src = msg.content;
        if (msg.cover) video.poster = msg.cover;
        video.muted = true;
        video.playsInline = true;
        video.preload = "none";
        itemEl.appendChild(video);

        const playBadge = document.createElement("div");
        playBadge.className = "video-play-badge";
        playBadge.innerHTML = `<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>`;
        itemEl.appendChild(playBadge);
      }
    }

    // Add +N overlay on the last item if count > 4
    if (idx === 3 && count > 4) {
      const overlayEl = document.createElement("div");
      overlayEl.className = "more-overlay";
      overlayEl.textContent = `+${count - 3}`;
      itemEl.appendChild(overlayEl);
    }

    // Attachment lightbox click handler
    itemEl.onclick = (e) => {
      if (State.selectedMessageIds && State.selectedMessageIds.size > 0) {
        e.preventDefault();
        e.stopPropagation();
        const parentMsgEl = itemEl.closest(".message, .media-group-message") || msgEl;
        window.toggleMessageSelection(msg, parentMsgEl);
        return;
      }
      e.stopPropagation();
      if (typeof MediaViewer !== "undefined") {
        if ((!window.viewer || window.viewer.chatId !== State.activeChat) && State.activeChat) {
          window.viewer = new MediaViewer(State.activeChat);
        }
        if (window.viewer) {
          window.viewer.open(msg.id || msg.tempId, null, true);
        }
      }
    };

    collageEl.appendChild(itemEl);
  });

  // Append progress loader overlay if any of the group messages are still uploading
  const uploadingMsgs = groupMessages.filter(m => m.uploadStatus === "uploading");
  const uploadedCount = count - uploadingMsgs.length;

  if (uploadingMsgs.length > 0) {
    const overlayEl = document.createElement("div");
    overlayEl.className = "collage-upload-overlay";
    overlayEl.dataset.groupId = groupId;

    const radius = 26;
    const circumference = 2 * Math.PI * radius; // 163.36
    const offset = circumference * (1 - uploadedCount / count);

    overlayEl.innerHTML = `
      <div class="circular-progress-wrap">
        <svg class="progress-ring" width="60" height="60">
          <circle class="progress-ring-circle-bg" stroke="rgba(255,255,255,0.15)" stroke-width="4" fill="transparent" r="${radius}" cx="30" cy="30" />
          <circle class="progress-ring-circle" stroke="#22c55e" stroke-width="4" fill="transparent" r="${radius}" cx="30" cy="30" 
            style="stroke-dasharray: ${circumference}; stroke-dashoffset: ${offset};" />
        </svg>
        <button type="button" class="collage-cancel-btn" title="Cancel upload">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
        </button>
      </div>
      <div class="collage-upload-progress-text">${uploadedCount} / ${count}</div>
    `;

    const cancelBtn = overlayEl.querySelector(".collage-cancel-btn");
    if (cancelBtn) {
      cancelBtn.onclick = (e) => {
        e.stopPropagation();
        if (typeof cancelGroupUpload === "function") {
          cancelGroupUpload(groupId);
        }
      };
    }
    collageEl.appendChild(overlayEl);
  }

  bubbleEl.appendChild(collageEl);

  // Group caption (if any, from the first message with caption or search any)
  const captionMsg = groupMessages.find(m => m.caption);
  if (captionMsg && captionMsg.caption) {
    const captionEl = document.createElement("p");
    captionEl.className = "messag-text caption";
    captionEl.textContent = captionMsg.caption;
    bubbleEl.appendChild(captionEl);
  }

  // Footer: time + status icon (clock icon while uploading, single tick when done)
  const initialStatus = (isMe && uploadingMsgs.length > 0) ? { sent: false } : (firstMsg.status || { sent: true });
  const statusSVG = isMe ? `<span class="msg-status-wrap">${getStatusIconHTML(initialStatus)}</span>` : "";
  const footerEl = document.createElement("div");
  footerEl.className = "msg-footer";
  footerEl.innerHTML = `<span class="message-time">${formatTime(firstMsg.timestamp)}</span>${statusSVG}`;
  bubbleEl.appendChild(footerEl);

  msgEl.appendChild(bubbleEl);

  // Touch / Hold events for mobile context menu & selection on media groups
  let groupTouchTimer = null;
  let groupOptionsTriggered = false;
  let groupJustLongPressed = false;
  let groupStartX = 0;
  let groupStartY = 0;

  msgEl.addEventListener("touchstart", (e) => {
    groupOptionsTriggered = false;
    groupJustLongPressed = false;
    const touch = e.touches[0];
    groupStartX = touch.clientX;
    groupStartY = touch.clientY;

    if (State.selectedMessageIds && State.selectedMessageIds.size > 0) {
      return;
    }

    groupTouchTimer = setTimeout(() => {
      groupOptionsTriggered = true;
      groupJustLongPressed = true;
      msgEl.dataset.justLongPressed = "true";
      window.__justLongPressedTime = Date.now();
      if (typeof showGroupMessageOptions === "function") {
        showGroupMessageOptions(groupMessages, msgEl, e);
      }
    }, 450);
  }, { passive: true });

  msgEl.addEventListener("touchmove", (e) => {
    const touch = e.touches[0];
    if (touch && Math.hypot(touch.clientX - groupStartX, touch.clientY - groupStartY) > 10) {
      if (groupTouchTimer) {
        clearTimeout(groupTouchTimer);
        groupTouchTimer = null;
      }
    }
  }, { passive: true });

  msgEl.addEventListener("touchend", (e) => {
    const touch = e.changedTouches?.[0];
    const endX = touch ? touch.clientX : groupStartX;
    const endY = touch ? touch.clientY : groupStartY;
    const distance = Math.hypot(endX - groupStartX, endY - groupStartY);

    if (groupTouchTimer) {
      clearTimeout(groupTouchTimer);
      groupTouchTimer = null;
    }

    if (groupOptionsTriggered || groupJustLongPressed || msgEl.dataset.justLongPressed === "true") {
      e.preventDefault();
      setTimeout(() => {
        groupJustLongPressed = false;
        msgEl.dataset.justLongPressed = "false";
      }, 400);
      return;
    }

    if (State.selectedMessageIds && State.selectedMessageIds.size > 0 && distance < 10) {
      e.preventDefault();
      e.stopPropagation();
      msgEl.dataset.touchHandledSelection = "true";
      setTimeout(() => {
        msgEl.dataset.touchHandledSelection = "false";
      }, 400);
      window.toggleMessageSelection(firstMsg, msgEl);
      return;
    }
  }, { passive: false });

  msgEl.addEventListener("click", (e) => {
    if (groupOptionsTriggered || groupJustLongPressed || msgEl.dataset.justLongPressed === "true" || (Date.now() - (window.__justLongPressedTime || 0) < 400)) {
      e.preventDefault();
      e.stopPropagation();
      msgEl.dataset.justLongPressed = "false";
      groupOptionsTriggered = false;
      return;
    }
    if (msgEl.dataset.touchHandledSelection === "true") {
      e.preventDefault();
      e.stopPropagation();
      msgEl.dataset.touchHandledSelection = "false";
      return;
    }
    if (State.selectedMessageIds && State.selectedMessageIds.size > 0) {
      e.preventDefault();
      e.stopPropagation();
      window.toggleMessageSelection(firstMsg, msgEl);
    }
  });

  // Context menu listener for media group
  msgEl.addEventListener("contextmenu", (e) => {
    e.preventDefault();
    if (typeof showGroupMessageOptions === "function") {
      showGroupMessageOptions(groupMessages, msgEl, e);
    }
  });

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
    if (typeof updateReplyPreviewBar === "function") {
      updateReplyPreviewBar(message);
    }
    const inputEl = document.getElementById("message-input");
    if (inputEl) inputEl.focus();
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

    const isGroup = !!message.groupId;
    const chatId = State.activeChat;
    const msgsInChat = (chatId && State.messages[chatId]) ? State.messages[chatId] : [];
    const groupItems = isGroup ? msgsInChat.filter(m => m && m.groupId === message.groupId) : [message];
    const targetMsgIds = (groupItems.length > 0 ? groupItems : [message]).map(m => m.id || m._id || m.tempId).filter(Boolean);

    const isMe = message.sender === "me" ||
      message.user?.toString() === (State.currentUser?.id || State.currentUser?._id)?.toString() ||
      message.from?.toString() === (State.currentUser?.id || State.currentUser?._id)?.toString();

    // Create and append the confirmation modal dynamically
    const modal = document.createElement("div");
    modal.className = "modal-overlay delete-message-modal";
    modal.style.zIndex = "2200";
    modal.innerHTML = `
      <div class="delete-confirm-box">
        <h3>${isGroup ? 'Delete media group?' : 'Delete message?'}</h3>
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
        const deletePromises = targetMsgIds.map(async (msgId) => {
          const res = await apiRequest("DELETE", `/api/message/${msgId}`, { type });
          if (res && res.status) {
            if (typeof socket !== "undefined" && socket.emit) {
              socket.emit("delete_message", { messageId: msgId, to: State.activeChat, type });
            }
            if (typeof window.animateAndDeleteMessageFromDom === "function") {
              window.animateAndDeleteMessageFromDom(msgId);
            }
          }
        });
        await Promise.all(deletePromises);
        showToast(isGroup ? "Media group deleted" : "Message deleted", "success");
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
      const groupMap = {};
      let groupRendered = false;

      messagesToForward.forEach(msg => {
        const tempId = generateId();

        let targetGroupId = null;
        if (msg.groupId) {
          if (!groupMap[msg.groupId]) {
            groupMap[msg.groupId] = `grp_${Date.now()}_${Math.random().toString(36).slice(2)}`;
          }
          targetGroupId = groupMap[msg.groupId];
        }

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
          isDisappearing: msg.isDisappearing || false,
          groupId: targetGroupId
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
          isDisappearing: msg.isDisappearing || false,
          groupId: targetGroupId
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
          if (targetGroupId) {
            groupRendered = true;
          } else {
            const messagesEl = document.getElementById("messages");
            if (messagesEl) {
              messagesEl.appendChild(createMessageElement(localMsg));
            }
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
          isDisappearing: msg.isDisappearing || false,
          groupId: targetGroupId
        });

        // Send over socket connection
        if (socket && socket.connected) {
          socket.emit("private_message", {
            message: forwardMsgPayload
          });
        }
      });

      if (groupRendered && recipientId === State.activeChat) {
        renderMessages(recipientId);
        const container = document.getElementById("messages-container");
        if (container) {
          container.scrollTop = 99999;
        }
      } else if (recipientId === State.activeChat) {
        const container = document.getElementById("messages-container");
        if (container) {
          container.scrollTop = 99999;
        }
      }
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
  if (window.isMaintenanceModeActive) {
    if (typeof window.showMaintenanceActionModal === "function") {
      window.showMaintenanceActionModal("Sending Messages");
    }
    return;
  }
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
    const currentChatId = State.activeChat;
    const conv = (State.conversations || []).find(c => c.id === currentChatId);
    if (conv) conv.draft = null;
    if (window.IndexedDBQueueService && typeof window.IndexedDBQueueService.deleteInputDraft === "function") {
      window.IndexedDBQueueService.deleteInputDraft(currentChatId).catch(console.error);
    }
  }
  if (typeof window.adjustMessageInputHeight === "function") {
    window.adjustMessageInputHeight();
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
      if (window.Router) {
        window.Router.navigate("/inbox");
      } else {
        document.getElementById("chat-list-sidebar").classList.remove("hidden");
        chatWindow.classList.remove("active");
        State.activeChat = null;
        const navbar = document.querySelector(".app-navbar");
        if (navbar) navbar.style.display = "flex";
      }
    }
  }, { passive: true });
}

function openMomentsCarousel(friendId, clickedSnapIdOrUrl = null) {
  const moments = State.friendMoments[friendId] || [];
  if (!moments.length) return;

  const oldLightbox = document.querySelector(".moments-lightbox");
  if (oldLightbox) oldLightbox.remove();

  const lightbox = document.createElement("div");
  lightbox.className = "moments-lightbox";

  // Find starting index
  let currentIndex = 0;
  if (clickedSnapIdOrUrl) {
    const idx = moments.findIndex(m => m.url === clickedSnapIdOrUrl || m._id?.toString() === clickedSnapIdOrUrl || m.id === clickedSnapIdOrUrl);
    if (idx >= 0) currentIndex = idx;
  }

  const currentUserId = (window.State && window.State.currentUser) ? (window.State.currentUser.id || window.State.currentUser._id || "").toString() : "";
  const isMe = friendId === "me" || friendId.toString() === currentUserId;
  let username = "me";
  if (isMe) {
    username = (window.State && window.State.currentUser) ? window.State.currentUser.username : "me";
  } else {
    const friend = State.contacts.find(c => (c.user.id || c.user._id || "").toString() === friendId.toString());
    username = friend ? friend.user.username : "friend";
  }

  const activeMoment = moments[currentIndex];
  const activeMomentId = activeMoment ? (activeMoment._id || activeMoment.id) : "";

  window.__momentsLightboxActive = true;
  window.history.pushState({ momentsLightboxOpen: true }, "", `/@${username}/moment/${activeMomentId}`);

  const slidesHtml = moments.map((m) => {
    const timeStr = typeof formatRelativeTime === "function"
      ? formatRelativeTime(new Date(m.createdAt))
      : new Date(m.createdAt).toLocaleTimeString();
    
    // Check if the moment is a video
    const isVideo = m.url && m.url.match(/\.(mp4|webm|ogg|mov)/i);
    
    if (isVideo) {
      return `
        <div class="moments-slide">
          <video src="${m.url}" class="moment-carousel-img" controls autoplay loop playsinline style="max-height: 100%; max-width: 100%; object-fit: contain; outline: none;"></video>
          <div class="moment-slide-time">${timeStr}</div>
        </div>
      `;
    } else {
      return `
        <div class="moments-slide">
          <img src="${m.url}" alt="Moment Snapshot" class="moment-carousel-img">
          <div class="moment-slide-time">${timeStr}</div>
        </div>
      `;
    }
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

  const updateSlide = () => {
    track.style.transform = `translateX(-${currentIndex * 100}%)`;
    const prevBtn = lightbox.querySelector(".prev-btn");
    const nextBtn = lightbox.querySelector(".next-btn");
    if (prevBtn && nextBtn) {
      prevBtn.style.display = currentIndex === 0 ? "none" : "flex";
      nextBtn.style.display = currentIndex === slides.length - 1 ? "none" : "flex";
    }

    // Update URL without polluting history stack!
    const activeMoment = moments[currentIndex];
    if (activeMoment) {
      const activeMomentId = activeMoment._id || activeMoment.id;
      window.history.replaceState({ momentsLightboxOpen: true }, "", `/@${username}/moment/${activeMomentId}`);
    }

    // Play active slide's video and pause all others
    slides.forEach((slide, idx) => {
      const video = slide.querySelector("video");
      if (video) {
        if (idx === currentIndex) {
          video.currentTime = 0;
          video.play().catch(() => {});
        } else {
          video.pause();
        }
      }
    });
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

  const closeLightbox = (fromPopstate = false) => {
    lightbox.classList.remove("active");
    document.removeEventListener("keydown", handleKeyDown);
    lightbox.querySelectorAll("video").forEach(v => v.pause());
    setTimeout(() => lightbox.remove(), 300);
    window.__momentsLightboxActive = false;
    window.closeMomentsLightbox = null;
    if (!fromPopstate && window.history.state && window.history.state.momentsLightboxOpen) {
      window.__ignoreNextPopstate = true;
      window.history.back();
    }
  };

  window.closeMomentsLightbox = closeLightbox;

  lightbox.querySelector(".moments-lightbox-close").onclick = (e) => {
    e.stopPropagation();
    closeLightbox(false);
  };

  lightbox.onclick = (e) => {
    if (e.target === lightbox || e.target.classList.contains("moments-slide")) {
      closeLightbox(false);
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

window.updateChatListLastMessage = function (chatId) {
  if (!chatId) return;
  const conv = State.conversations.find(c => c.id === chatId);
  if (!conv) return;

  const msgs = State.messages[chatId] || [];
  const newLastMsg = msgs.length > 0 ? msgs[msgs.length - 1] : null;

  if (newLastMsg) {
    conv.lastMessage = newLastMsg;
    conv.timestamp = newLastMsg.timestamp;
  } else {
    conv.lastMessage = null;
    conv.timestamp = null;
  }

  // Update chat item preview & time in left sidebar DOM
  const item = document.querySelector(`.chat-item[data-conv-id="${chatId}"]`);
  if (item) {
    const timeEl = item.querySelector(".chat-item-time");
    if (timeEl) {
      timeEl.textContent = newLastMsg && newLastMsg.timestamp ? formatTime(newLastMsg.timestamp) : "";
    }
    const previewEl = item.querySelector(".chat-item-preview");
    if (previewEl) {
      previewEl.innerHTML = typeof getLastMessageHTML === "function" ? getLastMessageHTML(conv) : "";
    }
  } else {
    if (typeof renderChatList === "function") {
      renderChatList();
    }
  }
};

window.animateAndDeleteMessageFromDom = function (messageId) {
  const msgEl = document.querySelector(`.message[data-message-id="${messageId}"]`);
  const groupItemEl = document.querySelector(`.media-group-item[data-message-id="${messageId}"]`);
  let groupParentEl = null;
  if (groupItemEl) {
    groupParentEl = groupItemEl.closest(".media-group-message");
  }

  // Remove the message object from the local State.messages array to keep state in sync
  const chatId = State.messageIndex[messageId] || State.activeChat;
  if (chatId) {
    const msgs = State.messages[chatId] || [];
    const index = msgs.findIndex(m => String(m.id ?? m.tempId ?? m._id) === String(messageId));
    if (index !== -1) {
      msgs.splice(index, 1);
    }
  }

  if (groupParentEl) {
    const groupId = groupParentEl.dataset.groupId;
    const remainingInGroup = (State.messages[chatId] || []).filter(m => m.groupId === groupId);
    if (remainingInGroup.length === 0) {
      groupParentEl.classList.add("message-deleting");
      setTimeout(() => {
        groupParentEl.remove();
      }, 400);
    } else {
      if (typeof renderMessages === "function") {
        renderMessages(chatId);
      }
    }
  } else if (msgEl) {
    // Add deletion class to trigger transition/animation
    msgEl.classList.add("message-deleting");
    // Remove element from DOM after animation completes (400ms)
    setTimeout(() => {
      msgEl.remove();
    }, 400);
  }

  // Update chat list last message preview & time if deleted message was the last message
  if (chatId && typeof window.updateChatListLastMessage === "function") {
    window.updateChatListLastMessage(chatId);
  }
};

// Clear current message selection
window.clearMessageSelection = function () {
  document.querySelectorAll(".message.selected, .media-group-message.selected").forEach(el => el.classList.remove("selected"));
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
  const msgId = message.id || message._id || message.tempId || message.groupId;
  if (!State.selectedMessageIds) {
    State.selectedMessageIds = new Set();
  }

  if (!msgEl || (!msgEl.classList.contains("message") && !msgEl.classList.contains("media-group-message"))) {
    msgEl = document.querySelector(`.message[data-message-id="${msgId}"], .media-group-message[data-group-id="${msgId}"], .media-group-message[data-message-id="${msgId}"]`);
  }

  if (State.selectedMessageIds.has(msgId)) {
    State.selectedMessageIds.delete(msgId);
    if (msgEl) msgEl.classList.remove("selected");
  } else {
    State.selectedMessageIds.add(msgId);
    if (msgEl) msgEl.classList.add("selected");
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
    const remainingEl = document.querySelector(`.message[data-message-id="${remainingId}"], .media-group-message[data-group-id="${remainingId}"]`);
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

  const viewportWidth = window.innerWidth;
  const barWidth = Math.min(345, viewportWidth - 20);

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
      if (typeof updateReplyPreviewBar === "function") {
        updateReplyPreviewBar(message);
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

  // If selection mode is already active, toggle selection of this message instead of clearing
  if (State.selectedMessageIds && State.selectedMessageIds.size > 0) {
    window.toggleMessageSelection(message, msgEl);
    return;
  }

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
      if (Date.now() - (window.__justLongPressedTime || 0) < 400) {
        return;
      }
      if (State.selectedMessageIds && State.selectedMessageIds.size > 0) {
        const emojiBar = document.querySelector(".mobile-emoji-bar");
        const clickedInsideEmojiBar = emojiBar && emojiBar.contains(e.target);
        const clickedInsideMessage = e.target.closest(".message, .media-group-message, .message-bubble");
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
  }, 50);
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
      const rawMsgIds = Array.from(State.selectedMessageIds);

      // Expand any selected media group IDs into all items of that media group
      const allTargetMsgIds = new Set();
      const allTargetMsgs = [];

      for (const rawId of rawMsgIds) {
        const chatId = State.messageIndex[rawId] || State.activeChat;
        const msgsInChat = State.messages[chatId] || [];
        let msg = msgsInChat.find(m => m && (m.id === rawId || m._id === rawId || m.tempId === rawId || m.groupId === rawId));
        if (msg) {
          if (msg.groupId) {
            const groupItems = msgsInChat.filter(m => m && m.groupId === msg.groupId);
            groupItems.forEach(item => {
              const itemId = item.id || item._id || item.tempId;
              if (itemId) {
                allTargetMsgIds.add(itemId);
                allTargetMsgs.push(item);
              }
            });
          } else {
            const itemId = msg.id || msg._id || msg.tempId || rawId;
            allTargetMsgIds.add(itemId);
            allTargetMsgs.push(msg);
          }
        } else {
          allTargetMsgIds.add(rawId);
        }
      }

      for (const msg of allTargetMsgs) {
        const isMe = msg.sender === "me" ||
          msg.user?.toString() === (State.currentUser?.id || State.currentUser?._id)?.toString() ||
          msg.from?.toString() === (State.currentUser?.id || State.currentUser?._id)?.toString();
        if (!isMe) {
          allMine = false;
        }
      }

      const finalMsgIds = Array.from(allTargetMsgIds);

      const modal = document.createElement("div");
      modal.className = "modal-overlay delete-message-modal";
      modal.style.zIndex = "2200";
      modal.innerHTML = `
        <div class="delete-confirm-box">
          <h3>Delete selected message${finalMsgIds.length > 1 ? 's' : ''}?</h3>
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
          const deletePromises = finalMsgIds.map(async (msgId) => {
            const res = await apiRequest("DELETE", `/api/message/${msgId}`, { type });
            if (res && res.status) {
              if (typeof socket !== "undefined" && socket.emit) {
                socket.emit("delete_message", { messageId: msgId, to: State.activeChat, type });
              }
              if (typeof window.animateAndDeleteMessageFromDom === "function") {
                window.animateAndDeleteMessageFromDom(msgId);
              }
            }
          });
          await Promise.all(deletePromises);
          showToast(`Deleted selected message${finalMsgIds.length > 1 ? 's' : ''}`, "success");
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
  if (window.updateGlobalUserAvatarUI) {
    window.updateGlobalUserAvatarUI();
  }

  chatBtn.onclick = async () => {
    if (window.location.pathname !== "/inbox" && window.Router && !window.Router.isNavigatingFromRouter) {
      window.Router.navigate("/inbox", { silent: true });
    }
    document.body.classList.remove("profile-page-active");
    document.body.classList.remove("mobile-profile-value-active");
    chatBtn.classList.add("active");
    statusBtn.classList.remove("active");
    if (avatarBtn) avatarBtn.classList.remove("active");

    const profileSidebar = document.getElementById("profile-page-sidebar");
    if (chatSidebar) {
      chatSidebar.style.display = "flex";
      chatSidebar.classList.remove("hidden");
    }
    if (statusSidebar) {
      statusSidebar.style.display = "none";
      statusSidebar.classList.add("hidden");
    }
    if (profileSidebar) {
      profileSidebar.style.display = "none";
      profileSidebar.classList.add("hidden");
    }

    // Restore Chat window if it was replaced by status empty state or profile settings
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
    if (window.location.pathname !== "/status" && window.Router && !window.Router.isNavigatingFromRouter) {
      window.Router.navigate("/status", { silent: true });
    }
    document.body.classList.remove("profile-page-active");
    document.body.classList.remove("mobile-profile-value-active");
    statusBtn.classList.add("active");
    chatBtn.classList.remove("active");
    if (avatarBtn) avatarBtn.classList.remove("active");

    const profileSidebar = document.getElementById("profile-page-sidebar");
    if (chatSidebar) {
      chatSidebar.style.display = "none";
      chatSidebar.classList.add("hidden");
    }
    if (statusSidebar) {
      statusSidebar.style.display = "flex";
      statusSidebar.classList.remove("hidden");
    }
    if (profileSidebar) {
      profileSidebar.style.display = "none";
      profileSidebar.classList.add("hidden");
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
      const username = (window.State && window.State.currentUser) ? window.State.currentUser.username : "me";
      if (typeof openProfileModal === "function") {
        openProfileModal(null, true);
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
            avatarContainer.innerHTML = `<img src="${State.currentUser.avatar}" onerror="this.style.display='none'; if(this.nextElementSibling) this.nextElementSibling.style.display='inline';" style="width: 100%; height: 100%; object-fit: cover; border-radius: 50%;" /><span style="display:none; font-weight: 700; color: white;">${State.currentUser.username.charAt(0).toUpperCase()}</span><span class="status-add-badge">+</span>`;
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

// =============================================================================
// FULLSCREEN PROFILE PICTURE VIEW
// =============================================================================
function viewFullscreenProfilePicture(imgUrl, username) {
  if (typeof openFullProfilePhotoViewer === "function") {
    openFullProfilePhotoViewer(imgUrl, username);
  }
}
window.viewFullscreenProfilePicture = viewFullscreenProfilePicture;

// =============================================================================
// CONTACT INFO RIGHT SIDEBAR (WhatsApp Web Style)
// =============================================================================
function initContactInfoSidebar() {
  const chatHeaderInfo = document.querySelector(".chat-header-info");
  const chatInfoBtn = document.getElementById("chat-info-btn");
  const contactSidebar = document.getElementById("contact-info-sidebar");
  const closeBtn = document.getElementById("contact-info-close-btn");

  if (!contactSidebar) return;

  const toggleSidebar = (e) => {
    if (e) e.stopPropagation();
    if (contactSidebar.classList.contains("hidden")) {
      openContactInfoSidebar();
    } else {
      closeContactInfoSidebar();
    }
  };

  if (chatHeaderInfo) {
    chatHeaderInfo.style.cursor = "pointer";
    chatHeaderInfo.onclick = toggleSidebar;
  }
  if (chatInfoBtn) {
    chatInfoBtn.onclick = toggleSidebar;
  }
  if (closeBtn) {
    closeBtn.onclick = closeContactInfoSidebar;
  }
}

function openContactInfoSidebar() {
  const contactSidebar = document.getElementById("contact-info-sidebar");
  if (!contactSidebar || !State.activeChat) return;

  window.__contactInfoSidebarActive = true;
  window.history.pushState({ contactInfoOpen: true }, "");

  const activeConv = State.conversations.find(c => c.id === State.activeChat) || {};
  const headerUsernameEl = document.getElementById("chat-username");
  const headerStatusEl = document.getElementById("online-status");

  const username = activeConv.username || activeConv.user?.username || (headerUsernameEl ? headerUsernameEl.textContent : "") || "User";
  const avatarLetter = activeConv.avatar || activeConv.user?.username?.charAt(0) || username.charAt(0) || "U";
  const statusText = activeConv.online ? "Active now" : (headerStatusEl ? headerStatusEl.textContent : "Offline");

  // Populate user data
  const avatarEl = document.getElementById("contact-sidebar-avatar");
  const nameEl = document.getElementById("contact-sidebar-name");
  const subEl = document.getElementById("contact-sidebar-sub");

  const avatarWrap = document.querySelector(".contact-info-avatar-wrap");

  if (avatarEl) {
    const isLetterAvatar = avatarLetter && avatarLetter.length === 1;
    if (isLetterAvatar) {
      avatarEl.innerHTML = avatarLetter.toUpperCase();
      if (avatarWrap) {
        avatarWrap.style.cursor = "default";
        avatarWrap.onclick = null;
      }
    } else {
      avatarEl.innerHTML = `<img src="${avatarLetter}" onerror="this.style.display='none'; if(this.nextElementSibling) this.nextElementSibling.style.display='inline';" style="width: 100%; height: 100%; object-fit: cover; border-radius: 50%;" /><span style="display: none;">${username.charAt(0).toUpperCase()}</span>`;
      if (avatarWrap) {
        avatarWrap.style.cursor = "pointer";
        avatarWrap.onclick = (e) => {
          e.stopPropagation();
          viewFullscreenProfilePicture(avatarLetter, username);
        };
      }
    }
  }
  if (nameEl) nameEl.textContent = sanitizeInput(username);
  if (subEl) subEl.textContent = statusText;

  // Bind quick actions
  const voiceBtn = document.getElementById("contact-action-voice");
  const videoBtn = document.getElementById("contact-action-video");
  const searchBtn = document.getElementById("contact-action-search");

  if (voiceBtn) {
    voiceBtn.onclick = () => {
      const audioCallBtn = document.getElementById("audio-call-btn");
      if (audioCallBtn) audioCallBtn.click();
    };
  }
  if (videoBtn) {
    videoBtn.onclick = () => {
      const videoCallBtn = document.getElementById("video-call-btn");
      if (videoCallBtn) videoCallBtn.click();
    };
  }
  if (searchBtn) {
    searchBtn.onclick = () => {
      const searchInput = document.getElementById("message-search-input");
      if (searchInput) searchInput.focus();
    };
  }

  // Bind Media Header click to open media gallery panel
  const mediaHeader = document.getElementById("contact-media-header");
  if (mediaHeader) {
    mediaHeader.onclick = () => {
      openMediaGalleryPanel();
    };
  }

  // Populate media preview grid
  populateContactMediaGrid(State.activeChat);

  // Bind Danger actions
  const blockBtn = document.getElementById("contact-block-btn");
  const clearBtn = document.getElementById("contact-clear-btn");

  if (blockBtn) {
    blockBtn.onclick = () => {
      if (typeof showToast === "function") showToast(`Block settings for ${username} coming soon`, "info");
    };
  }
  if (clearBtn) {
    clearBtn.onclick = () => {
      if (typeof showToast === "function") showToast("Clear chat coming soon", "info");
    };
  }

  contactSidebar.classList.remove("hidden");
}

function closeContactInfoSidebar(fromPopstate = false) {
  const contactSidebar = document.getElementById("contact-info-sidebar");
  if (contactSidebar) {
    contactSidebar.classList.add("hidden");
  }

  let popCount = 0;

  // Also reset gallery panel if it was open
  const galleryPanel = document.getElementById("media-gallery-panel");
  if (galleryPanel && !galleryPanel.classList.contains("hidden")) {
    galleryPanel.classList.add("hidden");
    const contactBody = document.querySelector(".contact-info-body");
    const contactHeader = document.querySelector(".contact-info-header");
    if (contactBody) contactBody.style.display = "";
    if (contactHeader) contactHeader.style.display = "";
    window.__mediaGalleryActive = false;
    if (!fromPopstate && window.history.state && window.history.state.mediaGalleryOpen) {
      popCount++;
    }
  }

  window.__contactInfoSidebarActive = false;
  if (!fromPopstate && window.history.state && window.history.state.contactInfoOpen) {
    popCount++;
  }

  if (popCount > 0) {
    if (popCount === 1) {
      window.__ignoreNextPopstate = true;
    } else {
      window.__ignorePopstatesCount = popCount;
    }
    window.history.go(-popCount);
  }
}

async function populateContactMediaGrid(chatId) {
  const gridEl = document.getElementById("contact-media-grid");
  const countEl = document.getElementById("contact-media-count");
  if (!gridEl) return;

  // Hide grid initially
  gridEl.style.display = "none";
  gridEl.innerHTML = "";

  // ── 1. PREVIEW GRID — only from what's currently loaded in the chat (frontend cache)
  const cachedMsgs = (State.messages && State.messages[chatId]) || [];
  const urlRegex = /(https?:\/\/[^\s]+)/g;

  // Get image/video messages visible in this chat window
  const cachedMedia = cachedMsgs.filter(m => m.type === "image" || m.type === "video");
  const previewItems = cachedMedia.slice(-4).reverse(); // show 4 most recent

  if (previewItems.length > 0) {
    gridEl.style.display = "";
    gridEl.innerHTML = "";

    for (const m of previewItems) {
      const thumb = document.createElement("div");
      thumb.className = "contact-media-thumb";

      let thumbUrl = m.thumbnail || m.thumb || m.cover || "";

      if (!thumbUrl && m.content) {
        if (typeof getDecryptedStreamUrl === "function") {
          try { thumbUrl = await getDecryptedStreamUrl(m.content, m.id || m.tempId); } catch (e) { thumbUrl = ""; }
        }
      }

      if (thumbUrl) {
        thumb.innerHTML = `<img src="${thumbUrl}" alt="media" onerror="this.parentNode.innerHTML='<div class=\\'contact-media-fallback\\'><svg width=\\'20\\' height=\\'20\\' viewBox=\\'0 0 24 24\\' fill=\\'none\\' stroke=\\'currentColor\\' stroke-width=\\'2\\'><rect x=\\'3\\' y=\\'3\\' width=\\'18\\' height=\\'18\\' rx=\\'2\\' ry=\\'2\\'/><circle cx=\\'8.5\\' cy=\\'8.5\\' r=\\'1.5\\'/><polyline points=\\'21 15 16 10 5 21\\'/></svg></div>'" />`;
      } else {
        thumb.innerHTML = `
          <div class="contact-media-fallback">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/>
            </svg>
          </div>`;
      }

      thumb.onclick = () => openMediaGalleryPanel();
      gridEl.appendChild(thumb);
    }
  }
  // If no media in frontend cache → grid stays hidden

      // ── 2. COUNT BADGE — from the database (API) — reflects all stored media
  try {
    if (typeof fetchMedia === "function") {
      const data = await fetchMedia(chatId, null, 200);
      const allItems = data.Data?.data || [];

      // Fetch links count from database via API
      let linkCount = 0;
      if (typeof fetchLinks === "function") {
        try {
          const linkData = await fetchLinks(chatId, 200);
          linkCount = linkData.Data?.data?.length || 0;
        } catch (e) {
          console.warn("fetchLinks count failed, falling back to cache:", e);
        }
      }

      // Fallback: If database fetch didn't return links count, use cache
      if (linkCount === 0) {
        for (const m of cachedMsgs) {
          if (m.type === "text" && m.content) {
            const urls = m.content.match(urlRegex);
            if (urls) linkCount += urls.length;
          }
        }
      }

      const totalCount = allItems.length + linkCount;

      if (countEl) {
        countEl.innerHTML = totalCount > 0 ? `${totalCount} &rsaquo;` : `&rsaquo;`;
        countEl.style.cursor = "pointer";
        countEl.onclick = (e) => { e.stopPropagation(); openMediaGalleryPanel(); };
      }
    }
  } catch (err) {
    console.error("Failed to fetch media count:", err);
  }

  // ── 3. Wire the header row to open gallery on click
  const headerEl = document.getElementById("contact-media-header");
  if (headerEl) {
    headerEl.style.cursor = "pointer";
    headerEl.onclick = () => openMediaGalleryPanel();
  }
}


// =========================================================================
// MEDIA GALLERY PANEL — Full Media/Docs/Links view inside contact sidebar
// =========================================================================
let _mediaGalleryCache = { media: [], docs: [], links: [] };
let _mediaGalleryLoaded = false;

async function promptPasswordForMediaGallery(onSuccess) {
  // Load password overlay if not exists
  let passwordOverlay = document.getElementById("passwordOverlay");
  if (!passwordOverlay) {
    try {
      const html = await ComponentLoader.load("password-overlay");
      const wrapper = document.createElement("div");
      wrapper.innerHTML = html;
      passwordOverlay = wrapper.firstElementChild;
      document.body.appendChild(passwordOverlay);
      
      const passwordInput = document.getElementById("passwordInput");
      if (passwordInput) {
        passwordInput.addEventListener("keydown", e => {
          if (e.key === "Enter") {
            if (typeof window.unlockScreen === "function") {
              window.unlockScreen();
            }
          }
        });
      }
    } catch (err) {
      console.error("Failed to load password overlay for media view:", err);
      return;
    }
  }

  const passwordInput = document.getElementById("passwordInput");
  const errorMsg = document.getElementById("errorMsg");
  const submitBtn = document.getElementById("submitBtn");

  if (passwordInput) {
    passwordInput.value = "";
    passwordInput.disabled = false;
  }
  if (errorMsg) errorMsg.textContent = "";
  if (submitBtn) {
    submitBtn.disabled = false;
    submitBtn.classList.remove("loading");
    submitBtn.textContent = "Submit";
  }

  let remainingAttempts = 5;
  passwordOverlay.classList.add("active");
  if (passwordInput) passwordInput.focus();

  const originalUnlock = window.unlockScreen;
  window.unlockScreen = async function () {
    const btn = document.getElementById("submitBtn");
    const input = document.getElementById("passwordInput");
    const error = document.getElementById("errorMsg");

    if (!btn || btn.disabled) return;
    if (error) error.textContent = "";
    btn.disabled = true;
    btn.classList.add("loading");
    btn.textContent = "Verifying";

    try {
      const verifyFn = window.fakePasswordApi || (async (pw) => {
        const response = await loginuser({ identifier: State.currentUser.username, password: pw, type: "password" });
        return !!response.Data?.status;
      });

      const success = await verifyFn(input.value);
      if (success) {
        btn.disabled = false;
        btn.classList.remove("loading");
        btn.textContent = "Submit";
        passwordOverlay.classList.remove("active");
        window.unlockScreen = originalUnlock;
        
        if (onSuccess) onSuccess();
        return;
      }

      remainingAttempts--;
      if (remainingAttempts <= 0) {
        if (error) error.textContent = "You have exceeded the maximum number of attempts. Access has been blocked.";
        btn.textContent = "Blocked";
        btn.classList.remove("loading");
        btn.disabled = true;
        if (input) input.disabled = true;
        setTimeout(() => { 
          passwordOverlay.classList.remove("active");
          window.unlockScreen = originalUnlock; 
        }, 3000);
        return;
      }
      
      const getAttemptMsg = (attemptsLeft) => {
        if (attemptsLeft === 4) return "Invalid password. You have 4 attempts remaining.";
        if (attemptsLeft === 3) return "Warning: Only 3 attempts remaining.";
        if (attemptsLeft === 2) return "Alert: Only 2 attempts remaining.";
        if (attemptsLeft === 1) return "Final warning: Last attempt remaining.";
        return `Invalid password. Attempts remaining: ${attemptsLeft}`;
      };

      if (error) error.textContent = getAttemptMsg(remainingAttempts);
      btn.disabled = false;
      btn.classList.remove("loading");
      btn.textContent = "Submit";
    } catch (err) {
      if (error) error.textContent = "Server error. Please try again later.";
      btn.disabled = false;
      btn.classList.remove("loading");
      btn.textContent = "Submit";
    }
  };
}

function openMediaGalleryPanel() {
  promptPasswordForMediaGallery(() => {
    const contactBody = document.querySelector(".contact-info-body");
    const contactHeader = document.querySelector(".contact-info-header");
    const galleryPanel = document.getElementById("media-gallery-panel");
    if (!galleryPanel) return;

    window.__mediaGalleryActive = true;
    window.history.pushState({ mediaGalleryOpen: true }, "");

    if (contactBody) contactBody.style.display = "none";
    if (contactHeader) contactHeader.style.display = "none";
    galleryPanel.classList.remove("hidden");

    const backBtn = document.getElementById("media-gallery-back-btn");
    if (backBtn) {
      backBtn.onclick = () => closeMediaGalleryPanel();
    }

    const tabs = galleryPanel.querySelectorAll(".media-gallery-tab");
    tabs.forEach(tab => {
      tab.onclick = () => {
        tabs.forEach(t => t.classList.remove("active"));
        tab.classList.add("active");
        renderMediaGalleryTab(tab.dataset.tab);
      };
    });

    const viewAllBtn = document.getElementById("media-gallery-view-all");
    if (viewAllBtn) {
      viewAllBtn.onclick = () => {
        closeContactInfoSidebar();
        if (typeof fetchAndShowAllMedia === "function") {
          fetchAndShowAllMedia();
        }
      };
    }

    // Reset to media tab
    tabs.forEach(t => t.classList.remove("active"));
    const mediaTab = galleryPanel.querySelector('[data-tab="media"]');
    if (mediaTab) mediaTab.classList.add("active");

    _mediaGalleryLoaded = false;
    loadMediaGalleryData().then(() => {
      renderMediaGalleryTab("media");
    });
  });
}

function closeMediaGalleryPanel(fromPopstate = false) {
  const contactBody = document.querySelector(".contact-info-body");
  const contactHeader = document.querySelector(".contact-info-header");
  const galleryPanel = document.getElementById("media-gallery-panel");
  if (!galleryPanel) return;

  galleryPanel.classList.add("hidden");
  if (contactBody) contactBody.style.display = "";
  if (contactHeader) contactHeader.style.display = "";

  window.__mediaGalleryActive = false;
  if (!fromPopstate && window.history.state && window.history.state.mediaGalleryOpen) {
    window.__ignoreNextPopstate = true;
    window.history.back();
  }
}

let _mediaGalleryPagination = {
  chatId: null,
  activeTab: "media",
  limit: 10,
  hasMoreMedia: true,
  isLoading: false,
  oldestCreatedAt: null
};

async function loadMediaGalleryData() {
  const contentEl = document.getElementById("media-gallery-content");
  if (!contentEl) return;

  contentEl.innerHTML = `<div class="media-gallery-loading">Loading...</div>`;
  _mediaGalleryCache = { media: [], docs: [], links: [] };
  _mediaGalleryPagination = {
    chatId: State.activeChat,
    activeTab: "media",
    limit: 10,
    hasMoreMedia: true,
    isLoading: false,
    oldestCreatedAt: null
  };

  try {
    if (typeof fetchMedia !== "function" || !State.activeChat) {
      contentEl.innerHTML = `<div class="media-gallery-empty">No media available</div>`;
      return;
    }

    // ── 1. Fetch initial batch of media items
    const data = await fetchMedia(State.activeChat, null, _mediaGalleryPagination.limit);
    const allMessages = data.Data?.data || [];

    if (allMessages.length < _mediaGalleryPagination.limit) {
      _mediaGalleryPagination.hasMoreMedia = false;
    }

    for (const m of allMessages) {
      if (m.type === "image" || m.type === "video" || m.type === "audio") {
        _mediaGalleryCache.media.push(m);
      } else if (m.type === "document" || m.type === "file") {
        _mediaGalleryCache.docs.push(m);
      }
    }

    if (_mediaGalleryCache.media.length > 0) {
      _mediaGalleryPagination.oldestCreatedAt = _mediaGalleryCache.media[_mediaGalleryCache.media.length - 1].createdAt;
    }

    // ── 2. Fetch links from database
    if (typeof fetchLinks === "function") {
      try {
        const linkData = await fetchLinks(State.activeChat, 50);
        const dbLinks = linkData.Data?.data || [];
        for (const l of dbLinks) {
          _mediaGalleryCache.links.push(l);
        }
      } catch (e) { console.warn("fetchLinks failed:", e); }
    }

    // ── 3. Merge extra items from in-memory cached messages
    const cachedMsgs = (State.messages && State.messages[State.activeChat]) || [];
    const urlRegex = /(https?:\/\/[^\s]+)/g;
    for (const m of cachedMsgs) {
      if ((m.type === "image" || m.type === "video" || m.type === "audio") && !_mediaGalleryCache.media.find(x => (x.id || x.tempId) === (m.id || m.tempId))) {
        _mediaGalleryCache.media.push(m);
      } else if ((m.type === "document" || m.type === "file") && !_mediaGalleryCache.docs.find(d => (d.id || d.tempId) === (m.id || m.tempId))) {
        _mediaGalleryCache.docs.push(m);
      }
      if (m.type === "text" && m.content) {
        const urls = m.content.match(urlRegex);
        if (urls) {
          for (const url of urls) {
            if (!_mediaGalleryCache.links.find(l => l.url === url)) {
              _mediaGalleryCache.links.push({ url, createdAt: m.createdAt, from: m.from || m.sender || null });
            }
          }
        }
      }
    }

    _mediaGalleryLoaded = true;
  } catch (err) {
    console.error("Failed to load media gallery data:", err);
    contentEl.innerHTML = `<div class="media-gallery-empty">Failed to load media</div>`;
  }
}

async function loadMoreGalleryMedia() {
  if (!_mediaGalleryPagination.hasMoreMedia || _mediaGalleryPagination.isLoading || !State.activeChat) return;

  _mediaGalleryPagination.isLoading = true;

  const contentEl = document.getElementById("media-gallery-content");
  let spinner = document.getElementById("media-gallery-scroll-spinner");
  if (!spinner && contentEl) {
    spinner = document.createElement("div");
    spinner.id = "media-gallery-scroll-spinner";
    spinner.style.cssText = "padding: 16px; text-align: center; color: rgba(255,255,255,0.5); font-size: 12px;";
    spinner.innerHTML = `<div class="spinner-ring" style="width:18px;height:18px;border-width:2px;margin:0 auto 6px;"></div>Loading more media...`;
    contentEl.appendChild(spinner);
  }

  try {
    const data = await fetchMedia(State.activeChat, _mediaGalleryPagination.oldestCreatedAt, _mediaGalleryPagination.limit);
    const newMessages = data.Data?.data || [];

    if (newMessages.length < _mediaGalleryPagination.limit) {
      _mediaGalleryPagination.hasMoreMedia = false;
    }

    const addedMedia = [];
    for (const m of newMessages) {
      if (m.type === "image" || m.type === "video" || m.type === "audio") {
        if (!_mediaGalleryCache.media.some(x => (x.id || x.tempId) === (m.id || m.tempId))) {
          _mediaGalleryCache.media.push(m);
          addedMedia.push(m);
        }
      } else if (m.type === "document" || m.type === "file") {
        if (!_mediaGalleryCache.docs.some(x => (x.id || x.tempId) === (m.id || m.tempId))) {
          _mediaGalleryCache.docs.push(m);
        }
      }
    }

    if (addedMedia.length > 0) {
      _mediaGalleryPagination.oldestCreatedAt = addedMedia[addedMedia.length - 1].createdAt;
      if (_mediaGalleryPagination.activeTab === "media" && contentEl) {
        await renderGalleryMediaTab(contentEl);
      }
    }
  } catch (err) {
    console.error("[MediaGallery] Scroll pagination error:", err);
  } finally {
    if (spinner) spinner.remove();
    _mediaGalleryPagination.isLoading = false;
  }
}

async function renderMediaGalleryTab(tab) {
  const contentEl = document.getElementById("media-gallery-content");
  if (!contentEl) return;

  _mediaGalleryPagination.activeTab = tab;

  if (!_mediaGalleryLoaded) {
    contentEl.innerHTML = `<div class="media-gallery-loading">Loading...</div>`;
    return;
  }

  // Scroll listener for infinite scroll pagination
  contentEl.onscroll = () => {
    if (_mediaGalleryPagination.activeTab !== "media") return;
    if (!_mediaGalleryPagination.hasMoreMedia || _mediaGalleryPagination.isLoading) return;
    const distanceToBottom = contentEl.scrollHeight - (contentEl.scrollTop + contentEl.clientHeight);
    if (distanceToBottom < 150) {
      loadMoreGalleryMedia();
    }
  };

  if (tab === "media") {
    await renderGalleryMediaTab(contentEl);
  } else if (tab === "docs") {
    renderGalleryDocsTab(contentEl);
  } else if (tab === "links") {
    renderGalleryLinksTab(contentEl);
  }
}

async function renderGalleryMediaTab(contentEl) {
  const items = _mediaGalleryCache.media;
  if (items.length === 0) {
    contentEl.innerHTML = `<div class="media-gallery-empty">No media shared yet</div>`;
    return;
  }

  const groups = {};
  const now = new Date();
  for (const m of items) {
    const d = new Date(m.createdAt);
    const monthKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    let label;
    if (d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth()) {
      label = "THIS MONTH";
    } else {
      label = d.toLocaleString("en-US", { month: "long", year: "numeric" }).toUpperCase();
    }
    if (!groups[monthKey]) groups[monthKey] = { label, items: [] };
    groups[monthKey].items.push(m);
  }

  contentEl.innerHTML = "";
  const sortedKeys = Object.keys(groups).sort().reverse();

  for (const key of sortedKeys) {
    const group = groups[key];
    const groupDiv = document.createElement("div");
    groupDiv.className = "media-gallery-month-group";

    const labelDiv = document.createElement("div");
    labelDiv.className = "media-gallery-month-label";
    labelDiv.textContent = group.label;
    groupDiv.appendChild(labelDiv);

    const gridDiv = document.createElement("div");
    gridDiv.className = "media-gallery-grid";

    for (const m of group.items) {
      const itemDiv = document.createElement("div");
      itemDiv.className = "media-gallery-item";

      // Use pre-built thumbnail if available (API returns /api/thumbnail/:id)
      let thumbUrl = m.thumbnail || m.thumb || m.cover || "";
      
      if (!thumbUrl && m.content) {
        // Fallback: decrypt stream URL for direct display
        if (typeof getDecryptedStreamUrl === "function") {
          try { thumbUrl = await getDecryptedStreamUrl(m.content, m.id); } catch (e) { /* */ }
        } else {
          thumbUrl = m.content;
        }
      }

      if (m.type === "video") {
        if (thumbUrl && thumbUrl.includes("/api/thumbnail")) {
          itemDiv.innerHTML = `<img src="${thumbUrl}" alt="" onerror="this.style.display='none'" />
            <div class="video-badge"><svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg></div>`;
        } else {
          itemDiv.innerHTML = `<video src="${thumbUrl}" preload="metadata"></video>
            <div class="video-badge"><svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg></div>`;
        }
      } else if (m.type === "audio") {
        const dur = m.duration ? ` ${Math.floor(m.duration / 60)}:${String(Math.floor(m.duration % 60)).padStart(2, "0")}` : "Audio";
        itemDiv.innerHTML = `
          <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;gap:6px;color:rgba(255,255,255,0.7);">
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#25d366" stroke-width="1.8">
              <path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>
            </svg>
            <span style="font-size:10px;color:rgba(255,255,255,0.5);">${dur}</span>
          </div>`;
      } else {
        itemDiv.innerHTML = `<img src="${thumbUrl}" alt="" onerror="this.style.display='none'" />`;
      }

      itemDiv.onclick = () => {
        const viewerItems = items.map((msg, idx) => ({
          index: idx, id: msg.id ?? msg.tempId, type: msg.type,
          src: msg.content, thumb: msg.thumb || null, cover: msg.cover || null,
          createdAt: msg.createdAt, originalMsg: msg
        }));
        const clickIdx = items.indexOf(m);
        if (typeof MediaViewer !== "undefined") {
          const v = new MediaViewer(State.activeChat, viewerItems);
          v.open(clickIdx >= 0 ? clickIdx : 0);
        }
      };

      gridDiv.appendChild(itemDiv);
    }

    groupDiv.appendChild(gridDiv);
    contentEl.appendChild(groupDiv);
  }
}

function renderGalleryDocsTab(contentEl) {
  const items = _mediaGalleryCache.docs;
  if (items.length === 0) {
    contentEl.innerHTML = `<div class="media-gallery-empty">No documents shared yet</div>`;
    return;
  }

  // Map extension → CSS class for colour coding
  const EXT_CLASS = {
    pdf: "pdf", doc: "doc", docx: "doc",
    xls: "xls", xlsx: "xls", csv: "csv",
    txt: "txt", zip: "zip", rar: "zip",
    ppt: "doc", pptx: "doc"
  };

  contentEl.innerHTML = "";
  for (const m of items) {
    // fileName now comes from the API; fall back to parsing content URL
    const rawName = m.fileName || m.filename || m.caption || "";
    const filename = rawName || (m.content ? decodeURIComponent(m.content.split("/").pop().split("?")[0]) : "Document");
    const ext = filename.includes(".") ? filename.split(".").pop().toLowerCase() : "file";
    const extClass = EXT_CLASS[ext] || "default";
    const label = ext.toUpperCase().slice(0, 4) || "FILE";
    const date = m.createdAt ? new Date(m.createdAt).toLocaleDateString("en-US", { day: "numeric", month: "short", year: "numeric" }) : "";
    const size = m.size && m.size !== "0 B" ? ` · ${m.size}` : "";

    const msgId = m.id || m._id || m.tempId;
    const isPresent = !!document.querySelector(`.message[data-message-id="${msgId}"]`);

    const docDiv = document.createElement("div");
    docDiv.className = "media-gallery-doc-item";
    docDiv.style.cursor = "default";
    docDiv.style.alignItems = "flex-start";
    docDiv.innerHTML = `
      <div class="media-gallery-doc-icon ${extClass}">${label}</div>
      <div class="media-gallery-doc-info" style="flex: 1; min-width: 0;">
        <div class="media-gallery-doc-name" title="${filename}">${filename}</div>
        <div class="media-gallery-doc-date" style="margin-bottom: 4px;">${date}${size}</div>
        <div class="media-gallery-doc-actions" style="display: flex; gap: 8px; margin-top: 8px; width: 100%;">
          <button type="button" class="doc-btn doc-open go-to-msg-btn" ${isPresent ? "" : "disabled"} title="${isPresent ? "Scroll to message in chat" : "Message is not loaded in current chat history"}" style="padding: 5px 10px; font-size: 12px; height: 32px;">
            <i class="ti ti-message"></i>
            <span>Go to message</span>
          </button>
          <button type="button" class="doc-btn doc-save save-as-btn" style="padding: 5px 10px; font-size: 12px; height: 32px;">
            <i class="ti ti-download"></i>
            <span>Save as</span>
          </button>
        </div>
      </div>`;

    docDiv.querySelector(".go-to-msg-btn").onclick = (e) => {
      e.stopPropagation();
      e.preventDefault();
      const targetEl = document.querySelector(`.message[data-message-id="${msgId}"]`);
      if (targetEl) {
        closeMediaGalleryPanel();
        closeContactInfoSidebar();
        targetEl.scrollIntoView({ behavior: "smooth", block: "center" });
        targetEl.classList.add("highlight-pulse");
        setTimeout(() => targetEl.classList.remove("highlight-pulse"), 1500);
      } else {
        if (typeof showToast === "function") {
          showToast("Message not found in current history", "info");
        }
      }
    };

    docDiv.querySelector(".save-as-btn").onclick = (e) => {
      e.stopPropagation();
      e.preventDefault();
      const url = m.content || "";
      if (url && typeof forceDownload === "function") {
        forceDownload(url, filename, msgId, e.currentTarget);
      }
    };

    contentEl.appendChild(docDiv);
  }
}

function renderGalleryLinksTab(contentEl) {
  const items = _mediaGalleryCache.links;
  if (items.length === 0) {
    contentEl.innerHTML = `<div class="media-gallery-empty">No links shared yet</div>`;
    return;
  }

  // Get context: current user ID and active conversation partner name
  const myId = State.currentUser?._id || State.currentUser?.id || "";
  const conv = State.conversations?.find(c => c.id === State.activeChat);
  const otherName = conv?.name || conv?.username || "Contact";
  const myName = State.currentUser?.name || State.currentUser?.username || "You";

  contentEl.innerHTML = "";

  for (const item of items) {
    // Parse domain from URL
    let domain = item.url;
    try { domain = new URL(item.url).hostname.replace(/^www\./, ""); } catch (e) { /* */ }

    // Format date/time
    const d = item.createdAt ? new Date(item.createdAt) : null;
    const timeStr = d ? d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true }) : "";
    const dateStr = d ? formatLinkDate(d) : "";

    // Determine sender
    const isMe = !item.from || String(item.from) === String(myId);
    const senderName = isMe ? myName : otherName;
    const directionLabel = isMe ? `You ▸ ${otherName}` : `${otherName} ▸ You`;

    const wrapper = document.createElement("div");
    wrapper.className = "gallery-link-card" + (isMe ? " gallery-link-card--me" : "");
    wrapper.innerHTML = `
      <div class="gallery-link-meta">
        <span class="gallery-link-sender">${directionLabel}</span>
        <span class="gallery-link-date">${dateStr}</span>
      </div>
      <div class="gallery-link-bubble" style="${isMe ? "background:var(--sent-bubble,#005c4b);" : "background:var(--received-bubble,#1f2c33);"}">
        <div class="gallery-link-preview">
          <div class="gallery-link-preview-icon">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.5)" stroke-width="2">
              <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/>
              <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>
            </svg>
          </div>
          <div class="gallery-link-preview-text">
            <div class="gallery-link-preview-title">${domain}</div>
            <div class="gallery-link-preview-url">${item.url}</div>
            <div class="gallery-link-preview-domain">${domain}</div>
          </div>
        </div>
        <a class="gallery-link-url" href="${item.url}" target="_blank" rel="noopener" onclick="event.stopPropagation()">${item.url}</a>
        <div class="gallery-link-time">${timeStr}</div>
      </div>`;

    wrapper.onclick = () => window.open(item.url, "_blank");
    contentEl.appendChild(wrapper);
  }
}

function formatLinkDate(d) {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const msgDay = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const diff = (today - msgDay) / 86400000;
  if (diff === 0) return "Today";
  if (diff === 1) return "Yesterday";
  if (diff < 7) return d.toLocaleDateString("en-US", { weekday: "long" });
  return d.toLocaleDateString("en-US", { day: "numeric", month: "short", year: "numeric" });
}

window.initContactInfoSidebar = initContactInfoSidebar;
window.openContactInfoSidebar = openContactInfoSidebar;
window.closeContactInfoSidebar = closeContactInfoSidebar;
window.openMediaGalleryPanel = openMediaGalleryPanel;
window.closeMediaGalleryPanel = closeMediaGalleryPanel;

function cancelGroupUpload(groupId) {
  if (!State.activeChat || !groupId) return;
  const convId = State.activeChat;
  const groupMsgs = (State.messages[convId] || []).filter(m => m.groupId === groupId);
  
  groupMsgs.forEach(msg => {
    const msgId = msg.tempId || msg.id;
    if (UploadControllers[msgId]) {
      UploadControllers[msgId].abort();
      delete UploadControllers[msgId];
    }
    if (typeof UploadQueue !== "undefined") {
      UploadQueue.remove(msgId);
    }
    msg.uploadStatus = "failed";
  });

  // Remove cancelled uploads from state completely
  State.messages[convId] = State.messages[convId].filter(
    m => !(m.groupId === groupId && m.uploadStatus === "failed")
  );

  renderMessages(convId);
  showToast("Upload cancelled.", "info");
}
window.cancelGroupUpload = cancelGroupUpload;

function updateGroupMessageDOM(tempId, updates, chatId) {
  console.log("[updateGroupMessageDOM] ENTER tempId:", tempId, "chatId:", chatId, "updates:", JSON.stringify(updates));
  const groupMsgs = (State.messages[chatId] || []);
  console.log("[updateGroupMessageDOM] groupMsgs length:", groupMsgs.length);
  const msg = groupMsgs.find(m => m.tempId === tempId || m.id === tempId);
  console.log("[updateGroupMessageDOM] msg found:", msg ? "YES" : "NO", "groupId:", msg?.groupId, "uploadStatus:", msg?.uploadStatus);
  if (!msg || !msg.groupId) {
    console.log("[updateGroupMessageDOM] msg not found or has no groupId, returning false");
    return false;
  }

  // Explicitly sync updates onto state to prevent timing / stale closure bugs
  if (updates.uploadStatus) msg.uploadStatus = updates.uploadStatus;
  if (updates.content) msg.content = updates.content;
  if (updates.cover) msg.cover = updates.cover;
  if (updates.thumb) msg.thumb = updates.thumb;
  if (updates.type) msg.type = updates.type;
  if (updates.status) {
    msg.status = { ...msg.status, ...updates.status };
  }

  const groupId = msg.groupId;
  let groupEl = document.querySelector(`.message-media-group[data-group-id="${groupId}"]`);
  if (!groupEl) {
    const parentMsgEl = document.querySelector(`.media-group-message[data-group-id="${groupId}"]`);
    if (parentMsgEl) {
      groupEl = parentMsgEl.querySelector(".message-media-group");
    }
  }
  console.log("[updateGroupMessageDOM] groupEl found:", groupEl ? "YES" : "NO");
  if (!groupEl) {
    console.log("[updateGroupMessageDOM] groupEl not found in DOM, returning false");
    return false;
  }

  const msgEl = groupEl.closest(".media-group-message");

  // Update media content if this specific item is rendered in the first 4 items of the collage
  const itemEl = groupEl.querySelector(`.media-group-item[data-message-id="${tempId}"]`);
  console.log("[updateGroupMessageDOM] itemEl found:", itemEl ? "YES" : "NO");
  if (itemEl && (updates.content || updates.cover)) {
    const previewSrc = updates.cover || updates.content;
    const img = itemEl.querySelector("img");
    if (img && previewSrc) {
      img.src = previewSrc;
    }
    const video = itemEl.querySelector("video");
    if (video) {
      video.src = updates.content;
      if (updates.cover) video.poster = updates.cover;
    }
  }

  // Update progress overlay
  const msgsInGroup = groupMsgs.filter(m => m.groupId === groupId);
  const totalCount = msgsInGroup.length;
  const uploadingMsgs = msgsInGroup.filter(m => m.uploadStatus === "uploading");
  const uploadedCount = totalCount - uploadingMsgs.length;

  const overlay = groupEl.querySelector(".collage-upload-overlay");
  if (overlay) {
    if (uploadingMsgs.length === 0) {
      overlay.remove();
    } else {
      const progressCircle = overlay.querySelector(".progress-ring-circle");
      if (progressCircle) {
        const radius = 26;
        const circumference = 2 * Math.PI * radius; // 163.36
        const offset = circumference * (1 - uploadedCount / totalCount);
        progressCircle.style.strokeDashoffset = offset;
      }
      const progressText = overlay.querySelector(".collage-upload-progress-text");
      if (progressText) {
        progressText.textContent = `${uploadedCount} / ${totalCount}`;
      }
    }
  }

  // Update status wrap (convert clock icon to single tick when all group uploads succeed)
  if (msgEl) {
    let statusWrap = msgEl.querySelector(".msg-status-wrap");
    if (!statusWrap) {
      const footerEl = msgEl.querySelector(".msg-footer");
      if (footerEl) {
        statusWrap = document.createElement("span");
        statusWrap.className = "msg-status-wrap";
        footerEl.appendChild(statusWrap);
      }
    }
    if (statusWrap) {
      if (uploadingMsgs.length > 0) {
        // Still uploading: show clock/watch icon
        statusWrap.innerHTML = getStatusIconHTML({ sent: false });
      } else {
        // All media items in group uploaded successfully! Show single tick (or delivered/seen tick)
        const firstGroupMsg = msgsInGroup[0] || msg;
        const targetStatus = firstGroupMsg.status || updates.status || { sent: true };
        statusWrap.innerHTML = getStatusIconHTML(targetStatus);
      }
    }
  }

  return true;
}
window.updateGroupMessageDOM = updateGroupMessageDOM;

async function loadJSZip() {
  if (window.JSZip) return window.JSZip;
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js";
    script.onload = () => resolve(window.JSZip);
    script.onerror = () => reject(new Error("Failed to load JSZip"));
    document.head.appendChild(script);
  });
}

async function downloadGroupMediaAsZip(groupMessages, groupId) {
  showToast("Downloading all media as zip...", "info");
  try {
    const JSZip = await loadJSZip();
    const zip = new JSZip();
    
    // Fetch all files concurrently
    const fetchPromises = groupMessages.map(async (m, idx) => {
      if (!m.content) return;
      try {
        const res = await fetch(m.content);
        if (!res.ok) throw new Error(`Fetch failed for ${m.content}`);
        const blob = await res.blob();
        
        let ext = m.type === "video" ? "mp4" : "jpg";
        if (m.fileName && m.fileName.includes(".")) {
          ext = m.fileName.split(".").pop();
        }
        const name = m.fileName || `media_${idx + 1}.${ext}`;
        zip.file(name, blob);
      } catch (err) {
        console.error(`Failed to fetch media file for zip:`, err);
      }
    });
    
    await Promise.all(fetchPromises);
    
    const zipBlob = await zip.generateAsync({ type: "blob" });
    const downloadUrl = URL.createObjectURL(zipBlob);
    
    const a = document.createElement("a");
    a.href = downloadUrl;
    a.download = `media_group_${groupId || "download"}.zip`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(downloadUrl);
    showToast("Zip downloaded successfully!", "success");
  } catch (err) {
    console.error("ZIP download failed:", err);
    showToast("Failed to download group media zip", "error");
  }
}
window.downloadGroupMediaAsZip = downloadGroupMediaAsZip;

function showGroupMessageOptions(groupMessages, msgEl, event) {
  if (window.innerWidth <= 768) {
    if (typeof window.selectMessageMobile === "function") {
      window.selectMessageMobile(groupMessages[0], msgEl);
      return;
    }
  }

  document.querySelectorAll(".message-options-popup").forEach(p => p.remove());
  navigator.vibrate && navigator.vibrate(20);

  const firstMsg = groupMessages[0];
  const isMe = msgEl.classList.contains("self");
  const groupId = firstMsg.groupId;

  const popup = document.createElement("div");
  popup.className = `message-options-popup ${isMe ? "self-side" : "other-side"}`;
  popup.innerHTML = `
    <div class="whatsapp-context-menu">
      <button class="context-menu-item forward-opt">
        <i class="ti ti-arrow-forward-up"></i>
        <span>Forward</span>
      </button>
      <button class="context-menu-item select-opt">
        <i class="ti ti-checkbox"></i>
        <span>Select</span>
      </button>
      <button class="context-menu-item save-opt">
        <i class="ti ti-download"></i>
        <span>Save as</span>
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

  popup.querySelector(".forward-opt").addEventListener("click", (e) => {
    e.stopPropagation();
    popup.remove();
    openForwardModal(groupMessages);
  });

  popup.querySelector(".select-opt").addEventListener("click", (e) => {
    e.stopPropagation();
    popup.remove();
    if (typeof window.toggleMessageSelection === "function") {
      groupMessages.forEach(msg => {
        window.toggleMessageSelection(msg, msgEl);
      });
    } else {
      showToast("Messages selected", "info");
    }
  });

  popup.querySelector(".save-opt").addEventListener("click", (e) => {
    e.stopPropagation();
    popup.remove();
    if (typeof downloadGroupMediaAsZip === "function") {
      downloadGroupMediaAsZip(groupMessages, groupId);
    }
  });

  popup.querySelector(".report-opt").addEventListener("click", (e) => {
    e.stopPropagation();
    showToast("Media group reported successfully", "success");
    popup.remove();
  });

  popup.querySelector(".delete-opt").addEventListener("click", (e) => {
    e.stopPropagation();
    popup.remove();

    const modal = document.createElement("div");
    modal.className = "modal-overlay delete-message-modal";
    modal.style.zIndex = "2200";
    modal.innerHTML = `
      <div class="delete-confirm-box">
        <h3>Delete media group?</h3>
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

    modal.onclick = (evt) => {
      if (evt.target === modal) modal.remove();
    };

    const performDeleteGroup = async (type) => {
      try {
        const deletePromises = groupMessages.map(async (m) => {
          const msgId = m.id || m._id || m.tempId;
          const res = await apiRequest("DELETE", `/api/message/${msgId}`, { type });
          if (res && res.status) {
            if (typeof socket !== "undefined" && socket.emit) {
              socket.emit("delete_message", { messageId: msgId, to: State.activeChat, type });
            }
            if (typeof window.animateAndDeleteMessageFromDom === "function") {
              window.animateAndDeleteMessageFromDom(msgId);
            }
          }
        });
        await Promise.all(deletePromises);
        showToast("Media group deleted", "success");
      } catch (err) {
        console.error("Delete media group error:", err);
        showToast("Error deleting media group", "error");
      }
      modal.remove();
    };

    meBtn.onclick = () => performDeleteGroup("me");
    if (everyoneBtn) {
      everyoneBtn.onclick = () => performDeleteGroup("everyone");
    }
  });

  const container = document.getElementById("messages-container");
  container.appendChild(popup);

  const popupRect = popup.getBoundingClientRect();
  const msgRect = msgEl.getBoundingClientRect();
  const contRect = container.getBoundingClientRect();
  const popW = Math.max(popupRect.width || 200, 200);
  const popH = Math.max(popupRect.height || 260, 260);

  let top = msgRect.top - contRect.top + container.scrollTop - popH - 8;
  if (top < container.scrollTop + 8) {
    top = msgRect.bottom - contRect.top + container.scrollTop + 8;
    if (top + popH > container.scrollTop + contRect.height - 8) {
      top = container.scrollTop + contRect.height - popH - 8;
      if (top < container.scrollTop + 8) {
        top = container.scrollTop + 8;
      }
    }
  }

  const clickX = (event && typeof event.clientX === "number") ? event.clientX : (msgRect.left + msgRect.width / 2);
  let left = clickX - contRect.left - (popW / 2);
  left = Math.max(12, Math.min(left, contRect.width - popW - 12));

  popup.style.position = "absolute";
  popup.style.top = `${top}px`;
  popup.style.left = `${left}px`;

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
window.showGroupMessageOptions = showGroupMessageOptions;

function showChatItemContextMenu(conv, event, clientX, clientY) {
  if (!conv) return;

  document.querySelectorAll(".chat-item-context-menu").forEach(el => el.remove());
  safeVibrate(30);

  const menu = document.createElement("div");
  menu.className = "chat-item-context-menu";

  const isArchived = !!conv.isArchived;
  const isLocked = !!conv.isLocked;
  const isMuted = !!conv.isMuted;
  const isPinned = !!conv.isPinned;
  const isUnread = (conv.unread > 0);
  const isFavourite = !!conv.isFavourite;
  const isBlocked = !!conv.isBlocked;

  menu.innerHTML = `
    <button class="context-menu-item archive-opt">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 8v13H3V8M1 3h22v5H1zM10 12h4"/></svg>
      <span>${isArchived ? "Unarchive chat" : "Archive chat"}</span>
    </button>
    <button class="context-menu-item lock-opt">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 11H5a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7a2 2 0 0 0-2-2z"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
      <span>${isLocked ? "Unlock chat" : "Lock chat"}</span>
    </button>
    <button class="context-menu-item mute-opt">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M13.73 21a2 2 0 0 1-3.46 0M18.63 13A17.89 17.89 0 0 1 18 8A6 6 0 0 0 6 8c0 .7-.08 1.38-.24 2.03M2 2l20 20M10.3 4.3A6 6 0 0 1 18 8v5"/></svg>
      <span>${isMuted ? "Unmute notifications" : "Mute notifications"}</span>
    </button>
    <button class="context-menu-item pin-opt">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="17" x2="12" y2="22"/><path d="M5 17h14l-1.5-6H6.5zM9 11V4h6v7"/></svg>
      <span>${isPinned ? "Unpin chat" : "Pin chat"}</span>
    </button>
    <button class="context-menu-item unread-opt">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>
      <span>${isUnread ? "Mark as read" : "Mark as unread"}</span>
    </button>
    <button class="context-menu-item favourite-opt">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="${isFavourite ? "currentColor" : "none"}" stroke="currentColor" stroke-width="2"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
      <span>${isFavourite ? "Remove from favourites" : "Add to favourites"}</span>
    </button>
    <button class="context-menu-item addlist-opt">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>
      <span>Add to list</span>
    </button>
    <div class="context-menu-divider"></div>
    <button class="context-menu-item block-opt danger-opt">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/></svg>
      <span>${isBlocked ? "Unblock" : "Block"}</span>
    </button>
    <button class="context-menu-item clear-opt danger-opt">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><line x1="9" y1="12" x2="15" y2="12"/></svg>
      <span>Clear chat</span>
    </button>
    <button class="context-menu-item delete-opt danger-opt">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>
      <span>Delete chat</span>
    </button>
  `;

  document.body.appendChild(menu);

  const menuWidth = 230;
  const menuHeight = menu.offsetHeight || 360;
  let posX = clientX !== undefined ? clientX : (window.innerWidth / 2 - menuWidth / 2);
  let posY = clientY !== undefined ? clientY : (window.innerHeight / 2 - menuHeight / 2);

  if (posX + menuWidth > window.innerWidth - 10) {
    posX = window.innerWidth - menuWidth - 14;
  }
  if (posX < 10) posX = 10;

  if (posY + menuHeight > window.innerHeight - 10) {
    posY = window.innerHeight - menuHeight - 14;
  }
  if (posY < 10) posY = 10;

  menu.style.left = `${posX}px`;
  menu.style.top = `${posY}px`;

  menu.querySelector(".archive-opt").addEventListener("click", (e) => {
    e.stopPropagation();
    menu.remove();
    conv.isArchived = !conv.isArchived;
    showToast(conv.isArchived ? `Archived chat with ${conv.username}` : `Unarchived chat with ${conv.username}`, "info");
    initChatList();
  });

  menu.querySelector(".lock-opt").addEventListener("click", (e) => {
    e.stopPropagation();
    menu.remove();
    conv.isLocked = !conv.isLocked;
    showToast(conv.isLocked ? `Locked chat with ${conv.username}` : `Unlocked chat with ${conv.username}`, "info");
    initChatList();
  });

  menu.querySelector(".mute-opt").addEventListener("click", (e) => {
    e.stopPropagation();
    menu.remove();
    conv.isMuted = !conv.isMuted;
    showToast(conv.isMuted ? `Muted notifications for ${conv.username}` : `Unmuted notifications for ${conv.username}`, "info");
    initChatList();
  });

  menu.querySelector(".pin-opt").addEventListener("click", (e) => {
    e.stopPropagation();
    menu.remove();
    conv.isPinned = !conv.isPinned;
    showToast(conv.isPinned ? `Pinned chat with ${conv.username}` : `Unpinned chat with ${conv.username}`, "info");
    initChatList();
  });

  menu.querySelector(".unread-opt").addEventListener("click", (e) => {
    e.stopPropagation();
    menu.remove();
    conv.unread = conv.unread > 0 ? 0 : 1;
    showToast(conv.unread > 0 ? `Marked chat with ${conv.username} as unread` : `Marked chat as read`, "info");
    initChatList();
  });

  menu.querySelector(".favourite-opt").addEventListener("click", (e) => {
    e.stopPropagation();
    menu.remove();
    conv.isFavourite = !conv.isFavourite;
    showToast(conv.isFavourite ? `Added ${conv.username} to favourites` : `Removed ${conv.username} from favourites`, "info");
    initChatList();
  });

  menu.querySelector(".addlist-opt").addEventListener("click", (e) => {
    e.stopPropagation();
    menu.remove();
    showToast(`Added ${conv.username} to list`, "info");
  });

  menu.querySelector(".block-opt").addEventListener("click", async (e) => {
    e.stopPropagation();
    menu.remove();
    conv.isBlocked = !conv.isBlocked;
    showToast(conv.isBlocked ? `Blocked ${conv.username}` : `Unblocked ${conv.username}`, "warning");
    initChatList();
  });

  menu.querySelector(".clear-opt").addEventListener("click", (e) => {
    e.stopPropagation();
    menu.remove();
    showCustomConfirmModal({
      title: "Clear Chat Messages?",
      message: `Clear all messages in chat with ${conv.username}?`,
      confirmText: "Clear",
      cancelText: "Cancel",
      isDanger: true,
      onConfirm: () => {
        State.messages[conv.id] = [];
        conv.chatState = "nochat";
        conv.lastMessage = "";
        conv.timestamp = 0;
        showToast(`Cleared chat messages`, "info");
        initChatList();
        if (State.activeChat === conv.id) {
          const listEl = document.getElementById("messages-list");
          if (listEl) listEl.innerHTML = "";
        }
        if (typeof window.clearChatAPI === "function") {
          window.clearChatAPI(conv.id).catch(console.error);
        }
      }
    });
  });

  menu.querySelector(".delete-opt").addEventListener("click", async (e) => {
    e.stopPropagation();
    menu.remove();
    showCustomConfirmModal({
      title: `Delete Chat with ${conv.username}?`,
      message: "This action cannot be undone.",
      confirmText: "Delete",
      cancelText: "Cancel",
      isDanger: true,
      onConfirm: () => {
        const chatIdToDelete = conv.id;
        conv.userStatus = "inactive";
        conv.status = "inactive";
        conv.chatState = "nochat";
        State.conversations = State.conversations.filter(c => c.id !== chatIdToDelete);
        delete State.messages[chatIdToDelete];
        const itemEl = document.querySelector(`.chat-item[data-conv-id="${chatIdToDelete}"]`);
        if (itemEl) itemEl.remove();
        if (State.activeChat === chatIdToDelete) {
          State.activeChat = null;
          document.getElementById("active-chat").style.display = "none";
          document.getElementById("chat-empty-state").style.display = "flex";
        }
        showToast(`Deleted chat with ${conv.username}`, "info");
        if (typeof deleteChat === "function") {
          deleteChat(chatIdToDelete).catch(console.error);
        }
      }
    });
  });

  const dismissHandler = (e) => {
    if (!menu.contains(e.target)) {
      menu.remove();
      document.removeEventListener("click", dismissHandler);
      document.removeEventListener("contextmenu", dismissHandler);
      document.removeEventListener("touchstart", dismissHandler);
    }
  };

  setTimeout(() => {
    document.addEventListener("click", dismissHandler);
    document.addEventListener("contextmenu", dismissHandler);
    document.addEventListener("touchstart", dismissHandler);
  }, 50);
}
window.showChatItemContextMenu = showChatItemContextMenu;

function showCustomConfirmModal({
  title = "Are you sure?",
  message = "",
  confirmText = "Confirm",
  cancelText = "Cancel",
  isDanger = false,
  onConfirm
}) {
  const existing = document.querySelector(".custom-confirm-modal-overlay");
  if (existing) existing.remove();

  const modal = document.createElement("div");
  modal.className = "modal-overlay custom-confirm-modal-overlay";
  modal.style.zIndex = "22000";
  modal.style.display = "flex";
  modal.style.alignItems = "center";
  modal.style.justifyContent = "center";
  modal.style.position = "fixed";
  modal.style.top = "0";
  modal.style.left = "0";
  modal.style.width = "100vw";
  modal.style.height = "100vh";
  modal.style.background = "rgba(0, 0, 0, 0.65)";
  modal.style.backdropFilter = "blur(8px)";
  modal.style.webkitBackdropFilter = "blur(8px)";

  const cleanTitle = title ? title.replace(/</g, "&lt;").replace(/>/g, "&gt;") : "";
  const cleanMsg = message ? message.replace(/</g, "&lt;").replace(/>/g, "&gt;") : "";

  modal.innerHTML = `
    <div class="delete-confirm-box" style="background:#1c1c1e; border:1px solid rgba(255,255,255,0.14); border-radius:20px; padding:24px; width:340px; max-width:90%; box-shadow:0 20px 50px rgba(0,0,0,0.7); animation: popupIn 0.2s cubic-bezier(0.34, 1.56, 0.64, 1);">
      <h3 style="font-size:18px; font-weight:600; color:#ffffff; margin:0 0 8px 0;">${cleanTitle}</h3>
      ${cleanMsg ? `<p style="font-size:14px; color:#a0a0a5; margin:0 0 20px 0; line-height:1.4;">${cleanMsg}</p>` : ''}
      <div style="display:flex; align-items:center; justify-content:flex-end; gap:10px;">
        <button type="button" class="confirm-cancel-btn" style="background:transparent; border:1px solid rgba(255,255,255,0.15); color:#e3e3e3; border-radius:24px; padding:8px 18px; font-size:14px; font-weight:500; cursor:pointer; transition:background 0.15s ease;">${cancelText}</button>
        <button type="button" class="confirm-ok-btn" style="background:${isDanger ? "#ff4d4d" : "#25d366"}; border:none; color:${isDanger ? "#ffffff" : "#000000"}; border-radius:24px; padding:8px 20px; font-size:14px; font-weight:600; cursor:pointer; transition:opacity 0.15s ease;">${confirmText}</button>
      </div>
    </div>
  `;

  document.body.appendChild(modal);

  const cancelBtn = modal.querySelector(".confirm-cancel-btn");
  const okBtn = modal.querySelector(".confirm-ok-btn");

  cancelBtn.onclick = () => modal.remove();
  modal.onclick = (e) => { if (e.target === modal) modal.remove(); };

  okBtn.onclick = () => {
    modal.remove();
    if (typeof onConfirm === "function") onConfirm();
  };
}
window.showCustomConfirmModal = showCustomConfirmModal;

