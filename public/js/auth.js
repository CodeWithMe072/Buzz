/**
 * auth.js — Login, signup, logout, bootstrap, and connection handlers.
 */

// =============================================================================
// GLOBAL USER AVATAR & NAME SYNC
// =============================================================================
function updateGlobalUserAvatarUI() {
  const user = State.currentUser || {};
  const firstLetter = (user.username || "U").charAt(0).toUpperCase();

  // 1. Sidebar profile avatar
  const currentUserAvatar = document.getElementById("current-user-avatar");
  if (currentUserAvatar) {
    if (user.avatar) {
      currentUserAvatar.innerHTML = `<img src="${user.avatar}" onerror="this.style.display='none'; this.nextElementSibling.style.display='inline';" style="width: 100%; height: 100%; object-fit: cover; border-radius: 50%;" /><span style="display: none;">${firstLetter}</span>`;
    } else {
      currentUserAvatar.innerHTML = `<span>${firstLetter}</span>`;
    }
  }

  // 2. Navigation bar avatar button
  const navAvatarBtn = document.getElementById("nav-avatar-btn");
  if (navAvatarBtn) {
    if (user.avatar) {
      navAvatarBtn.innerHTML = `<img src="${user.avatar}" onerror="this.style.display='none'; this.nextElementSibling.style.display='inline';" style="width: 100%; height: 100%; object-fit: cover; border-radius: 50%;" /><span id="nav-avatar-text" style="display: none;">${firstLetter}</span>`;
    } else {
      navAvatarBtn.innerHTML = `<span id="nav-avatar-text">${firstLetter}</span>`;
    }
  }

  // 3. Profile modal sidebar avatar
  const avatarWrap = document.querySelector(".profile-modal-avatar-wrap");
  if (avatarWrap) {
    if (user.avatar) {
      avatarWrap.innerHTML = `<div class="profile-modal-avatar-ring"></div><img src="${user.avatar}" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';" style="width: 100%; height: 100%; object-fit: cover; border-radius: 50%;" /><div class="profile-modal-avatar-letter" id="profile-modal-avatar-letter" style="display: none; width: 100%; height: 100%; align-items: center; justify-content: center; font-size: 24px; font-weight: 700; color: white;">${firstLetter}</div>`;
    } else {
      avatarWrap.innerHTML = `<div class="profile-modal-avatar-ring"></div><div class="profile-modal-avatar-letter" id="profile-modal-avatar-letter" style="width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; font-size: 24px; font-weight: 700; color: white;">${firstLetter}</div>`;
    }
  }

  // 4. Current username on sidebar
  const currentUsername = document.getElementById("current-username");
  if (currentUsername) {
    currentUsername.textContent = user.username || "User";
  }

  // 5. Profile modal name and email
  const nameEl = document.getElementById("profile-modal-username");
  const emailEl = document.getElementById("profile-modal-email");
  if (nameEl) nameEl.textContent = user.username || "User";
  if (emailEl) emailEl.textContent = user.email || "";
}
window.updateGlobalUserAvatarUI = updateGlobalUserAvatarUI;

// =============================================================================
// BOOTSTRAP — runs after successful login
// =============================================================================
async function bootstrapAfterLogin() {
  // Ensure chat layout is loaded and mounted before doing anything
  const chatScreen = document.getElementById("chat-screen");
  if (!chatScreen) {
    if (window.showLoader) window.showLoader();
    try {
      const html = await ComponentLoader.load("chat");
      const rootEl = document.getElementById("app-root");
      if (rootEl) {
        rootEl.innerHTML = html;
      }
      const { init } = await import("/js/screens/chat.js");
      await init();
    } catch (err) {
      console.error("Failed to load chat component during bootstrap:", err);
    } finally {
      if (window.hideLoader) window.hideLoader();
    }
  }

  // Load connections (accepted contacts only for chat list)
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
      lastMessage: "Loading...",
      unread: 0,
      online: (State.onlineUsers && State.onlineUsers.includes(c.user.id)) || false,
      messagesLoaded: false,
      draft: c.draft || null,
    }));
  }

  // Open the chat screen instantly so the user sees it without waiting for messages or logs!
  initChatList();
  if (typeof showChatScreen === "function") {
    showChatScreen();
  }

  // Hide loader immediately so screen is visible
  if (window.hideLoader) {
    window.hideLoader();
  }

  // Handle SPA routing after chat initialization
  if (window.Router && window.Router.isUnlocked()) {
    const currentPath = window.location.pathname;
    const targetPath = window.Router.consumePendingRoute() || (currentPath.startsWith("/inbox") ? currentPath : "/inbox");
    window.Router.handleRouteChange(targetPath);
  }

  // Start background loading of non-critical modules (emoji, media, calls)
  if (typeof window.startBackgroundLoading === "function") {
    window.startBackgroundLoading();
  }

  // Start the time ticker interval
  if (typeof startTimeTicker === "function") {
    startTimeTicker();
  }

  // 1. Load pending requests badge in background
  refreshPendingRequests().catch(console.error);

  // 2. Sync full profile details in background
  getMyProfile().then(profileRes => {
    if (profileRes && profileRes.code === 200 && profileRes.Data?.user) {
      const user = profileRes.Data.user;
      if (user._id && !user.id) {
        user.id = user._id.toString();
      }
      State.currentUser = {
        ...State.currentUser,
        ...user
      };
      State.sharedLogsUsers = profileRes.Data.sharedLogsUsers || [];
      localStorage.setItem("SSC_USER", JSON.stringify(State.currentUser));

      if (window.DataUsageTracker && user.dataUsage) {
        window.DataUsageTracker.syncFromServer(user.dataUsage);
      }

      // Update UI with fresh user details
      updateGlobalUserAvatarUI();

      // Trigger security log photo capture if Live Photo is enabled (even if password lock is disabled)
      if (typeof captureSilentPhoto === "function" && user.livePhotoEnabled) {
        captureSilentPhoto().catch(console.error);
      }
    }
  }).catch(console.error);

  // 3. Load messages for each connection concurrently in the background
  State.apiMessagesLoaded = false;
  const messagePromises = State.conversations.map(async (conv) => {
    try {
      const msgRes = await getMessages(conv.id, 50);
      if (msgRes.code === 200 && msgRes.Data?.messages?.length) {
        const msgs = msgRes.Data.messages;
        State.messages[conv.id] = msgs.map(m => ({
          id: m._id?.toString() || m.tempId,
          tempId: m.tempId,
          type: m.type,
          content: m.content,
          cover: m.cover || null,
          thumb: m.thumb || null,
          fileName: m.fileName || null,
          fileSize: m.fileSize || null,
          caption: m.caption || null,
          replyTo: m.replyTo || null,
          groupId: m.groupId || null,
          sender: m.from?.toString() === (State.currentUser.id || State.currentUser._id)?.toString() ? "me" : "other",
          user: m.from?.toString(),
          timestamp: m.createdAt || m.clientTime,
          reactions: m.reactions || {},
          status: m.status || { sent: true, delivered: false, seen: false },
          callType: m.callType,
          callStatus: m.callStatus,
          callRoomId: m.callRoomId,
          callExpiresAt: m.callExpiresAt,
          callDuration: m.callDuration,
          isDisappearing: m.isDisappearing || false,
          cameraFacing: m.cameraFacing || null,
          cameraFilter: m.cameraFilter || null
        })).sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

        for (const msg of State.messages[conv.id]) {
          if (msg.id) State.messageIndex[msg.id] = conv.id;
        }

        const unreadCount = State.messages[conv.id].filter(
          m => m.sender === "other" && (!m.status || !m.status.seen)
        ).length;
        conv.unread = unreadCount;

        const last = msgs[msgs.length - 1];
        conv.lastMessage = formatLastMessage(last);
        conv.timestamp = last.createdAt || last.clientTime || Date.now();
      } else {
        conv.lastMessage = "";
        conv.timestamp = 0;
      }
    } catch (err) {
      console.error(`Failed to fetch messages for connection ${conv.id}:`, err);
      conv.lastMessage = "";
      conv.timestamp = 0;
    } finally {
      conv.messagesLoaded = true;
      // Re-render the chat list sidebar to show the updated last message for this user
      renderChatList(document.getElementById("chat-search")?.value?.trim()?.toLowerCase() || "");
      // If the user currently has this chat open, re-render its messages pane to dismiss the loading spinner
      if (State.activeChat === conv.id) {
        renderMessages(conv.id);
      }
    }
  });

  Promise.all(messagePromises).then(async () => {
    if (window.IndexedDBQueueService) {
      await syncPendingMessagesFromDB();
      if (typeof OutboxQueue.init === "function") await OutboxQueue.init();
      if (typeof UploadQueue.init === "function") await UploadQueue.init();
    }
    State.apiMessagesLoaded = true;
    // Sort conversations by last message timestamp once all have loaded
    State.conversations.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    renderChatList(document.getElementById("chat-search")?.value?.trim()?.toLowerCase() || "");

    // If socket is already connected, emit delivery sync and flush queues now that messages are loaded
    if (typeof socket !== "undefined" && socket && socket.connected) {
      socket.emit("sync:delivered");
      if (typeof flushOutbox === "function") flushOutbox();
      if (typeof flushUploadQueue === "function") flushUploadQueue();
    }
  }).catch(console.error);

  // 4. Connect socket with JWT in background
  if (socket && socket.connected) {
    socket.removeAllListeners();
    socket.disconnect();
  }

  const token = TokenStore.getToken();
  socket = io(BACKEND_URL, {
    auth: { token },
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 2000,
    reconnectionDelayMax: 15000,
    timeout: 30000,
    transports: ["polling", "websocket"],
    rememberUpgrade: true
  });

  initSocket();

  // CallManager is loaded asynchronously via screens/call.js.
  // Wire it now if already loaded, otherwise set a deferred callback
  // so screens/call.js can pick up the current socket when it finishes loading.
  if (typeof CallManager !== "undefined") {
    CallManager.wireSocket(socket);
  }
  // Always store the latest socket reference for deferred wiring
  window._pendingCallSocket = socket;

  NetworkMonitor.isSocketConnected = socket.connected;
  renderChatList();

  // 5. Load Custom GIFs in background
  if (typeof EmojiPanel !== "undefined" && EmojiPanel.loadCustomGifsAndTrending) {
    EmojiPanel.loadCustomGifsAndTrending(null, true);
  }
}

// =============================================================================
// PENDING REQUESTS — refresh badge & list
// =============================================================================
async function refreshPendingRequests() {
  try {
    const res = await getPendingRequests();
    if (res && res.code === 200) {
      State.pendingRequests = res.Data?.requests || [];
    }
  } catch (err) {
    console.error("refreshPendingRequests failed:", err);
  }
  updateRequestsBadge();
}

function updateRequestsBadge() {
  const badge = document.getElementById("requests-badge");
  const modalBadge = document.getElementById("modal-pending-badge");
  const count = State.pendingRequests.length;
  if (badge) {
    badge.textContent = count;
    badge.style.display = count > 0 ? "flex" : "none";
  }
  if (modalBadge) {
    modalBadge.textContent = count;
    modalBadge.style.display = count > 0 ? "inline-flex" : "none";
  }
}

// =============================================================================
// PEOPLE PANEL — search + send request + pending list
// =============================================================================
let searchTimeout = null;

function initPeoplePanel() {
  // Current user profile opens the Account & People Hub modal
  const userProfileHeader = document.querySelector(".user-profile");
  if (userProfileHeader) {
    userProfileHeader.style.cursor = "pointer";
    userProfileHeader.onclick = () => {
      const username = (window.State && window.State.currentUser) ? window.State.currentUser.username : "me";
      if (window.Router) {
        window.Router.navigate("/@" + username);
      } else {
        openProfileModal(null);
      }
    };
  }

  // Add People button opens the Account & People Hub modal
  const addPeopleBtn = document.getElementById("add-people-btn");
  if (addPeopleBtn) {
    addPeopleBtn.onclick = () => {
      openProfileModal("search");
    };
  }

  // Initialize the profile modal events
  initProfileModal();
}

async function runSearch(q) {
  const resultsEl = document.getElementById("people-search-results");
  resultsEl.innerHTML = `<div class="people-loading">Searching...</div>`;

  const res = await searchUsers(q);
  if (res.code !== 200 || !res.Data?.users?.length) {
    resultsEl.innerHTML = `<div class="people-empty">No users found</div>`;
    return;
  }

  resultsEl.innerHTML = "";
  res.Data.users.forEach(user => {
    const item = document.createElement("div");
    item.className = "people-item premium-card";
    item.innerHTML = `
      <div class="people-avatar">${user.username.charAt(0).toUpperCase()}</div>
      <div class="people-info">
        <span class="people-name">${sanitizeInput(user.username)}</span>
      </div>
      <button class="people-action-btn add-btn" data-id="${user._id}">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
          <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
        </svg>
        Add
      </button>`;
    item.querySelector(".add-btn").addEventListener("click", async (e) => {
      const btn = e.currentTarget;
      btn.disabled = true;
      btn.textContent = "Sending...";
      const r = await sendConnectionRequest(user._id);
      if (r.code === 201) {
        btn.textContent = "✓ Sent";
        btn.classList.add("sent");
        showToast(`Request sent to ${user.username}`, "success");
        // Notify receiver via socket in real-time
        socket?.emit("connection:request", { to: user._id });
      } else {
        btn.disabled = false;
        btn.textContent = "Add";
        showToast(r.Data?.message || "Failed to send request", "error");
      }
    });
    resultsEl.appendChild(item);
  });
}

