/**
 * InstaChat - Instagram-style Chat Frontend
 * Pure JavaScript with no frameworks
 * Mobile-first, touch-optimized interactions
 */

// =============================================================================
// State Management
// =============================================================================
let socket = null;
let viewer = null

const State = {
    currentUser: null,
    activeChat: null,
    conversations: [],
    messages: {},
    typingTimeouts: {},
    replyingTo: null,
    longPressTimeout: null,
    touchStartX: 0,
    touchStartY: 0,
    isSwiping: false,
    allusers: [],
    playTune: true,
    messageIndex: {}
};
const UploadControllers = {};
let currentStream = null;
let mediaRecorder = null;
let audioChunks = [];
let isRecording = false;
let recordingStartTime = 0;
let recordingTimer = null;
let audioContext = null;
let analyser = null;
let animationId = null;
let recordedAudioBlob = null;

// Audio playback state
const audioPlayers = new Map(); // Store audio elements per message

function initSocket() {
    let tonePath = "/tone/notices.mp3"
    let tone = new Audio(tonePath)
    socket.on("private_message", (msg) => {
        tone.currentTime = 0
        const message = {
            id: msg.id,
            type: msg.type,
            content: msg.content,
            caption: msg.caption,
            sender: "other",
            timestamp: msg.timestamp,
            user: msg.from,
            replyTo: msg.replyTo,
            reactions: {},
            // showTime: msg.showTime,
            status: {
                sent: true,
                delivered: true,
                seen: false
            }
        }
        // Add to messages
        if (!State.messages[message.user]) {
            State.messages[message.user] = [];
        }
        State.messages[message.user].unshift(message);
        State.messageIndex[message.id] = message.user


        if (message.user == State.activeChat) {
            // if (State.playTune == true) {
            //     tone.play();
            // }
            const messagesContainer = document.getElementById('messages');


            const messageEl = createMessageElement(message);
            messagesContainer.appendChild(messageEl);

            // Scroll to bottom
            const container = document.getElementById('messages-container');
            container.scrollTop = container.scrollHeight;
            socket.emit("chat:seen", {
                from: State.activeChat
            });


        }
        const conv = State.conversations.find(c => c.id === message.user);
        if (conv) {
            conv.lastMessage = message.type === 'text' ? message.content : `📷 ${message.type}`;
            conv.timestamp = message.timestamp;
            if (State.activeChat != message.user) {

                conv.unread = conv.unread ? conv.unread + 1 : 1
            } else {
                conv.unread = 0
            }
        }
        renderChatList();
    });

    socket.on("typing:start", ({ user }) => {
        if (user !== State.activeChat) return;
        showTypingIndicator(true);

    });

    socket.on("typing:stop", ({ user }) => {
        if (user !== State.activeChat) return;
        showTypingIndicator(false);
    });


    socket.on("online:list", ({ users }) => {
        State.conversations.forEach(conv => {
            conv.online = users.includes(conv.id);
        });

        renderChatList();
    });

    socket.on("user:online", ({ userId }) => {
        const conv = State.conversations.find(c => c.id === userId);
        if (!conv) return;
        conv.online = true;
        const statusEl = document.getElementById('online-status');
        let lastseen = formatTime(new Date(conv.lastSeen).getTime())
        statusEl.textContent = conv.online ? 'Active now' : `${lastseen == "Just now" ? "Just now" : "Last seen " + lastseen + " Ago"}`;
        statusEl.className = `online-status ${conv.id == State.activeChat ? 'online' : ''}`;
        renderChatList();
    });

    socket.on("user:offline", async ({ userId }) => {
        const conv = State.conversations.find(c => c.id === userId);
        if (!conv) return;

        conv.online = false;
        conv.lastSeen = Date.now()
        let lastseen = formatTime(new Date(conv.lastSeen).getTime())
        const statusEl = document.getElementById('online-status');
        statusEl.textContent = conv.id == State.activeChat ? `${lastseen == "Just now" ? "Just now" : "Last seen " + lastseen + " Ago"}` : 'Active now';
        statusEl.className = `online-status ${conv.id == State.activeChat ? '' : 'online'}`;
        renderChatList();
    });

    socket.on("media:uploaded", ({ tempId, url, cover, thumb, mediaType }) => {
        updateMessageByTempId(tempId, {
            content: url,
            type: mediaType,
            cover: cover ?? null,
            thumb: thumb ?? null,
            uploadStatus: "uploaded"
        });
    });



    socket.on("message:delivered", ({ tempId }) => {
        updateMessageByTempId(tempId, {
            status: { delivered: true }
        });
    })

    socket.on("message:seen", ({ by }) => {
        updateMessageSeenByTempId(by)
    });

}

function updateMessageSeenByTempId(chatId) {
    const msgs = State.messages[chatId] || [];
    msgs.forEach(m => {
        if (m.status.delivered && !m.status.seen) {
            m.status.seen = true;
            const msgEl = document.querySelector(
                `.message[data-message-id="${m.id || m.tempId}"] .message-bubble`
            );
            if (!msgEl) return;


            let messageStatus = msgEl.querySelector(".message-status")

            let statusIcon = `
    <svg class="status-icon double seen" viewBox="0 0 16 16">
        <polyline points="2 8 6 12 14 4"/>
        <polyline points="5 8 9 12 17 4" style="transform: translate(-9px, 0px);"/>
    </svg>`;

            messageStatus.innerHTML = statusIcon
        }
    });
}


function updateMessageByTempId(tempId = null, updates, chatId = null) {
    /* ---------- 1 Update STATE ---------- */
    if (chatId == null) {
        chatId = State.messageIndex[tempId];
    }

    if (!chatId) return;

    const msgs = State.messages[chatId];
    if (!msgs) return;

    const msg = msgs.find(m => (m.tempId || m.id) === tempId);
    if (!msg) return;

    Object.assign(msg, updates);

    /* ---------- 2 Update DOM ---------- */
    const msgEl = document.querySelector(
        `.message[data-message-id="${tempId}"] .message-bubble`
    );
    if (!msgEl) return;

    /* ---------- Media update ---------- */
    if (updates.content || updates.cover) {
        if (updates.type != "audio") {
            const mediaContainer = msgEl.querySelector(".message-media");
            if (!mediaContainer) return;

            const mediaOverlay = mediaContainer.querySelector(".media-overlay");

            // choose preview source
            const previewSrc = updates.cover ?? updates.content;

            if (!previewSrc) return;

            /* ---------- IMAGE MESSAGE ---------- */
            if (updates.type === "image") {
                let img = mediaContainer.querySelector("img");

                const preloadImg = new Image();
                preloadImg.src = previewSrc;
                preloadImg.alt = "Image message";

                // preloadImg.onload = () => {
                if (!img) {
                    mediaContainer.innerHTML = "";
                    img = document.createElement("img");
                    mediaContainer.appendChild(img);
                }

                img.src = previewSrc;
                img.alt = "Image message";
                // };
            }

            /* ---------- VIDEO MESSAGE (THUMB ONLY) ---------- */
            if (updates.type === "video") {
                let img = mediaContainer.querySelector("img");
                let playIcon = mediaContainer.querySelector(".video-play-icon");

                const preloadImg = new Image();
                preloadImg.src = previewSrc;
                preloadImg.alt = "Video thumbnail";

                preloadImg.onload = () => {
                    if (!img) {
                        mediaContainer.innerHTML = "";

                        img = document.createElement("img");
                        img.className = "video-thumb";
                        mediaContainer.appendChild(img);

                        playIcon = document.createElement("div");
                        playIcon.className = "video-play-icon";
                        playIcon.innerHTML = "▶";
                        mediaContainer.appendChild(playIcon);

                        // click → play video
                        mediaContainer.onclick = () => {
                            playVideoInline(mediaContainer, updates.content);
                        };
                    }

                    img.src = previewSrc;
                    img.alt = "Video thumbnail";

                };
            }

            if (mediaOverlay) mediaOverlay.remove();
            attactEventOnMedia()
            viewer.addItem(msg)
        }
        // After the video section in updateMessageByTempId()
        if (updates.type === "audio") {
            const audioContainer = msgEl.querySelector(".message-audio");
            if (!audioContainer) return;

            // Replace loading state with player
            const newPlayer = createAudioPlayer(updates.content, msg.id || msg.tempId);
            audioContainer.replaceWith(newPlayer);
        }

    }


    /* ---------- Status update ---------- */
    if (updates.status || updates.content || updates.cover) {
        const messageStatus = msgEl.querySelector(".message-status");
        if (!messageStatus) return;

        let statusIcon = "";

        if (msg.status.seen) {
            statusIcon = `<svg class="status-icon double seen" viewBox="0 0 16 16" style="transform: translateX(3px);">
            <polyline points="2 8 6 12 14 4"/>
            <polyline points="5 8 9 12 17 4" style="transform: translate(-9px,0);"/>
            </svg>`;
        } else if (msg.status.delivered) {
            statusIcon = `
<svg class="status-icon double delivered" viewBox="0 0 16 16">
  <polyline points="2 8 6 12 14 4"/>
  <polyline points="5 8 9 12 17 4" style="transform: translate(-9px,0);"/>
</svg>`;
        } else {
            statusIcon = ` <svg class="status-icon single sent" viewBox="0 0 16 16">
        <polyline points="2 8 6 12 14 4"/>
    </svg>`
        }
        messageStatus.innerHTML = statusIcon;
    }

    const container = document.getElementById("messages-container");
    container.scrollTop = container.scrollHeight;
}


