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

function renderPeopleTab(tab) {
  const container = document.getElementById("people-tab-content");
  container.innerHTML = "";

  if (tab === "pending") {
    if (!State.pendingRequests.length) {
      container.innerHTML = `<div class="people-empty">No pending requests</div>`;
      return;
    }
    State.pendingRequests.forEach(req => {
      const item = document.createElement("div");
      item.className = "people-item";
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
          // Notify the sender
          socket?.emit("connection:accepted", { to: req.from.id });
          State.pendingRequests = State.pendingRequests.filter(r => r.connectionId !== req.connectionId);
          updateRequestsBadge();
          renderPeopleTab("pending");
          // Add to conversations immediately
          await bootstrapAfterLogin(); // re-sync
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
      container.innerHTML = `<div class="people-empty">No connections yet. Search for people to add!</div>`;
      return;
    }
    State.contacts.forEach(c => {
      const item = document.createElement("div");
      item.className = "people-item";
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
  document.getElementById("people-search-input").focus();
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