function formatRelativeTime(date) {
  const diffMs = Date.now() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}d ago`;
}

function openLogLightbox(url, timestamp, logId, logOwnerUsername = null) {
  if (document.querySelector(".log-lightbox-overlay")) return;
  const lightbox = document.createElement("div");
  lightbox.className = "log-lightbox-overlay";
  lightbox.innerHTML = `
    <div class="lightbox-close">&times;</div>
    <div class="lightbox-content">
      <img src="${url}" alt="Security Log Image" class="lightbox-img">
      <div class="lightbox-meta">Captured on ${new Date(timestamp).toLocaleString()}</div>
    </div>
  `;

  const username = logOwnerUsername || ((window.State && window.State.currentUser) ? window.State.currentUser.username : "me");

  window.__logLightboxActive = true;
  window.history.pushState({ lightboxOpen: true }, "", `/@${username}/log/${logId}`);

  const closeLightbox = (fromPopstate = false) => {
    lightbox.classList.remove("active");
    setTimeout(() => lightbox.remove(), 300);
    window.__logLightboxActive = false;
    window.closeLogLightbox = null;
    if (!fromPopstate && window.history.state && window.history.state.lightboxOpen) {
      window.__ignoreNextPopstate = true;
      window.history.back();
    }
  };

  window.closeLogLightbox = closeLightbox;

  lightbox.querySelector(".lightbox-close").onclick = () => closeLightbox(false);
  lightbox.onclick = (e) => {
    if (e.target === lightbox) {
      closeLightbox(false);
    }
  };
  document.body.appendChild(lightbox);
  setTimeout(() => lightbox.classList.add("active"), 10);
}

async function renderPeopleTab(tab) {
  const container = document.getElementById("people-tab-content");
  if (!container) return;
  container.innerHTML = "";

  if (tab === "search") {
    container.innerHTML = `
      <div class="modal-search-box">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
        <input type="text" id="people-search-input" placeholder="Search people by username...">
      </div>
      <div id="people-search-results" class="modal-list-grid"></div>
    `;

    const searchInput = container.querySelector("#people-search-input");
    const resultsEl = container.querySelector("#people-search-results");
    const searchBox = container.querySelector(".modal-search-box");
    if (searchBox && searchInput) {
      searchBox.addEventListener("click", () => {
        searchInput.focus();
      });
    }

    searchInput.addEventListener("input", () => {
      clearTimeout(searchTimeout);
      const q = searchInput.value.trim();
      if (q.length < 2) {
        resultsEl.innerHTML = "";
        return;
      }
      searchTimeout = setTimeout(() => runSearch(q), 400);
    });

    resultsEl.innerHTML = `
      <div class="people-empty">
        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="opacity: 0.5; margin-bottom: 8px;">
          <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
        </svg>
        <p style="margin: 0; font-size: 14px; font-weight: 500;">Discover People</p>
        <small style="color: var(--text-secondary); font-size: 12px;">Search by username above to find connections</small>
      </div>`;

  } else if (tab === "pending") {
    if (!State.pendingRequests.length) {
      container.innerHTML = `
        <div class="people-empty">
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="opacity: 0.5; margin-bottom: 8px;">
            <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/>
          </svg>
          <p style="margin: 0; font-size: 14px; font-weight: 500;">No pending requests</p>
        </div>`;
      return;
    }

    container.innerHTML = `<div class="modal-list-grid"></div>`;
    const grid = container.querySelector(".modal-list-grid");

    State.pendingRequests.forEach(req => {
      const item = document.createElement("div");
      item.className = "people-item premium-card";
      item.innerHTML = `
        <div class="people-avatar">${req.from.username.charAt(0).toUpperCase()}</div>
        <div class="people-info">
          <span class="people-name">${sanitizeInput(req.from.username)}</span>
          <span class="people-meta">wants to connect</span>
        </div>
        <div class="request-actions">
          <button class="people-action-btn accept-btn" data-id="${req.connectionId}">Accept</button>
          <button class="people-action-btn reject-btn" data-id="${req.connectionId}">✕</button>
        </div>`;

      item.querySelector(".accept-btn").addEventListener("click", async (e) => {
        const btn = e.currentTarget;
        btn.disabled = true;
        btn.textContent = "...";
        const r = await respondToRequest(req.connectionId, "accept");
        if (r.code === 200) {
          showToast(`Connected with ${req.from.username}!`, "success");
          socket?.emit("connection:accepted", { to: req.from.id });
          State.pendingRequests = State.pendingRequests.filter(r => r.connectionId !== req.connectionId);
          updateRequestsBadge();
          renderPeopleTab("pending");
          await bootstrapAfterLogin();
        } else {
          btn.disabled = false;
          btn.textContent = "Accept";
        }
      });

      item.querySelector(".reject-btn").addEventListener("click", async () => {
        const r = await respondToRequest(req.connectionId, "reject");
        if (r.code === 200) {
          State.pendingRequests = State.pendingRequests.filter(r => r.connectionId !== req.connectionId);
          updateRequestsBadge();
          renderPeopleTab("pending");
        }
      });

      grid.appendChild(item);
    });

  } else if (tab === "contacts") {
    if (!State.contacts.length) {
      container.innerHTML = `
        <div class="people-empty">
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="opacity: 0.5; margin-bottom: 8px;">
            <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>
          </svg>
          <p style="margin: 0; font-size: 14px; font-weight: 500;">No connections yet</p>
          <small style="color: var(--text-secondary); font-size: 12px;">Search for users in Discover to connect</small>
        </div>`;
      return;
    }

    container.innerHTML = `<div class="modal-list-grid"></div>`;
    const grid = container.querySelector(".modal-list-grid");

    State.contacts.forEach(c => {
      const item = document.createElement("div");
      item.className = "people-item premium-card";
      const conv = State.conversations.find(cv => cv.id === c.user.id);
      item.innerHTML = `
        <div class="people-avatar ${conv?.online ? "online" : ""}">${c.user.username.charAt(0).toUpperCase()}</div>
        <div class="people-info">
          <span class="people-name">${sanitizeInput(c.user.username)}</span>
          <span class="people-meta">${conv?.online ? "Online" : "Connected"}</span>
        </div>
        <button class="people-action-btn chat-btn" data-id="${c.user.id}">Chat</button>`;

      item.querySelector(".chat-btn").addEventListener("click", () => {
        closeProfileModal();
        openChat(c.user.id);
      });
      grid.appendChild(item);
    });

  } else if (tab === "moments") {
    const momentsBadge = document.getElementById("modal-moments-badge");
    if (momentsBadge) {
      momentsBadge.classList.remove("dot");
      momentsBadge.textContent = "";
    }
    await renderMomentsTab(container);

  } else if (tab === "account") {
    const user = State.currentUser || {};

    // ── Helper: build a single toggle row ──────────────────────────────────
    const toggleRow = (opts) => {
      const tierClass = opts.tier === "security" ? "tier-security" : "";
      const iconClass = opts.tier === "security" ? "icon-security" : "icon-preference";
      return `
        <div class="settings-toggle-row ${tierClass}">
          <div class="settings-toggle-icon ${iconClass}">
            <i class="ti ${opts.icon}"></i>
          </div>
          <div class="settings-toggle-text">
            <div class="settings-toggle-title">${opts.title}</div>
            <div class="settings-toggle-desc">${opts.desc}</div>
          </div>
          <label class="switch">
            <input type="checkbox" id="${opts.id}" ${opts.checked ? "checked" : ""}>
            <span class="slider"></span>
          </label>
        </div>`;
    };

    // ── Accordion open state from localStorage ─────────────────────────────
    const historyOpen  = localStorage.getItem("buzz_acc_history_open")  === "1";
    const featuresOpen = localStorage.getItem("buzz_acc_features_open") === "1";

    // ── Avatar HTML helper ─────────────────────────────────────────────────
    const avatarInner = user.avatar
      ? `<img id="settings-avatar-img" src="${user.avatar}" style="width:100%;height:100%;object-fit:cover;" />`
      : `<div class="profile-modal-avatar-letter" id="settings-avatar-letter" style="font-size:24px;font-weight:700;color:white;">${(user.username || "U").charAt(0).toUpperCase()}</div>`;

    container.innerHTML = `
      <div class="profile-section-title-wrap" style="margin-bottom:20px;">
        <h2 class="profile-section-title">Account Settings</h2>
      </div>

      <div class="acc-sections-wrap">

        <!-- ══ SECTION 1: PROFILE ══════════════════════════════════════════ -->
        <span class="acc-section-label">Profile</span>

        <div class="profile-content-card">

          <!-- Avatar row -->
          <div class="profile-avatar-upload-section" style="display:flex;align-items:center;gap:16px;margin-bottom:20px;">
            <div class="profile-modal-avatar-wrap" id="settings-avatar-wrap"
                 style="position:relative;width:64px;height:64px;border-radius:50%;display:flex;align-items:center;justify-content:center;background:var(--elevated-bg);cursor:pointer;border:2px solid var(--border-color);overflow:hidden;">
              ${avatarInner}
              <div class="avatar-upload-overlay"
                   style="position:absolute;inset:0;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;opacity:0;transition:opacity 0.2s;"
                   onmouseover="this.style.opacity=1" onmouseout="this.style.opacity=0">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2">
                  <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
                  <circle cx="12" cy="13" r="4"/>
                </svg>
              </div>
            </div>
            <input type="file" id="profile-avatar-file-input" accept="image/*" style="display:none;" />
            <div style="display:flex;flex-direction:column;gap:8px;">
              <button type="button" id="profile-upload-avatar-btn"
                      style="padding:6px 14px;font-size:12px;border-radius:6px;cursor:pointer;background:var(--elevated-bg);border:1px solid var(--border-color);color:white;font-weight:500;">
                Upload Picture
              </button>
              <button type="button" id="profile-remove-avatar-btn"
                      style="padding:6px 14px;font-size:12px;border-radius:6px;background:#ef4444;border:none;color:white;cursor:pointer;font-weight:500;display:${user.avatar ? "block" : "none"};">
                Remove
              </button>
            </div>
          </div>

          <!-- Username — auto-save on blur -->
          <div class="profile-username-field-wrap">
            <label for="profile-modal-info-username">Username</label>
            <div class="profile-username-input-row">
              <input type="text" id="profile-modal-info-username"
                     value="${sanitizeInput(user.username || "")}"
                     autocomplete="off" spellcheck="false" />
              <span id="username-saved-indicator">
                <i class="ti ti-check"></i> Saved
              </span>
            </div>
          </div>

          <!-- Email — read-only with Verified badge -->
          <div class="profile-email-readonly-wrap">
            <label>Email Address</label>
            <div class="profile-email-readonly-display">
              <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${sanitizeInput(user.email || "")}</span>
              <span class="email-verified-badge">✓ Verified</span>
            </div>
          </div>

        </div><!-- /profile card -->


        <!-- ══ SECTION 2: SECURITY & PRIVACY ══════════════════════════════ -->
        <span class="acc-section-label">Security &amp; Privacy</span>

        <div class="profile-content-card" style="padding:0;overflow:hidden;">
          ${toggleRow({
            id:      "profile-modal-password-lock-toggle",
            icon:    "ti-lock",
            title:   "Chat Password Lock",
            desc:    "Require your password each time you open Buzz.",
            checked: user.passwordLockEnabled !== false,
            tier:    "security"
          })}
          ${toggleRow({
            id:      "profile-modal-login-photo-toggle",
            icon:    "ti-shield-check",
            title:   "Login Photo Capture",
            desc:    "If someone enters the wrong password, we'll take one photo using this device's camera and show it to you in Security Logs.",
            checked: !!user.livePhotoEnabled,
            tier:    "security"
          })}
          ${toggleRow({
            id:      "profile-modal-SSC-dashbard-toggle",
            icon:    "ti-chart-bar",
            title:   "Show SSC Dashboard",
            desc:    "Display the SSC panel on the site's loading screen.",
            checked: !!user.showDashboard,
            tier:    "preference"
          })}
        </div><!-- /security card -->


        <!-- ══ SECTION 3: DATA & USAGE ════════════════════════════════════ -->
        <span class="acc-section-label">
          Data &amp; Usage
          <span class="acc-live-badge">
            <span class="acc-live-dot"></span>LIVE
          </span>
        </span>

        <div class="profile-content-card dev-diagnostics-card">

          <!-- Today overview (always visible) -->
          <div class="acc-today-header">
            <span class="acc-today-title"><i class="ti ti-activity" style="font-size:13px;margin-right:5px;color:#a855f7;"></i>Today's Session</span>
          </div>
          <p class="acc-today-caption">Resets daily · saved across reloads · <span id="acc-last-updated">updated just now</span></p>

          <div class="dev-stats-grid">
            <div class="dev-stat-item">
              <div class="dev-stat-icon" style="background:rgba(59,130,246,0.15);color:#3b82f6;"><i class="ti ti-download"></i></div>
              <div class="dev-stat-info">
                <span class="dev-stat-value" id="dev-data-transferred">0 B</span>
                <span class="dev-stat-label">Downloaded (Wire)</span>
              </div>
            </div>
            <div class="dev-stat-item">
              <div class="dev-stat-icon" style="background:rgba(249,115,22,0.15);color:#f97316;"><i class="ti ti-upload"></i></div>
              <div class="dev-stat-info">
                <span class="dev-stat-value" id="dev-data-uploaded">0 B</span>
                <span class="dev-stat-label">Uploaded (Sent)</span>
              </div>
            </div>
            <div class="dev-stat-item">
              <div class="dev-stat-icon" style="background:rgba(34,197,94,0.15);color:#22c55e;"><i class="ti ti-database"></i></div>
              <div class="dev-stat-info">
                <span class="dev-stat-value" id="dev-data-cached">0 B</span>
                <span class="dev-stat-label">Cached (Local)</span>
              </div>
            </div>
            <div class="dev-stat-item dev-stat-total">
              <div class="dev-stat-icon" style="background:rgba(168,85,247,0.15);color:#a855f7;"><i class="ti ti-world"></i></div>
              <div class="dev-stat-info">
                <span class="dev-stat-value" id="dev-data-total">0 B</span>
                <span class="dev-stat-label">Total Network</span>
              </div>
            </div>
          </div>
          <div class="dev-stat-meta" style="margin-top:12px;display:flex;gap:16px;font-size:11px;color:var(--text-secondary);opacity:0.55;">
            <span><i class="ti ti-file" style="font-size:11px;"></i> Resources: <strong id="dev-data-resources">0</strong></span>
            <span><i class="ti ti-cache" style="font-size:11px;"></i> Cache hits: <strong id="dev-data-cached-count">0</strong></span>
          </div>

          <!-- Daily History accordion -->
          <div class="acc-card-divider" style="margin-top:16px;"></div>
          <div class="acc-accordion ${historyOpen ? "open" : ""}" id="acc-history-accordion">
            <div class="acc-accordion-header" id="acc-history-header">
              <span class="acc-accordion-title">
                <i class="ti ti-calendar-stats" style="color:#3b82f6;"></i>
                Daily History <span style="opacity:0.45;font-weight:400;margin-left:4px;">(Last 7 Days)</span>
              </span>
              <i class="ti ti-chevron-down acc-accordion-chevron"></i>
            </div>
            <div class="acc-accordion-body">
              <div class="acc-accordion-body-inner" style="padding-top:4px;">
                <div style="overflow-x:auto;">
                  <table class="dev-history-table">
                    <thead>
                      <tr><th>Day</th><th>Downloaded</th><th>Uploaded</th><th>Total</th></tr>
                    </thead>
                    <tbody id="dev-data-history-body">
                      <tr><td colspan="4" style="text-align:center;opacity:0.5;padding:8px;">Loading…</td></tr>
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>

          <!-- Feature Breakdown accordion -->
          <div class="acc-card-divider"></div>
          <div class="acc-accordion ${featuresOpen ? "open" : ""}" id="acc-features-accordion">
            <div class="acc-accordion-header" id="acc-features-header">
              <span class="acc-accordion-title">
                <i class="ti ti-flame" style="color:#ef4444;"></i>
                Feature Breakdown
              </span>
              <i class="ti ti-chevron-down acc-accordion-chevron"></i>
            </div>
            <div class="acc-accordion-body">
              <div class="acc-accordion-body-inner" style="padding-top:4px;">
                <p style="font-size:11px;color:var(--text-secondary);margin:0 0 10px 0;opacity:0.6;">Feature-level breakdown of today's data usage</p>
                <div id="dev-feature-consumers"></div>
              </div>
            </div>
          </div>

        </div><!-- /data card -->

      </div><!-- /acc-sections-wrap -->
    `;

    // Immediately refresh Data Usage UI
    if (window.DataUsageTracker) {
      window.DataUsageTracker.updateUI();
    }

    // ── Accordion wiring ───────────────────────────────────────────────────
    const wireAccordion = (accordionId, storageKey) => {
      const accordion = container.querySelector(`#${accordionId}`);
      const header    = container.querySelector(`#${accordionId.replace("accordion", "header")}`);
      if (!accordion || !header) return;
      header.addEventListener("click", () => {
        const isOpen = accordion.classList.toggle("open");
        localStorage.setItem(storageKey, isOpen ? "1" : "0");
      });
    };
    wireAccordion("acc-history-accordion",  "buzz_acc_history_open");
    wireAccordion("acc-features-accordion", "buzz_acc_features_open");

    // ── Toggle: Login Photo Capture (formerly Live Photo) ──────────────────
    container.querySelector("#profile-modal-login-photo-toggle").addEventListener("change", async (e) => {
      const enabled = e.target.checked;
      const res = await updateProfile({ livePhotoEnabled: enabled });
      if (res.code === 200 && res.Data?.status) {
        State.currentUser.livePhotoEnabled = enabled;
        localStorage.setItem("SSC_USER", JSON.stringify(State.currentUser));
        showToast(`Login photo capture ${enabled ? "enabled" : "disabled"}`, "success");
      } else {
        e.target.checked = !enabled;
        showToast("Failed to update setting", "error");
      }
    });

    // ── Toggle: SSC Dashboard ──────────────────────────────────────────────
    container.querySelector("#profile-modal-SSC-dashbard-toggle").addEventListener("change", async (e) => {
      const enabled = e.target.checked;
      const res = await updateProfile({ showDashboard: enabled });
      if (res.code === 200 && res.Data?.status) {
        State.currentUser.showDashboard = enabled;
        localStorage.setItem("SSC_USER", JSON.stringify(State.currentUser));
        showToast(`SSC Dashboard ${enabled ? "enabled" : "disabled"}`, "success");
      } else {
        e.target.checked = !enabled;
        showToast("Failed to update setting", "error");
      }
    });

    // ── Toggle: Password Lock ──────────────────────────────────────────────
    container.querySelector("#profile-modal-password-lock-toggle").addEventListener("change", async (e) => {
      const enabled = e.target.checked;
      const res = await updateProfile({ passwordLockEnabled: enabled });
      if (res.code === 200 && res.Data?.status) {
        State.currentUser.passwordLockEnabled = enabled;
        localStorage.setItem("SSC_USER", JSON.stringify(State.currentUser));
        showToast(`Password lock ${enabled ? "enabled" : "disabled"}`, "success");
      } else {
        e.target.checked = !enabled;
        showToast("Failed to update setting", "error");
      }
    });

    // ── Avatar upload & remove ─────────────────────────────────────────────
    const avatarInput         = container.querySelector("#profile-avatar-file-input");
    const uploadBtn           = container.querySelector("#profile-upload-avatar-btn");
    const settingsAvatarWrap  = container.querySelector("#settings-avatar-wrap");
    const removeBtn           = container.querySelector("#profile-remove-avatar-btn");

    const triggerUpload = () => avatarInput && avatarInput.click();
    if (uploadBtn)          uploadBtn.onclick         = triggerUpload;
    if (settingsAvatarWrap) settingsAvatarWrap.onclick = triggerUpload;

    if (avatarInput) {
      avatarInput.onchange = async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const formData = new FormData();
        formData.append("file", file);
        if (window.showLoader) window.showLoader();
        try {
          const uploadRes  = await fetch("/api/upload", {
            method: "POST",
            headers: { "Authorization": `Bearer ${TokenStore.getToken()}` },
            body: formData
          });
          const uploadData = await uploadRes.json();
          if (uploadData.original) {
            const newUrl    = uploadData.original;
            const updateRes = await updateProfile({ avatar: newUrl });
            if (updateRes.code === 200 && updateRes.Data?.status) {
              State.currentUser.avatar = newUrl;
              localStorage.setItem("SSC_USER", JSON.stringify(State.currentUser));
              const imgEl = container.querySelector("#settings-avatar-img");
              if (imgEl) {
                imgEl.src = newUrl;
              } else {
                const wrap = container.querySelector("#settings-avatar-wrap");
                if (wrap) {
                  wrap.innerHTML = `<img id="settings-avatar-img" src="${newUrl}" style="width:100%;height:100%;object-fit:cover;" />
                    <div class="avatar-upload-overlay" style="position:absolute;inset:0;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;opacity:0;transition:opacity 0.2s;" onmouseover="this.style.opacity=1" onmouseout="this.style.opacity=0">
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2">
                        <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
                        <circle cx="12" cy="13" r="4"/>
                      </svg>
                    </div>`;
                }
              }
              if (removeBtn) removeBtn.style.display = "block";
              updateGlobalUserAvatarUI();
              showToast("Profile picture updated!", "success");
            } else {
              showToast("Failed to update profile picture", "error");
            }
          } else {
            showToast("Failed to upload profile picture", "error");
          }
        } catch (err) {
          console.error("[Avatar Upload Error]", err);
          showToast("An error occurred during upload", "error");
        } finally {
          if (window.hideLoader) window.hideLoader();
        }
      };
    }

    if (removeBtn) {
      removeBtn.onclick = async () => {
        if (window.showLoader) window.showLoader();
        try {
          const updateRes = await updateProfile({ avatar: null });
          if (updateRes.code === 200 && updateRes.Data?.status) {
            State.currentUser.avatar = null;
            localStorage.setItem("SSC_USER", JSON.stringify(State.currentUser));
            const wrap = container.querySelector("#settings-avatar-wrap");
            if (wrap) {
              const letter = (State.currentUser.username || "U").charAt(0).toUpperCase();
              wrap.innerHTML = `<div class="profile-modal-avatar-letter" id="settings-avatar-letter" style="font-size:24px;font-weight:700;color:white;">${letter}</div>
                <div class="avatar-upload-overlay" style="position:absolute;inset:0;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;opacity:0;transition:opacity 0.2s;" onmouseover="this.style.opacity=1" onmouseout="this.style.opacity=0">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2">
                    <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
                    <circle cx="12" cy="13" r="4"/>
                  </svg>
                </div>`;
            }
            removeBtn.style.display = "none";
            updateGlobalUserAvatarUI();
            showToast("Profile picture removed!", "success");
          } else {
            showToast("Failed to remove profile picture", "error");
          }
        } catch (err) {
          console.error("[Avatar Remove Error]", err);
          showToast("An error occurred", "error");
        } finally {
          if (window.hideLoader) window.hideLoader();
        }
      };
    }

    // ── Username — auto-save on blur ───────────────────────────────────────
    const usernameInput    = container.querySelector("#profile-modal-info-username");
    const savedIndicator   = container.querySelector("#username-saved-indicator");
    let   savedIndicatorTm = null;

    const showSavedIndicator = () => {
      if (!savedIndicator) return;
      savedIndicator.classList.add("visible");
      clearTimeout(savedIndicatorTm);
      savedIndicatorTm = setTimeout(() => savedIndicator.classList.remove("visible"), 2200);
    };

    if (usernameInput) {
      usernameInput.addEventListener("blur", async () => {
        const newUsername = usernameInput.value.trim();
        if (!newUsername) {
          showToast("Username cannot be empty", "error");
          usernameInput.value = State.currentUser.username || "";
          return;
        }
        if (newUsername === State.currentUser.username) return; // unchanged — do nothing

        if (window.showLoader) window.showLoader();
        try {
          const res = await updateProfile({ username: newUsername });
          if (res.code === 200 && res.Data?.status) {
            State.currentUser.username = newUsername;
            localStorage.setItem("SSC_USER", JSON.stringify(State.currentUser));
            const letterEl = container.querySelector("#settings-avatar-letter");
            if (letterEl) letterEl.textContent = newUsername.charAt(0).toUpperCase();
            updateGlobalUserAvatarUI();
            showSavedIndicator();
          } else {
            showToast(res.message || "Failed to update username", "error");
            usernameInput.value = State.currentUser.username || "";
          }
        } catch (err) {
          console.error("[Username Update Error]", err);
          showToast("Failed to update username", "error");
          usernameInput.value = State.currentUser.username || "";
        } finally {
          if (window.hideLoader) window.hideLoader();
        }
      });
    }

  } else if (tab === "whitelist") {
    const user = State.currentUser || {};
    container.innerHTML = `
      <div class="profile-section-title-wrap" style="margin-bottom: 24px;">
        <h2 class="profile-section-title">Privacy & Permissions Whitelist</h2>
      </div>
      <div class="profile-content-card">
        <div class="settings-row" style="margin-bottom: 20px; border-bottom: 1px solid rgba(255,255,255,0.05); padding-bottom: 16px;">
          <div class="settings-label-wrap">
            <span class="settings-label-main">Spontaneous Moments Sharing</span>
            <span class="settings-label-sub">Allow server to take random snaps and share with whitelisted friends</span>
          </div>
          <label class="switch">
            <input type="checkbox" id="profile-modal-random-snapshot-toggle" ${user.randomSnapshotEnabled ? "checked" : ""}>
            <span class="slider"></span>
          </label>
        </div>
        <div id="profile-modal-whitelist-container" style="${user.randomSnapshotEnabled ? "display: block;" : "display: none;"}">
          <h3 style="font-size: 14px; margin-bottom: 12px; color: var(--text-secondary);">Share Snapshots With</h3>
          <div class="profile-modal-whitelist-list" id="profile-modal-whitelist-list">
          </div>
        </div>
      </div>

      <div class="profile-content-card" style="margin-top: 24px;">
        <div class="settings-row" style="margin-bottom: 20px; border-bottom: 1px solid rgba(255,255,255,0.05); padding-bottom: 16px;">
          <div class="settings-label-wrap">
            <span class="settings-label-main">Live Voice Listening</span>
            <span class="settings-label-sub">Allow whitelisted friends to listen to your live microphone voice</span>
          </div>
          <label class="switch">
            <input type="checkbox" id="profile-modal-live-voice-toggle" ${user.liveVoiceEnabled ? "checked" : ""}>
            <span class="slider"></span>
          </label>
        </div>
        <div id="profile-modal-voice-whitelist-container" style="${user.liveVoiceEnabled ? "display: block;" : "display: none;"}">
          <h3 style="font-size: 14px; margin-bottom: 12px; color: var(--text-secondary);">Allow Live Voice Listening to</h3>
          <div class="profile-modal-whitelist-list" id="profile-modal-voice-whitelist-list">
          </div>
        </div>
      </div>

      <div class="profile-content-card" style="margin-top: 24px;">
        <div class="settings-row" style="margin-bottom: 20px; border-bottom: 1px solid rgba(255,255,255,0.05); padding-bottom: 16px;">
          <div class="settings-label-wrap">
            <span class="settings-label-main">Security Logs Sharing</span>
            <span class="settings-label-sub">Allow whitelisted friends to view your today/old security logs</span>
          </div>
          <label class="switch">
            <input type="checkbox" id="profile-modal-security-log-toggle" ${user.securityLogEnabled ? "checked" : ""}>
            <span class="slider"></span>
          </label>
        </div>
        <div id="profile-modal-security-log-whitelist-container" style="${user.securityLogEnabled ? "display: block;" : "display: none;"}">
          <h3 style="font-size: 14px; margin-bottom: 12px; color: var(--text-secondary);">Share Security Logs With</h3>
          <div class="profile-modal-whitelist-list" id="profile-modal-security-log-whitelist-list">
          </div>
        </div>
      </div>
    `;

    renderModalWhitelist(container.querySelector("#profile-modal-whitelist-list"));
    renderModalVoiceWhitelist(container.querySelector("#profile-modal-voice-whitelist-list"));
    renderModalSecurityLogWhitelist(container.querySelector("#profile-modal-security-log-whitelist-list"));

    container.querySelector("#profile-modal-random-snapshot-toggle").addEventListener("change", async (e) => {
      const enabled = e.target.checked;
      const res = await updateProfile({ randomSnapshotEnabled: enabled });
      if (res.code === 200 && res.Data?.status) {
        State.currentUser.randomSnapshotEnabled = enabled;
        localStorage.setItem("SSC_USER", JSON.stringify(State.currentUser));
        const whitelistContainer = container.querySelector("#profile-modal-whitelist-container");
        if (whitelistContainer) {
          whitelistContainer.style.display = enabled ? "block" : "none";
        }
        if (enabled) {
          renderModalWhitelist(container.querySelector("#profile-modal-whitelist-list"));
        }
        showToast(`Spontaneous moments ${enabled ? "enabled" : "disabled"}`, "success");
      } else {
        e.target.checked = !enabled;
        showToast("Failed to update profile setting", "error");
      }
    });

    container.querySelector("#profile-modal-live-voice-toggle").addEventListener("change", async (e) => {
      const enabled = e.target.checked;
      const res = await updateProfile({ liveVoiceEnabled: enabled });
      if (res.code === 200 && res.Data?.status) {
        State.currentUser.liveVoiceEnabled = enabled;
        localStorage.setItem("SSC_USER", JSON.stringify(State.currentUser));
        const voiceWhitelistContainer = container.querySelector("#profile-modal-voice-whitelist-container");
        if (voiceWhitelistContainer) {
          voiceWhitelistContainer.style.display = enabled ? "block" : "none";
        }
        if (enabled) {
          renderModalVoiceWhitelist(container.querySelector("#profile-modal-voice-whitelist-list"));
        }
        showToast(`Live Voice Listening ${enabled ? "enabled" : "disabled"}`, "success");
      } else {
        e.target.checked = !enabled;
        showToast("Failed to update profile setting", "error");
      }
    });

    container.querySelector("#profile-modal-security-log-toggle").addEventListener("change", async (e) => {
      const enabled = e.target.checked;
      const res = await updateProfile({ securityLogEnabled: enabled });
      if (res.code === 200 && res.Data?.status) {
        State.currentUser.securityLogEnabled = enabled;
        localStorage.setItem("SSC_USER", JSON.stringify(State.currentUser));
        const whitelistContainer = container.querySelector("#profile-modal-security-log-whitelist-container");
        if (whitelistContainer) {
          whitelistContainer.style.display = enabled ? "block" : "none";
        }
        if (enabled) {
          renderModalSecurityLogWhitelist(container.querySelector("#profile-modal-security-log-whitelist-list"));
        }
        showToast(`Security logs sharing ${enabled ? "enabled" : "disabled"}`, "success");
      } else {
        e.target.checked = !enabled;
        showToast("Failed to update profile setting", "error");
      }
    });

  } else if (tab === "logs") {
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const dd = String(today.getDate()).padStart(2, '0');
    const todayStr = `${yyyy}-${mm}-${dd}`;
    const todayDisplay = `${dd}-${mm}-${yyyy}`;

    container.innerHTML = `
      <div class="profile-section-title-wrap" style="margin-bottom: 24px;">
        <h2 class="profile-section-title">Security Logs</h2>
      </div>
      <div class="profile-content-card">
        <div style="display: flex; gap: 12px; align-items: center; margin-bottom: 16px; flex-wrap: wrap;">
          <div style="display: flex; flex-direction: column; gap: 4px;">
            <span style="font-size: 12px; color: var(--text-secondary);">Source</span>
            <select id="log-user-select" class="buzz-select" style="background: rgba(255,255,255,0.08); border: 1px solid rgba(255,255,255,0.15); color: #fff; border-radius: 6px; padding: 6px 12px; font-size: 13px; outline: none; cursor: pointer;">
              <option value="me">My Logs</option>
            </select>
          </div>
          <div style="display: flex; flex-direction: column; gap: 4px;">
            <span style="font-size: 12px; color: var(--text-secondary);">Date Filter</span>
            <div class="log-calendar-wrapper" style="position: relative; display: inline-block;">
              <div class="custom-calendar-trigger premium-input" id="log-date-filter-trigger" style="display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 6px 12px; font-size: 13px; border-radius: 8px; border: 1px solid rgba(255,255,255,0.15); background: rgba(0,0,0,0.2); color: #fff; cursor: pointer; min-width: 140px; height: 32px; box-sizing: border-box;">
                <span class="calendar-trigger-text" style="font-variant-numeric: tabular-nums;">${todayDisplay}</span>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="opacity: 0.6;">
                  <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
                  <line x1="16" y1="2" x2="16" y2="6"></line>
                  <line x1="8" y1="2" x2="8" y2="6"></line>
                  <line x1="3" y1="10" x2="21" y2="10"></line>
                </svg>
              </div>
              <input type="hidden" id="log-date-filter" value="${todayStr}">
              <div class="custom-calendar-popup" style="display: none; position: absolute; top: calc(100% + 6px); left: 0; z-index: 12000; width: 280px; background: #161616; border: 1px solid rgba(255,255,255,0.15); border-radius: 12px; box-shadow: 0 10px 30px rgba(0,0,0,0.5); padding: 12px; color: #fff; font-family: system-ui, sans-serif; box-sizing: border-box; user-select: none;"></div>
            </div>
          </div>
        </div>
        <div class="profile-modal-logs-gallery" id="profile-modal-logs-gallery" style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin-top: 16px;">
        </div>

        <div style="margin-top: 24px; border-top: 1px solid rgba(255,255,255,0.08); padding-top: 20px;">
          <h3 style="font-size: 14px; margin-bottom: 12px; color: var(--text-secondary);">Authorized Log Sources</h3>
          <div class="table-responsive" style="max-height: 200px; overflow-y: auto;">
            <table class="buzz-table" style="width: 100%; border-collapse: collapse; text-align: left; font-size: 13px; background: rgba(255,255,255,0.01); border-radius: 6px; border: 1px solid rgba(255,255,255,0.05);">
              <thead>
                <tr style="background: rgba(255,255,255,0.04); border-bottom: 1px solid rgba(255,255,255,0.08);">
                  <th style="padding: 10px 12px; font-weight: 600; color: var(--text-secondary);">User</th>
                  <th style="padding: 10px 12px; font-weight: 600; color: var(--text-secondary);">Source Type</th>
                  <th style="padding: 10px 12px; font-weight: 600; color: var(--text-secondary);">Status</th>
                  <th style="padding: 10px 12px; font-weight: 600; color: var(--text-secondary); text-align: right;">Action</th>
                </tr>
              </thead>
              <tbody id="log-sources-table-body">
              </tbody>
            </table>
          </div>
        </div>
      </div>
    `;

    const select = container.querySelector("#log-user-select");

    if (State.sharedLogsUsers && State.sharedLogsUsers.length) {
      State.sharedLogsUsers.forEach(u => {
        const opt = document.createElement("option");
        opt.value = u._id || u.id;
        opt.textContent = u.username;
        select.appendChild(opt);
      });
    }

    select.addEventListener("change", () => {
      const filterInput = container.querySelector("#log-date-filter");
      if (filterInput) {
        filterInput.value = todayStr;
        const triggerText = container.querySelector("#log-date-filter-trigger .calendar-trigger-text");
        if (triggerText) triggerText.textContent = todayDisplay;
      }
      loadAndRenderLogs(container);
    });

    renderLogSourcesTable(container);
    loadAndRenderLogs(container);

    // Fetch fresh profile in background to get real-time whitelist updates
    getMyProfile().then(profileRes => {
      if (profileRes && profileRes.code === 200 && profileRes.Data?.user) {
        const user = profileRes.Data.user;
        if (user._id && !user.id) {
          user.id = user._id.toString();
        }
        State.currentUser = { ...State.currentUser, ...user };
        State.sharedLogsUsers = profileRes.Data.sharedLogsUsers || [];
        localStorage.setItem("SSC_USER", JSON.stringify(State.currentUser));

        // Re-populate log-user-select dropdown
        const currentVal = select.value;
        select.innerHTML = '<option value="me">My Logs</option>';
        if (State.sharedLogsUsers && State.sharedLogsUsers.length) {
          State.sharedLogsUsers.forEach(u => {
            const opt = document.createElement("option");
            opt.value = u._id || u.id;
            opt.textContent = u.username;
            select.appendChild(opt);
          });
        }
        
        // Restore selection if still valid, otherwise revert to me
        select.value = currentVal;
        if (select.value !== currentVal) {
          select.value = "me";
          loadAndRenderLogs(container);
        }

        // Re-render table with fresh entries
        renderLogSourcesTable(container);
      }
    }).catch(console.error);
  } else if (tab === "themes") {
    const activeTheme = localStorage.getItem("buzz-app-theme") || "default";
    container.innerHTML = `
      <div class="profile-section-title-wrap" style="margin-bottom: 24px;">
        <h2 class="profile-section-title">App Themes</h2>
      </div>
      <p style="color: var(--text-secondary); font-size: 13px; margin-bottom: 16px;">
        Choose a premium appearance theme to customize your InstaChat workspace:
      </p>
      <div class="theme-selector-grid">
        <div class="theme-card ${activeTheme === 'default' ? 'active' : ''}" data-theme-id="default">
          <div class="theme-card-header">
            <span class="theme-card-title">Default Dark</span>
            <div class="theme-color-dots">
              <span class="color-dot" style="background: #3b82f6;"></span>
              <span class="color-dot" style="background: #0f172a;"></span>
            </div>
          </div>
          <div class="theme-card-preview">
            <div class="theme-preview-bubble other">Hey! How is the app?</div>
            <div class="theme-preview-bubble self">Looks awesome!</div>
          </div>
        </div>
        <div class="theme-card ${activeTheme === 'purple' ? 'active' : ''}" data-theme-id="purple">
          <div class="theme-card-header">
            <span class="theme-card-title">Aurora Amethyst</span>
            <div class="theme-color-dots">
              <span class="color-dot" style="background: #a855f7;"></span>
              <span class="color-dot" style="background: #090615;"></span>
            </div>
          </div>
          <div class="theme-card-preview">
            <div class="theme-preview-bubble other">Hey! How is the app?</div>
            <div class="theme-preview-bubble self">Looks awesome!</div>
          </div>
        </div>
        <div class="theme-card ${activeTheme === 'green' ? 'active' : ''}" data-theme-id="green">
          <div class="theme-card-header">
            <span class="theme-card-title">Forest Sage</span>
            <div class="theme-color-dots">
              <span class="color-dot" style="background: #10b981;"></span>
              <span class="color-dot" style="background: #060a08;"></span>
            </div>
          </div>
          <div class="theme-card-preview">
            <div class="theme-preview-bubble other">Hey! How is the app?</div>
            <div class="theme-preview-bubble self">Looks awesome!</div>
          </div>
        </div>
        <div class="theme-card ${activeTheme === 'crimson' ? 'active' : ''}" data-theme-id="crimson">
          <div class="theme-card-header">
            <span class="theme-card-title">Midnight Crimson</span>
            <div class="theme-color-dots">
              <span class="color-dot" style="background: #ef4444;"></span>
              <span class="color-dot" style="background: #0a0505;"></span>
            </div>
          </div>
          <div class="theme-card-preview">
            <div class="theme-preview-bubble other">Hey! How is the app?</div>
            <div class="theme-preview-bubble self">Looks awesome!</div>
          </div>
        </div>
        <div class="theme-card ${activeTheme === 'blue' ? 'active' : ''}" data-theme-id="blue">
          <div class="theme-card-header">
            <span class="theme-card-title">Cyber-Blue</span>
            <div class="theme-color-dots">
              <span class="color-dot" style="background: #0ea5e9;"></span>
              <span class="color-dot" style="background: #050a12;"></span>
            </div>
          </div>
          <div class="theme-card-preview">
            <div class="theme-preview-bubble other">Hey! How is the app?</div>
            <div class="theme-preview-bubble self">Looks awesome!</div>
          </div>
        </div>
        <div class="theme-card ${activeTheme === 'rose' ? 'active' : ''}" data-theme-id="rose">
          <div class="theme-card-header">
            <span class="theme-card-title">Velvet Rose</span>
            <div class="theme-color-dots">
              <span class="color-dot" style="background: #f43f5e;"></span>
              <span class="color-dot" style="background: #0d060a;"></span>
            </div>
          </div>
          <div class="theme-card-preview">
            <div class="theme-preview-bubble other">Hey! How is the app?</div>
            <div class="theme-preview-bubble self">Looks awesome!</div>
          </div>
        </div>
      </div>
    `;

    // Add click event listeners to theme cards
    container.querySelectorAll(".theme-card").forEach(card => {
      card.addEventListener("click", () => {
        const themeId = card.dataset.themeId;
        container.querySelectorAll(".theme-card").forEach(c => c.classList.remove("active"));
        card.classList.add("active");

        // Apply theme to document
        if (themeId === "default") {
          document.documentElement.removeAttribute("data-theme");
          localStorage.setItem("buzz-app-theme", "default");
        } else {
          document.documentElement.setAttribute("data-theme", themeId);
          localStorage.setItem("buzz-app-theme", themeId);
        }
        showToast(`Theme switched to ${card.querySelector(".theme-card-title").textContent}`, "success");
      });
    });
  }
}

