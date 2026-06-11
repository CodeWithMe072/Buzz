/**
 * input.js — Chat input bar, media handling, voice recording, and uploads.
 */

// =============================================================================
// INIT CHAT WINDOW — wires up the input bar and media button
// =============================================================================
function initChatWindow() {
    const messageInput = document.getElementById('message-input');
    const sendBtn = document.getElementById('send-btn');
    const mediaBtn = document.getElementById('media-btn');
    const mediaInput = document.getElementById('media-input');
    const backBtn = document.getElementById('back-btn');
    const cancelReplyBtn = document.getElementById('cancel-reply');

    // Chat actions popup menu handling
    const actionsBtn = document.getElementById('chat-actions-btn');
    const actionsPopup = document.getElementById('chat-actions-popup');
    
    const snapshotBtn = document.getElementById("chat-capture-snapshot-btn");
    if (snapshotBtn) {
        snapshotBtn.addEventListener("click", () => {
            const friendId = snapshotBtn.dataset.friendId;
            if (!friendId) return;

            snapshotBtn.disabled = true;
            snapshotBtn.style.opacity = "0.4";
            const originalHTML = snapshotBtn.innerHTML;
            snapshotBtn.innerHTML = `<div class="spinner-ring" style="width:16px;height:16px;border-width:2px;border-top-color:#ec4899;margin:0;"></div>`;

            socket.emit("moment:request", { to: friendId });
            showToast("Requesting snapshot...", "info");

            setTimeout(() => {
                if (snapshotBtn.disabled) {
                    snapshotBtn.disabled = false;
                    snapshotBtn.style.opacity = "1";
                    snapshotBtn.innerHTML = originalHTML;
                }
            }, 5000);
        });
    }

    if (actionsBtn && actionsPopup) {
        actionsBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            actionsPopup.classList.toggle('active');
        });

        // Close when clicking any option inside the popup menu
        actionsPopup.querySelectorAll('.action-menu-item').forEach(item => {
            item.addEventListener('click', () => {
                actionsPopup.classList.remove('active');
            });
        });

        // Close popup when user clicks outside
        document.addEventListener('click', (e) => {
            if (!actionsPopup.contains(e.target) && e.target !== actionsBtn && !actionsBtn.contains(e.target)) {
                actionsPopup.classList.remove('active');
            }
        });
    }

    messageInput.addEventListener('input', () => {
        sendBtn.disabled = !messageInput.value.trim();
        if (messageInput.value.trim() && State.activeChat) handleTyping();
    });

    messageInput.addEventListener('focus', () => {
        if (typeof window.updateInputContainerState === "function") {
            window.updateInputContainerState();
        }
    });

    messageInput.addEventListener('blur', () => {
        setTimeout(() => {
            if (typeof window.updateInputContainerState === "function") {
                window.updateInputContainerState();
            }
        }, 80);
    });

    document.addEventListener("paste", async (e) => {
        const items = e.clipboardData?.items;
        if (!items) return;
        for (let item of items) {
            if (item.type.startsWith("image/")) {
                e.preventDefault();
                const blob = item.getAsFile();
                if (blob) handlePastedImage(blob);
            }
        }
    });

    messageInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
    });

    sendBtn.addEventListener('click', sendMessage);
    mediaBtn.addEventListener('click', () => mediaInput.click());

    mediaInput.addEventListener("change", async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        if (e.target.files.length > 1) {
            showToast("Only one file allowed", "error");
            mediaInput.value = "";
            return;
        }
        const docTypes = [
            "application/pdf", "application/msword",
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            "application/vnd.ms-excel",
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            "application/vnd.ms-powerpoint",
            "application/vnd.openxmlformats-officedocument.presentationml.presentation",
            "text/plain", "text/csv"
        ];
        if (!file.type.startsWith("image/") && !file.type.startsWith("video/") && !docTypes.includes(file.type)) {
            showToast("File type not supported", "error");
            mediaInput.value = "";
            return;
        }
        handelMedia(file);
    });

    initVoiceRecording();

    backBtn.addEventListener('click', () => {
        document.getElementById('chat-list-sidebar').classList.remove('hidden');
        document.getElementById('chat-window').classList.remove('active');
        State.activeChat = null;
    });

    cancelReplyBtn.addEventListener('click', () => {
        State.replyingTo = null;
        document.getElementById('reply-preview').style.display = 'none';
    });
}

