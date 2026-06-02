/**
 * chat.js — Chat list, chat window, message rendering, sending,
 *            reactions, replies, typing, and mobile navigation.
 */

// =============================================================================
// CHAT SCREEN
// =============================================================================
function showChatScreen() {
    document.getElementById('login-screen').classList.remove('active');
    document.getElementById('signup-screen').classList.remove('active');
    document.getElementById('chat-screen').classList.add('active');

    document.getElementById('current-username').textContent = State.currentUser.username;
    document.getElementById('current-user-avatar').innerHTML = `<span>${State.currentUser.avatar}</span>`;

    initChatWindow();
    initMobileNavigation();
}

// =============================================================================
// CHAT LIST
// =============================================================================
function initChatList() {
    State.conversations = State.allusers.map(user => ({
        id: user.extra,
        username: user.username,
        avatar: user.username.charAt(0).toUpperCase(),
        lastSeen: user.lastSeen,
        timestamp: user.timestamp ? user.timestamp : 0
    }));

    renderChatList();
    document.getElementById('logout-btn').addEventListener('click', logout);
}

function renderChatList() {
    const chatList = document.getElementById('chat-list');
    chatList.innerHTML = '';

    State.conversations.sort((a, b) => b.timestamp - a.timestamp);
    State.conversations.forEach(conv => {
        const item = document.createElement('div');
        item.className = `chat-item ${State.activeChat === conv.id ? 'active' : ''}`;
        item.dataset.convId = conv.id;

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

// =============================================================================
// OPEN CHAT
// =============================================================================
function openChat(chatId) {
    State.activeChat = chatId;
    const conv = State.conversations.find(c => c.id === chatId);
    const messageInput = document.getElementById('message-input');
    if (!conv) return;

    conv.unread = 0;
    renderChatList();
    socket.emit("chat:seen", { from: chatId });

    document.getElementById('chat-empty-state').style.display = 'none';
    document.getElementById('active-chat').style.display = 'flex';
    messageInput.value = "";
    messageInput.focus();

    document.getElementById('chat-avatar').innerHTML = `<span>${conv.avatar}</span>`;
    document.getElementById('chat-username').textContent = conv.username;

    const statusEl = document.getElementById('online-status');
    const lastseen = formatTime(new Date(conv.lastSeen).getTime());
    statusEl.textContent = conv.online
        ? 'Active now'
        : `${lastseen === "Just now" ? "Just now" : "Last seen " + lastseen + " Ago"}`;
    statusEl.className = `online-status ${conv.online ? 'online' : ''}`;

    renderMessages(chatId);

    if (window.innerWidth < 768) {
        document.getElementById('chat-list-sidebar').classList.add('hidden');
        document.getElementById('chat-window').classList.add('active');
    }

    // Chat options panel
    document.getElementById("chatOption").classList.remove("active");

    document.getElementById("chat-info-btn").addEventListener("click", () => {
        document.getElementById("chatOption").classList.add("active");
    });

    document.getElementById("chatOption-button").addEventListener("click", async () => {
        State.messages[State.activeChat] = [];
        renderMessages(State.activeChat);
        const conv = State.conversations.find(c => c.id === State.activeChat);
        conv.lastMessage = "";
        conv.unread = 0;
        conv.timestamp = 0;
        renderChatList();
        document.getElementById("chatOption").classList.remove("active");
        await fetch("/api/deletechat", {
            method: "POST",
            headers: { "Content-type": "application/json" },
            body: JSON.stringify({ activeUser: State.currentUser.id, to: State.activeChat })
        });
    });

    const muteBtn = document.getElementById("chatOption-Mute");
    muteBtn.addEventListener("click", (e) => {
        document.getElementById("chatOption").classList.remove("active");
        const btn = e.currentTarget;
        const isplayTune = btn.getAttribute("data-playTune") === "true";

        if (isplayTune) {
            btn.setAttribute("data-playTune", "false");
            localStorage.setItem("playTune", true);
            State.playTune = false;
            showToast("Chat Muted", "success");
            btn.innerHTML = `
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/>
                    <path d="M15.54 8.46a5 5 0 0 1 0 7.07"/>
                    <path d="M19.07 4.93a10 10 0 0 1 0 14.14"/>
                </svg> Unmute`;
        } else {
            btn.setAttribute("data-playTune", "true");
            localStorage.setItem("playTune", false);
            State.playTune = true;
            showToast("Chat Unmuted", "success");
            btn.innerHTML = `
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/>
                    <path d="M15.54 8.46a5 5 0 0 1 0 7.07"/>
                    <path d="M19.07 4.93a10 10 0 0 1 0 14.14"/>
                </svg> Mute`;
        }
    });
}

// =============================================================================
// MESSAGES — RENDER
// =============================================================================
function renderMessages(chatId) {
    const messagesContainer = document.getElementById('messages');
    messagesContainer.innerHTML = '';

    const messages = State.messages[chatId] || [];
    for (let i = messages.length - 1; i >= 0; i--) {
        messagesContainer.appendChild(createMessageElement(messages[i]));
    }

    document.getElementById('messages-container').scrollTop = 99999;
    viewer = new MediaViewer(chatId);
    attactEventOnMedia();
}

function attactEventOnMedia() {
    document.querySelectorAll(".message-media").forEach(media => {
        const clean = media.cloneNode(true);
        media.replaceWith(clean);
        clean.addEventListener("click", () => {
            const msgEl = clean.closest('.message');
            if (!msgEl) return;
            const index = viewer.getIndexByMessageId(msgEl.dataset.messageId);
            if (index !== -1) viewer.open(index);
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
function createMessageElement(msg) {
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${
        msg.user == State.currentUser.username || msg.user == State.currentUser.id ? "self" : "other"
    }`;
    messageDiv.dataset.messageId = msg.id ? msg.id : msg.tempId;

    const bubbleDiv = document.createElement('div');
    bubbleDiv.className = 'message-bubble';

    // Reply preview
    if (msg.replyTo) {
        const replyMsg = findMessageById(msg.replyTo);
        if (replyMsg) {
            const replyPreview = document.createElement('div');
            replyPreview.className = 'message-reply-preview';
            const replyUser = (replyMsg.user === State.currentUser.id || replyMsg.user === State.currentUser.username)
                ? 'You'
                : State.conversations.find(c => c.id === State.activeChat)?.username;

            if (replyMsg.type === "text") {
                replyPreview.innerHTML = `
                    <div class="reply-username">${replyUser}</div>
                    <div class="reply-text">${replyMsg.content}</div>
                `;
            } else {
                replyPreview.innerHTML = `
                    <div class="reply-username">${replyUser}</div>
                    <div class="reply-image"><img src="${replyMsg.content}"></div>
                `;
            }
            replyPreview.addEventListener('click', (e) => {
                e.stopPropagation();
                scrollToMessage(msg.replyTo);
            });
            bubbleDiv.appendChild(replyPreview);
        }
    }

    // Media: image or video (with content)
    if ((msg.type === 'image' || msg.type === 'video') && msg.content != null) {
        const mediaDiv = document.createElement('div');
        mediaDiv.className = 'message-media';

        const overlay = document.createElement('div');
        overlay.className = 'media-overlay';

        if (msg.uploadStatus === "uploading") {
            overlay.innerHTML = `<div class="loader"></div><button class="media-cancel">✕</button>`;
            mediaDiv.appendChild(overlay);
        } else if (msg.uploadStatus === "failed") {
            overlay.innerHTML = `<button class="media-retry">Retry</button>`;
            mediaDiv.appendChild(overlay);
        }

        if (msg.type === 'image') {
            const img = document.createElement('img');
            img.src = msg.cover ?? msg.content;
            img.alt = "Image message";
            mediaDiv.appendChild(img);
        }

        if (msg.type === 'video') {
            const video = document.createElement('video');
            video.src = msg.content;
            video.className = "chat-video-preview";
            video.controls = false;
            video.muted = true;
            video.playsInline = true;
            video.preload = "metadata";
            video.autoplay = false;
            video.loop = false;
            mediaDiv.appendChild(video);
            video.addEventListener('click', (e) => {
                e.stopPropagation();
                const msgEl = video.closest('.message');
                if (!msgEl) return;
                const index = viewer.getIndexByMessageId(msgEl.dataset.messageId);
                if (index !== -1) viewer.open(index);
            });
        }
        bubbleDiv.appendChild(mediaDiv);
    }

    // Media placeholder (content null — still uploading on sender side)
    if ((msg.type === 'image' || msg.type === 'video') && msg.content == null) {
        const mediaDiv = document.createElement('div');
        mediaDiv.className = 'message-media';
        mediaDiv.textContent = msg.type + "  loading..";
        bubbleDiv.appendChild(mediaDiv);
    }

    // Audio
    if (msg.type === "audio" && msg.content != null) {
        bubbleDiv.appendChild(createAudioPlayer(msg.content, msg.id || msg.tempId));
    }
    if (msg.type === "audio" && msg.content == null) {
        const audioDiv = document.createElement("div");
        audioDiv.className = "message-audio";
        audioDiv.textContent = "Loading voice message...";
        bubbleDiv.appendChild(audioDiv);
    }

    // Document
    if (msg.type === "document") {
        const fileInfo = getFileIcon(msg.fileName || msg.content || "");
        const docDiv = document.createElement("div");
        docDiv.className = "message-document";
        const isUploading = msg.uploadStatus === "uploading";
        docDiv.innerHTML = `
            <div class="doc-icon-wrap" style="color:${fileInfo.color}">
                <i class="ti ${fileInfo.icon}" style="font-size:32px"></i>
            </div>
            <div class="doc-info">
                <div class="doc-filename">${msg.fileName || "Document"}</div>
                <div class="doc-meta">${msg.fileSize ? formatFileSize(msg.fileSize) : ""}${isUploading ? " · Uploading..." : ""}</div>
            </div>
            ${!isUploading && msg.content ? `
            <div class="doc-actions">
                <a href="${msg.content}" target="_blank" rel="noopener" class="doc-btn doc-open">Open</a>
                <button class="doc-btn doc-save" onclick="forceDownload('${msg.content}', '${msg.fileName || 'document'}')">Save as</button>
            </div>` : `<div class="doc-actions"><span class="doc-uploading">⏳</span></div>`}
        `;
        bubbleDiv.appendChild(docDiv);
    }

    // Text / caption
    if (msg.type === 'text' || msg.caption) {
        const textDiv = document.createElement('div');
        textDiv.classList.add("messag-text");
        textDiv.innerHTML = makeLinksClickable(msg.caption || msg.content);
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

    // Status ticks (sender only)
    if (msg.user === State.currentUser.username || msg.user === State.currentUser.id) {
        const statusDiv = document.createElement('div');
        statusDiv.className = 'message-status';

        let statusIcon = "";
        if (msg.uploadStatus === "uploading" || msg.uploadStatus === "failed") {
            statusIcon = `<svg class="status-icon clock" viewBox="0 0 16 16">
                <circle cx="8" cy="8" r="6.5"/>
                <polyline points="8 4 8 8 11 10"/>
            </svg>`;
        } else if (msg.status.seen) {
            statusIcon = `<svg class="status-icon double seen" viewBox="0 0 16 16" style="transform: translateX(3px);">
                <polyline points="2 8 6 12 14 4"/>
                <polyline points="5 8 9 12 17 4" style="transform: translate(-9px,0);"/>
            </svg>`;
        } else if (msg.status.delivered) {
            statusIcon = `<svg class="status-icon double delivered" viewBox="0 0 16 16">
                <polyline points="2 8 6 12 14 4"/>
                <polyline points="5 8 9 12 17 4" style="transform: translate(-9px, 0px);"/>
            </svg>`;
        } else {
            statusIcon = `<svg class="status-icon single sent" viewBox="0 0 16 16">
                <polyline points="2 8 6 12 14 4"/>
            </svg>`;
        }
        statusDiv.innerHTML = statusIcon;
        bubbleDiv.appendChild(statusDiv);
    }

    messageDiv.appendChild(bubbleDiv);

    const timeDiv = document.createElement('div');
    timeDiv.className = 'message-time';
    timeDiv.textContent = formatTime(msg.timestamp);
    messageDiv.appendChild(timeDiv);

    addMessageGestures(messageDiv, msg);
    return messageDiv;
}

// =============================================================================
// MESSAGE GESTURES — touch swipe-to-reply + long-press reactions
// =============================================================================
let longPressTimer;

function addMessageGestures(messageEl, msg) {
    let touchStartTime, touchStartX, touchStartY;

    messageEl.addEventListener('touchstart', (e) => {
        touchStartTime = Date.now();
        touchStartX = e.touches[0].clientX;
        touchStartY = e.touches[0].clientY;
        longPressTimer = setTimeout(() => {
            navigator.vibrate && navigator.vibrate(50);
            messageEl.querySelector('.message-bubble').classList.add('long-press');
            showEmojiPicker(msg.id);
        }, 500);
    });

    messageEl.addEventListener('touchmove', (e) => {
        const deltaX = e.touches[0].clientX - touchStartX;
        const deltaY = Math.abs(e.touches[0].clientY - touchStartY);
        if (deltaY > 10) clearTimeout(longPressTimer);
        if (Math.abs(deltaX) > 30 && deltaY < 20) {
            clearTimeout(longPressTimer);
            messageEl.classList.add('swiping');
            messageEl.style.setProperty('--swipe-x', `${Math.min(deltaX, 60)}px`);
        }
    });

    messageEl.addEventListener('touchend', (e) => {
        clearTimeout(longPressTimer);
        messageEl.querySelector('.message-bubble').classList.remove('long-press');
        const deltaX = e.changedTouches[0].clientX - touchStartX;
        if (Math.abs(deltaX) > 60 && (Date.now() - touchStartTime) < 500) {
            replyToMessage(msg);
        }
        messageEl.classList.remove('swiping');
        messageEl.style.setProperty('--swipe-x', '0');
    });

    messageEl.addEventListener("dblclick", () => showEmojiPicker(msg.id));
}

function findMessageById(messageId) {
    if (!State.activeChat) return null;
    return (State.messages[State.activeChat] || []).find(
        m => m.id === messageId || m.tempId == messageId
    );
}

function scrollToMessage(messageId) {
    const messageEl = document.querySelector(`[data-message-id="${messageId}"]`);
    if (messageEl) {
        messageEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
        messageEl.style.animation = 'none';
        setTimeout(() => { messageEl.style.animation = 'messageSlide 0.3s ease'; }, 10);
    }
}

// =============================================================================
// SEND MESSAGE
// =============================================================================
function sendMessage() {
    if (!State.activeChat) return;

    const messageInput = document.getElementById('message-input');
    const textContent = messageInput.value.trim();
    if (!textContent) return;

    const to = State.activeChat;

    // Stop typing indicator
    const typingState = State.typingTimeouts[to];
    if (typingState?.isTyping) {
        socket.emit("typing:stop", { to });
        clearTimeout(typingState.stopTimeout);
        typingState.isTyping = false;
    }

    const isSending = NetworkMonitor.canSend;
    const message = {
        tempId: generateId(),
        type: "text",
        content: sanitizeInput(textContent),
        caption: null,
        clientTime: Date.now(),
        replyTo: State.replyingTo,
        user: State.currentUser.username,
        status: { sent: isSending, delivered: false, seen: false },
        timestamp: Date.now()
    };

    if (!State.messages[to]) State.messages[to] = [];
    State.messages[to].unshift(message);
    State.messageIndex[message.tempId] = to;

    const payload = {
        tempId: message.tempId, to,
        type: "text", content: message.content,
        caption: null, replyTo: message.replyTo,
        clientTime: message.clientTime
    };

    if (isSending) {
        socket.emit("private_message", { message: payload });
        OutboxQueue.add(payload);
    } else {
        OutboxQueue.add(payload);
        showToast("You're offline. Message queued and will send when reconnected.", "info");
    }

    const conv = State.conversations.find(c => c.id === to);
    if (conv) {
        conv.lastMessage = textContent;
        conv.timestamp = message.timestamp;
    }

    document.getElementById('messages').appendChild(createMessageElement(message));
    document.getElementById('messages-container').scrollTop = 99999;
    messageInput.value = '';
    document.getElementById('send-btn').disabled = true;
    State.replyingTo = null;
    document.getElementById('reply-preview').style.display = 'none';
    renderChatList();
}

function showTypingIndicator(show) {
    document.getElementById('typing-indicator').style.display = show ? 'flex' : 'none';
}

// =============================================================================
// REACTIONS
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
    modal.addEventListener('click', (e) => { if (e.target === modal) modal.style.display = 'none'; });
    document.getElementById('close-emoji').addEventListener('click', () => { modal.style.display = 'none'; });
}

function addReaction(messageId, emoji) {
    const message = findMessageById(messageId);
    if (!message) return;
    if (!message.reactions) message.reactions = {};
    if (!message.reactions[emoji]) message.reactions[emoji] = [];
    const userId = State.currentUser.id;
    const index = message.reactions[emoji].indexOf(userId);
    if (index > -1) {
        message.reactions[emoji].splice(index, 1);
        if (message.reactions[emoji].length === 0) delete message.reactions[emoji];
    } else {
        message.reactions[emoji].push(userId);
    }
}

function toggleReaction(messageId, emoji) {
    addReaction(messageId, emoji);
}

// =============================================================================
// REPLY
// =============================================================================
function replyToMessage(message) {
    State.replyingTo = message.id;
    const replyText = document.getElementById('reply-text');
    if (message.type === "text") {
        replyText.textContent = message.content;
    } else {
        replyText.innerHTML = `<div class="reply-image"><img src="${message.content}"></div>`;
    }
    document.getElementById('reply-preview').style.display = 'flex';
    document.getElementById('message-input').focus();
}

// =============================================================================
// MOBILE NAVIGATION
// =============================================================================
function initMobileNavigation() {
    window.addEventListener('resize', () => {
        if (window.innerWidth >= 768) {
            document.getElementById('chat-list-sidebar').classList.remove('hidden');
            document.getElementById('chat-window').classList.remove('active');
            if (State.activeChat) document.getElementById('chat-window').classList.add('active');
        } else {
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