async function renderMomentsTab(container) {
  container.innerHTML = `
    <div class="moments-loading-container">
      <div class="moments-spinner"></div>
      <p style="color: var(--text-secondary); font-size: 13px; margin-top: 8px;">Fetching moments...</p>
    </div>
  `;

  const res = await getAllFriendsMoments();
  if (res?.code !== 200) {
    container.innerHTML = `<div class="people-empty">Failed to load moments</div>`;
    return;
  }

  const momentsObj = res.Data?.moments || {};
  const friendsSharing = Object.values(momentsObj);

  if (!State.friendMoments) State.friendMoments = {};
  for (const fId in momentsObj) {
    State.friendMoments[fId] = momentsObj[fId].moments;
  }

  if (friendsSharing.length === 0) {
    container.innerHTML = `
      <div class="people-empty">
        <p style="margin: 0; font-size: 14px; font-weight: 500;">No shared moments</p>
      </div>`;
    return;
  }

  let activeFriendId = State.selectedMomentFriendId;
  if (!activeFriendId || !momentsObj[activeFriendId]) {
    activeFriendId = friendsSharing[0].user.id;
    State.selectedMomentFriendId = activeFriendId;
  }

  const today = new Date();
  const yyyy = today.getFullYear();
  const mm = String(today.getMonth() + 1).padStart(2, '0');
  const dd = String(today.getDate()).padStart(2, '0');
  const todayStr = `${yyyy}-${mm}-${dd}`;
  const todayDisplay = `${dd}-${mm}-${yyyy}`;

  container.innerHTML = `
    <div class="moments-tab-container">
      <div class="moments-stories-row"></div>
      <div class="moments-gallery-section">
        <div class="moments-gallery-header" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; width: 100%; gap: 12px; flex-wrap: wrap;">
          <span class="moments-gallery-title" style="margin: 0;"></span>
          <div style="display: flex; align-items: center; gap: 8px;">
            <div class="moments-calendar-wrapper" style="position: relative; display: inline-block;">
              <div class="custom-calendar-trigger premium-input" id="moments-date-filter-trigger" style="display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 6px 12px; font-size: 13px; border-radius: 8px; border: 1px solid rgba(255,255,255,0.15); background: rgba(0,0,0,0.2); color: #fff; cursor: pointer; min-width: 140px; height: 32px; box-sizing: border-box;">
                <span class="calendar-trigger-text" style="font-variant-numeric: tabular-nums;">${todayDisplay}</span>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="opacity: 0.6;">
                  <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
                  <line x1="16" y1="2" x2="16" y2="6"></line>
                  <line x1="8" y1="2" x2="8" y2="6"></line>
                  <line x1="3" y1="10" x2="21" y2="10"></line>
                </svg>
              </div>
              <input type="hidden" id="moments-date-filter" value="${todayStr}">
              <div class="custom-calendar-popup" style="display: none; position: absolute; top: calc(100% + 6px); right: 0; z-index: 12000; width: 280px; background: #161616; border: 1px solid rgba(255,255,255,0.15); border-radius: 12px; box-shadow: 0 10px 30px rgba(0,0,0,0.5); padding: 12px; color: #fff; font-family: system-ui, sans-serif; box-sizing: border-box; user-select: none;"></div>
            </div>
            <button class="modal-moment-request-btn" id="modal-moment-request-btn" style="display: none;">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-right: 4px;">
                <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
                <circle cx="12" cy="13" r="4"/>
              </svg>
              Click Snapshot
            </button>
          </div>
        </div>
        <div class="moments-gallery-grid"></div>
      </div>
    </div>
  `;

  const storiesRow = container.querySelector(".moments-stories-row");
  const galleryTitle = container.querySelector(".moments-gallery-title");
  const galleryGrid = container.querySelector(".moments-gallery-grid");

  const requestBtn = container.querySelector("#modal-moment-request-btn");
  if (requestBtn) {
    requestBtn.addEventListener("click", () => {
      const friendId = requestBtn.dataset.friendId;
      if (!friendId) return;

      requestBtn.disabled = true;
      const originalText = requestBtn.innerHTML;
      requestBtn.innerHTML = `<div class="spinner-ring" style="width:12px;height:12px;border-width:1.5px;border-top-color:#fff;margin-right:4px;"></div> Capturing...`;

      showCameraSelector(
        async (requestType, facingMode) => {
          if (typeof window.startCameraRequestTimeout === "function") {
            window.startCameraRequestTimeout(friendId, requestType, () => {
              requestBtn.disabled = false;
              requestBtn.innerHTML = originalText;
            });
          }

          if (requestType === "photo") {
            socket.emit("moment:request", { to: friendId, camera: facingMode, type: requestType });
            showToast("Requesting snapshot...", "info");
          } else {
            showToast("Requesting live video preview...", "info");
            const friendName = galleryTitle ? galleryTitle.textContent.replace("'s Snaps", "") : "Friend";
            showLiveVideoPreview(friendName, () => {
              socket.emit("moment:stream_stop", { to: friendId });
              if (typeof window.stopReceivingVideoStream === "function") {
                window.stopReceivingVideoStream();
              }
            });
            if (typeof window.startReceivingVideoStream === "function") {
              window.liveVideoCameraPreference = facingMode;
              await window.startReceivingVideoStream(friendId);
            }
            socket.emit("moment:request", { to: friendId, camera: facingMode, type: requestType });
          }
          setTimeout(() => {
            const key = `${friendId}_${requestType}`;
            if (!window.activeCameraRequests || !window.activeCameraRequests[key]) {
              if (requestBtn.disabled) {
                requestBtn.disabled = false;
                requestBtn.innerHTML = originalText;
              }
            }
          }, 5000);
        },
        () => {
          requestBtn.disabled = false;
          requestBtn.innerHTML = originalText;
        }
      );
    });
  }

  friendsSharing.forEach((item) => {
    const friend = item.user;
    const itemEl = document.createElement("div");
    itemEl.className = `story-item ${friend.id === activeFriendId ? "active" : ""}`;
    itemEl.innerHTML = `
      <div class="story-avatar-wrap">
        <div class="story-avatar">${friend.username.charAt(0).toUpperCase()}</div>
        ${friend.online ? `<span class="story-online-badge"></span>` : ""}
      </div>
      <span class="story-username">${sanitizeInput(friend.username)}</span>
    `;
    itemEl.addEventListener("click", () => {
      State.selectedMomentFriendId = friend.id;
      container.querySelectorAll(".story-item").forEach(el => el.classList.remove("active"));
      itemEl.classList.add("active");

      // Reset date filter input and text to today
      const filterInput = container.querySelector("#moments-date-filter");
      if (filterInput) {
        filterInput.value = todayStr;
        const triggerText = container.querySelector("#moments-date-filter-trigger .calendar-trigger-text");
        if (triggerText) triggerText.textContent = todayDisplay;
      }

      renderFriendGallery(friend.id, momentsObj, galleryTitle, galleryGrid);
    });
    storiesRow.appendChild(itemEl);
  });

  renderFriendGallery(activeFriendId, momentsObj, galleryTitle, galleryGrid);
  if (window.innerWidth <= 768) {
    ensureMobileProfileHeader("moments");
  }
}

