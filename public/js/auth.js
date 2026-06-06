/**
 * auth.js — Login, signup, logout, and post-auth socket bootstrap.
 */

// =============================================================================
// SHARED: load all messages + init socket after login
// =============================================================================
async function bootstrapAfterLogin() {
    let allusersResponse = await alluser();
    if (allusersResponse.code === 200) {
        State.allusers = allusersResponse.Data.user.filter(
            u => u.username !== State.currentUser.username
        );
    }

    initChatList();

    const messResponse = await fetch("/allmessages", {
        method: "POST",
        headers: { "Content-type": "application/json" },
        body: JSON.stringify({ userId: State.currentUser.id })
    });

    const { ChatMesaage } = await messResponse.json();

    for (const element of ChatMesaage) {
        const chatUserId = element._id;
        const msgs = element.messages || [];
        State.messages[chatUserId] = msgs;

        for (const msg of msgs) {
            if (msg.id) State.messageIndex[msg.id] = msg.user;
        }

        const conv = State.conversations.find(c => c.id == chatUserId);
        if (!conv || !element.messages?.length) continue;

        const lastMsg = element.messages[0];
        conv.lastMessage = lastMsg.type === "text" ? lastMsg.content : `📷 ${lastMsg.type}`;
        conv.unread = element.unreadCount;
        conv.timestamp = lastMsg.timestamp || lastMsg.createdAt || Date.now();
    }

    State.apiMessagesLoaded = true;

    socket = io(BACKEND_URL, {
        auth: { userId: State.currentUser.id },
        reconnection: true,
        reconnectionAttempts: Infinity,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 10000,
        timeout: 10000,
        transports: ["websocket", "polling"]
    });

    initSocket();
    NetworkMonitor.isSocketConnected = socket.connected;
    renderChatList();
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
    const loginForm = document.getElementById('login-form');
    const signupForm = document.getElementById('signup-form');

    /* ─── LOGIN ─── */
    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const username = document.getElementById('login-username').value.trim();
        const password = document.getElementById('login-password').value;
        const submitBtn = loginForm.querySelector('.btn-primary');

        if (!username || !password) { showToast('Please fill in all fields', 'error'); return; }

        setButtonLoading(submitBtn, "Verifying...");
        try {
            const response = await loginuser({ username, password });
            if (response.code !== 200) {
                showToast(response.Data.message, 'error');
                resetButtonLoading(submitBtn);
                return;
            }
            State.currentUser = {
                id: response.Data.user.extra,
                username,
                avatar: response.Data.user.avatar
            };
            localStorage.setItem('SSC_USER', JSON.stringify(State.currentUser));
            if (response.Data.version !== localStorage.getItem("version")) {
                localStorage.setItem("version", response.Data.version);
                await fetch("/auth/flush-redis", { method: "POST" });
            }
            await bootstrapAfterLogin();
            resetButtonLoading(submitBtn);
            showToast('Logged in successfully!', 'success');
            showChatScreen();
            startTimeTicker();
        } catch (err) {
            resetButtonLoading(submitBtn);
            showToast('Server error. Please try again.', 'error');
        }
    });

    /* ─── SIGNUP ─── */
    signupForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const username = document.getElementById('signup-username').value.trim();
        const email = document.getElementById('signup-email').value.trim();
        const password = document.getElementById('signup-password').value;
        const confirmPassword = document.getElementById('signup-confirm-password').value;
        const submitBtn = signupForm.querySelector('.btn-primary');

        if (!username || !email || !password || !confirmPassword) {
            showToast('Please fill in all fields', 'error'); return;
        }
        if (password !== confirmPassword) { showToast('Passwords do not match', 'error'); return; }
        if (password.length < 6) { showToast('Password must be at least 6 characters', 'error'); return; }

        setButtonLoading(submitBtn, "Submitting...");
        try {
            const response = await createUser({
                username, email, password,
                extra: generateId(), phoneNumber: "9999999999", role: "user"
            });
            if (response.code !== 201) {
                showToast(response.Data.message, 'error');
                resetButtonLoading(submitBtn);
                return;
            }
            resetButtonLoading(submitBtn);
            showToast('Account created successfully!', 'success');
            showChatScreen();
        } catch (err) {
            resetButtonLoading(submitBtn);
            showToast('Server error. Please try again.', 'error');
        }
    });
}

// =============================================================================
// LOGOUT
// =============================================================================
function logout() {
    localStorage.removeItem('SSC_USER');
    State.currentUser = null;
    State.activeChat = null;
    State.conversations = [];
    State.messages = {};
    if (socket?.connected) socket.disconnect();
    document.getElementById('chat-screen').classList.remove('active');
    document.getElementById('login-screen').classList.add('active');
    showToast('Logged out successfully', 'success');
}

// =============================================================================
// INIT AUTH — runs on DOMContentLoaded
// =============================================================================
async function initAuth() {
    handelAuthForm();

    const toSignup = document.getElementById('to-signup');
    const toLogin = document.getElementById('to-login');
    toSignup.addEventListener('click', () => {
        document.getElementById('login-screen').classList.remove('active');
        document.getElementById('signup-screen').classList.add('active');
    });
    toLogin.addEventListener('click', () => {
        document.getElementById('signup-screen').classList.remove('active');
        document.getElementById('login-screen').classList.add('active');
    });

    const savedUser = localStorage.getItem('SSC_USER');
    if (savedUser) {
        document.getElementById("passwordOverlay").classList.add("active");
        State.currentUser = JSON.parse(savedUser);
        await bootstrapAfterLogin();
        showChatScreen();
        startTimeTicker();
    }
}