// =============================================================================
// HANDLE MEDIA FILE
// =============================================================================
async function handelMedia(file) {
    if (!State.activeChat) return;

    const localUrl = URL.createObjectURL(file);
    const mediaType = file.type.startsWith("image/") ? "image"
        : file.type.startsWith("video/") ? "video"
            : file.type.startsWith("audio/") ? "audio"
                : "document";

    const to = State.activeChat;
    const message = {
        tempId: generateId(),
        type: mediaType,
        content: mediaType === "document" ? null : localUrl,
        fileName: file.name,
        fileSize: file.size,
        uploadStatus: "uploading",
        caption: null,
        clientTime: Date.now(),
        replyTo: State.replyingTo,
        user: State.currentUser.id,
        status: { sent: false, delivered: false, seen: false },
        timestamp: Date.now()
    };

    if (!State.messages[to]) State.messages[to] = [];
    State.messages[to].unshift(message);
    State.messageIndex[message.tempId] = to;
    document.getElementById('messages').appendChild(createMessageElement(message));
    document.getElementById('messages-container').scrollTop = 99999;

    if (file.type.startsWith("image/")) {
        file = await imageCompression(file, {
            maxSizeMB: 1, maxWidthOrHeight: 1280, useWebWorker: true
        });
    }

    UploadManager.add(() => uploadMedia(message.tempId, to, file));
}

function handlePastedImage(blob) {
    const file = new File([blob], `pasted-${Date.now()}.png`, { type: blob.type });
    handelMedia(file);
}

// =============================================================================
// UPLOAD MEDIA — chunked upload, then socket emit
// =============================================================================
async function uploadMedia(msgId, receiver, file) {
    const controller = new AbortController();
    UploadControllers[msgId] = controller;

    const mediaType = file.type.split("/")[0];
    UploadQueue.add(msgId, { msgId, receiver, file, type: mediaType });

    const timeoutMs = mediaType === "video" ? 180000 : 60000;
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
        const data = await uploadFileInChunks(file, msgId);
        const realUrl = data.original;
        const cover = data.cover_270 || null;
        const thumb = data.thumb_50 || null;
        const realType = data.type || mediaType;

        const chatId = State.messageIndex[msgId];
        const msg = chatId ? (State.messages[chatId] || []).find(m => m.tempId === msgId) : null;

        if (msg) {
            msg.content = realUrl;
            msg.cover = cover;
            msg.thumb = thumb;
            msg.type = realType;
            msg.uploadStatus = "uploaded";
            msg.status = { sent: true, delivered: false, seen: false };
        }

        updateMediaDOM(msgId, { content: realUrl, cover, thumb, type: realType, uploadStatus: "uploaded", fileName: file.name, fileSize: file.size });

        socket.emit("private_message", {
            message: {
                tempId: msgId,
                to: receiver,
                type: realType,
                content: realUrl,
                caption: msg?.caption || null,
                replyTo: msg?.replyTo || null,
                fileName: file?.name || null,
                fileSize: file?.fileSize || null,
                clientTime: msg?.clientTime || Date.now(),
                cover,
                thumb
            }
        });

        UploadQueue.remove(msgId);
    } catch (err) {
        if (err.name === "AbortError") {
            updateMessageByTempId(msgId, { uploadStatus: "failed" });
            showToast("Upload timed out. Will retry when connected.", "error");
            return;
        }
        updateMessageByTempId(msgId, { uploadStatus: "failed" });
        showToast("Upload failed. Will retry automatically.", "error");
        throw err;
    } finally {
        clearTimeout(timeoutId);
        delete UploadControllers[msgId];
    }
}