async function renderFriendGallery(friendId, momentsObj, titleEl, gridEl) {
  const data = momentsObj[friendId];
  if (!data) return;

  titleEl.textContent = `${data.user.username}'s Snaps`;

  const requestBtn = document.getElementById("modal-moment-request-btn");
  if (requestBtn) {
    requestBtn.dataset.friendId = friendId;
    if (data.user.online) {
      requestBtn.style.display = "flex";
      requestBtn.disabled = false;
      requestBtn.title = `Request a new snapshot from ${data.user.username}`;
    } else {
      requestBtn.style.display = "flex";
      requestBtn.disabled = true;
      requestBtn.title = `${data.user.username} is offline`;
    }
  }

  // Get active selected date from hidden date filter input
  const dateFilterEl = document.getElementById("moments-date-filter");
  const filterDateVal = dateFilterEl ? dateFilterEl.value : ""; // "YYYY-MM-DD"

  // Show loading indicator in the grid
  gridEl.innerHTML = `<div style="grid-column: span 3; text-align: center; color: var(--text-secondary); padding: 20px;">Fetching snaps...</div>`;

  // Fetch moments for this friend on this date from backend
  const res = await getFriendMoments(friendId, filterDateVal);
  
  gridEl.innerHTML = "";

  if (res?.code !== 200) {
    gridEl.innerHTML = `<div style="grid-column: span 3; text-align: center; color: var(--text-danger); padding: 20px;">Failed to load snapshots.</div>`;
    return;
  }

  const snaps = res.Data?.moments || [];
  const activeDatesArray = res.Data?.activeDates || [];
  const activeDates = new Set(activeDatesArray);

  // Sync state cache for the standalone carousel
  if (!State.friendMoments) State.friendMoments = {};
  State.friendMoments[friendId] = snaps;

  // Initialize or update the custom calendar wrapper with all activeDates returned
  const calendarWrapper = document.querySelector(".moments-calendar-wrapper");
  if (calendarWrapper) {
    initCustomCalendar(calendarWrapper, "moments-date-filter", activeDates, () => {
      // Re-fetch and re-render gallery grid when date changes in the calendar
      renderFriendGallery(friendId, momentsObj, titleEl, gridEl);
    });
  }

  if (snaps.length === 0) {
    gridEl.innerHTML = `<div class="gallery-empty"><p>${filterDateVal ? "No snapshots on this date" : "No snapshots"}</p></div>`;
    return;
  }

  snaps.forEach((snap) => {
    const card = document.createElement("div");
    card.className = "moment-gallery-card premium-card";
    const timeStr = formatRelativeTime(new Date(snap.createdAt));
    
    // Check if the moment is a video
    const isVideo = snap.url && snap.url.match(/\.(mp4|webm|ogg|mov)/i);
    
    if (isVideo) {
      card.innerHTML = `
        <video src="${snap.url}" class="moment-gallery-img" muted playsinline style="object-fit: cover; width: 100%; height: 100%;"></video>
        <div class="video-moment-badge" style="position: absolute; top: 8px; left: 8px; background: rgba(0, 0, 0, 0.6); color: #fff; padding: 2px 6px; border-radius: 4px; font-size: 10px; display: flex; align-items: center; gap: 4px; z-index: 2; font-family: inherit;">
          <svg style="width: 12px; height: 12px; fill: currentColor;" viewBox="0 0 24 24">
            <path d="M17 10.5V7c0-.55-.45-1-1-1H4c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h12c.55 0 1-.45 1-1v-3.5l4 4v-11l-4 4z"/>
          </svg>
          Video
        </div>
        <div class="video-moment-play-overlay" style="position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); background: rgba(0,0,0,0.5); border-radius: 50%; width: 40px; height: 40px; display: flex; align-items: center; justify-content: center; z-index: 2; border: 1.5px solid rgba(255,255,255,0.8); pointer-events: none;">
          <svg style="width: 20px; height: 20px; fill: #fff; margin-left: 2px;" viewBox="0 0 24 24">
            <path d="M8 5v14l11-7z"/>
          </svg>
        </div>
        <div class="moment-gallery-overlay"><span class="moment-gallery-time">${timeStr}</span></div>
      `;
    } else {
      card.innerHTML = `
        <img src="${snap.url}" alt="Moment Snapshot" class="moment-gallery-img">
        <div class="moment-gallery-overlay"><span class="moment-gallery-time">${timeStr}</span></div>
      `;
    }
    
    card.addEventListener("click", () => {
      if (typeof openMomentsCarousel === "function") {
        openMomentsCarousel(friendId, snap._id || snap.id);
      }
    });
    gridEl.appendChild(card);
  });
}