// send message to another user
function sendsocketMessage(message) {
    socket.emit("private_message", {
        message
    });
}
// =============================================================================
// Setup typing
// =============================================================================
function handleTyping() {
    const to = State.activeChat;
    if (!to) return;

    // init typing state if missing
    if (!State.typingTimeouts[to]) {
        State.typingTimeouts[to] = {
            isTyping: false,
            stopTimeout: null
        };
    }

    const typingState = State.typingTimeouts[to];

    // emit typing:start once
    if (!typingState.isTyping) {
        socket.emit("typing:start", { to });
        typingState.isTyping = true;
    }

    // reset stop timer
    clearTimeout(typingState.stopTimeout);

    typingState.stopTimeout = setTimeout(() => {
        socket.emit("typing:stop", { to });
        typingState.isTyping = false;
    }, 1000);
}


const EMOJI_LIST = ['❤️', '👍', '😂', '😮', '😢', '🙏', '🔥', '🎉', '👏', '💯', '✨', '💪', '🤔', '😍', '🥳', '😎'];

// =============================================================================
// Utility Functions
// =============================================================================

function generateId() {
    return Date.now() + Math.random().toString(36).substr(2, 9);
}

function formatTime(timestamp) {
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now - date;
    // Less than a minute
    if (diff < 60000) return 'Just now';

    // Less than an hour
    if (diff < 3600000) {
        const mins = Math.floor(diff / 60000);
        return `${mins}m`;
    }

    // Less than a day
    if (diff < 86400000) {
        const hours = Math.floor(diff / 3600000);
        return `${hours}h`;
    }

    // Less than a week
    if (diff < 604800000) {
        const days = Math.floor(diff / 86400000);
        return `${days}d`;
    }

    // Format as date
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;

    container.appendChild(toast);

    setTimeout(() => {
        toast.style.animation = 'toastSlide 0.3s ease reverse';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

function sanitizeInput(input) {
    const div = document.createElement('div');
    div.textContent = input;
    return div.innerHTML;
}

// =============================================================================
// Authentication
// =============================================================================

async function initAuth() {

    const toSignup = document.getElementById('to-signup');
    const toLogin = document.getElementById('to-login');

    // Check if user is already logged in
    handelAuthForm()
    // Toggle between login and signup
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
        // Add small delay for smooth transition

        let allusersresponse = await alluser()
        if (allusersresponse.code == 200) {
            State.allusers = allusersresponse.Data.user.filter(u => u.username != State.currentUser.username)
        }
        initChatList();
        let messResponse = await fetch("/allmessages", {
            method: "POST",
            headers: {
                "Content-type": "application/json"
            },
            body: JSON.stringify({ userId: State.currentUser.id })
        })

        let { ChatMesaage } = await messResponse.json()
        for (const element of ChatMesaage) {
            const chatUserId = element._id;
            // 1️⃣ Store messages safely
            const msgs = element.messages || [];
            State.messages[chatUserId] = msgs;

            for (const msg of msgs) {
                if (msg.id) {
                    State.messageIndex[msg.id] = msg.user;
                }
            }

            // 2️⃣ Update conversation preview
            const conv = State.conversations.find(c => c.id == chatUserId);
            if (!conv || !element.messages || element.messages.length === 0) continue;
            const lastMsg = element.messages[0];


            conv.lastMessage =
                lastMsg.type === "text"
                    ? lastMsg.content
                    : `📷 ${lastMsg.type}`;

            conv.unread = element.unreadCount
            // 3️⃣ Use REAL timestamp (not Date.now)
            conv.timestamp = lastMsg.timestamp || lastMsg.createdAt || Date.now();


        }
        socket = io({
            auth: {
                userId: State.currentUser.id
            }
        });
        initSocket()
        renderChatList();
        showChatScreen();
        return;
    }
    // No saved user, hide loader and show login
    hideLoader();





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



function handelAuthForm() {
    // Login form

    const loginForm = document.getElementById('login-form');
    const signupForm = document.getElementById('signup-form');
    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        const username = document.getElementById('login-username').value.trim();
        const password = document.getElementById('login-password').value;
        const submitBtn = loginForm.querySelector('.btn-primary');

        if (!username || !password) {
            showToast('Please fill in all fields', 'error');
            return;
        }

        setButtonLoading(submitBtn, "Verifying...");

        try {
            let response = await loginuser({ username, password });

            if (response.code !== 200) {
                showToast(response.Data.message, 'error');
                resetButtonLoading(submitBtn);
                return;
            }

            // ✅ success flow (unchanged)
            const user = {
                id: response.Data.user.extra,
                username,
                avatar: response.Data.user.avatar
            };

            State.currentUser = user;
            localStorage.setItem('SSC_USER', JSON.stringify(user));

            let allusersresponse = await alluser();
            if (allusersresponse.code === 200) {
                State.allusers = allusersresponse.Data.user.filter(
                    u => u.username !== State.currentUser.username
                );
            }

            initChatList();

            let messResponse = await fetch("/allmessages", {
                method: "POST",
                headers: {
                    "Content-type": "application/json"
                },
                body: JSON.stringify({ userId: State.currentUser.id })
            })

            let { ChatMesaage } = await messResponse.json()
            for (const element of ChatMesaage) {
                const chatUserId = element._id;
                // 1️⃣ Store messages safely
                const msgs = element.messages || [];
                State.messages[chatUserId] = msgs;

                for (const msg of msgs) {
                    if (msg.id) {
                        State.messageIndex[msg.id] = msg.user;
                    }
                }

                // 2️⃣ Update conversation preview
                const conv = State.conversations.find(c => c.id == chatUserId);
                if (!conv || !element.messages || element.messages.length === 0) continue;

                const lastMsg = element.messages[0];


                conv.lastMessage =
                    lastMsg.type === "text"
                        ? lastMsg.content
                        : `📷 ${lastMsg.type}`;

                conv.unread = element.unreadCount
                // 3️⃣ Use REAL timestamp (not Date.now)
                conv.timestamp = lastMsg.timestamp || lastMsg.createdAt || Date.now();


            }

            socket = io({ auth: { userId: State.currentUser.id } });
            initSocket();
            renderChatList();

            resetButtonLoading(submitBtn);
            showToast('Logged in successfully!', 'success');
            showChatScreen();

        } catch (err) {
            resetButtonLoading(submitBtn);
            showToast('Server error. Please try again.', 'error');
        }
    });

    signupForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        const username = document.getElementById('signup-username').value.trim();
        const email = document.getElementById('signup-email').value.trim();
        const password = document.getElementById('signup-password').value;
        const confirmPassword = document.getElementById('signup-confirm-password').value;
        const submitBtn = signupForm.querySelector('.btn-primary');

        if (!username || !email || !password || !confirmPassword) {
            showToast('Please fill in all fields', 'error');
            return;
        }

        if (password !== confirmPassword) {
            showToast('Passwords do not match', 'error');
            return;
        }

        if (password.length < 6) {
            showToast('Password must be at least 6 characters', 'error');
            return;
        }

        setButtonLoading(submitBtn, "Submitting...");

        try {
            let response = await createUser({
                username,
                email,
                password,
                extra: generateId(),
                phoneNumber: "9999999999",
                role: "user"
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

function logout() {
    localStorage.removeItem('SSC_USER');
    State.currentUser = null;
    State.activeChat = null;
    State.conversations = [];
    State.messages = {};
    if (socket && socket.connected) {
        socket.disconnect(); // 🔑 force disconnect
    }

    document.getElementById('chat-screen').classList.remove('active');
    document.getElementById('login-screen').classList.add('active');
    // handelAuthForm()
    showToast('Logged out successfully', 'success');
}

// =============================================================================
// Chat Screen
// =============================================================================

function showChatScreen() {
    document.getElementById('login-screen').classList.remove('active');
    document.getElementById('signup-screen').classList.remove('active');
    document.getElementById('chat-screen').classList.add('active');

    // Update current user info
    document.getElementById('current-username').textContent = State.currentUser.username;
    const currentUserAvatar = document.getElementById('current-user-avatar');
    currentUserAvatar.innerHTML = `<span>${State.currentUser.avatar}</span>`;


    initChatWindow();
    initMobileNavigation();
}

// =============================================================================
// Chat List
// =============================================================================

function initChatList() {
    // Initialize mock conversations
    State.conversations = State.allusers.map(user => ({
        id: user.extra,
        username: user.username,
        avatar: user.username.charAt(0).toUpperCase(),
        lastSeen: user.lastSeen,
        timestamp: user.timestamp ? user.timestamp : 0
    }));


    renderChatList();

    // Logout button
    document.getElementById('logout-btn').addEventListener('click', logout);
}

function renderChatList() {
    const chatList = document.getElementById('chat-list');
    chatList.innerHTML = '';

    State.conversations.sort((a, b) => b.timestamp - a.timestamp)
    State.conversations.forEach(conv => {
        const item = document.createElement('div');
        item.className = `chat-item ${State.activeChat === conv.id ? 'active' : ''}`;

        item.innerHTML = `
            <div class="avatar ${conv.online ? 'online' : ''}">
                <span>${conv.avatar}</span>
            </div>
            <div class="chat-item-content">
                <div class="chat-item-header">
                    <span class="chat-item-username">${conv.username}</span>
                     <span class="chat-item-time">${conv.timestamp ? formatTime(conv.timestamp) : ""}</span>
                </div>
                 <div class="chat-item-preview ${conv.unread > 0 ? 'unread' : ''}">
                    <span>${conv.lastMessage ? conv.lastMessage : ""}</span>
                </div>
               
            </div>
            ${conv.unread > 0 ? `<span class="unread-badge">${conv.unread}</span>` : ''}
        `;

        item.addEventListener('click', () => openChat(conv.id));
        chatList.appendChild(item);
    });
}

function openChat(chatId) {
    State.activeChat = chatId;
    const conv = State.conversations.find(c => c.id === chatId);
    const messageInput = document.getElementById('message-input');

    if (!conv) return;
    // Mark as read
    conv.unread = 0;
    renderChatList();

    socket.emit("chat:seen", {
        from: chatId
    });

    // Update UI
    document.getElementById('chat-empty-state').style.display = 'none';
    document.getElementById('active-chat').style.display = 'flex';
    messageInput.value = ""
    messageInput.focus()

    // Update header
    document.getElementById('chat-avatar').innerHTML = `<span>${conv.avatar}</span>`;
    document.getElementById('chat-username').textContent = conv.username;
    const statusEl = document.getElementById('online-status');
    let lastseen = formatTime(new Date(conv.lastSeen).getTime())
    statusEl.textContent = conv.online ? 'Active now' : `${lastseen == "Just now" ? "Just now" : "Last seen " + lastseen + " Ago"}`;
    statusEl.className = `online-status ${conv.online ? 'online' : ''}`;

    // Render messages
    renderMessages(chatId);

    // Mobile: show chat window
    if (window.innerWidth < 768) {
        document.getElementById('chat-list-sidebar').classList.add('hidden');
        document.getElementById('chat-window').classList.add('active');
    }

    document.getElementById("chatOption").classList.remove("active");
    document.getElementById("chat-info-btn").addEventListener("click", () => {
        document.getElementById("chatOption").classList.add("active")
    })

    document.getElementById("chatOption-button").addEventListener("click", async () => {
        State.messages[State.activeChat] = []
        renderMessages(State.activeChat)

        let conv = State.conversations.find(c => c.id == State.activeChat)
        conv.lastMessage = ""
        conv.unread = 0
        conv.timestamp = 0;
        renderChatList()
        document.getElementById("chatOption").classList.remove("active")
        await fetch("/api/deletechat", {
            method: "POST",
            headers: {
                "Content-type": "application/json"
            },
            body: JSON.stringify({ activeUser: State.currentUser.id, to: State.activeChat })
        })

    })


    const muteBtn = document.getElementById("chatOption-Mute");

    muteBtn.addEventListener("click", (e) => {
        document.getElementById("chatOption").classList.remove("active");

        const btn = e.currentTarget;
        // const isplayTune = btn.dataset.playTune == "true";/
        let tuneatt = btn.getAttribute("data-playTune")

        const isplayTune = tuneatt == "true" ? true : false
        if (isplayTune) {
            // MUTE
            btn.setAttribute("data-playTune", "false")
            localStorage.setItem("playTune", true);
            State.playTune = false
            showToast("Chat Muted", "success");

            btn.innerHTML = `
       <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/>
                    <path d="M15.54 8.46a5 5 0 0 1 0 7.07"/>
                    <path d="M19.07 4.93a10 10 0 0 1 0 14.14"/>
                </svg> Unmute
    `;
        } else {
            // UNMUTE
            btn.setAttribute("data-playTune", "true")
            localStorage.setItem("playTune", false);
            State.playTune = true
            showToast("Chat Unmuted", "success");

            btn.innerHTML = `
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/>
        <path d="M15.54 8.46a5 5 0 0 1 0 7.07"/>
        <path d="M19.07 4.93a10 10 0 0 1 0 14.14"/>
      </svg> Mute
    `;
        }
    });



}

// =============================================================================
// Messages
// =============================================================================

function renderMessages(chatId) {
    const messagesContainer = document.getElementById('messages');
    messagesContainer.innerHTML = '';

    const messages = State.messages[chatId] || [];
    for (let i = messages.length - 1; i >= 0; i--) {
        const msg = messages[i];
        const messageEl = createMessageElement(msg);
        messagesContainer.appendChild(messageEl);
    }
    // Scroll to bottom
    const container = document.getElementById('messages-container');
    container.scrollTop = container.scrollHeight;
    // Initialize the media viewer
    viewer = new MediaViewer(chatId);
    attactEventOnMedia();
}

function attactEventOnMedia() {
    document.querySelectorAll(".message-media").forEach(media => {
        const clean = media.cloneNode(true); // removes listeners
        media.replaceWith(clean);

        clean.addEventListener("click", () => {
            const msgEl = clean.closest('.message');
            const messageId = msgEl.dataset.messageId;
            const index = viewer.getIndexByMessageId(messageId);
            if (index !== -1) viewer.open(index);
        });
    });


}


function createMessageElement(msg) {
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${msg.user == State.currentUser.username || msg.user == State.currentUser.id ? "self" : "other"}`;
    messageDiv.dataset.messageId = msg.id ? msg.id : msg.tempId;

    const bubbleDiv = document.createElement('div');
    bubbleDiv.className = 'message-bubble';

    // Reply preview
    if (msg.replyTo) {
        const replyMsg = findMessageById(msg.replyTo);
        if (replyMsg) {
            if (replyMsg.type == "text") {
                const replyPreview = document.createElement('div');
                replyPreview.className = 'message-reply-preview';
                replyPreview.innerHTML = `
                    <div class="reply-username">${replyMsg.user === State.currentUser.id || replyMsg.user === State.currentUser.username ? 'You' : State.conversations.find(c => c.id === State.activeChat)?.username}</div>
                    <div class="reply-text">${replyMsg.content}</div>
                `;
                replyPreview.addEventListener('click', (e) => {
                    e.stopPropagation();
                    scrollToMessage(msg.replyTo);
                });
                bubbleDiv.appendChild(replyPreview);
            } else {
                const replyPreview = document.createElement('div');
                replyPreview.className = 'message-reply-preview';
                replyPreview.innerHTML = `
                    <div class="reply-username">${replyMsg.user === State.currentUser.id || replyMsg.user === State.currentUser.username ? 'You' : State.conversations.find(c => c.id === State.activeChat)?.username}</div>
                    <div class="reply-image">
                    <img src="${replyMsg.content}">
                    </div>
                `;
                replyPreview.addEventListener('click', (e) => {
                    e.stopPropagation();
                    scrollToMessage(msg.replyTo);
                });
                bubbleDiv.appendChild(replyPreview);
            }
        }
    }

    // Media content
    if ((msg.type === 'image' || msg.type === 'video') && msg.content != null) {
        const mediaDiv = document.createElement('div');
        mediaDiv.className = 'message-media';

        const overlay = document.createElement('div');
        overlay.className = 'media-overlay';

        if (msg.uploadStatus === "uploading") {
            overlay.innerHTML = `
                <div class="loader"></div>
                <button class="media-cancel">✕</button>
            `;
            mediaDiv.appendChild(overlay);
        }

        if (msg.uploadStatus === "failed") {
            overlay.innerHTML = `
                    <button class="media-retry">Retry</button>
                `;
            mediaDiv.appendChild(overlay);
        }

        if (msg.type === 'image') {
            const img = document.createElement('img');
            img.src = msg.cover ?? msg.content;
            img.alt = "Image message";
            mediaDiv.appendChild(img);
        }

        if (msg.type === "video") {
            const thumb = document.createElement("img");
            thumb.className = "video-thumb";

            const playIcon = document.createElement("div");
            playIcon.className = "video-play-icon";
            playIcon.innerHTML = "▶";

            mediaDiv.appendChild(thumb);
            mediaDiv.appendChild(playIcon);

            if (msg.cover) {
                thumb.src = msg.cover;
            } else {
                // 2️⃣ generate thumbnail from video blob
                generateVideoThumbnail(msg.content).then((dataUrl) => {
                    thumb.src = dataUrl.url;
                    msg.cover = dataUrl.url; // cache it for reuse
                });
            }
        }
        bubbleDiv.appendChild(mediaDiv);
    }
    if ((msg.type === 'image' || msg.type === 'video') && msg.content == null) {
        const mediaDiv = document.createElement('div');
        mediaDiv.className = 'message-media';
        mediaDiv.textContent = msg.type + "  loading.."
        bubbleDiv.appendChild(mediaDiv);
    }



    if (msg.type === "audio" && msg.content != null) {
        const audioPlayer = createAudioPlayer(msg.content, msg.id || msg.tempId);
        bubbleDiv.appendChild(audioPlayer);
    }

    if (msg.type === "audio" && msg.content == null) {
        const audioDiv = document.createElement("div");
        audioDiv.className = "message-audio";
        audioDiv.textContent = "Loading voice message...";
        bubbleDiv.appendChild(audioDiv);
    }
    // Text content
    if (msg.type === 'text' || msg.caption) {
        const textDiv = document.createElement('div');
        textDiv.classList.add("messag-text")
        const text = msg.caption || msg.content;
        textDiv.innerHTML = makeLinksClickable(text);
        bubbleDiv.appendChild(textDiv);
    }

    // Reactions
    if (msg.reactions && Object.keys(msg.reactions).length > 0) {
        const reactionsDiv = document.createElement('div');
        reactionsDiv.className = 'message-reactions';

        Object.entries(msg.reactions).forEach(([emoji, users]) => {
            const reactionBtn = document.createElement('button');
            reactionBtn.className = `reaction ${users.includes(State.currentUser.id) ? 'active' : ''}`;
            reactionBtn.innerHTML = `<span>${emoji}</span><span>${users.length}</span>`;
            reactionBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                toggleReaction(msg.id, emoji);
            });
            reactionsDiv.appendChild(reactionBtn);
        });

        bubbleDiv.appendChild(reactionsDiv);
    }



    // Status and time for sent messages
    if (msg.user === State.currentUser.username || msg.user === State.currentUser.id) {
        const statusDiv = document.createElement('div');
        statusDiv.className = 'message-status';

        let statusIcon = "";

        if (msg.status.seen) {
            statusIcon = `
            <svg class="status-icon double seen" viewBox="0 0 16 16" style="
                transform: translateX(3px);
            ">
            <polyline points="2 8 6 12 14 4"/>
            <polyline points="5 8 9 12 17 4" style="transform: translate(-9px,0);"/>
            </svg>`;
        }
        else if (msg.status.delivered) {
            statusIcon = `
    <svg class="status-icon double delivered" viewBox="0 0 16 16">
        <polyline points="2 8 6 12 14 4"/>
        <polyline points="5 8 9 12 17 4" style="transform: translate(-9px, 0px);"/>
    </svg>`;
        }
        else {
            statusIcon = `
            <svg class="status-icon single sent" viewBox="0 0 16 16">
                <polyline points="2 8 6 12 14 4"/>
            </svg>`;
        }

        if (msg.uploadStatus === "uploading" || msg.uploadStatus === "failed") {
            statusIcon = `<svg class="status-icon clock" viewBox="0 0 16 16">
                    <circle cx="8" cy="8" r="6.5"/>
                    <polyline points="8 4 8 8 11 10"/>
                </svg>`
        }

        statusDiv.innerHTML = statusIcon;
        bubbleDiv.appendChild(statusDiv);
    }

    messageDiv.appendChild(bubbleDiv);
    const timeDiv = document.createElement('div');
    timeDiv.className = 'message-time';
    timeDiv.textContent = formatTime(msg.timestamp);
    messageDiv.appendChild(timeDiv);

    // Add touch gestures
    addMessageGestures(messageDiv, msg);

    return messageDiv;
}


function makeLinksClickable(text) {
    if (!text) return "";

    // Escape HTML first (prevents XSS)
    const escaped = text
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");

    // Detect:
    // 1) http:// or https://
    // 2) www.domain.com
    // 3) domain.com / domain.in / domain.co.in etc.
    const urlRegex = /((https?:\/\/[^\s]+)|(www\.[^\s]+)|([a-zA-Z0-9-]+\.[a-zA-Z]{2,}(\/[^\s]*)?))/g;

    return escaped.replace(urlRegex, (match) => {
        let href = match;

        // If no protocol, add https://
        if (!href.startsWith("http")) {
            href = "https://" + href;
        }

        return `<a href="${href}" target="_blank" rel="noopener noreferrer">${match}</a>`;
    });
}

function addMessageGestures(messageEl, msg) {
    let touchStartTime;
    let touchStartX;
    let touchStartY;

    messageEl.addEventListener('touchstart', (e) => {
        touchStartTime = Date.now();
        touchStartX = e.touches[0].clientX;
        touchStartY = e.touches[0].clientY;

        // Long press for reactions
        longPressTimer = setTimeout(() => {
            navigator.vibrate && navigator.vibrate(50);
            messageEl.querySelector('.message-bubble').classList.add('long-press');
            showEmojiPicker(msg.id);
        }, 500);
    });

    messageEl.addEventListener('touchmove', (e) => {
        const touchX = e.touches[0].clientX;
        const touchY = e.touches[0].clientY;
        const deltaX = touchX - touchStartX;
        const deltaY = Math.abs(touchY - touchStartY);

        // If moving too much vertically, cancel long press
        if (deltaY > 10) {
            clearTimeout(longPressTimer);
        }

        // Swipe to reply (only for horizontal swipes)
        if (Math.abs(deltaX) > 30 && deltaY < 20) {
            clearTimeout(longPressTimer);
            messageEl.classList.add('swiping');
            messageEl.style.setProperty('--swipe-x', `${Math.min(deltaX, 60)}px`);
        }
    });

    messageEl.addEventListener('touchend', (e) => {
        clearTimeout(longPressTimer);
        messageEl.querySelector('.message-bubble').classList.remove('long-press');

        const touchEndX = e.changedTouches[0].clientX;
        const deltaX = touchEndX - touchStartX;
        const touchDuration = Date.now() - touchStartTime;

        // Swipe to reply
        if (Math.abs(deltaX) > 60 && touchDuration < 500) {
            replyToMessage(msg);
        }

        // Reset swipe
        messageEl.classList.remove('swiping');
        messageEl.style.setProperty('--swipe-x', '0');
    });

    // Desktop: long click for reactions
    messageEl.addEventListener("dblclick", (e) => {
        showEmojiPicker(msg.id);
    });


    // messageEl.addEventListener('mouseup', () => {
    //     clearTimeout(longPressTimer);
    // });

    // messageEl.addEventListener('mouseleave', () => {
    //     clearTimeout(longPressTimer);
    // });
}

function findMessageById(messageId) {
    if (!State.activeChat) return null;
    const messages = State.messages[State.activeChat];
    return messages.find(m => m.id === messageId || m.tempId == messageId);
}

function scrollToMessage(messageId) {
    const messageEl = document.querySelector(`[data-message-id="${messageId}"]`);
    if (messageEl) {
        messageEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
        messageEl.style.animation = 'none';
        setTimeout(() => {
            messageEl.style.animation = 'messageSlide 0.3s ease';
        }, 10);
    }
}

// =============================================================================
// Chat Input
// =============================================================================

function initChatWindow() {
    const messageInput = document.getElementById('message-input');
    const sendBtn = document.getElementById('send-btn');
    const mediaBtn = document.getElementById('media-btn');
    const mediaInput = document.getElementById('media-input');
    const backBtn = document.getElementById('back-btn');
    const cancelReplyBtn = document.getElementById('cancel-reply');

    // Enable/disable send button
    messageInput.addEventListener('input', () => {
        sendBtn.disabled = !messageInput.value.trim();

        // Simulate typing indicator for other user
        if (messageInput.value.trim() && State.activeChat) {
            handleTyping()
        }
    });

    document.addEventListener("paste", async (e) => {

        const items = e.clipboardData?.items;
        if (!items) return;

        for (let item of items) {

            if (item.type.startsWith("image/")) {

                e.preventDefault();

                const blob = item.getAsFile();

                if (!blob) return;

                handlePastedImage(blob);
            }
        }
    });

    // Send message on Enter (desktop)
    messageInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    });

    // Send button
    sendBtn.addEventListener('click', () => {
        sendMessage()
    });

    // Media button
    mediaBtn.addEventListener('click', () => {
        mediaInput.click();
    });

    // Media input
    mediaInput.addEventListener("change", async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        //  Allow only one file
        if (e.target.files.length > 1) {
            showToast("Only one file allowed", "error");
            mediaInput.value = "";
            return;
        }
        // Validate type
        if (
            !file.type.startsWith("image/") &&
            !file.type.startsWith("video/")
        ) {
            showToast("Only image or video allowed", "error");
            mediaInput.value = "";
            return;
        }
        handelMedia(file)
    });
    initVoiceRecording()
    // Back button (mobile)
    backBtn.addEventListener('click', () => {
        document.getElementById('chat-list-sidebar').classList.remove('hidden');
        document.getElementById('chat-window').classList.remove('active');
        State.activeChat = null;
    });

    // Cancel reply
    cancelReplyBtn.addEventListener('click', () => {
        State.replyingTo = null;
        document.getElementById('reply-preview').style.display = 'none';
    });
}

async function handelMedia(file) {
    const fileUrl = URL.createObjectURL(file);
    let activeChatOnline = State.conversations.find(c => c.id == State.activeChat)
    const message = {
        tempId: generateId(),
        type: file.type.split("/")[0],
        content: fileUrl,
        uploadStatus: "uploading", // uploading | failed | uploaded
        uploadProgress: 0,
        caption: null,
        clientTime: Date.now(),
        replyTo: State.replyingTo,
        user: State.currentUser.username,
        status: { sent: true, delivered: activeChatOnline.online, seen: false },
        timestamp: Date.now()
    };
    const conv = State.conversations.find(c => c.id === State.activeChat);
    if (conv) {
        conv.lastMessage = `📷 ${file.type.split("/")[0]}`;
        conv.timestamp = Date.now();
    }
    const messagesContainer = document.getElementById('messages');


    const messageEl = createMessageElement(message);
    messagesContainer.appendChild(messageEl);


    // Scroll to bottom
    const container = document.getElementById('messages-container');
    container.scrollTop = container.scrollHeight;
    renderChatList()
    // ✅ Send Cloudinary URL to chat
    sendMessage(message.type, null, message.tempId);

    try {
        showToast("Uploading...", "info");

        uploadMedia(message.tempId, State.activeChat, file)


    } catch (err) {
        showToast("Upload failed", "error");
        console.error(err);
    } finally {
        mediaInput.value = ""; // reset
    }
}

function handlePastedImage(blob) {

    const file = new File(
        [blob],
        `pasted-${Date.now()}.png`,
        { type: blob.type }
    );

    handelMedia(file);
}
// =============================================================================
// VOICE RECORDING SYSTEM
// =============================================================================

function initVoiceRecording() {
    const micBtn = document.getElementById("mic-btn");
    const voiceUI = document.getElementById("voiceRecordingUI");
    const messageInput = document.getElementById("message-input");
    const sendBtn = document.getElementById("send-btn");
    const mediaBtn = document.getElementById("media-btn");
    const cancelBtn = document.getElementById("voiceCancelBtn");
    const sendVoiceBtn = document.getElementById("voiceSendBtn");

    micBtn.addEventListener("click", async () => {
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            showToast("Mic not supported in this browser", "error");
            return;
        }

        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            startRecording(stream);
        } catch (err) {
            console.error(err);
            showToast("Mic permission denied", "error");
        }
    });

    cancelBtn.addEventListener("click", () => {
        stopRecording(false);
    });

    sendVoiceBtn.addEventListener("click", () => {
        stopRecording(true);
    });

    function startRecording(stream) {
        mediaRecorder = new MediaRecorder(stream);
        audioChunks = [];
        isRecording = true;
        recordingStartTime = Date.now();
        currentStream = stream;
        // Show recording UI
        voiceUI.style.display = "flex";
        messageInput.style.display = "none";
        sendBtn.style.display = "none";
        micBtn.style.display = "none";
        mediaBtn.style.display = "none";

        // Setup audio visualization
        setupAudioVisualization(stream);

        // Start timer
        updateRecordingTimer();
        recordingTimer = setInterval(updateRecordingTimer, 100);

        mediaRecorder.ondataavailable = (e) => {
            if (e.data.size > 0) audioChunks.push(e.data);
        };

        mediaRecorder.onstop = () => {
            stream.getTracks().forEach(track => track.stop());
            clearInterval(recordingTimer);
            cancelAnimationFrame(animationId);
            if (audioContext) audioContext.close();
        };

        mediaRecorder.start();
        navigator.vibrate && navigator.vibrate(50);
    }

    function stopRecording(shouldSend) {
        // if (!mediaRecorder || mediaRecorder.state === "inactive") return;

        isRecording = false;

        // Hide recording UI
        voiceUI.style.display = "none";
        messageInput.style.display = "block";
        sendBtn.style.display = "flex";
        micBtn.style.display = "flex";
        mediaBtn.style.display = "flex";
        if (!mediaRecorder || mediaRecorder.state === "inactive") return;

        mediaRecorder.onstop = () => {
            currentStream.getTracks().forEach(track => track.stop());
            clearInterval(recordingTimer);
            cancelAnimationFrame(animationId);
            if (audioContext) audioContext.close();

            if (shouldSend && audioChunks.length > 0) {
                const recordedAudioBlob = new Blob(audioChunks, { type: "audio/webm" });
                sendVoiceMessage(recordedAudioBlob);
            }

            audioChunks = [];
        };

        mediaRecorder.stop();

        // Clear canvas
        const canvas = document.getElementById("voiceWaveformCanvas");
        const ctx = canvas.getContext("2d");
        ctx.clearRect(0, 0, canvas.width, canvas.height);
    }

    function setupAudioVisualization(stream) {
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
        analyser = audioContext.createAnalyser();
        const source = audioContext.createMediaStreamSource(stream);
        source.connect(analyser);

        analyser.fftSize = 128;
        const bufferLength = analyser.frequencyBinCount;
        const dataArray = new Uint8Array(bufferLength);

        const canvas = document.getElementById("voiceWaveformCanvas");
        const ctx = canvas.getContext("2d");

        // Set canvas size
        canvas.width = canvas.offsetWidth * 2;
        canvas.height = canvas.offsetHeight * 2;
        ctx.scale(2, 2);

        function draw() {
            if (!isRecording) return;
            animationId = requestAnimationFrame(draw);

            analyser.getByteFrequencyData(dataArray);

            const width = canvas.width / 2;
            const height = canvas.height / 2;

            ctx.clearRect(0, 0, width, height);

            const barWidth = (width / bufferLength) * 1.5;
            const barGap = 2;
            let x = 0;

            for (let i = 0; i < bufferLength; i++) {
                const barHeight = (dataArray[i] / 255) * height * 0.8;

                const gradient = ctx.createLinearGradient(0, height - barHeight, 0, height);
                gradient.addColorStop(0, "#667eea");
                gradient.addColorStop(1, "#764ba2");

                ctx.fillStyle = gradient;
                ctx.fillRect(x, height - barHeight, barWidth - barGap, barHeight);

                x += barWidth;
            }
        }

        draw();
    }

    function updateRecordingTimer() {
        const elapsed = Date.now() - recordingStartTime;
        const minutes = Math.floor(elapsed / 60000);
        const seconds = Math.floor((elapsed % 60000) / 1000);
        document.getElementById("voiceTimer").textContent =
            `${minutes}:${seconds.toString().padStart(2, '0')}`;
    }
}



async function sendVoiceMessage(audioBlob) {
    const audioUrl = URL.createObjectURL(audioBlob);
    let activeChatOnline = State.conversations.find(c => c.id === State.activeChat);

    const message = {
        tempId: generateId(),
        type: "audio",
        content: audioUrl,
        uploadStatus: "uploading",
        caption: null,
        clientTime: Date.now(),
        replyTo: State.replyingTo,
        user: State.currentUser.username,
        status: { sent: true, delivered: activeChatOnline.online, seen: false },
        timestamp: Date.now(),
        duration: 0 // Will be set after upload
    };

    // Add to state
    if (!State.messages[State.activeChat]) {
        State.messages[State.activeChat] = [];
    }
    State.messages[State.activeChat].unshift(message);
    State.messageIndex[message.tempId] = State.activeChat;

    // Update conversation preview
    const conv = State.conversations.find(c => c.id === State.activeChat);
    if (conv) {
        conv.lastMessage = "🎤 Voice message";
        conv.timestamp = Date.now();
    }

    // Render to DOM
    const messagesContainer = document.getElementById("messages");
    const messageEl = createMessageElement(message);
    messagesContainer.appendChild(messageEl);

    const container = document.getElementById("messages-container");
    container.scrollTop = container.scrollHeight;

    renderChatList();

    // Send socket message
    message.to = State.activeChat;
    message.content = null
    sendsocketMessage(message);

    // Upload audio
    try {
        await uploadAudio(message.tempId, State.activeChat, audioBlob);
    } catch (err) {
        showToast("Upload failed", "error");
        console.error(err);
    }
}

async function uploadAudio(msgId, receiver, audioBlob) {
    const controller = new AbortController();
    UploadControllers[msgId] = controller;

    try {
        const formData = new FormData();
        formData.append("file", audioBlob, "voice.webm");

        const res = await fetch("/api/upload", {
            method: "POST",
            body: formData,
            signal: controller.signal
        });

        if (!res.ok) throw new Error("Upload failed");

        const data = await res.json();

        socket.emit("media:uploaded", {
            tempId: msgId,
            to: receiver,
            url: data.original,
            cover: null,
            thumb: null,
            mediaType: "audio"
        });

    } catch (err) {
        if (err.name === "AbortError") return;

        updateMessageByTempId(msgId, {
            uploadStatus: "failed"
        });
    } finally {
        delete UploadControllers[msgId];
    }
}

// =============================================================================
// AUDIO MESSAGE PLAYER
// =============================================================================

// Add this to your existing audio player code

function createAudioPlayer(audioUrl, messageId) {
    const container = document.createElement("div");
    container.className = "message-audio";
    container.dataset.audioId = messageId;

    const playBtn = document.createElement("button");
    playBtn.className = "audio-play-btn";
    playBtn.innerHTML = `
        <svg viewBox="0 0 24 24" fill="currentColor">
            <path d="M8 5v14l11-7z"/>
        </svg>
    `;

    const waveformContainer = document.createElement("div");
    waveformContainer.className = "audio-waveform";
    const canvas = document.createElement("canvas");
    waveformContainer.appendChild(canvas);

    const timeLabel = document.createElement("div");
    timeLabel.className = "audio-time";
    timeLabel.textContent = "0:00";

    container.appendChild(playBtn);
    container.appendChild(waveformContainer);
    container.appendChild(timeLabel);

    // Create audio element
    const audio = new Audio(audioUrl);
    audioPlayers.set(messageId, audio);

    // 🔑 Mobile-specific audio configuration
    audio.preload = "metadata"; // Faster loading on mobile
    audio.crossOrigin = "anonymous";

    // Draw static waveform
    drawStaticWaveform(canvas);

    // Play/pause functionality
    let isPlaying = false;

    playBtn.addEventListener("click", (e) => {
        e.stopPropagation(); // Prevent message gestures

        if (isPlaying) {
            audio.pause();
            playBtn.innerHTML = `
                <svg viewBox="0 0 24 24" fill="currentColor">
                    <path d="M8 5v14l11-7z"/>
                </svg>
            `;
        } else {
            // Pause other audio messages
            audioPlayers.forEach((otherAudio, otherId) => {
                if (otherId !== messageId) {
                    otherAudio.pause();
                    const otherBtn = document.querySelector(`[data-audio-id="${otherId}"] .audio-play-btn`);
                    if (otherBtn) {
                        otherBtn.innerHTML = `
                            <svg viewBox="0 0 24 24" fill="currentColor">
                                <path d="M8 5v14l11-7z"/>
                            </svg>
                        `;
                    }
                }
            });

            // 🔑 Mobile: unlock audio context if needed
            if (audioContext && audioContext.state === 'suspended') {
                audioContext.resume();
            }

            audio.play().catch(err => {
                console.error("Audio playback failed:", err);
                showToast("Failed to play audio", "error");
            });

            playBtn.innerHTML = `
                <svg viewBox="0 0 24 24" fill="currentColor">
                    <rect x="6" y="4" width="4" height="16"/>
                    <rect x="14" y="4" width="4" height="16"/>
                </svg>
            `;
        }
        isPlaying = !isPlaying;

        // 🔑 Mobile: haptic feedback
        if (navigator.vibrate) {
            navigator.vibrate(10);
        }
    });

    audio.addEventListener("timeupdate", () => {
        const current = audio.currentTime;
        const duration = audio.duration || 0;
        const minutes = Math.floor(current / 60);
        const seconds = Math.floor(current % 60);
        timeLabel.textContent = `${minutes}:${seconds.toString().padStart(2, '0')}`;

        // Update waveform progress
        drawStaticWaveform(canvas, duration > 0 ? current / duration : 0);
    });

    audio.addEventListener("ended", () => {
        isPlaying = false;
        playBtn.innerHTML = `
            <svg viewBox="0 0 24 24" fill="currentColor">
                <path d="M8 5v14l11-7z"/>
            </svg>
        `;
        audio.currentTime = 0;
        const duration = audio.duration || 0;
        const minutes = Math.floor(duration / 60);
        const seconds = Math.floor(duration % 60);
        timeLabel.textContent = `${minutes}:${seconds.toString().padStart(2, '0')}`;
        drawStaticWaveform(canvas, 0);
    });

    audio.addEventListener("loadedmetadata", () => {
        const duration = audio.duration;
        const minutes = Math.floor(duration / 60);
        const seconds = Math.floor(duration % 60);
        timeLabel.textContent = `${minutes}:${seconds.toString().padStart(2, '0')}`;
    });

    // 🔑 Mobile: handle errors
    audio.addEventListener("error", (e) => {
        console.error("Audio error:", e);
        container.classList.add("error");
        timeLabel.textContent = "Error";
        playBtn.disabled = true;
    });

    // 🔑 Mobile: show loading state
    container.classList.add("loading");
    audio.addEventListener("canplaythrough", () => {
        container.classList.remove("loading");
    });

    return container;
}

function drawStaticWaveform(canvas, progress = 0) {
    const ctx = canvas.getContext("2d");

    // 🔑 Use device pixel ratio for sharper rendering
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();

    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;

    ctx.scale(dpr, dpr);

    const width = rect.width;
    const height = rect.height;

    ctx.clearRect(0, 0, width, height);

    // 🔑 Adjust bar count based on canvas width for mobile
    const barCount = Math.min(40, Math.floor(width / 5));
    const barWidth = (width / barCount) * 0.6;
    const barGap = (width / barCount) * 0.4;

    for (let i = 0; i < barCount; i++) {
        const barHeight = (Math.random() * 0.5 + 0.3) * height;
        const x = i * (barWidth + barGap);
        const y = (height - barHeight) / 2;

        // Gradient based on progress
        const isPlayed = (i / barCount) < progress;
        const gradient = ctx.createLinearGradient(0, y, 0, y + barHeight);

        if (isPlayed) {
            gradient.addColorStop(0, "#667eea");
            gradient.addColorStop(1, "#764ba2");
        } else {
            gradient.addColorStop(0, "#d0d0d0");
            gradient.addColorStop(1, "#a0a0a0");
        }

        ctx.fillStyle = gradient;
        ctx.fillRect(x, y, barWidth, barHeight);
    }
}



async function uploadMedia(msgId, receiver, file) {
    const controller = new AbortController();
    UploadControllers[msgId] = controller;

    try {
        const formData = new FormData();
        formData.append("file", file);

        const res = await fetch("/api/upload", {
            method: "POST",
            body: formData,
            signal: controller.signal
        });

        if (!res.ok) throw new Error("Upload failed");

        const data = await res.json();
        socket.emit("media:uploaded", {
            tempId: msgId,
            to: receiver,
            url: data.original,          // original
            cover: data.cover_270,      // NEW
            thumb: data.thumb_50,      // NEW
            mediaType: data.type
        });

    } catch (err) {
        if (err.name === "AbortError") return;

        updateMessageByTempId(msgId, {
            uploadStatus: "failed"
        });
    } finally {
        delete UploadControllers[msgId];
    }
}



function sendMessage(type = 'text', content = null, OldtempId = undefined) {
    if (!State.activeChat) return;
    const to = State.activeChat;
    const typingState = State.typingTimeouts[to];
    if (typingState?.isTyping) {
        socket.emit("typing:stop", { to });
        clearTimeout(typingState.stopTimeout);
        typingState.isTyping = false;
    }

    const messageInput = document.getElementById('message-input');
    const textContent = messageInput.value.trim();
    if (type === 'text' && !textContent) return;
    // if (type !== 'text' && !content) return;
    let activeChatOnline = State.conversations.find(c => c.id == State.activeChat)
    const message = {
        tempId: OldtempId ? OldtempId : generateId(),
        type: type,
        content: type === 'text' ? sanitizeInput(textContent) : content,
        caption: type !== 'text' && textContent ? sanitizeInput(textContent) : null,
        clientTime: Date.now(),
        replyTo: State.replyingTo,
        user: State.currentUser.username,
        status: { sent: true, delivered: activeChatOnline.online, seen: false },
        timestamp: Date.now()
    };


    // Add to messages
    if (!State.messages[State.activeChat]) {
        State.messages[State.activeChat] = [];
    }
    State.messages[State.activeChat].unshift(message);
    State.messageIndex[message.tempId] = State.activeChat
    message.to = State.activeChat
    sendsocketMessage(message)
    // Update conversation


    // Clear input
    messageInput.value = '';
    document.getElementById('send-btn').disabled = true;
    State.replyingTo = null;
    document.getElementById('reply-preview').style.display = 'none';

    if (type !== "image" && type !== "video") {
        const conv = State.conversations.find(c => c.id === State.activeChat);
        if (conv) {
            conv.lastMessage = type === 'text' ? textContent : `📷 ${type}`;
            conv.timestamp = Date.now();
        }
        const messagesContainer = document.getElementById('messages');


        const messageEl = createMessageElement(message);
        messagesContainer.appendChild(messageEl);


        // Scroll to bottom
        const container = document.getElementById('messages-container');
        container.scrollTop = container.scrollHeight;
        renderChatList();
    }

}

function showTypingIndicator(show) {
    const indicator = document.getElementById('typing-indicator');
    indicator.style.display = show ? 'flex' : 'none';
}

// =============================================================================
// Reactions
// =============================================================================

function showEmojiPicker(messageId) {
    const modal = document.getElementById('emoji-modal');
    const grid = document.getElementById('emoji-grid');

    grid.innerHTML = '';

    EMOJI_LIST.forEach(emoji => {
        const btn = document.createElement('button');
        btn.className = 'emoji-btn';
        btn.textContent = emoji;
        btn.addEventListener('click', () => {
            addReaction(messageId, emoji);
            modal.style.display = 'none';
        });
        grid.appendChild(btn);
    });

    modal.style.display = 'flex';

    // Close on overlay click
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            modal.style.display = 'none';
        }
    });

    // Close button
    document.getElementById('close-emoji').addEventListener('click', () => {
        modal.style.display = 'none';
    });
}

function addReaction(messageId, emoji) {
    const message = findMessageById(messageId);
    if (!message) return;

    if (!message.reactions) {
        message.reactions = {};
    }

    if (!message.reactions[emoji]) {
        message.reactions[emoji] = [];
    }

    // Toggle reaction
    const userId = State.currentUser.id;
    const index = message.reactions[emoji].indexOf(userId);

    if (index > -1) {
        message.reactions[emoji].splice(index, 1);
        if (message.reactions[emoji].length === 0) {
            delete message.reactions[emoji];
        }
    } else {
        message.reactions[emoji].push(userId);
    }

}

function toggleReaction(messageId, emoji) {
    addReaction(messageId, emoji);
}

// =============================================================================
// Reply
// =============================================================================

function replyToMessage(message) {
    State.replyingTo = message.id;

    const replyPreview = document.getElementById('reply-preview');
    const replyText = document.getElementById('reply-text');
    if (message.type == "text") {
        replyText.textContent = message.content;
    } else {
        replyText.innerHTML = `<div class="reply-image">
            <img src="${message.content}">
        </div>`
    }
    replyPreview.style.display = 'flex';

    // Focus input
    document.getElementById('message-input').focus();
}

// =============================================================================
// Mobile Navigation
// =============================================================================

function initMobileNavigation() {
    // Handle window resize
    window.addEventListener('resize', () => {
        if (window.innerWidth >= 768) {
            // Desktop: show both
            document.getElementById('chat-list-sidebar').classList.remove('hidden');
            document.getElementById('chat-window').classList.remove('active');
            if (State.activeChat) {
                document.getElementById('chat-window').classList.add('active');
            }
        } else {
            // Mobile: show appropriate screen
            if (State.activeChat) {
                document.getElementById('chat-list-sidebar').classList.add('hidden');
                document.getElementById('chat-window').classList.add('active');
            } else {
                document.getElementById('chat-list-sidebar').classList.remove('hidden');
                document.getElementById('chat-window').classList.remove('active');
            }
        }
    });
}

// =============================================================================
// Initialization
// =============================================================================

document.addEventListener('DOMContentLoaded', async () => {
    // Show loader initially
    const loader = document.getElementById('loader-overlay');
    let isplayTune = localStorage.getItem("playTune")
    const muteBtn = document.getElementById("chatOption-Mute");
    if (isplayTune) {
        State.playTune = isplayTune == "true" ? true : false
        muteBtn.setAttribute("playTune", isplayTune);

        if (State.playTune) {

            muteBtn.innerHTML = `
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/>
                <path d="M15.54 8.46a5 5 0 0 1 0 7.07"/>
                <path d="M19.07 4.93a10 10 0 0 1 0 14.14"/>
              </svg> Mute
            `;
        } else {

            muteBtn.innerHTML = `
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
               <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/>
               <path d="M15.54 8.46a5 5 0 0 1 0 7.07"/>
               <path d="M19.07 4.93a10 10 0 0 1 0 14.14"/>
           </svg> Unmute
`;
        }
    }


    // Simulate initial load time
    await initAuth();
    hideLoader();


});

// =============================================================================
// Loader Functions
// =============================================================================

function showLoader() {
    const loader = document.getElementById('loader-overlay');
    loader.classList.remove('hidden');
}

function hideLoader() {
    const loader = document.getElementById('loader-overlay');
    loader.classList.add('hidden');
}

async function retryUpload(msgId) {
    const chatId = State.messageIndex[msgId];
    const msg = State.messages[chatId].find(m => m.tempId === msgId);
    if (!msg) return;

    msg.uploadStatus = "uploading";
    updateMessageByTempId(msgId, { uploadStatus: "uploading" });

    // ❗ For now you must reselect file
    showToast("Please reselect file to retry", "info");
}


document.addEventListener("click", (e) => {
    const msgEl = e.target.closest(".message");
    if (!msgEl) return;

    const msgId = msgEl.dataset.messageId;

    if (e.target.classList.contains("media-cancel")) {
        // UploadControllers[msgId]?.abort();
        // removeMessage(msgId);
        let mediaOverlay = msgEl.querySelector(".message-media .media-overlay")
        mediaOverlay.remove()
    }

    if (e.target.classList.contains("media-retry")) {
        retryUpload(msgId);
    }
});


function generateVideoThumbnail(videoSrc) {
    return new Promise((resolve, reject) => {
        const video = document.createElement("video");
        video.src = videoSrc;
        video.muted = true;
        video.playsInline = true;
        video.crossOrigin = "anonymous";

        video.onloadeddata = () => {
            // seek a little to avoid black frame
            video.currentTime = Math.min(0.5, video.duration / 2);
        };

        video.onseeked = () => {
            const canvas = document.createElement("canvas");
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;

            const ctx = canvas.getContext("2d");
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

            resolve({ url: canvas.toDataURL("image/jpeg", 0.75), duration: video.duration });
        };

        video.onerror = reject;
    });
}


function getVideoDuration(videoUrl) {
    return new Promise((resolve, reject) => {
        const video = document.createElement("video");

        video.preload = "metadata";     // 🔑 important
        video.src = videoUrl;
        video.crossOrigin = "anonymous";

        video.onloadedmetadata = () => {
            resolve(video.duration);    // duration in seconds
        };

        video.onerror = () => {
            reject("Failed to load video metadata");
        };
    });
}

class MediaViewer {
    constructor(chatId) {
        this.chatId = chatId;
        this.mediaItems = [];
        this.currentIndex = 0;

        // frontend pagination config
        this.chunkSize = 10;
        this.renderedCount = 0;

        this.overlay = document.getElementById('mediaViewer');
        this.container = document.getElementById('mediaContainer');
        this.thumbnailContainer = document.getElementById('thumbnailContainer');
        this.prevBtn = document.getElementById('prevBtn');
        this.nextBtn = document.getElementById('nextBtn');
        this.closeBtn = document.getElementById('closeViewer');
        this.viewerMain = document.getElementById('viewerMain');

        this.touchStartX = 0;
        this.touchEndX = 0;
        this.isDragging = false;

        this.collectMediaItems();
        this.bindEvents();
    }

    /* ================= DATA ================= */

    collectMediaItems() {
        const messages = State.messages[this.chatId] || [];

        this.mediaItems = messages
            .filter(m => (m.type === 'image' || m.type === 'video') && m.content)
            .map((m, index) => ({
                index,
                id: m.id ?? m.tempId,
                type: m.type,
                src: m.content,
                thumb: m.thumb || null,
                cover: m.cover || null
            }));

        this.renderedCount = 0;
    }

    getIndexByMessageId(messageId) {
        return this.mediaItems.findIndex(
            m => String(m.id) === String(messageId)
        );
    }

    /* ================= LIFECYCLE ================= */

    open(index) {
        if (index < 0 || index >= this.mediaItems.length) return;

        this.currentIndex = index;
        this.overlay.classList.add('active');
        document.body.style.overflow = 'hidden';

        // render only needed chunk
        this.render(true);
    }

    close() {
        this.overlay.classList.remove('active');
        document.body.style.overflow = '';

        this.container.querySelectorAll('video').forEach(v => v.pause());
    }

    navigate(direction) {
        const next = this.currentIndex + direction;
        if (next < 0 || next >= this.mediaItems.length) return;

        this.currentIndex = next;

        // if user is near end of rendered chunk, render more
        if (this.currentIndex >= this.renderedCount - 3) {
            this.renderMore();
        }

        this.updateMedia();
    }

    /* ================= RENDER ================= */

    render(reset = false) {
        if (reset) {
            this.container.innerHTML = '';
            this.thumbnailContainer.innerHTML = '';
            this.renderedCount = 0;
        }

        // ensure currentIndex is inside rendered area
        const requiredCount = Math.max(this.currentIndex + 1, this.chunkSize);

        while (this.renderedCount < requiredCount && this.renderedCount < this.mediaItems.length) {
            this.appendItem(this.mediaItems[this.renderedCount], this.renderedCount);
            this.renderedCount++;
        }

        this.updateControls();
        this.updateMedia();
    }

    renderMore() {
        const target = Math.min(this.renderedCount + this.chunkSize, this.mediaItems.length);

        while (this.renderedCount < target) {
            this.appendItem(this.mediaItems[this.renderedCount], this.renderedCount);
            this.renderedCount++;
        }

        this.updateControls();
    }

    appendItem(item, index) {
        /* ----- MAIN SLIDE ----- */
        const slide = document.createElement('div');
        slide.className = 'media-slide';
        slide.dataset.index = index;

        if (item.type === 'video') {
            const video = document.createElement('video');
            video.src = item.src;
            video.controls = true;
            slide.appendChild(video);
        } else {
            const img = document.createElement('img');
            img.loading = "lazy";
            img.src = item.src;
            slide.appendChild(img);
        }

        this.container.appendChild(slide);

        /* ----- THUMBNAIL ----- */
        const thumb = document.createElement('div');
        thumb.className = 'thumbnail-item';
        thumb.dataset.index = index;

        const img = document.createElement('img');
        img.loading = "lazy";

        if (item.type === 'image') {
            img.src = item.thumb || item.src;
        } else {
            img.src = item.cover || item.thumb || item.src;
            thumb.classList.add('video');
        }

        thumb.appendChild(img);

        thumb.addEventListener('click', () => {
            this.currentIndex = index;

            // if user clicks a thumbnail not yet rendered (rare case)
            if (this.currentIndex >= this.renderedCount - 1) {
                this.renderMore();
            }

            this.updateMedia();
        });

        this.thumbnailContainer.appendChild(thumb);
    }

    updateMedia() {
        this.container.querySelectorAll('.media-slide').forEach((slide, i) => {
            const active = i === this.currentIndex;
            slide.classList.toggle('active', active);

            const video = slide.querySelector('video');
            if (video) active ? video.play() : video.pause();
        });

        this.thumbnailContainer.querySelectorAll('.thumbnail-item').forEach((t, i) => {
            t.classList.toggle('active', i === this.currentIndex);

            if (i === this.currentIndex) {
                t.scrollIntoView({ block: 'nearest', inline: 'center' });
            }
        });

        this.updateControls();
    }

    updateControls() {
        document.getElementById('currentIndex').textContent = this.currentIndex + 1;
        document.getElementById('totalMedia').textContent = this.mediaItems.length;

        this.prevBtn.disabled = this.currentIndex === 0;
        this.nextBtn.disabled = this.currentIndex === this.mediaItems.length - 1;
    }

    /* ================= EVENTS ================= */

    bindEvents() {
        this.closeBtn.onclick = () => this.close();
        this.prevBtn.onclick = () => this.navigate(-1);
        this.nextBtn.onclick = () => this.navigate(1);

        document.addEventListener('keydown', e => {
            if (!this.overlay.classList.contains('active')) return;
            if (e.key === 'ArrowLeft') this.navigate(-1);
            if (e.key === 'ArrowRight') this.navigate(1);
            if (e.key === 'Escape') this.close();
        });

        this.viewerMain.addEventListener('touchstart', e => {
            this.touchStartX = e.changedTouches[0].screenX;
        }, { passive: true });

        this.viewerMain.addEventListener('touchend', e => {
            this.touchEndX = e.changedTouches[0].screenX;
            this.handleSwipe();
        }, { passive: true });

        this.viewerMain.addEventListener('mousedown', e => {
            this.isDragging = true;
            this.touchStartX = e.clientX;
        });

        this.viewerMain.addEventListener('mouseup', e => {
            if (!this.isDragging) return;
            this.isDragging = false;
            this.touchEndX = e.clientX;
            this.handleSwipe();
        });

        // load more thumbnails if user scrolls near end
        this.thumbnailContainer.addEventListener("scroll", () => {
            const nearEnd =
                this.thumbnailContainer.scrollLeft + this.thumbnailContainer.clientWidth >=
                this.thumbnailContainer.scrollWidth - 200;

            if (nearEnd && this.renderedCount < this.mediaItems.length) {
                this.renderMore();
            }
        });
    }

    handleSwipe() {
        const diff = this.touchStartX - this.touchEndX;
        if (Math.abs(diff) < 50) return;
        diff > 0 ? this.navigate(1) : this.navigate(-1);
    }

    addItem(msg) {
        if (!msg || !msg.content) return;
        if (!(msg.type === "image" || msg.type === "video")) return;

        const index = this.mediaItems.length;

        this.mediaItems.push({
            index,
            id: msg.id ?? msg.tempId,
            type: msg.type,
            src: msg.content,
            thumb: msg.thumb || null,
            cover: msg.cover || null
        });

        // if viewer is open, only render if user is near end
        if (this.overlay.classList.contains("active")) {
            if (this.currentIndex >= this.renderedCount - 3) {
                this.renderMore();
            }
            this.updateControls();
        }
    }
}



// ========================================
// SECRET BUTTON SYSTEM WITH PERSISTENCE
// ========================================

let chatMode = false
let clickCount = 0;
let clickTimer = null;
const secretButton = document.getElementById('secretButton');
const dashboard = document.getElementById('ssc-dashboard');
const chatContainer = document.getElementById('chat-container');

// Triple-click detection
secretButton.addEventListener('click', () => {
    clickCount++;
    secretButton.classList.add('clicked');

    setTimeout(() => {
        secretButton.classList.remove('clicked');
    }, 300);




    // Clear previous timer
    if (clickTimer) {
        clearTimeout(clickTimer);
    }

    // Check if triple-clicked
    if (clickCount === 5) {
        toggleChatMode();
        clickCount = 0;
    }

    // Reset click count after 1 second
    clickTimer = setTimeout(() => {
        clickCount = 0;
    }, 1000);
});

function toggleChatMode() {
    const wasActive = chatMode;

    if (wasActive) {
        deactivateChatMode();
    } else {
        activateChatMode();
    }

    chatMode = !wasActive;
}

function activateChatMode() {
    // Hide dashboard
    dashboard.classList.add('hidden');

    // Show chat container
    chatContainer.classList.add('active');

    // Prevent body scroll
    document.body.style.overflow = 'hidden';
}

function deactivateChatMode() {
    // Show dashboard
    dashboard.classList.remove('hidden');

    // Hide chat container
    chatContainer.classList.remove('active');

    // Restore body scroll
    document.body.style.overflow = '';
}


// ========================================
// CAROUSEL FUNCTIONALITY
// ========================================

let currentSlideIndex = 0;
const slides = document.querySelectorAll('.carousel-item');
const dots = document.querySelectorAll('.carousel-dot');

function showSlide(index) {
    // Hide all slides
    slides.forEach(slide => slide.classList.remove('active'));
    dots.forEach(dot => dot.classList.remove('active'));

    // Show current slide
    if (index >= slides.length) {
        currentSlideIndex = 0;
    } else if (index < 0) {
        currentSlideIndex = slides.length - 1;
    } else {
        currentSlideIndex = index;
    }

    slides[currentSlideIndex].classList.add('active');
    dots[currentSlideIndex].classList.add('active');
}

function changeSlide(direction) {
    showSlide(currentSlideIndex + direction);
}

function currentSlide(index) {
    showSlide(index);
}

// Auto-play carousel
setInterval(() => {
    if (chatMode) {
        changeSlide(1);
    }
}, 5000);

// ========================================
// ACCESSIBILITY FEATURES
// ========================================

const fontButtons = document.querySelectorAll('.font-btn');
let fontSize = 100;

fontButtons.forEach((btn, index) => {
    btn.addEventListener('click', () => {
        if (index === 0) fontSize = 90; // A-
        if (index === 1) fontSize = 100; // A
        if (index === 2) fontSize = 110; // A+

        document.body.style.fontSize = fontSize + '%';
    });
});


const MAX_ATTEMPTS = 5;
let remainingAttempts = MAX_ATTEMPTS;

async function unlockScreen() {

    const btn = document.getElementById("submitBtn");
    const input = document.getElementById("passwordInput");
    const error = document.getElementById("errorMsg");

    if (btn.disabled) return;

    error.textContent = "";

    // UI → loading
    btn.disabled = true;
    btn.classList.add("loading");
    btn.textContent = "Verifying";

    try {
        const success = await fakePasswordApi(input.value);
        if (success) {
            document.getElementById("passwordOverlay").classList.remove("active");
            btn.disabled = false;
            btn.classList.remove("loading");
            btn.textContent = "submit";
            return;
        }

        remainingAttempts--;

        if (remainingAttempts <= 0) {
            blockUser(btn, input, error);
            return;
        }

        // Warning messages (gov-style)
        error.textContent = getAttemptMessage(remainingAttempts);
        resetButton(btn);

    } catch (err) {
        error.textContent = "Server error. Please try again later.";
        resetButton(btn);
    }
}

function getAttemptMessage(attemptsLeft) {
    if (attemptsLeft === 4)
        return "Invalid password. You have 4 attempts remaining.";
    if (attemptsLeft === 3)
        return "Warning: Only 3 attempts remaining.";
    if (attemptsLeft === 2)
        return "Alert: Only 2 attempts remaining.";
    if (attemptsLeft === 1)
        return "Final warning: Last attempt remaining.";
    return `Invalid password. Attempts remaining: ${attemptsLeft}`;
}

function blockUser(btn, input, error) {
    error.textContent =
        "You have exceeded the maximum number of attempts. Access has been blocked.";

    btn.textContent = "Blocked";
    btn.classList.remove("loading");
    btn.disabled = true;
    input.disabled = true;
}

function resetButton(btn) {
    btn.disabled = false;
    btn.classList.remove("loading");
    btn.textContent = "Submit";
}

async function fakePasswordApi(password) {
    let response = await loginuser({ username: State.currentUser.username, password })
    if (response.Data.status) {
        return true
    } else {
        return false
    }
}

document.getElementById("passwordInput").addEventListener("keydown", e => {
    if (e.key === "Enter") unlockScreen();
});

// ========================================
// SHOW MEDIA BUTTON FUNCTIONALITY
// ========================================

document.getElementById("chatOption-ShowMedia").addEventListener("click", async () => {
    // Show password overlay
    document.getElementById("chatOption").classList.remove("active");
    const passwordOverlay = document.getElementById("passwordOverlay");
    const passwordInput = document.getElementById("passwordInput");
    const errorMsg = document.getElementById("errorMsg");

    // Reset password input
    passwordInput.value = "";
    errorMsg.textContent = "";
    remainingAttempts = MAX_ATTEMPTS;

    // Show overlay
    passwordOverlay.classList.add("active");

    // Override the unlock function temporarily
    const originalUnlock = window.unlockScreen;
    window.unlockScreen = async function () {
        const btn = document.getElementById("submitBtn");
        const input = document.getElementById("passwordInput");
        const error = document.getElementById("errorMsg");

        if (btn.disabled) return;

        error.textContent = "";

        // UI → loading
        btn.disabled = true;
        btn.classList.add("loading");
        btn.textContent = "Verifying";

        try {
            const success = await fakePasswordApi(input.value);
            if (success) {
                // Password verified - fetch and show media
                await fetchAndShowAllMedia();
                document.getElementById("passwordOverlay").classList.remove("active");

                // Restore original unlock function
                window.unlockScreen = originalUnlock;
                document.querySelectorAll("input[type=text]").forEach(input => input.value = "")

                return;
            }

            remainingAttempts--;

            if (remainingAttempts <= 0) {
                blockUser(btn, input, error);
                setTimeout(() => {
                    window.unlockScreen = originalUnlock;
                }, 3000);
                return;
            }

            error.textContent = getAttemptMessage(remainingAttempts);
            resetButton(btn);

        } catch (err) {
            error.textContent = "Server error. Please try again later.";
            resetButton(btn);
        }
    };
});

async function fetchAndShowAllMedia() {
    try {
        // Show loading indicator
        const loaderOverlay = document.getElementById("loader-overlay");
        loaderOverlay.style.display = "flex";

        // Fetch all media messages from the API
        const response = await fetch(`/api/chats/media/${State.activeChat}-${State.currentUser.id}`);

        if (!response.ok) {
            throw new Error('Failed to fetch media messages');
        }

        const data = await response.json();
        console.log(data.data)
        const messages = data.data || [];

        // Filter only media messages (image, video, audio)
        const mediaMessages = messages
        console.log(mediaMessages)
        if (mediaMessages.length === 0) {
            loaderOverlay.style.display = "none";
            showToast("No media found in this chat", "info");
            return;
        }

        // Clear existing media items in viewer
        viewer.mediaItems = [];
        viewer.currentIndex = 0;

        // Add all media to viewer
        mediaMessages.forEach(msg => {
            viewer.addItem(msg);
        });

        // Hide loader
        loaderOverlay.style.display = "none";

        // Open viewer with first media item
        viewer.open(0);
    } catch (error) {
        console.error("Error fetching media:", error);
        const loaderOverlay = document.getElementById("loader-overlay");
        loaderOverlay.style.display = "none";
        showToast("Failed to load media. Please try again.", "error");
    }
}