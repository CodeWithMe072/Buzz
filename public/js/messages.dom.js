/**
 * messages.dom.js — DOM update helpers for message state changes
 * (status icons, media swaps, received media updates)
 */

// =============================================================================
// UPDATE MESSAGE BY TEMP ID — merges state + refreshes DOM
// =============================================================================
function updateMessageByTempId(tempId = null, updates, chatId = null) {
    if (chatId == null) chatId = State.messageIndex[tempId];
    if (!chatId) return;

    const msgs = State.messages[chatId];
    if (!msgs) return;

    const msg = msgs.find(m => (m.tempId || m.id) === tempId);
    if (!msg) return;

    if (updates.status) {
        msg.status = { ...msg.status, ...updates.status };
        const { status, ...rest } = updates;
        Object.assign(msg, rest);
    } else {
        Object.assign(msg, updates);
    }

    const msgEl = document.querySelector(`.message[data-message-id="${tempId}"] .message-bubble`);
    if (!msgEl) return;

    /* ─── Media update ─── */
    if (updates.content || updates.cover) {
        if (updates.type !== "audio") {
            const mediaContainer = msgEl.querySelector(".message-media");
            if (!mediaContainer) return;

            const mediaOverlay = mediaContainer.querySelector(".media-overlay");
            const previewSrc = updates.cover ?? updates.content;
            if (!previewSrc) return;

            if (updates.type === "image") {
                let img = mediaContainer.querySelector("img");
                if (!img) {
                    mediaContainer.innerHTML = "";
                    img = document.createElement("img");
                    mediaContainer.appendChild(img);
                }
                img.src = previewSrc;
                img.alt = "Image message";
            }

            if (updates.type === "video") {
                mediaContainer.innerHTML = "";
                const video = document.createElement("video");
                video.src = updates.content;
                video.className = "chat-video-preview";
                video.controls = false;
                video.muted = true;
                video.playsInline = true;
                video.preload = "metadata";
                mediaContainer.appendChild(video);
            }

            if (mediaOverlay) mediaOverlay.remove();
            attactEventOnMedia();
            if (viewer) viewer.addItem(msg);
        }

        if (updates.type === "audio") {
            const audioContainer = msgEl.querySelector(".message-audio");
            if (!audioContainer) return;
            const newPlayer = createAudioPlayer(updates.content, msg.id || msg.tempId);
            audioContainer.replaceWith(newPlayer);
        }

        if (updates.type === "document" && updates.content) {
            const docContainer = msgEl.querySelector(".message-document");
            if (docContainer) {
                const meta = docContainer.querySelector(".doc-meta");
                if (meta) meta.textContent = updates.fileSize ? formatFileSize(updates.fileSize) : "";
                const actionsDiv = docContainer.querySelector(".doc-actions");
                if (actionsDiv) {
                    actionsDiv.innerHTML = `
                        <a href="${msg.content}" target="_blank" rel="noopener" class="doc-btn doc-open">Open</a>
                        <button class="doc-btn doc-save" onclick="forceDownload('${msg.content}', '${msg.fileName || 'document'}')">Save as</button>
                    `;
                }
            }
        }
    }

    /* ─── Status update ─── */
    if ((updates.status || updates.content || updates.cover) && chatId !== State.currentUser.id) {
        const messageStatus = msgEl.querySelector(".msg-status-wrap");
        if (!messageStatus) return;

        let statusIcon = "";
        if (msg.status.seen) {
            statusIcon = `<svg class="status-icon double seen" viewBox="0 0 16 16" style="transform: translateX(3px);">
                <polyline points="2 8 6 12 14 4"/>
                <polyline points="5 8 9 12 17 4" style="transform: translate(-9px,0);"/>
            </svg>`;
        } else if (msg.status.delivered) {
            statusIcon = `<svg class="status-icon double delivered" viewBox="0 0 16 16">
                <polyline points="2 8 6 12 14 4"/>
                <polyline points="5 8 9 12 17 4" style="transform: translate(-9px,0);"/>
            </svg>`;
        } else {
            statusIcon = `<svg class="status-icon single sent" viewBox="0 0 16 16">
                <polyline points="2 8 6 12 14 4"/>
            </svg>`;
        }
        messageStatus.innerHTML = statusIcon;
    }

    document.getElementById("messages-container").scrollTop = 99999;
}