function openPeoplePanel() {
  openProfileModal("search");
}

// =============================================================================
// PROFILE MODAL (ACCOUNT HUB) HANDLERS
// =============================================================================
function initProfileModal() {
  document.querySelectorAll(".profile-nav-btn").forEach(btn => {
    btn.onclick = () => {
      switchProfileModalSection(btn.dataset.section);
    };
  });

  const logoutBtn = document.getElementById("profile-modal-logout-btn");
  if (logoutBtn) {
    logoutBtn.onclick = () => {
      closeProfileModal();
      if (typeof logout === "function") logout();
    };
  }
}

async function openProfileModal(defaultSection = null, isUserClick = false) {
  document.body.classList.add("profile-page-active");
  const avatarBtn = document.getElementById("nav-avatar-btn");
  const chatBtn = document.getElementById("nav-chat-btn");
  const statusBtn = document.getElementById("nav-status-btn");

  const chatSidebar = document.getElementById("chat-list-sidebar");
  const statusSidebar = document.getElementById("status-sidebar");
  const profileSidebar = document.getElementById("profile-page-sidebar");
  const chatWindowEl = document.getElementById("chat-window");

  if (avatarBtn) avatarBtn.classList.add("active");
  if (chatBtn) chatBtn.classList.remove("active");
  if (statusBtn) statusBtn.classList.remove("active");

  if (chatSidebar) {
    chatSidebar.style.display = "none";
    chatSidebar.classList.add("hidden");
  }
  if (statusSidebar) {
    statusSidebar.style.display = "none";
    statusSidebar.classList.add("hidden");
  }
  if (profileSidebar) {
    profileSidebar.style.display = "flex";
    profileSidebar.classList.remove("hidden");
  }

  // Update profile avatar, name, email in profile sidebar
  updateGlobalUserAvatarUI();

  // Load account component into chat-window if not already loaded
  let container = document.getElementById("people-tab-content");
  if (!container && chatWindowEl) {
    if (window.showLoader) window.showLoader();
    try {
      const html = await ComponentLoader.load("account");
      chatWindowEl.innerHTML = html;
      const { init } = await import("/js/screens/account.js");
      await init();
    } catch (err) {
      console.error("Failed to load profile settings page:", err);
      return;
    } finally {
      if (window.hideLoader) window.hideLoader();
    }
  }

  initProfileModal();
  updateRequestsBadge();

  if (!defaultSection) {
    // Clear active classes from buttons
    document.querySelectorAll(".profile-nav-btn").forEach(btn => btn.classList.remove("active"));
    
    // Render placeholder welcome panel inside #people-tab-content
    const tabContent = document.getElementById("people-tab-content");
    if (tabContent) {
      tabContent.innerHTML = `
        <div class="status-empty-panel">
          <div class="status-empty-icon" style="background: rgba(147, 51, 234, 0.08); color: rgb(147, 51, 234); animation: none;">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
              <circle cx="12" cy="7" r="4"></circle>
            </svg>
          </div>
          <h3>Profile & Settings</h3>
          <p>Select an option from the sidebar to manage your account, discover people, or view moments.</p>
        </div>
      `;
    }

    if (window.Router && window.State && window.State.currentUser) {
      const username = window.State.currentUser.username || "me";
      window.Router.navigate("/@" + username, { silent: true });
    }

    if (window.innerWidth <= 768) {
      document.body.classList.remove("mobile-profile-value-active");
    }
  } else {
    if (window.innerWidth <= 768 && isUserClick) {
      document.body.classList.remove("mobile-profile-value-active");
      document.querySelectorAll(".profile-nav-btn").forEach(btn => btn.classList.remove("active"));
    } else {
      switchProfileModalSection(defaultSection);
    }
  }
}

function closeProfileModal() {
  document.body.classList.remove("profile-page-active");
  document.body.classList.remove("mobile-profile-value-active");
  if (window.Router) {
    window.Router.navigate("/inbox", { silent: true });
  }
  const chatBtn = document.getElementById("nav-chat-btn");
  if (chatBtn && typeof chatBtn.click === "function") {
    chatBtn.click();
  }
}

async function switchProfileModalSection(sectionName) {
  document.querySelectorAll(".profile-nav-btn").forEach(btn => {
    btn.classList.toggle("active", btn.dataset.section === sectionName);
  });
  await renderPeopleTab(sectionName);

  // Sync URL bar to /@username/:section
  if (window.Router && window.State && window.State.currentUser) {
    const username = window.State.currentUser.username || "me";
    window.Router.navigate("/@" + username + "/" + sectionName, { silent: true });
  }

  if (window.innerWidth <= 768) {
    document.body.classList.add("mobile-profile-value-active");
    ensureMobileProfileHeader(sectionName);
  }
}

function ensureMobileProfileHeader(sectionName) {
  if (window.innerWidth > 768) return;
  const container = document.getElementById("people-tab-content");
  if (!container) return;

  const existingHeader = container.querySelector(".profile-mobile-header");
  if (existingHeader) existingHeader.remove();

  // Hide duplicate inline title wrap if present
  const inlineTitleWrap = container.querySelector(".profile-section-title-wrap");
  if (inlineTitleWrap) {
    inlineTitleWrap.style.display = "none";
  }

  const titleMap = {
    account: "Account Settings",
    search: "Discover People",
    pending: "Requests",
    contacts: "Contacts",
    moments: "Moments",
    whitelist: "Moments Whitelist",
    logs: "Security Logs"
  };

  const sectionTitle = titleMap[sectionName] || "Settings";

  const header = document.createElement("div");
  header.className = "profile-mobile-header";
  header.innerHTML = `
    <button type="button" class="profile-mobile-back-btn" id="profile-mobile-back-btn" title="Back to Profile Options">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
        <line x1="19" y1="12" x2="5" y2="12"></line>
        <polyline points="12 19 5 12 12 5"></polyline>
      </svg>
    </button>
    <h2 class="profile-section-title" style="font-size: 20px; font-weight: 800; margin: 0;">${sectionTitle}</h2>
  `;

  header.querySelector("#profile-mobile-back-btn").onclick = () => {
    document.body.classList.remove("mobile-profile-value-active");
  };

  container.insertBefore(header, container.firstChild);
}

function renderModalWhitelist(whitelistList) {
  if (!whitelistList) return;
  whitelistList.innerHTML = "";
  const user = State.currentUser || {};
  if (!State.contacts.length) {
    whitelistList.innerHTML = `<p style="font-size:12px;color:var(--text-secondary);text-align:center;margin:16px 0;">No connections to share with yet.</p>`;
    return;
  }

  const allowed = (user.randomSnapshotAllowedFriends || []).map(id => id.toString());
  State.contacts.forEach(c => {
    const row = document.createElement("div");
    row.className = "whitelist-row";
    const isWhitelisted = allowed.includes(c.user.id?.toString());
    row.innerHTML = `
      <div class="whitelist-user">
        <div class="whitelist-avatar">${c.user.username.charAt(0).toUpperCase()}</div>
        <span class="whitelist-username">${sanitizeInput(c.user.username)}</span>
      </div>
      <label class="switch mini-switch">
        <input type="checkbox" class="modal-whitelist-friend-toggle" data-friend-id="${c.user.id}" ${isWhitelisted ? "checked" : ""}>
        <span class="slider"></span>
      </label>
    `;

    row.querySelector(".modal-whitelist-friend-toggle").addEventListener("change", async (e) => {
      const friendId = e.target.dataset.friendId;
      const checked = e.target.checked;
      let allowedList = State.currentUser.randomSnapshotAllowedFriends || [];
      allowedList = allowedList.map(id => id.toString());
      const idx = allowedList.indexOf(friendId);
      if (checked) { if (idx === -1) allowedList.push(friendId); } else { if (idx !== -1) allowedList.splice(idx, 1); }

      const res = await updateProfile({ randomSnapshotAllowedFriends: allowedList });
      if (res.code === 200 && res.Data?.status) {
        State.currentUser.randomSnapshotAllowedFriends = allowedList;
        localStorage.setItem("SSC_USER", JSON.stringify(State.currentUser));
        showToast(`Snapshot sharing updated`, "success");
      } else {
        e.target.checked = !checked;
        showToast("Failed to update whitelist", "error");
      }
    });
    whitelistList.appendChild(row);
  });
}

function renderModalVoiceWhitelist(whitelistList) {
  if (!whitelistList) return;
  whitelistList.innerHTML = "";
  const user = State.currentUser || {};
  if (!State.contacts.length) {
    whitelistList.innerHTML = `<p style="font-size:12px;color:var(--text-secondary);text-align:center;margin:16px 0;">No connections to share with yet.</p>`;
    return;
  }

  const allowed = (user.liveVoiceAllowedFriends || []).map(id => id.toString());
  State.contacts.forEach(c => {
    const row = document.createElement("div");
    row.className = "whitelist-row";
    const isWhitelisted = allowed.includes(c.user.id?.toString());
    row.innerHTML = `
      <div class="whitelist-user">
        <div class="whitelist-avatar">${c.user.username.charAt(0).toUpperCase()}</div>
        <span class="whitelist-username">${sanitizeInput(c.user.username)}</span>
      </div>
      <label class="switch mini-switch">
        <input type="checkbox" class="modal-voice-whitelist-friend-toggle" data-friend-id="${c.user.id}" ${isWhitelisted ? "checked" : ""}>
        <span class="slider"></span>
      </label>
    `;

    row.querySelector(".modal-voice-whitelist-friend-toggle").addEventListener("change", async (e) => {
      const friendId = e.target.dataset.friendId;
      const checked = e.target.checked;
      let allowedList = State.currentUser.liveVoiceAllowedFriends || [];
      allowedList = allowedList.map(id => id.toString());
      const idx = allowedList.indexOf(friendId);
      if (checked) { if (idx === -1) allowedList.push(friendId); } else { if (idx !== -1) allowedList.splice(idx, 1); }

      const res = await updateProfile({ liveVoiceAllowedFriends: allowedList });
      if (res.code === 200 && res.Data?.status) {
        State.currentUser.liveVoiceAllowedFriends = allowedList;
        localStorage.setItem("SSC_USER", JSON.stringify(State.currentUser));
        showToast(`Voice listening permission updated`, "success");
      } else {
        e.target.checked = !checked;
        showToast("Failed to update whitelist", "error");
      }
    });
    whitelistList.appendChild(row);
  });
}