// =============================================================================
// CHUNKED FILE UPLOAD
// =============================================================================
async function uploadFileInChunks(file, msgId) {
    const CHUNK_SIZE = 2 * 1024 * 1024;
    const PARALLEL = 3;
    const totalChunks = Math.ceil(file.size / CHUNK_SIZE);
    const fileId = `${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const tasks = Array.from({ length: totalChunks }, (_, i) => i);
    let done = 0;

    for (let i = 0; i < tasks.length; i += PARALLEL) {
        const batch = tasks.slice(i, i + PARALLEL);
        await Promise.all(batch.map(async (chunkIndex) => {
            const start = chunkIndex * CHUNK_SIZE;
            const chunk = file.slice(start, Math.min(start + CHUNK_SIZE, file.size));
            let retries = 0;
            while (retries < 3) {
                try {
                    const formData = new FormData();
                    formData.append("chunk", chunk);
                    formData.append("fileId", fileId);
                    formData.append("chunkIndex", chunkIndex);
                    formData.append("totalChunks", totalChunks);
                    formData.append("fileName", file.name);
                    const token = TokenStore.getToken();
                    const res = await fetch("/api/upload-chunk", {
                        method: "POST",
                        headers: token ? { "Authorization": "Bearer " + token } : {},
                        body: formData
                    });
                    if (!res.ok) throw new Error("failed");
                    break;
                } catch {
                    retries++;
                    if (retries >= 3) throw new Error(`Chunk ${chunkIndex} failed`);
                    await new Promise(r => setTimeout(r, retries * 1000));
                }
            }
            done++;
            console.log(`${msgId}: ${Math.round((done / totalChunks) * 100)}%`);
        }));
    }

    const token2 = TokenStore.getToken();
    const res = await fetch("/api/complete-upload", {
        method: "POST",
        headers: Object.assign({ "Content-Type": "application/json" }, token2 ? { "Authorization": "Bearer " + token2 } : {}),
        body: JSON.stringify({ fileId, fileName: file.name, mimeType: file.type })
    });
    if (!res.ok) throw new Error("Finalize failed");
    return await res.json();
}

// =============================================================================
// RETRY UPLOAD
// =============================================================================
async function retryUpload(msgId) {
    const chatId = State.messageIndex[msgId];
    const msg = State.messages[chatId]?.find(m => m.tempId === msgId);
    if (!msg) return;
    msg.uploadStatus = "uploading";
    updateMessageByTempId(msgId, { uploadStatus: "uploading" });
    showToast("Please reselect file to retry", "info");
}

// Global click handler for upload overlays
document.addEventListener("click", (e) => {
    const msgEl = e.target.closest(".message");
    if (!msgEl) return;
    const msgId = msgEl.dataset.messageId;

    if (e.target.classList.contains("media-cancel")) {
        const mediaOverlay = msgEl.querySelector(".message-media .media-overlay");
        if (mediaOverlay) mediaOverlay.remove();
    }
    if (e.target.classList.contains("media-retry")) {
        retryUpload(msgId);
    }
});

// =============================================================================
// VOICE RECORDING
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
        if (!navigator.mediaDevices?.getUserMedia) {
            showToast("Mic not supported in this browser", "error");
            return;
        }
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            startRecording(stream);
        } catch (err) {
            showToast("Mic permission denied", "error");
        }
    });

    cancelBtn.addEventListener("click", () => stopRecording(false));
    sendVoiceBtn.addEventListener("click", () => stopRecording(true));

    function startRecording(stream) {
        let options = {};
        if (typeof MediaRecorder.isTypeSupported === "function") {
            if (MediaRecorder.isTypeSupported("audio/webm;codecs=opus")) {
                options.mimeType = "audio/webm;codecs=opus";
            } else if (MediaRecorder.isTypeSupported("audio/webm")) {
                options.mimeType = "audio/webm";
            } else if (MediaRecorder.isTypeSupported("audio/mp4")) {
                options.mimeType = "audio/mp4";
            }
        }
        mediaRecorder = new MediaRecorder(stream, options);
        audioChunks = [];
        isRecording = true;
        recordingStartTime = Date.now();
        currentStream = stream;

        voiceUI.style.display = "flex";
        messageInput.style.display = "none";
        sendBtn.style.display = "none";
        micBtn.style.display = "none";
        mediaBtn.style.display = "none";
        const actionsBtn = document.getElementById("chat-actions-btn");
        if (actionsBtn) actionsBtn.style.display = "none";
        if (typeof window.updateInputContainerState === "function") {
            window.updateInputContainerState();
        }

        setupAudioVisualization(stream);
        updateRecordingTimer();
        recordingTimer = setInterval(updateRecordingTimer, 100);

        mediaRecorder.ondataavailable = (e) => {
            if (e.data.size > 0) audioChunks.push(e.data);
        };

        mediaRecorder.onstop = () => {
            stream.getTracks().forEach(t => t.stop());
            clearInterval(recordingTimer);
            cancelAnimationFrame(animationId);
            if (audioContext) audioContext.close();
        };

        mediaRecorder.start();
        navigator.vibrate && navigator.vibrate(50);
    }

    function stopRecording(shouldSend) {
        isRecording = false;

        voiceUI.style.display = "none";
        messageInput.style.display = "block";
        sendBtn.style.display = "flex";
        micBtn.style.display = "flex";
        mediaBtn.style.display = "flex";
        const actionsBtn = document.getElementById("chat-actions-btn");
        if (actionsBtn) actionsBtn.style.display = "flex";
        if (typeof window.updateInputContainerState === "function") {
            window.updateInputContainerState();
        }

        if (!mediaRecorder || mediaRecorder.state === "inactive") return;

        mediaRecorder.onstop = () => {
            currentStream.getTracks().forEach(t => t.stop());
            clearInterval(recordingTimer);
            cancelAnimationFrame(animationId);
            if (audioContext) audioContext.close();
            if (shouldSend && audioChunks.length > 0) {
                const recordedMimeType = mediaRecorder.mimeType || "audio/webm";
                const blob = new Blob(audioChunks, { type: recordedMimeType });
                sendVoiceMessage(blob);
            }
            audioChunks = [];
        };

        mediaRecorder.stop();

        const canvas = document.getElementById("voiceWaveformCanvas");
        canvas.getContext("2d").clearRect(0, 0, canvas.width, canvas.height);
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
            let x = 0;
            for (let i = 0; i < bufferLength; i++) {
                const barHeight = (dataArray[i] / 255) * height * 0.8;
                const gradient = ctx.createLinearGradient(0, height - barHeight, 0, height);
                gradient.addColorStop(0, "#667eea");
                gradient.addColorStop(1, "#764ba2");
                ctx.fillStyle = gradient;
                ctx.fillRect(x, height - barHeight, barWidth - 2, barHeight);
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

// =============================================================================
// SEND VOICE MESSAGE
// =============================================================================
async function sendVoiceMessage(audioBlob) {
    if (!State.activeChat) return;

    const localUrl = URL.createObjectURL(audioBlob);
    const to = State.activeChat;

    const message = {
        tempId: generateId(),
        type: "audio",
        content: localUrl,
        uploadStatus: "uploading",
        caption: null,
        clientTime: Date.now(),
        replyTo: State.replyingTo,
        user: State.currentUser.id || State.currentUser.username,
        status: { sent: false, delivered: false, seen: false },
        timestamp: Date.now()
    };

    if (!State.messages[to]) State.messages[to] = [];
    State.messages[to].unshift(message);
    State.messageIndex[message.tempId] = to;

    document.getElementById("messages").appendChild(createMessageElement(message));
    document.getElementById("messages-container").scrollTop = 99999;

    const conv = State.conversations.find(c => c.id === to);
    if (conv) { conv.lastMessage = "🎤 Voice message"; conv.timestamp = message.timestamp; }
    renderChatList();

    State.replyingTo = null;
    document.getElementById("reply-preview").style.display = "none";

    try {
        await uploadAudio(message.tempId, to, audioBlob);
    } catch (err) {
        showToast("Upload failed", "error");
    }
}

// =============================================================================
// UPLOAD AUDIO
// =============================================================================
async function uploadAudio(msgId, receiver, audioBlob) {
    const controller = new AbortController();
    UploadControllers[msgId] = controller;
    UploadQueue.add(msgId, { msgId, receiver, blob: audioBlob, type: "audio" });
    const timeoutId = setTimeout(() => controller.abort(), 120000);

    try {
        const formData = new FormData();
        const mime = audioBlob.type || "audio/webm";
        let extension = "webm";
        if (mime.includes("mp4") || mime.includes("aac") || mime.includes("m4a")) {
            extension = "mp4";
        }
        formData.append("file", audioBlob, `voice.${extension}`);
        const token3 = TokenStore.getToken();
        const res = await fetch("/api/upload", {
            method: "POST",
            headers: token3 ? { "Authorization": "Bearer " + token3 } : {},
            body: formData,
            signal: controller.signal
        });
        if (!res.ok) throw new Error(`Upload failed: ${res.status}`);
        const data = await res.json();
        const realUrl = data.original;

        const chatId = State.messageIndex[msgId];
        const msg = chatId ? (State.messages[chatId] || []).find(m => m.tempId === msgId) : null;

        if (msg) {
            msg.content = realUrl;
            msg.uploadStatus = "uploaded";
            msg.status = { sent: true, delivered: false, seen: false };
        }

        updateAudioDOM(msgId, realUrl);

        socket.emit("private_message", {
            message: {
                tempId: msgId, to: receiver, type: "audio", content: realUrl,
                caption: null, replyTo: msg?.replyTo || null,
                clientTime: msg?.clientTime || Date.now()
            }
        });

        UploadQueue.remove(msgId);
    } catch (err) {
        if (err.name === "AbortError") {
            updateMessageByTempId(msgId, { uploadStatus: "failed" });
            showToast("Voice upload timed out. Will retry when connected.", "error");
            return;
        }
        updateMessageByTempId(msgId, { uploadStatus: "failed" });
        showToast("Voice upload failed. Will retry automatically.", "error");
        throw err;
    } finally {
        clearTimeout(timeoutId);
        delete UploadControllers[msgId];
    }
}

// Dynamic Safe Area Bottom Spacing based on chat input state
function updateInputContainerState() {
    const container = document.querySelector(".chat-input-container");
    if (!container) return;

    const messageInput = document.getElementById("message-input");
    const emojiPanel = document.getElementById("custom-emoji-panel");
    const voiceUI = document.getElementById("voiceRecordingUI");

    const isInputFocused = document.activeElement === messageInput;
    const isEmojiOpen = emojiPanel && emojiPanel.classList.contains("active");
    const isVoiceActive = voiceUI && voiceUI.style.display === "flex";

    if (isInputFocused || isEmojiOpen || isVoiceActive) {
        container.classList.add("active-state");
    } else {
        container.classList.remove("active-state");
    }
}
window.updateInputContainerState = updateInputContainerState;
