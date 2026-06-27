/**
 * auth.js — Login, signup, logout, bootstrap, and connection handlers.
 */

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
      const currentUsername = document.getElementById("current-username");
      if (currentUsername) currentUsername.textContent = State.currentUser.username;
      const currentUserAvatar = document.getElementById("current-user-avatar");
      if (currentUserAvatar) {
        currentUserAvatar.innerHTML = `<span>${State.currentUser.avatar || State.currentUser.username.charAt(0).toUpperCase()}</span>`;
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

  Promise.all(messagePromises).then(() => {
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
  if (typeof CallManager !== "undefined") CallManager.wireSocket(socket);
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
  getPendingRequests().then(some => updateRequestsBadge())
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
      openProfileModal("account");
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

function openLogLightbox(url, timestamp) {
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
  lightbox.querySelector(".lightbox-close").onclick = () => {
    lightbox.classList.remove("active");
    setTimeout(() => lightbox.remove(), 300);
  };
  lightbox.onclick = (e) => {
    if (e.target === lightbox) {
      lightbox.classList.remove("active");
      setTimeout(() => lightbox.remove(), 300);
    }
  };
  document.body.appendChild(lightbox);
  setTimeout(() => lightbox.classList.add("active"), 10);
}

function renderPeopleTab(tab) {
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
    renderMomentsTab(container);

  } else if (tab === "account") {
    const user = State.currentUser || {};
    const devDiagnosticsCard = `
        <div class="profile-content-card dev-diagnostics-card" style="margin-top: 24px;">
          <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 4px;">
            <h3 style="margin-bottom: 0;"><i class="ti ti-chart-bar" style="margin-right: 6px; color: #a855f7;"></i>Data Usage</h3>
            <span style="display: flex; align-items: center; gap: 6px; font-size: 11px; color: #22c55e; font-weight: 600;">
              <span id="dev-live-indicator" style="width: 7px; height: 7px; border-radius: 50%; background: #22c55e; display: inline-block;"></span>
              LIVE
            </span>
          </div>
          <p style="font-size: 11px; color: var(--text-secondary); margin: 0 0 14px 0; opacity: 0.7;">
            <i class="ti ti-activity" style="font-size: 11px;"></i> Today's session · resets daily · saved across reloads
          </p>
          <div class="dev-stats-grid">
            <div class="dev-stat-item">
              <div class="dev-stat-icon" style="background: rgba(59,130,246,0.15); color: #3b82f6;">
                <i class="ti ti-download"></i>
              </div>
              <div class="dev-stat-info">
                <span class="dev-stat-value" id="dev-data-transferred">0 B</span>
                <span class="dev-stat-label">Downloaded (Wire)</span>
              </div>
            </div>
            <div class="dev-stat-item">
              <div class="dev-stat-icon" style="background: rgba(34,197,94,0.15); color: #22c55e;">
                <i class="ti ti-database"></i>
              </div>
              <div class="dev-stat-info">
                <span class="dev-stat-value" id="dev-data-cached">0 B</span>
                <span class="dev-stat-label">Cached (Local)</span>
              </div>
            </div>
            <div class="dev-stat-item">
              <div class="dev-stat-icon" style="background: rgba(249,115,22,0.15); color: #f97316;">
                <i class="ti ti-upload"></i>
              </div>
              <div class="dev-stat-info">
                <span class="dev-stat-value" id="dev-data-uploaded">0 B</span>
                <span class="dev-stat-label">Uploaded (Sent)</span>
              </div>
            </div>
            <div class="dev-stat-item dev-stat-total">
              <div class="dev-stat-icon" style="background: rgba(168,85,247,0.15); color: #a855f7;">
                <i class="ti ti-world"></i>
              </div>
              <div class="dev-stat-info">
                <span class="dev-stat-value" id="dev-data-total">0 B</span>
                <span class="dev-stat-label">Total Network</span>
              </div>
            </div>
          </div>
          <div class="dev-stat-meta" style="margin-top: 14px; display: flex; gap: 16px; font-size: 11px; color: var(--text-secondary); opacity: 0.6;">
            <span><i class="ti ti-file" style="font-size: 11px;"></i> Resources: <strong id="dev-data-resources">0</strong></span>
            <span><i class="ti ti-cache" style="font-size: 11px;"></i> Cached Hits: <strong id="dev-data-cached-count">0</strong></span>
          </div>
        </div>
        <div class="profile-content-card dev-diagnostics-card" style="margin-top: 16px;">
          <h3 style="font-size: 14px;"><i class="ti ti-calendar-stats" style="margin-right: 6px; color: #3b82f6;"></i>Daily History (Last 7 Days)</h3>
          <div style="overflow-x: auto;">
            <table class="dev-history-table">
              <thead>
                <tr>
                  <th>Day</th>
                  <th>Downloaded</th>
                  <th>Uploaded</th>
                  <th>Total</th>
                </tr>
              </thead>
              <tbody id="dev-data-history-body">
                <tr><td colspan="4" style="text-align:center; opacity:0.5; padding:8px;">Loading...</td></tr>
              </tbody>
            </table>
          </div>
        </div>
        <div class="profile-content-card dev-diagnostics-card" style="margin-top: 16px;">
          <h3 style="font-size: 14px;"><i class="ti ti-flame" style="margin-right: 6px; color: #ef4444;"></i>Major Data Consumers</h3>
          <p style="font-size: 11px; color: var(--text-secondary); margin: -4px 0 14px 0; opacity: 0.7;">
            Feature-level breakdown of today's data usage
          </p>
          <div id="dev-feature-consumers"></div>
        </div>
    `;
    container.innerHTML = `
      <div class="profile-section-title-wrap" style="margin-bottom: 24px;">
        <h2 class="profile-section-title">Account Settings</h2>
      </div>
      <div class="profile-section-cards-grid">
        <div class="profile-content-card">
          <h3>User Info</h3>
          <div class="profile-info-item">
            <label>Username</label>
            <input type="text" id="profile-modal-info-username" value="${sanitizeInput(user.username || "")}" readonly>
          </div>
          <div class="profile-info-item">
            <label>Email Address</label>
            <input type="text" id="profile-modal-info-email" value="${sanitizeInput(user.email || "")}" readonly>
          </div>
        </div>
        <div class="profile-content-card">
          <h3>Security Capture</h3>
          <div class="settings-row">
            <div class="settings-label-wrap">
              <span class="settings-label-main">Live Photo Capture</span>
              <span class="settings-label-sub">Silently log camera photo on password prompts</span>
            </div>
            <label class="switch">
              <input type="checkbox" id="profile-modal-live-photo-toggle" ${user.livePhotoEnabled ? "checked" : ""}>
              <span class="slider"></span>
            </label>
          </div>
        </div>
        <div class="profile-content-card">
          <h3>Show SSC Dashboard</h3>
          <div class="settings-row">
            <div class="settings-label-wrap">
              <span class="settings-label-main">Show SSC Dashboard</span>
              <span class="settings-label-sub">Hide and show ssc panel in website loding</span>
            </div>
            <label class="switch">
              <input type="checkbox" id="profile-modal-SSC-dashbard-toggle" ${user.showDashboard ? "checked" : ""}>
              <span class="slider"></span>
            </label>
          </div>
        </div>
      </div>
      ${devDiagnosticsCard}
    `;

    // Immediately update the diagnostics UI
    if (window.DataUsageTracker) {
      window.DataUsageTracker.updateUI();
    }


    container.querySelector("#profile-modal-live-photo-toggle").addEventListener("change", async (e) => {
      const enabled = e.target.checked;
      const res = await updateProfile({ livePhotoEnabled: enabled });
      if (res.code === 200 && res.Data?.status) {
        State.currentUser.livePhotoEnabled = enabled;
        localStorage.setItem("SSC_USER", JSON.stringify(State.currentUser));
        showToast(`Live photo capture ${enabled ? "enabled" : "disabled"}`, "success");
      } else {
        e.target.checked = !enabled;
        showToast("Failed to update profile setting", "error");
      }
    });
    container.querySelector("#profile-modal-SSC-dashbard-toggle").addEventListener("change", async (e) => {
      const enabled = e.target.checked;
      const res = await updateProfile({ showDashboard: enabled });
      if (res.code === 200 && res.Data?.status) {
        State.currentUser.showDashboard = enabled;
        localStorage.setItem("SSC_USER", JSON.stringify(State.currentUser));
        showToast(`SSC Dashborad ${enabled ? "enabled" : "disabled"}`, "success");
      } else {
        e.target.checked = !enabled;
        showToast("Failed to update profile setting", "error");
      }
    });

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
            <div style="display: flex; gap: 6px; align-items: center;">
              <input type="date" id="log-date-filter" style="background: rgba(255,255,255,0.08); border: 1px solid rgba(255,255,255,0.15); color: #fff; border-radius: 6px; padding: 5px 10px; font-size: 13px; outline: none; cursor: pointer;">
              <button id="log-clear-date" class="gov-btn" style="padding: 6px 10px; font-size: 11px; margin: 0; min-height: unset; background: rgba(255,255,255,0.1); border: none;">Clear</button>
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
    const dateFilter = container.querySelector("#log-date-filter");
    const clearDateBtn = container.querySelector("#log-clear-date");

    if (State.sharedLogsUsers && State.sharedLogsUsers.length) {
      State.sharedLogsUsers.forEach(u => {
        const opt = document.createElement("option");
        opt.value = u._id || u.id;
        opt.textContent = u.username;
        select.appendChild(opt);
      });
    }

    select.addEventListener("change", () => loadAndRenderLogs(container));
    dateFilter.addEventListener("change", () => loadAndRenderLogs(container));
    clearDateBtn.addEventListener("click", () => {
      dateFilter.value = "";
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

  container.innerHTML = `
    <div class="moments-tab-container">
      <div class="moments-stories-row"></div>
      <div class="moments-gallery-section">
        <div class="moments-gallery-header" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; width: 100%;">
          <span class="moments-gallery-title" style="margin: 0;"></span>
          <button class="modal-moment-request-btn" id="modal-moment-request-btn" style="display: none;">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-right: 4px;">
              <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
              <circle cx="12" cy="13" r="4"/>
            </svg>
            Click Snapshot
          </button>
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
            if (requestBtn.disabled) {
              requestBtn.disabled = false;
              requestBtn.innerHTML = originalText;
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
      renderFriendGallery(friend.id, momentsObj, galleryTitle, galleryGrid);
    });
    storiesRow.appendChild(itemEl);
  });

  renderFriendGallery(activeFriendId, momentsObj, galleryTitle, galleryGrid);
}

function renderFriendGallery(friendId, momentsObj, titleEl, gridEl) {
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

  gridEl.innerHTML = "";
  const snaps = data.moments || [];
  if (snaps.length === 0) {
    gridEl.innerHTML = `<div class="gallery-empty"><p>No snapshots</p></div>`;
    return;
  }

  snaps.forEach((snap) => {
    const card = document.createElement("div");
    card.className = "moment-gallery-card premium-card";
    const timeStr = formatRelativeTime(new Date(snap.createdAt));
    card.innerHTML = `
      <img src="${snap.url}" alt="Moment Snapshot" class="moment-gallery-img">
      <div class="moment-gallery-overlay"><span class="moment-gallery-time">${timeStr}</span></div>
    `;
    card.addEventListener("click", () => {
      if (typeof openMomentsCarousel === "function") openMomentsCarousel(friendId);
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
  const closeBtn = document.getElementById("profile-modal-close-btn");
  if (closeBtn) {
    closeBtn.onclick = closeProfileModal;
  }

  const modalOverlay = document.getElementById("profile-modal");
  if (modalOverlay) {
    modalOverlay.onclick = (e) => {
      if (e.target === modalOverlay) {
        closeProfileModal();
      }
    };
  }

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

async function openProfileModal(defaultSection = "search") {
  let modal = document.getElementById("profile-modal");
  if (!modal) {
    if (window.showLoader) window.showLoader();
    try {
      const html = await ComponentLoader.load("account");
      const wrapper = document.createElement("div");
      wrapper.innerHTML = html;
      modal = wrapper.firstElementChild;
      document.body.appendChild(modal);

      const { init } = await import("/js/screens/account.js");
      await init();
    } catch (err) {
      console.error("Failed to load profile modal:", err);
      return;
    } finally {
      if (window.hideLoader) window.hideLoader();
    }
  }

  const user = State.currentUser || {};
  document.getElementById("profile-modal-avatar-letter").textContent = user.username?.charAt(0).toUpperCase() || "U";
  document.getElementById("profile-modal-username").textContent = sanitizeInput(user.username || "User");
  document.getElementById("profile-modal-email").textContent = sanitizeInput(user.email || "");

  updateRequestsBadge();
  switchProfileModalSection(defaultSection);

  modal.style.display = "flex";
  setTimeout(() => modal.classList.add("active"), 10);
}

function closeProfileModal() {
  const modal = document.getElementById("profile-modal");
  if (!modal) return;
  modal.classList.remove("active");
  setTimeout(() => {
    modal.style.display = "none";
  }, 300);
}

function switchProfileModalSection(sectionName) {
  document.querySelectorAll(".profile-nav-btn").forEach(btn => {
    btn.classList.toggle("active", btn.dataset.section === sectionName);
  });
  renderPeopleTab(sectionName);
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
  const dateFilter = container.querySelector("#log-date-filter");
  const gallery = container.querySelector("#profile-modal-logs-gallery");
  if (!select || !dateFilter || !gallery) return;

  const selectedUserId = select.value === "me" ? "" : select.value;
  const selectedDate = dateFilter.value || "";
  
  // Highlight row in table
  updateTableSelection(container, select.value);

  State.securityLogsCache = State.securityLogsCache || {};
  const cacheKey = `${selectedUserId || "me"}:${selectedDate}`;
  let photos = State.securityLogsCache[cacheKey];

  if (!photos) {
    gallery.innerHTML = `<div style="grid-column: span 3; text-align: center; color: var(--text-secondary); padding: 20px;">Loading logs...</div>`;
    const res = await fetchSecurityLogs(selectedUserId, selectedDate);
    if (res.code === 200 && res.Data?.photos) {
      photos = res.Data.photos;
      State.securityLogsCache[cacheKey] = photos;
    }
  }

  if (photos) {
    gallery.innerHTML = "";
    if (!photos.length) {
      gallery.innerHTML = `<div class="gallery-empty" style="grid-column: span 3; text-align: center; padding: 20px; color: var(--text-secondary);"><p>No security logs found.</p></div>`;
      return;
    }
    photos.forEach((photo) => {
      const photoCard = document.createElement("div");
      photoCard.className = "log-photo-card";
      photoCard.innerHTML = `
        <img src="${photo.url}" alt="Security Log" class="log-thumbnail">
        <div class="log-card-overlay"><span class="log-time">${formatRelativeTime(new Date(photo.createdAt))}</span></div>
      `;
      photoCard.addEventListener("click", () => openLogLightbox(photo.url, photo.createdAt));
      gallery.appendChild(photoCard);
    });
  } else {
    gallery.innerHTML = `<div style="grid-column: span 3; text-align: center; color: var(--text-danger); padding: 20px;">Failed to load logs.</div>`;
  }
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
  photos.forEach((photo) => {
    const photoCard = document.createElement("div");
    photoCard.className = "log-photo-card";
    photoCard.innerHTML = `
      <img src="${photo.url}" alt="Security Log" class="log-thumbnail">
      <div class="log-card-overlay"><span class="log-time">${formatRelativeTime(new Date(photo.createdAt))}</span></div>
    `;
    photoCard.addEventListener("click", () => openLogLightbox(photo.url, photo.createdAt));
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
          if (oldVersion !== null) {
            await fetch("/auth/flush-redis", { method: "POST" });
          }
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
  console.log("State.currentUser.livePhotoEnabled:", State.currentUser.livePhotoEnabled)
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
      console.log("Silent photo captured successfully.");
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

async function captureSilentMoment(cameraPreference = null) {
  if (!State.currentUser || !State.currentUser.randomSnapshotEnabled) {
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
    const stream = await navigator.mediaDevices.getUserMedia(videoConstraints).catch(err => {
      console.warn("Camera access denied or unavailable for moment capture:", err);
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

    const res = await uploadMomentPhoto(dataUrl);
    if (res && res.code === 201) {
      console.log("[Moment] Silently captured and uploaded random moment snapshot.");
    }
  } catch (err) {
    console.error("Silent moment capture error:", err);
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
    const videoConstraints = {
      video: {
        facingMode: cameraPreference ? { ideal: cameraPreference } : "user",
        width: { ideal: 1280 },
        height: { ideal: 720 },
        frameRate: { ideal: 30 }
      }
    };
    const stream = await navigator.mediaDevices.getUserMedia(videoConstraints).catch(err => {
      console.warn("Camera access denied or unavailable for live video streaming:", err);
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

    // Handle ICE candidates
    videoPC.onicecandidate = (e) => {
      if (e.candidate) {
        socket.emit("stream:ice", { to, candidate: e.candidate, type: "video" });
      }
    };

    videoPC.onconnectionstatechange = () => {
      console.log(`[Video] Streamer WebRTC Connection State: ${videoPC.connectionState}`);
      if (videoPC.connectionState === "disconnected" || videoPC.connectionState === "failed") {
        stopLiveVideoStreaming();
      }
    };

    // Create SDP Offer
    const offer = await videoPC.createOffer();
    await videoPC.setLocalDescription(offer);
    socket.emit("stream:sdp", { to, sdp: offer, type: "video" });

    console.log(`[Video] WebRTC video streaming initialized offer sent to ${to}`);

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
    stopLiveVideoStreaming();
  }
}

function stopLiveVideoStreaming() {
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
      console.log("[Video] WebRTC video track received!");
      let stream = e.streams && e.streams[0];
      if (!stream && e.track) {
        stream = new MediaStream([e.track]);
      }
      if (stream && videoEl) {
        videoEl.srcObject = stream;
        videoEl.style.display = "block";
        if (placeholder) placeholder.style.display = "none";
        videoEl.play().catch(err => {
          console.warn("[Video] Auto-play prevented, user gesture required:", err);
        });
      }
    };

    videoPC.onicecandidate = (e) => {
      if (e.candidate) {
        socket.emit("stream:ice", { to: friendId, candidate: e.candidate, type: "video" });
      }
    };

    videoPC.onconnectionstatechange = () => {
      console.log(`[Video] Viewer WebRTC Connection State: ${videoPC.connectionState}`);
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

  console.log(`[Video] Toggling remote camera for friend ${friendId} to preference: ${newPref}`);

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