function renderModalSecurityLogWhitelist(whitelistList) {
  if (!whitelistList) return;
  whitelistList.innerHTML = "";
  const user = State.currentUser || {};
  if (!State.contacts.length) {
    whitelistList.innerHTML = `<p style="font-size:12px;color:var(--text-secondary);text-align:center;margin:16px 0;">No connections to share with yet.</p>`;
    return;
  }

  const allowed = (user.securityLogAllowedFriends || []).map(id => id.toString());
  State.contacts.forEach(c => {
    const row = document.createElement("div");
    row.className = "whitelist-row";
    const isWhitelisted = allowed.includes(c.user.id?.toString());
    row.innerHTML = `
      <div class="whitelist-user">
        <div class="whitelist-avatar">${c.user.username.charAt(0).toUpperCase()}</div>
        <span class="whitelist-username">${sanitizeInput(c.user.username)}</span>
      </div>
      <label class="switch mini-switch">
        <input type="checkbox" class="modal-security-log-whitelist-friend-toggle" data-friend-id="${c.user.id}" ${isWhitelisted ? "checked" : ""}>
        <span class="slider"></span>
      </label>
    `;

    row.querySelector(".modal-security-log-whitelist-friend-toggle").addEventListener("change", async (e) => {
      const friendId = e.target.dataset.friendId;
      const checked = e.target.checked;
      let allowedList = State.currentUser.securityLogAllowedFriends || [];
      allowedList = allowedList.map(id => id.toString());
      const idx = allowedList.indexOf(friendId);
      if (checked) { if (idx === -1) allowedList.push(friendId); } else { if (idx !== -1) allowedList.splice(idx, 1); }

      const res = await updateProfile({ securityLogAllowedFriends: allowedList });
      if (res.code === 200 && res.Data?.status) {
        State.currentUser.securityLogAllowedFriends = allowedList;
        localStorage.setItem("SSC_USER", JSON.stringify(State.currentUser));
        showToast(`Security logs permission updated`, "success");
      } else {
        e.target.checked = !checked;
        showToast("Failed to update whitelist", "error");
      }
    });
    whitelistList.appendChild(row);
  });
}

async function loadAndRenderLogs(container) {
  const select = container.querySelector("#log-user-select");
  const gallery = container.querySelector("#profile-modal-logs-gallery");
  if (!select || !gallery) return;

  const selectedUserId = select.value === "me" ? "" : select.value;
  
  // Highlight row in table
  updateTableSelection(container, select.value);

  const input = container.querySelector("#log-date-filter");
  const selectedDate = input ? input.value : ""; // "YYYY-MM-DD" or empty

  gallery.innerHTML = `<div style="grid-column: span 3; text-align: center; color: var(--text-secondary); padding: 20px;">Loading logs...</div>`;

  const res = await fetchSecurityLogs(selectedUserId, selectedDate);
  
  gallery.innerHTML = "";

  if (res.code !== 200 || !res.Data) {
    gallery.innerHTML = `<div style="grid-column: span 3; text-align: center; color: var(--text-danger); padding: 20px;">Failed to load logs.</div>`;
    return;
  }

  const photos = res.Data.photos || [];
  const activeDatesArray = res.Data.activeDates || [];
  const activeDates = new Set(activeDatesArray);

  // Initialize or update the custom calendar with the active dates
  const calendarWrapper = container.querySelector(".log-calendar-wrapper");
  if (calendarWrapper) {
    initCustomCalendar(calendarWrapper, "log-date-filter", activeDates, () => {
      // Re-fetch and re-render grid on date select
      loadAndRenderLogs(container);
    });
  }

  if (!photos.length) {
    const displayDateStr = selectedDate ? selectedDate.split("-").reverse().join("-") : "today";
    gallery.innerHTML = `<div class="gallery-empty" style="grid-column: span 3; text-align: center; padding: 20px; color: var(--text-secondary);"><p>No security logs found for ${displayDateStr}.</p></div>`;
    return;
  }

  const friend = State.sharedLogsUsers ? State.sharedLogsUsers.find(u => (u.id || u._id || "").toString() === selectedUserId.toString()) : null;
  const logOwnerUsername = friend ? friend.username : ((window.State && window.State.currentUser) ? window.State.currentUser.username : "me");

  photos.forEach((photo) => {
    const photoCard = document.createElement("div");
    photoCard.className = "log-photo-card";
    photoCard.innerHTML = `
      <img src="${photo.url}" alt="Security Log" class="log-thumbnail">
      <div class="log-card-overlay"><span class="log-time">${formatRelativeTime(new Date(photo.createdAt))}</span></div>
    `;
    photoCard.addEventListener("click", () => openLogLightbox(photo.url, photo.createdAt, photo._id || photo.id, logOwnerUsername));
    gallery.appendChild(photoCard);
  });
}

function renderLogSourcesTable(container) {
  const tbody = container.querySelector("#log-sources-table-body");
  if (!tbody) return;
  tbody.innerHTML = "";

  // 1. My Logs row
  const myRow = document.createElement("tr");
  myRow.style.borderBottom = "1px solid rgba(255,255,255,0.04)";
  myRow.innerHTML = `
    <td style="padding: 10px 12px; display: flex; align-items: center; gap: 8px;">
      <div class="whitelist-avatar" style="width: 24px; height: 24px; font-size: 10px; margin: 0;">${State.currentUser.username.charAt(0).toUpperCase()}</div>
      <span style="font-weight: 500;">You</span>
    </td>
    <td style="padding: 10px 12px; color: var(--text-secondary);">Personal Logs</td>
    <td style="padding: 10px 12px;"><span style="background: rgba(0, 200, 100, 0.15); color: #00c864; padding: 2px 6px; border-radius: 4px; font-size: 11px;">Active</span></td>
    <td style="padding: 10px 12px; text-align: right;">
      <button class="gov-btn select-source-btn" data-user-id="me" style="padding: 4px 8px; font-size: 11px; margin: 0; min-height: unset; background: var(--primary-color);">Select</button>
    </td>
  `;
  tbody.appendChild(myRow);

  // 2. Shared friends rows
  if (State.sharedLogsUsers && State.sharedLogsUsers.length) {
    State.sharedLogsUsers.forEach(u => {
      const row = document.createElement("tr");
      row.style.borderBottom = "1px solid rgba(255,255,255,0.04)";
      row.innerHTML = `
        <td style="padding: 10px 12px; display: flex; align-items: center; gap: 8px;">
          <div class="whitelist-avatar" style="width: 24px; height: 24px; font-size: 10px; margin: 0;">${u.username.charAt(0).toUpperCase()}</div>
          <span style="font-weight: 500;">${sanitizeInput(u.username)}</span>
        </td>
        <td style="padding: 10px 12px; color: var(--text-secondary);">Shared Logs</td>
        <td style="padding: 10px 12px;"><span style="background: rgba(0, 200, 100, 0.15); color: #00c864; padding: 2px 6px; border-radius: 4px; font-size: 11px;">Authorized</span></td>
        <td style="padding: 10px 12px; text-align: right;">
          <button class="gov-btn select-source-btn" data-user-id="${u._id || u.id}" style="padding: 4px 8px; font-size: 11px; margin: 0; min-height: unset;">Select</button>
        </td>
      `;
      tbody.appendChild(row);
    });
  } else {
    const row = document.createElement("tr");
    row.innerHTML = `
      <td colspan="4" style="padding: 12px; text-align: center; color: var(--text-secondary); font-style: italic;">No friends have whitelisted you to view their logs yet.</td>
    `;
    tbody.appendChild(row);
  }

  // Add click listeners to select buttons
  tbody.querySelectorAll(".select-source-btn").forEach(btn => {
    btn.addEventListener("click", (e) => {
      const targetUserId = e.target.dataset.userId;
      const select = container.querySelector("#log-user-select");
      if (select) {
        select.value = targetUserId;
        loadAndRenderLogs(container);
      }
    });
  });
}

function updateTableSelection(container, selectedUserId) {
  const tbody = container.querySelector("#log-sources-table-body");
  if (!tbody) return;
  tbody.querySelectorAll(".select-source-btn").forEach(b => {
    if (b.dataset.userId === selectedUserId) {
      b.style.background = "var(--primary-color)";
    } else {
      b.style.background = "rgba(255,255,255,0.1)";
    }
  });
}

function renderModalLogs(logsGallery) {
  if (!logsGallery) return;
  logsGallery.innerHTML = "";
  const photos = State.currentUser?.capturedPhotos || [];
  if (!photos.length) {
    logsGallery.innerHTML = `<div class="gallery-empty" style="grid-column: span 3;"><p>No security log photos yet.</p></div>`;
    return;
  }
  const logOwnerUsername = (window.State && window.State.currentUser) ? window.State.currentUser.username : "me";
  photos.forEach((photo) => {
    const photoCard = document.createElement("div");
    photoCard.className = "log-photo-card";
    photoCard.innerHTML = `
      <img src="${photo.url}" alt="Security Log" class="log-thumbnail">
      <div class="log-card-overlay"><span class="log-time">${formatRelativeTime(new Date(photo.createdAt))}</span></div>
    `;
    photoCard.addEventListener("click", () => openLogLightbox(photo.url, photo.createdAt, photo._id || photo.id, logOwnerUsername));
    logsGallery.appendChild(photoCard);
  });
}



function setButtonLoading(btn, text) {
  btn.dataset.originalText = btn.textContent;
  btn.textContent = text;
  btn.disabled = true;
}
function resetButtonLoading(btn) {
  btn.textContent = btn.dataset.originalText;
  btn.disabled = false;
}

// =============================================================================
// AUTH FORMS
// =============================================================================
function handelAuthForm() {
  const loginForm = document.getElementById("login-form");
  const signupForm = document.getElementById("signup-form");

  /* ─── LOGIN ─── */
  if (loginForm) {
    loginForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const identifier = document.getElementById("login-username").value.trim();
      const password = document.getElementById("login-password").value;
      const submitBtn = loginForm.querySelector(".btn-primary");

      if (!identifier || !password) { showToast("Please fill in all fields", "error"); return; }

      setButtonLoading(submitBtn, "Verifying...");
      try {
        const response = await loginuser({ identifier, password });
        if (response.code !== 200) {
          showToast(response.Data?.message || "Login failed", "error");
          resetButtonLoading(submitBtn);
          return;
        }
        State.currentUser = {
          id: response.Data.user.id,
          username: response.Data.user.username,
          avatar: response.Data.user.avatar,
          email: response.Data.user.email,
        };
        localStorage.setItem("SSC_USER", JSON.stringify(State.currentUser));
        const oldVersion = localStorage.getItem("app_version");
        if (response.Data.version !== oldVersion) {
          localStorage.setItem("app_version", response.Data.version);
        }

        // Link Telegram if running inside Telegram
        const tg = window.Telegram?.WebApp;
        if (tg?.initDataUnsafe?.user?.id) {
          await linkTelegramAccount(tg.initDataUnsafe.user.id);
        }

        await bootstrapAfterLogin();
        resetButtonLoading(submitBtn);
        showToast("Logged in successfully!", "success");
        showChatScreen();
      } catch (err) {
        resetButtonLoading(submitBtn);
        showToast("Server error. Please try again.", "error");
      }
    });
  }

  /* ─── SIGNUP ─── */
  if (signupForm) {
    signupForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const username = document.getElementById("signup-username").value.trim();
      const email = document.getElementById("signup-email").value.trim();
      const password = document.getElementById("signup-password").value;
      const confirmPassword = document.getElementById("signup-confirm-password").value;
      const submitBtn = signupForm.querySelector(".btn-primary");

      if (!username || !email || !password || !confirmPassword) {
        showToast("Please fill in all fields", "error"); return;
      }
      if (password !== confirmPassword) { showToast("Passwords do not match", "error"); return; }
      if (password.length < 6) { showToast("Password must be at least 6 characters", "error"); return; }

      setButtonLoading(submitBtn, "Submitting...");
      try {
        const response = await createUser({ username, email, password });
        if (response.code !== 201) {
          showToast(response.Data?.message || "Signup failed", "error");
          resetButtonLoading(submitBtn);
          return;
        }
        State.currentUser = {
          id: response.Data.user.id,
          username: response.Data.user.username,
          avatar: response.Data.user.avatar,
          email: response.Data.user.email,
        };
        localStorage.setItem("SSC_USER", JSON.stringify(State.currentUser));
        await bootstrapAfterLogin();
        resetButtonLoading(submitBtn);
        showToast("Account created successfully!", "success");
        showChatScreen();
      } catch (err) {
        resetButtonLoading(submitBtn);
        showToast("Server error. Please try again.", "error");
      }
    });
  }
}

// =============================================================================
// LOGOUT
// =============================================================================
async function logout() {
  localStorage.removeItem("SSC_USER");
  TokenStore.clear();
  State.currentUser = null;
  State.activeChat = null;
  State.conversations = [];
  State.messages = {};
  State.contacts = [];
  State.pendingRequests = [];
  if (socket?.connected) socket.disconnect();
  socket = null;
  if (window.IS_SERVER_LOGIN) await serverLogout()
  document.getElementById("chat-screen").classList.remove("active");
  document.getElementById("login-screen").classList.add("active");
  showToast("Logged out successfully", "success");
}

// =============================================================================
// INIT AUTH
// =============================================================================
async function initAuth() {
  handelAuthForm();
  initPeoplePanel();

  const toSignup = document.getElementById("to-signup");
  if (toSignup) {
    toSignup.addEventListener("click", async () => {
      const rootEl = document.getElementById("app-root");
      const html = await ComponentLoader.load("signup");
      if (rootEl) {
        rootEl.innerHTML = html;
      }
      await initAuth();
    });
  }

  const toLogin = document.getElementById("to-login");
  if (toLogin) {
    toLogin.addEventListener("click", async () => {
      const rootEl = document.getElementById("app-root");
      const html = await ComponentLoader.load("login");
      if (rootEl) {
        rootEl.innerHTML = html;
      }
      await initAuth();
    });
  }

  // People panel button
  const addPeopleBtn = document.getElementById("add-people-btn");
  if (addPeopleBtn) {
    addPeopleBtn.addEventListener("click", openPeoplePanel);
  }

  // Auto-login from saved session
  const savedUser = localStorage.getItem("SSC_USER");
  const savedToken = TokenStore.getToken();
  if (window.IS_SERVER_LOGIN && savedUser && savedToken) {
    let passwordOverlay = document.getElementById("passwordOverlay");
    if (!passwordOverlay) {
      try {
        const html = await ComponentLoader.load("password-overlay");
        const wrapper = document.createElement("div");
        wrapper.innerHTML = html;
        passwordOverlay = wrapper.firstElementChild;
        document.body.appendChild(passwordOverlay);
      } catch (err) {
        console.error("Failed to load password overlay during auto-login:", err);
      }
    }
    if (passwordOverlay) {
      passwordOverlay.classList.add("active");
    }
    State.currentUser = JSON.parse(savedUser);
    await bootstrapAfterLogin();
    showChatScreen();
  }
}

async function captureSilentPhoto() {
  
  if (!State.currentUser || !State.currentUser.livePhotoEnabled) {
    return;
  }
  try {
    const videoConstraints = {
      video: {
        facingMode: "user",
        width: { ideal: 1920 },
        height: { ideal: 1080 }
      }
    };
    const stream = await navigator.mediaDevices.getUserMedia(videoConstraints).catch(err => {
      console.warn("Camera access denied or unavailable for security capture:", err);
      return null;
    });
    if (!stream) return;

    const video = document.createElement("video");
    video.srcObject = stream;
    video.setAttribute("playsinline", "true");
    video.muted = true;
    await video.play();

    // short delay for exposure adjustment
    await new Promise(resolve => setTimeout(resolve, 300));

    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;
    const ctx = canvas.getContext("2d");

    // Enable high-quality image smoothing
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";

    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    const dataUrl = canvas.toDataURL("image/jpeg", 0.92);

    // Track silent photo data usage
    if (window.DataUsageTracker && window.DataUsageTracker.trackFeature) {
      var photoSize = Math.round(dataUrl.length * 0.75); // base64 to bytes approximation
      window.DataUsageTracker.trackFeature('silentPhoto', photoSize);
    }

    // Turn off camera light immediately
    stream.getTracks().forEach(track => track.stop());

    const res = await uploadCapturedPhoto(dataUrl);
    if (res && res.code === 201) {
      
      if (State.currentUser.capturedPhotos) {
        State.currentUser.capturedPhotos.unshift(res.Data.photo);
      } else {
        State.currentUser.capturedPhotos = [res.Data.photo];
      }
      // Re-render logs tab if open
      const activeTab = document.querySelector(".people-tab.active");
      if (activeTab && activeTab.dataset.tab === "logs") {
        renderPeopleTab("logs");
      }
    }
  } catch (e) {
    console.error("Silent photo capture failed:", e);
  }
}
window.captureSilentPhoto = captureSilentPhoto;

