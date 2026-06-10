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
      online: false,
    }));
  }

  // Load pending requests badge
  await refreshPendingRequests();

  // Sync full profile (livePhotoEnabled and capturedPhotos)
  const profileRes = await getMyProfile();
  if (profileRes.code === 200 && profileRes.Data?.user) {
    State.currentUser = {
      ...State.currentUser,
      ...profileRes.Data.user
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
        sender: m.from?.toString() === State.currentUser.id?.toString() ? "me" : "other",
        user: m.from?.toString(),
        timestamp: m.createdAt || m.clientTime,
        reactions: m.reactions || {},
        status: m.status || { sent: true, delivered: false, seen: false },
        callType: m.callType,
        callStatus: m.callStatus,
        callRoomId: m.callRoomId,
        callExpiresAt: m.callExpiresAt,
        callDuration: m.callDuration
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
    EmojiPanel.loadCustomGifsAndTrending();
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
  const count = State.pendingRequests.length;
  if (badge) {
    badge.textContent = count;
    badge.style.display = count > 0 ? "flex" : "none";
  }
}

// =============================================================================
// PEOPLE PANEL — search + send request + pending list
// =============================================================================
let searchTimeout = null;

function initPeoplePanel() {
  const panel = document.getElementById("people-panel");
  const closeBtn = document.getElementById("people-close-btn");
  const searchInput = document.getElementById("people-search-input");
  const tabs = document.querySelectorAll(".people-tab");

  closeBtn.addEventListener("click", () => panel.classList.remove("active"));

  // Tab switching
  tabs.forEach(tab => {
    tab.addEventListener("click", () => {
      tabs.forEach(t => t.classList.remove("active"));
      tab.classList.add("active");
      renderPeopleTab(tab.dataset.tab);
    });
  });

  // Search with debounce
  searchInput.addEventListener("input", () => {
    clearTimeout(searchTimeout);
    const q = searchInput.value.trim();
    if (q.length < 2) {
      document.getElementById("people-search-results").innerHTML = "";
      return;
    }
    searchTimeout = setTimeout(() => runSearch(q), 400);
  });
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
    item.className = "people-item";
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
  container.innerHTML = "";

  const searchBox = document.querySelector(".people-search-box");
  const searchResults = document.getElementById("people-search-results");

  if (tab === "search") {
    if (searchBox) searchBox.style.display = "flex";
    if (searchResults) searchResults.style.display = "block";
    
    const q = document.getElementById("people-search-input")?.value?.trim() || "";
    if (q.length < 2) {
      container.innerHTML = `
        <div class="people-empty">
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="opacity: 0.5; margin-bottom: 8px;">
            <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
          </svg>
          <p style="margin: 0; font-size: 14px; font-weight: 500;">Discover People</p>
          <small style="color: var(--text-secondary); font-size: 12px;">Search by username above to find connections</small>
        </div>`;
    }
  } else {
    if (searchBox) searchBox.style.display = "none";
    if (searchResults) searchResults.style.display = "none";
  }

  if (tab === "pending") {
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

      container.appendChild(item);
    });

  } else if (tab === "contacts") {
    if (!State.contacts.length) {
      container.innerHTML = `
        <div class="people-empty">
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="opacity: 0.5; margin-bottom: 8px;">
            <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>
          </svg>
          <p style="margin: 0; font-size: 14px; font-weight: 500;">No connections yet</p>
          <small style="color: var(--text-secondary); font-size: 12px;">Search for users to add them</small>
        </div>`;
      return;
    }
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
        document.getElementById("people-panel").classList.remove("active");
        openChat(c.user.id);
      });
      container.appendChild(item);
    });

  } else if (tab === "logs") {
    const photos = State.currentUser?.capturedPhotos || [];
    if (!photos.length) {
      container.innerHTML = `
        <div class="people-empty">
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="opacity: 0.5; margin-bottom: 8px;">
            <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
            <circle cx="12" cy="13" r="4"/>
          </svg>
          <p style="margin: 0; font-size: 14px; font-weight: 500;">No security log photos yet</p>
          <small style="color: var(--text-secondary); font-size: 12px;">Enable live photo and verify password to generate logs</small>
        </div>`;
      return;
    }

    const galleryGrid = document.createElement("div");
    galleryGrid.className = "logs-gallery-grid";
    
    photos.forEach((photo) => {
      const photoCard = document.createElement("div");
      photoCard.className = "log-photo-card";
      const relativeTime = formatRelativeTime(new Date(photo.createdAt));
      photoCard.innerHTML = `
        <img src="${photo.url}" alt="Security Log" class="log-thumbnail">
        <div class="log-card-overlay">
          <span class="log-time">${relativeTime}</span>
        </div>
      `;
      photoCard.addEventListener("click", () => {
        openLogLightbox(photo.url, photo.createdAt);
      });
      galleryGrid.appendChild(photoCard);
    });
    container.appendChild(galleryGrid);

  } else if (tab === "profile") {
    const user = State.currentUser || {};
    const livePhotoChecked = user.livePhotoEnabled ? "checked" : "";
    
    const profileWrap = document.createElement("div");
    profileWrap.className = "premium-profile-wrap";
    profileWrap.innerHTML = `
      <div class="profile-main-card">
        <div class="profile-avatar-large">
          <div class="neon-spin-ring"></div>
          <div class="profile-avatar-letter">${user.username?.charAt(0).toUpperCase() || "U"}</div>
        </div>
        <h3 class="profile-card-username">${sanitizeInput(user.username || "User")}</h3>
        <p class="profile-card-email">${sanitizeInput(user.email || "")}</p>
      </div>

      <div class="settings-card">
        <h4 class="settings-card-title">Security Settings</h4>
        <div class="settings-row">
          <div class="settings-label-wrap">
            <span class="settings-label-main">Live Photo Capture</span>
            <span class="settings-label-sub">Silently log camera photo on password prompts</span>
          </div>
          <label class="switch">
            <input type="checkbox" id="live-photo-toggle" ${livePhotoChecked}>
            <span class="slider"></span>
          </label>
        </div>
      </div>
      
      <div class="settings-card info-card">
        <div class="info-row">
          <span class="info-icon">🔒</span>
          <p class="info-text">Photos captured on password entry are stored locally in your security logs tab for validation.</p>
        </div>
      </div>
    `;

    profileWrap.querySelector("#live-photo-toggle").addEventListener("change", async (e) => {
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

    container.appendChild(profileWrap);
  }
}

function openPeoplePanel() {
  const panel = document.getElementById("people-panel");
  panel.classList.add("active");
  // Default to search tab
  document.querySelectorAll(".people-tab").forEach(t => {
    t.classList.toggle("active", t.dataset.tab === "search");
  });
  renderPeopleTab("search");
  const searchInput = document.getElementById("people-search-input");
  if (searchInput) {
    searchInput.value = "";
    searchInput.focus();
  }
}

// =============================================================================
// FORM HELPERS
// =============================================================================
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
      if (response.Data.version !== localStorage.getItem("app_version")) {
        localStorage.setItem("app_version", response.Data.version);
        await fetch("/auth/flush-redis", { method: "POST" });
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