// =============================================================================
// UPDATE MEDIA DOM — sender side: swap blob preview → real CDN URL
// =============================================================================
function updateMediaDOM(tempId, { content, cover, thumb, type, uploadStatus, fileName, fileSize }) {
    const msgEl = document.querySelector(`.message[data-message-id="${tempId}"] .message-bubble`);
    if (!msgEl) return;

    const mediaContainer = msgEl.querySelector(".message-media");
    const mediaDocument = msgEl.querySelector(".message-document");
    if (!mediaContainer && !mediaDocument) return;

    let overlay = null;
    if (mediaContainer) overlay = mediaContainer.querySelector(".media-overlay");
    if (mediaDocument) overlay = mediaDocument.querySelector(".media-overlay");
    if (overlay) overlay.remove();

    const previewSrc = cover || content;

    if (type === "image" && mediaContainer) {
        let img = mediaContainer.querySelector("img");
        if (!img) {
            img = document.createElement("img");
            mediaContainer.appendChild(img);
        }
        img.src = previewSrc;
        img.alt = "Image message";
    }

    if (type === "video" && mediaContainer) {
        mediaContainer.innerHTML = "";
        const video = document.createElement("video");
        video.src = content;
        video.poster = cover || thumb || "";
        video.className = "chat-video-preview";
        video.controls = true;
        video.playsInline = true;
        video.preload = "metadata";
        video.style.cssText = "width:100%; max-height:350px; border-radius:inherit; object-fit:cover;";
        mediaContainer.appendChild(video);
    }

    if (type === "document" && mediaDocument) {
        const meta = mediaDocument.querySelector(".doc-meta");
        if (meta) meta.textContent = fileSize ? formatFileSize(fileSize) : "";
        const actionsDiv = mediaDocument.querySelector(".doc-actions");
        if (actionsDiv) {
            actionsDiv.innerHTML = `
                <a href="${content}" target="_blank" rel="noopener" class="doc-btn doc-open">Open</a>
                <button class="doc-btn doc-save" onclick="forceDownload('${content}', '${fileName || 'document'}')">Save as</button>
            `;
        }
    }

    const statusEl = msgEl.querySelector(".msg-status-wrap");
    if (statusEl) {
        statusEl.innerHTML = `<svg class="status-icon single sent" viewBox="0 0 16 16">
            <polyline points="2 8 6 12 14 4"/>
        </svg>`;
    }

    attactEventOnMedia();
    if (viewer) {
        const chatId = State.messageIndex[tempId];
        const msg = chatId ? (State.messages[chatId] || []).find(m => m.tempId === tempId) : null;
        if (msg) viewer.addItem(msg);
    }
}

// =============================================================================
// UPDATE AUDIO DOM — swap local blob player → real URL player
// =============================================================================
function updateAudioDOM(tempId, realUrl) {
    const msgEl = document.querySelector(`.message[data-message-id="${tempId}"] .message-bubble`);
    if (!msgEl) return;

    const audioContainer = msgEl.querySelector(".message-audio");
    if (!audioContainer) return;

    const newPlayer = createAudioPlayer(realUrl, tempId);
    audioContainer.replaceWith(newPlayer);

    const statusEl = msgEl.querySelector(".msg-status-wrap");
    if (statusEl) {
        statusEl.innerHTML = `<svg class="status-icon single sent" viewBox="0 0 16 16">
            <polyline points="2 8 6 12 14 4"/>
        </svg>`;
    }
}

// =============================================================================
// UPDATE RECEIVED MEDIA DOM — receiver side: replace loading placeholder
// =============================================================================
function updateReceivedMediaDOM(tempId, { content, cover, thumb, type }) {
    const msgEl = document.querySelector(`.message[data-message-id="${tempId}"] .message-bubble`);
    if (!msgEl) return;

    const previewSrc = cover || content;

    if (type === "image" || type === "video") {
        let mediaContainer = msgEl.querySelector(".message-media");
        if (!mediaContainer) {
            mediaContainer = document.createElement("div");
            mediaContainer.className = "message-media";
            const textEl = msgEl.querySelector(".messag-text");
            if (textEl) msgEl.insertBefore(mediaContainer, textEl);
            else msgEl.prepend(mediaContainer);
        } else {
            mediaContainer.innerHTML = "";
        }

        if (type === "image") {
            const img = document.createElement("img");
            img.src = previewSrc;
            img.alt = "Image message";
            mediaContainer.appendChild(img);
        }

        if (type === "video") {
            const video = document.createElement("video");
            video.className = "chat-video-preview";
            video.src = content;
            video.poster = cover || thumb || "";
            video.controls = true;
            video.playsInline = true;
            video.preload = "metadata";
            video.style.cssText = "width:100%; max-height:350px; border-radius:inherit; object-fit:cover;";
            mediaContainer.appendChild(video);
        }

        attactEventOnMedia();
        if (viewer) {
            const chatId = State.messageIndex[tempId];
            const msg = chatId ? (State.messages[chatId] || []).find(m => (m.id || m.tempId) === tempId) : null;
            if (msg) viewer.addItem(msg);
        }
    }

    if (type === "audio") {
        const audioContainer = msgEl.querySelector(".message-audio");
        if (audioContainer) {
            const newPlayer = createAudioPlayer(content, tempId);
            audioContainer.replaceWith(newPlayer);
        }
    }
}