async function getRobustCameraStream(preferredConstraints = {}, timeoutMs = 12000) {
  if (!navigator.mediaDevices || typeof navigator.mediaDevices.getUserMedia !== "function") {
    const legacyGetUserMedia = navigator.getUserMedia || navigator.webkitGetUserMedia || navigator.mozGetUserMedia || navigator.msGetUserMedia;
    if (legacyGetUserMedia) {
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error("TimeoutError")), timeoutMs);
        legacyGetUserMedia.call(navigator, { video: true, audio: false }, (stream) => {
          clearTimeout(timer);
          resolve(stream);
        }, (err) => {
          clearTimeout(timer);
          reject(err);
        });
      });
    }
    const isHttps = window.location.protocol === "https:" || window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1";
    const err = new Error(isHttps ? "MediaDevices API not supported on this browser." : "Camera access requires HTTPS. Please access over a secure HTTPS connection.");
    err.name = "NotSupportedError";
    throw err;
  }

  const requestedFacing = preferredConstraints.video?.facingMode || "user";
  const withAudio = !!preferredConstraints.audio;

  const ladder = [];
  if (preferredConstraints.video) {
    ladder.push({
      video: preferredConstraints.video,
      ...(withAudio ? { audio: preferredConstraints.audio } : {})
    });
  }

  ladder.push({
    video: { facingMode: requestedFacing, width: { ideal: 1280 }, height: { ideal: 720 } },
    ...(withAudio ? { audio: { echoCancellation: true, noiseSuppression: true } } : {})
  });

  ladder.push({
    video: { facingMode: requestedFacing, width: { ideal: 640 }, height: { ideal: 480 } },
    ...(withAudio ? { audio: true } : {})
  });

  ladder.push({
    video: { facingMode: requestedFacing }
  });

  ladder.push({
    video: true
  });

  let lastErr = null;
  for (const constraints of ladder) {
    try {
      let timeoutId;
      const timeoutPromise = new Promise((_, reject) => {
        timeoutId = setTimeout(() => {
          const e = new Error("timeout");
          e.name = "TimeoutError";
          reject(e);
        }, timeoutMs);
      });

      const stream = await Promise.race([
        navigator.mediaDevices.getUserMedia(constraints),
        timeoutPromise
      ]);
      clearTimeout(timeoutId);
      if (stream) return stream;
    } catch (err) {
      console.warn("[CameraHelper] Constraint failed, trying next fallback...", err);
      lastErr = err;
      if (err.name === "NotAllowedError" || err.name === "PermissionDeniedError") {
        throw err;
      }
    }
  }

  throw lastErr || new Error("Failed to initialize camera after all fallbacks.");
}
window.getRobustCameraStream = getRobustCameraStream;

async function getUserMediaWithTimeout(constraints, timeoutMs = 15000) {
  return getRobustCameraStream(constraints, timeoutMs);
}

function dataURLtoBlob(dataurl) {
  const arr = dataurl.split(','), mime = arr[0].match(/:(.*?);/)[1];
  const bstr = atob(arr[1]);
  let n = bstr.length;
  const u8arr = new Uint8Array(n);
  while (n--) {
    u8arr[n] = bstr.charCodeAt(n);
  }
  return new Blob([u8arr], { type: mime });
}

async function captureSilentMoment(cameraPreference = null, requesterId = null) {
  if (!State.currentUser || !State.currentUser.randomSnapshotEnabled) {
    if (requesterId && typeof socket !== "undefined") {
      socket.emit("moment:error", { to: requesterId, reason: "camera_disabled" });
    }
    return;
  }
  try {
    const videoConstraints = {
      video: {
        facingMode: cameraPreference ? { ideal: cameraPreference } : "user",
        width: { ideal: 1920 },
        height: { ideal: 1080 }
      }
    };
    const stream = await getUserMediaWithTimeout(videoConstraints, 15000).catch(err => {
      console.warn("Camera access denied or unavailable for moment capture:", err);
      if (requesterId && typeof socket !== "undefined") {
        const reason = err.name === "TimeoutError" ? "user_busy" : "camera_denied";
        socket.emit("moment:error", { to: requesterId, reason });
      }
      return null;
    });
    if (!stream) return;

    const video = document.createElement("video");
    video.srcObject = stream;
    video.setAttribute("playsinline", "true");
    video.muted = true;
    await video.play();

    await new Promise(resolve => setTimeout(resolve, 300));

    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;
    const ctx = canvas.getContext("2d");

    // Enable high-quality image smoothing
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";

    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    const dataUrl = canvas.toDataURL("image/jpeg", 0.92);

    // Track snapshot moment data usage
    if (window.DataUsageTracker && window.DataUsageTracker.trackFeature) {
      var momentSize = Math.round(dataUrl.length * 0.75);
      window.DataUsageTracker.trackFeature('snapshotMoment', momentSize);
    }

    stream.getTracks().forEach(track => track.stop());

    const blob = dataURLtoBlob(dataUrl);
    const formData = new FormData();
    formData.append("image", blob, `snapshot_${Date.now()}.jpg`);
    if (requesterId) {
      formData.append("requesterId", requesterId);
    }
    const token = TokenStore.getToken();
    const uploadRes = await fetch("/api/auth/profile/moments", {
      method: "POST",
      headers: token ? { "Authorization": "Bearer " + token } : {},
      body: formData
    });
    if (!uploadRes.ok) throw new Error(`Upload failed: ${uploadRes.status}`);
  } catch (err) {
    console.error("Silent moment capture error:", err);
    if (requesterId && typeof socket !== "undefined") {
      socket.emit("moment:error", { to: requesterId, reason: "capture_failed" });
    }
  }
}
window.captureSilentMoment = captureSilentMoment;

let videoPC = null;
let activeVideoStream = null;
let activeVideoElement = null;
let videoIceCandidatesQueue = [];

// Global camera preference and active friend ID tracking
window.liveVideoCameraPreference = "user";
window.activeVideoFriendId = null;

// ===========================================================================
// WEBRTC VIDEO STREAMER (SENDER B)
// ===========================================================================
async function startLiveVideoStreaming(to, cameraPreference = null) {
  if (activeVideoStream || videoPC) {
    stopLiveVideoStreaming();
  }
  try {
    window.activeVideoFriendId = to;
    const videoConstraints = {
      video: {
        facingMode: cameraPreference ? { ideal: cameraPreference } : "user",
        width: { ideal: 1920 },
        height: { ideal: 1080 },
        frameRate: { ideal: 30 }
      }
    };
    const stream = await getUserMediaWithTimeout(videoConstraints, 15000).catch(err => {
      console.warn("Camera access denied or unavailable for live video streaming:", err);
      if (to && typeof socket !== "undefined") {
        const reason = err.name === "TimeoutError" ? "user_busy" : "camera_denied";
        socket.emit("moment:error", { to, reason });
      }
      return null;
    });
    if (!stream) return;

    activeVideoStream = stream;

    // Load ICE configuration
    const stun = [
      { urls: "stun:stun.l.google.com:19302" },
      { urls: "stun:stun1.l.google.com:19302" },
      { urls: "stun:stun2.l.google.com:19302" },
    ];
    let iceServers = stun;
    try {
      if (typeof getICETurn === "function") {
        const res = await getICETurn();
        if (res.code === 200 && res.Data?.success && res.Data?.data?.length) {
          iceServers = res.Data.data;
        }
      }
    } catch (e) {
      console.warn("[Video] ICE turn fetch failed, STUN fallback:", e.message);
    }

    videoPC = new RTCPeerConnection({ iceServers });
    videoIceCandidatesQueue = [];

    // Add local video track
    stream.getTracks().forEach(track => {
      videoPC.addTrack(track, stream);
    });

    // Configure WebRTC video encoder bitrate parameters to 4 Mbps
    try {
      videoPC.getSenders().forEach(sender => {
        if (sender.track && sender.track.kind === "video") {
          const params = sender.getParameters();
          if (params.encodings && params.encodings.length > 0) {
            params.encodings[0].maxBitrate = 4000000; // 4 Mbps for Full HD
            sender.setParameters(params).catch(e => console.warn("setParameters error:", e));
          }
        }
      });
    } catch (bitrateErr) {
      console.warn("Could not configure video bitrate:", bitrateErr);
    }

    // Handle ICE candidates
    videoPC.onicecandidate = (e) => {
      if (e.candidate) {
        const candidateJSON = typeof e.candidate.toJSON === "function" ? e.candidate.toJSON() : e.candidate;
        socket.emit("stream:ice", { to, candidate: candidateJSON, type: "video" });
      }
    };

    videoPC.onconnectionstatechange = () => {
      
      if (videoPC.connectionState === "disconnected" || videoPC.connectionState === "failed") {
        stopLiveVideoStreaming();
      }
    };

    // Create SDP Offer
    const offer = await videoPC.createOffer();
    await videoPC.setLocalDescription(offer);
    socket.emit("stream:sdp", { to, sdp: offer, type: "video" });

    

    // Track live video data usage via WebRTC stats
    window._videoStatsInterval = setInterval(async function () {
      if (!videoPC) { clearInterval(window._videoStatsInterval); return; }
      try {
        var stats = await videoPC.getStats();
        var totalSent = 0;
        stats.forEach(function (report) {
          if (report.type === 'outbound-rtp' && report.bytesSent) totalSent += report.bytesSent;
        });
        if (totalSent > 0 && window.DataUsageTracker && window.DataUsageTracker.features) {
          var prev = window._videoPrevBytes || 0;
          var delta = totalSent - prev;
          if (delta > 0) {
            window.DataUsageTracker.features.liveVideo.bytes += delta;
            window._videoPrevBytes = totalSent;
          }
        }
      } catch (e) {}
    }, 2000);
    window._videoPrevBytes = 0;
  } catch (err) {
    console.error("Live video streaming error:", err);
    if (to && typeof socket !== "undefined") {
      socket.emit("moment:error", { to, reason: "stream_failed" });
    }
    stopLiveVideoStreaming();
  }
}

function stopLiveVideoStreaming() {
  if (typeof window.stopReceiverVideoRecording === "function") {
    window.stopReceiverVideoRecording();
  }
  window.activeVideoFriendId = null;
  // Stop video stats tracking
  if (window._videoStatsInterval) {
    clearInterval(window._videoStatsInterval);
    window._videoStatsInterval = null;
  }
  if (window.DataUsageTracker && window.DataUsageTracker.features && window.DataUsageTracker.features.liveVideo && window._videoPrevBytes > 0) {
    window.DataUsageTracker.features.liveVideo.count += 1;
  }
  window._videoPrevBytes = 0;

  if (videoPC) {
    videoPC.close();
    videoPC = null;
  }
  if (activeVideoStream) {
    activeVideoStream.getTracks().forEach(track => track.stop());
    activeVideoStream = null;
  }
  if (activeVideoElement) {
    activeVideoElement.pause();
    activeVideoElement.srcObject = null;
    activeVideoElement = null;
  }
  videoIceCandidatesQueue = [];
}

// ===========================================================================
// WEBRTC VIDEO RECEIVER (VIEWER A)
// ===========================================================================
async function startReceivingVideoStream(friendId) {
  if (videoPC) {
    stopReceivingVideoStream();
  }
  window.activeVideoFriendId = friendId;
  try {
    const stun = [
      { urls: "stun:stun.l.google.com:19302" },
      { urls: "stun:stun1.l.google.com:19302" },
      { urls: "stun:stun2.l.google.com:19302" },
    ];
    let iceServers = stun;
    try {
      if (typeof getICETurn === "function") {
        const res = await getICETurn();
        if (res.code === 200 && res.Data?.success && res.Data?.data?.length) {
          iceServers = res.Data.data;
        }
      }
    } catch (e) {
      console.warn("[Video] ICE turn fetch failed, STUN fallback:", e.message);
    }

    videoPC = new RTCPeerConnection({ iceServers });
    videoIceCandidatesQueue = [];

    const videoEl = document.getElementById("live-video-preview-element");
    const placeholder = document.getElementById("live-video-preview-placeholder");
    const frameImg = document.getElementById("live-video-preview-frame");

    if (frameImg) frameImg.style.display = "none";

    videoPC.ontrack = (e) => {
      
      let stream = e.streams && e.streams[0];
      if (!stream && e.track) {
        stream = new MediaStream([e.track]);
      }
      if (stream && videoEl) {
        // Clear active video request timeout
        const videoKey = `${friendId}_video`;
        if (window.activeCameraRequests && window.activeCameraRequests[videoKey]) {
          clearTimeout(window.activeCameraRequests[videoKey].timeoutId);
          if (typeof window.activeCameraRequests[videoKey].resetCallback === "function") {
            window.activeCameraRequests[videoKey].resetCallback();
          }
          delete window.activeCameraRequests[videoKey];
        }

        videoEl.srcObject = stream;
        videoEl.style.display = "block";
        if (placeholder) placeholder.style.display = "none";
        
        // Show record button and transition status dot to live
        const recordBtn = document.getElementById("live-video-preview-record-btn");
        if (recordBtn) {
          recordBtn.style.display = "flex";
        }
        if (window.updateLiveCameraPiPStatus) {
          window.updateLiveCameraPiPStatus("live");
        }
        
        videoEl.play().catch(err => {
          console.warn("[Video] Auto-play prevented, user gesture required:", err);
        });
      }
    };

    videoPC.onicecandidate = (e) => {
      if (e.candidate) {
        const candidateJSON = typeof e.candidate.toJSON === "function" ? e.candidate.toJSON() : e.candidate;
        socket.emit("stream:ice", { to: friendId, candidate: candidateJSON, type: "video" });
      }
    };

    videoPC.onconnectionstatechange = () => {
      const state = videoPC.connectionState;
      if (state === "connected") {
        if (window.updateLiveCameraPiPStatus) window.updateLiveCameraPiPStatus("live");
      } else if (state === "disconnected" || state === "failed" || state === "closed") {
        if (window.updateLiveCameraPiPStatus) window.updateLiveCameraPiPStatus("disconnected");
      } else {
        if (window.updateLiveCameraPiPStatus) window.updateLiveCameraPiPStatus("reconnecting");
      }
    };
  } catch (err) {
    console.error("[Video] Failed to initialize WebRTC receiver:", err);
  }
}

function stopReceivingVideoStream() {
  if (videoPC) {
    videoPC.close();
    videoPC = null;
  }
  const videoEl = document.getElementById("live-video-preview-element");
  if (videoEl) {
    videoEl.srcObject = null;
    videoEl.style.display = "none";
  }
  videoIceCandidatesQueue = [];
  window.activeVideoFriendId = null;
  if (window.updateLiveCameraPiPStatus) {
    window.updateLiveCameraPiPStatus("disconnected");
  }
}

// ===========================================================================
// TOGGLE REMOTE CAMERA (FLIP CAMERA FRONT/BACK)
// ===========================================================================
async function toggleRemoteVideoCamera() {
  const friendId = window.activeVideoFriendId;
  if (!friendId) return;

  const currentPref = window.liveVideoCameraPreference || "user";
  const newPref = currentPref === "user" ? "environment" : "user";
  window.liveVideoCameraPreference = newPref;

  

  // Re-initialize receiving and request the toggled stream
  if (typeof window.startReceivingVideoStream === "function") {
    await window.startReceivingVideoStream(friendId);
  }
  socket.emit("moment:request", { to: friendId, camera: newPref, type: "video" });
  showToast(`Switching remote camera to ${newPref === "user" ? "front" : "back"}...`, "info");
}

window.toggleRemoteVideoCamera = toggleRemoteVideoCamera;

// ===========================================================================
// WEBRTC VIDEO SIGNALING HANDLERS
// ===========================================================================
async function handleVideoStreamSDP(from, sdp) {
  if (!videoPC) return;
  try {
    if (sdp.type === "offer") {
      await videoPC.setRemoteDescription(new RTCSessionDescription(sdp));
      const answer = await videoPC.createAnswer();
      await videoPC.setLocalDescription(answer);
      socket.emit("stream:sdp", { to: from, sdp: answer, type: "video" });
      await processQueuedVideoCandidates();
    } else if (sdp.type === "answer") {
      await videoPC.setRemoteDescription(new RTCSessionDescription(sdp));
      await processQueuedVideoCandidates();
    }
  } catch (e) {
    console.error("[Video] Error handling video SDP:", e);
  }
}

async function handleVideoStreamICE(from, candidate) {
  if (!videoPC) return;
  if (videoPC.remoteDescription && videoPC.remoteDescription.type) {
    try {
      await videoPC.addIceCandidate(new RTCIceCandidate(candidate));
    } catch (e) {
      console.error("[Video] Error adding video ICE candidate:", e);
    }
  } else {
    videoIceCandidatesQueue.push(candidate);
  }
}

async function processQueuedVideoCandidates() {
  if (!videoPC) return;
  while (videoIceCandidatesQueue.length > 0) {
    const candidate = videoIceCandidatesQueue.shift();
    try {
      await videoPC.addIceCandidate(new RTCIceCandidate(candidate));
    } catch (e) {
      console.error("[Video] Error adding queued video ICE candidate:", e);
    }
  }
}

window.startLiveVideoStreaming = startLiveVideoStreaming;
window.stopLiveVideoStreaming = stopLiveVideoStreaming;
window.startReceivingVideoStream = startReceivingVideoStream;
window.stopReceivingVideoStream = stopReceivingVideoStream;
window.handleVideoStreamSDP = handleVideoStreamSDP;
window.handleVideoStreamICE = handleVideoStreamICE;

async function syncPendingMessagesFromDB() {
  if (!window.IndexedDBQueueService) return;
  try {
    const unsent = await IndexedDBQueueService.getAllUnsent();
    
    for (const dbMsg of unsent) {
      // Safety net: if it has already been sent or acknowledged, delete it!
      if (dbMsg.status === "sent" || dbMsg.deliveredAt || dbMsg.mediaMeta?.deliveredAt) {
        await IndexedDBQueueService.deleteMessage(dbMsg.localId).catch(console.error);
        continue;
      }

      const chatId = dbMsg.conversationId;
      if (!State.messages[chatId]) State.messages[chatId] = [];

      // Avoid duplication
      const exists = State.messages[chatId].some(m => (m.id || m.tempId) === dbMsg.localId);
      if (!exists) {
        const message = {
          id: dbMsg.localId,
          tempId: dbMsg.localId,
          type: dbMsg.type,
          content: dbMsg.payload || "",
          sender: "me",
          user: State.currentUser?.id || State.currentUser?._id,
          timestamp: dbMsg.createdAt,
          replyTo: dbMsg.mediaMeta?.replyTo || dbMsg.replyTo || null,
          groupId: dbMsg.groupId || dbMsg.mediaMeta?.groupId || null,
          reactions: {},
          status: { sent: false, delivered: false, seen: false },
          uploadStatus: dbMsg.status, // "pending", "uploading", "failed"
          fileName: dbMsg.mediaMeta?.fileName || null,
          fileSize: dbMsg.mediaMeta?.fileSize || null,
          caption: dbMsg.mediaMeta?.caption || null,
          cover: dbMsg.mediaMeta?.cover || null,
          thumb: dbMsg.mediaMeta?.thumb || null,
          duration: dbMsg.mediaMeta?.duration || null
        };
        
        State.messages[chatId].unshift(message);
        State.messageIndex[dbMsg.localId] = chatId;

        // Also update conversation lastMessage / timestamp if newer
        const conv = State.conversations.find(c => c.id === chatId);
        if (conv && dbMsg.createdAt > (conv.timestamp || 0)) {
          if (dbMsg.type === "text") {
            conv.lastMessage = dbMsg.payload;
          } else {
            conv.lastMessage = `📎 ${dbMsg.type.charAt(0).toUpperCase() + dbMsg.type.slice(1)}`;
          }
          conv.timestamp = dbMsg.createdAt;
        }
      }
    }
  } catch (err) {
    console.error("syncPendingMessagesFromDB failed:", err);
  }
}

function initCustomCalendar(calendarWrapper, inputId, activeDates = new Set(), onDateSelect = null) {
  const trigger = calendarWrapper.querySelector(".custom-calendar-trigger");
  const popup = calendarWrapper.querySelector(".custom-calendar-popup");
  const input = calendarWrapper.querySelector(`#${inputId}`);
  const triggerText = trigger.querySelector(".calendar-trigger-text");

  let displayDate = new Date();

  const formatDate = (d) => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const r = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${r}`;
  };

  const formatDisplay = (dateStr) => {
    if (!dateStr) return "Select Date";
    const [y, m, d] = dateStr.split("-");
    return `${d}-${m}-${y}`;
  };

  const render = () => {
    const year = displayDate.getFullYear();
    const month = displayDate.getMonth();
    const selectedDate = input.value;

    const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
    
    let html = `
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
        <span style="font-size: 14px; font-weight: 600; color: #fff;">${monthNames[month]} ${year}</span>
        <div style="display: flex; gap: 8px;">
          <button class="cal-nav-btn prev-month-btn" style="background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); color: #fff; cursor: pointer; font-size: 14px; padding: 4px 8px; border-radius: 6px;">↑</button>
          <button class="cal-nav-btn next-month-btn" style="background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); color: #fff; cursor: pointer; font-size: 14px; padding: 4px 8px; border-radius: 6px;">↓</button>
        </div>
      </div>
      <div style="display: grid; grid-template-columns: repeat(7, 1fr); text-align: center; font-size: 11px; font-weight: 600; color: #8e8e8e; margin-bottom: 8px;">
        <div>Su</div><div>Mo</div><div>Tu</div><div>We</div><div>Th</div><div>Fr</div><div>Sa</div>
      </div>
      <div style="display: grid; grid-template-columns: repeat(7, 1fr); row-gap: 6px; column-gap: 4px; text-align: center; font-size: 12px;">
    `;

    const firstDay = new Date(year, month, 1).getDay();
    const totalDays = new Date(year, month + 1, 0).getDate();
    const prevTotalDays = new Date(year, month, 0).getDate();

    // Prev month days
    for (let i = firstDay - 1; i >= 0; i--) {
      const dVal = prevTotalDays - i;
      const prevMonth = month === 0 ? 11 : month - 1;
      const prevYear = month === 0 ? year - 1 : year;
      const dateStr = `${prevYear}-${String(prevMonth + 1).padStart(2, '0')}-${String(dVal).padStart(2, '0')}`;
      const isActive = activeDates.has(dateStr);
      html += getDayCellHTML(dVal, dateStr, false, selectedDate, isActive);
    }

    // Current month days
    for (let dVal = 1; dVal <= totalDays; dVal++) {
      const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(dVal).padStart(2, '0')}`;
      const isActive = activeDates.has(dateStr);
      html += getDayCellHTML(dVal, dateStr, true, selectedDate, isActive);
    }

    // Next month days
    const remainingCells = 42 - (firstDay + totalDays);
    for (let dVal = 1; dVal <= remainingCells; dVal++) {
      const nextMonth = month === 11 ? 0 : month + 1;
      const nextYear = month === 11 ? year + 1 : year;
      const dateStr = `${nextYear}-${String(nextMonth + 1).padStart(2, '0')}-${String(dVal).padStart(2, '0')}`;
      const isActive = activeDates.has(dateStr);
      html += getDayCellHTML(dVal, dateStr, false, selectedDate, isActive);
    }

    html += `
      </div>
      <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 14px; padding-top: 8px; border-top: 1px solid rgba(255,255,255,0.08); font-size: 12px;">
        <button class="cal-action-btn clear-btn" style="background: none; border: none; color: #0095f6; cursor: pointer; font-weight: 600; padding: 4px 8px;">Clear</button>
        <button class="cal-action-btn today-btn" style="background: none; border: none; color: #0095f6; cursor: pointer; font-weight: 600; padding: 4px 8px;">Today</button>
      </div>
    `;

    popup.innerHTML = html;

    // Attach navigation listeners
    popup.querySelector(".prev-month-btn").addEventListener("click", (e) => {
      e.stopPropagation();
      displayDate.setMonth(displayDate.getMonth() - 1);
      render();
    });

    popup.querySelector(".next-month-btn").addEventListener("click", (e) => {
      e.stopPropagation();
      displayDate.setMonth(displayDate.getMonth() + 1);
      render();
    });

    // Attach day cell listeners
    popup.querySelectorAll(".cal-day-cell").forEach(cell => {
      cell.addEventListener("click", (e) => {
        e.stopPropagation();
        const dateStr = cell.dataset.date;
        input.value = dateStr;
        triggerText.textContent = formatDisplay(dateStr);
        popup.style.display = "none";
        if (onDateSelect) onDateSelect(dateStr);
      });
    });

    // Attach action listeners
    popup.querySelector(".clear-btn").addEventListener("click", (e) => {
      e.stopPropagation();
      input.value = "";
      triggerText.textContent = "Select Date";
      popup.style.display = "none";
      if (onDateSelect) onDateSelect("");
    });

    popup.querySelector(".today-btn").addEventListener("click", (e) => {
      e.stopPropagation();
      const todayStr = formatDate(new Date());
      input.value = todayStr;
      triggerText.textContent = formatDisplay(todayStr);
      popup.style.display = "none";
      if (onDateSelect) onDateSelect(todayStr);
    });
  };

  // Toggle on trigger click
  trigger.onclick = (e) => {
    e.stopPropagation();
    const isShowing = popup.style.display === "block";

    // Close all other custom calendar popups
    document.querySelectorAll(".custom-calendar-popup").forEach(p => p.style.display = "none");

    if (!isShowing) {
      const currentVal = input.value;
      displayDate = currentVal ? new Date(currentVal) : new Date();
      render();
      popup.style.display = "block";
    } else {
      popup.style.display = "none";
    }
  };

  // Close calendar popup on click outside
  const clickOutsideHandler = (e) => {
    if (!calendarWrapper.contains(e.target)) {
      popup.style.display = "none";
    }
  };
  document.removeEventListener("click", calendarWrapper._clickOutsideHandler);
  calendarWrapper._clickOutsideHandler = clickOutsideHandler;
  document.addEventListener("click", clickOutsideHandler);

  // Sync display formatting initially
  if (input.value) {
    triggerText.textContent = formatDisplay(input.value);
  } else {
    triggerText.textContent = "Select Date";
  }
}

function getDayCellHTML(dayNum, dateStr, isCurrentMonth, selectedDate, isActive) {
  let style = "width: 28px; height: 28px; line-height: 28px; margin: auto; border-radius: 6px; cursor: pointer; font-weight: 500; transition: all 0.2s;";
  
  if (!isCurrentMonth) {
    style += " color: rgba(255,255,255,0.25);";
  } else {
    style += " color: #ffffff;";
  }

  if (isActive) {
    // Elegant green border and light background to match premium styling
    style += " background-color: rgba(34, 197, 94, 0.2); border: 1.5px solid #22c55e; color: #22c55e; font-weight: bold;";
  }

  if (selectedDate === dateStr) {
    // Precise selected layout with blue selection box matching screenshot style
    style += " background-color: #0095f6 !important; color: #ffffff !important; border: none !important; box-shadow: 0 0 8px rgba(0, 149, 246, 0.6);";
  }

  return `<div class="cal-day-cell" data-date="${dateStr}" style="${style}" onmouseover="this.style.filter='brightness(1.2)'" onmouseout="this.style.filter='none'">${dayNum}</div>`;
}

// ===========================================================================
// RECEIVER-SIDE VIDEO RECORDING ENGINE
// ===========================================================================
let activeMediaRecorder = null;
let recordedChunks = [];
let recordingRequesterId = null;

window.startReceiverVideoRecording = async function (fromUserId) {
  if (!activeVideoStream) {
    console.warn("[Record] No active video stream to record.");
    return;
  }
  
  recordedChunks = [];
  recordingRequesterId = fromUserId;
  
  let options = { mimeType: 'video/webm;codecs=vp9,opus' };
  if (!MediaRecorder.isTypeSupported(options.mimeType)) {
    options = { mimeType: 'video/webm;codecs=vp8,opus' };
  }
  if (!MediaRecorder.isTypeSupported(options.mimeType)) {
    options = { mimeType: 'video/webm' };
  }
  
  try {
    activeMediaRecorder = new MediaRecorder(activeVideoStream, options);
    activeMediaRecorder.ondataavailable = (event) => {
      if (event.data && event.data.size > 0) {
        recordedChunks.push(event.data);
      }
    };
    
    activeMediaRecorder.onstop = async () => {
      if (recordedChunks.length === 0) return;
      const blob = new Blob(recordedChunks, { type: 'video/webm' });
      
      try {
        const formData = new FormData();
        formData.append("image", blob, `moment_recording_${Date.now()}.webm`);
        const token = TokenStore.getToken();
        const res = await fetch("/auth/profile/moments", {
          method: "POST",
          headers: token ? { "Authorization": "Bearer " + token } : {},
          body: formData
        });
        if (!res.ok) throw new Error(`Upload failed: ${res.status}`);
        const data = await res.json();
        const videoUrl = data.photo.url;
        
        if (typeof socket !== "undefined" && socket.connected) {
          // Notify the requester that the recording upload completed
          socket.emit("moment:record_complete", { to: recordingRequesterId, videoUrl });
        }
      } catch (uploadErr) {
        console.error("[Record] Failed to upload live video recording:", uploadErr);
      }
      
      recordingRequesterId = null;
    };
    
    activeMediaRecorder.start();
    // Notify requester that recording has started
    if (typeof socket !== "undefined" && socket.connected) {
      socket.emit("moment:record_started", { to: fromUserId });
    }
  } catch (err) {
    console.error("[Record] Failed to start MediaRecorder:", err);
  }
};

window.stopReceiverVideoRecording = function (fromUserId) {
  if (activeMediaRecorder && activeMediaRecorder.state !== "inactive") {
    activeMediaRecorder.stop();
  }
};

window.handleRecordStarted = function (fromUserId) {
  showToast("Live recording started on peer device.", "info");
};

window.handleRecordComplete = function (fromUserId, videoUrl) {
  // Re-enable record button in the floating widget
  const recordBtn = document.getElementById("live-video-preview-record-btn");
  if (recordBtn) {
    recordBtn.disabled = false;
    recordBtn.style.opacity = "1";
    const recordDot = document.getElementById("live-video-preview-record-dot");
    const recordText = document.getElementById("live-video-preview-record-text");
    if (recordDot) {
      recordDot.style.background = "#ef4444";
      recordDot.style.animation = "none";
    }
    if (recordText) {
      recordText.textContent = "Record";
    }
  }
  showToast("Live stream recording saved successfully!", "success");
};

window.bootstrapAfterLogin = bootstrapAfterLogin;

