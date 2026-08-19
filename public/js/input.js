/**
 * input.js — Chat input bar, media handling, voice recording, and uploads.
 */

// =============================================================================
// INIT CHAT WINDOW — wires up the input bar and media button
// =============================================================================
function initChatWindow() {
    const messageInput = document.getElementById('message-input');
    if (!messageInput || messageInput.dataset.chatInitialized) return;
    messageInput.dataset.chatInitialized = "true";

    const sendBtn = document.getElementById('send-btn');
    const mediaBtn = document.getElementById('media-btn');
    const mediaInput = document.getElementById('media-input');
    const backBtn = document.getElementById('back-btn');
    const cancelReplyBtn = document.getElementById('cancel-reply');

    // Chat actions popup menu handling
    const actionsBtn = document.getElementById('chat-actions-btn');
    const actionsPopup = document.getElementById('chat-actions-popup');
    
    
    
    // Wire delegated snapshot button click handler globally to support dynamic re-renders
    if (!window.__snapshotButtonListenerBound) {
        window.__snapshotButtonListenerBound = true;
        document.addEventListener("click", (e) => {
            const snapshotBtn = e.target.closest("#chat-capture-snapshot-btn");
            if (!snapshotBtn) return;

            e.stopPropagation();

            if (window.isMaintenanceModeActive) {
                if (typeof window.showMaintenanceActionModal === "function") {
                    window.showMaintenanceActionModal("Camera Snapshots");
                } else if (typeof showToast === "function") {
                    showToast("Camera snapshot requests are disabled during maintenance mode.", "warning");
                }
                return;
            }

            const friendId = snapshotBtn.dataset.friendId || State.activeChat;
            if (!friendId) {
                showToast("No active chat selected", "error");
                return;
            }

            // Check online/socket network connectivity explicitly
            if (!navigator.onLine || (typeof socket !== "undefined" && !socket.connected)) {
                showToast("Network error: Cannot reach server. Please check your internet connection.", "error");
                return;
            }

            const conv = (State.conversations || []).find(c => c.id === friendId);
            if (conv && !conv.online) {
                showToast(`${conv.username || 'User'} is offline. Cannot request camera feed.`, "warning");
                return;
            }

            snapshotBtn.disabled = true;
            snapshotBtn.style.opacity = "0.4";
            const originalHTML = snapshotBtn.innerHTML;
            snapshotBtn.innerHTML = `<div class="spinner-ring" style="width:16px;height:16px;border-width:2px;border-top-color:#ec4899;margin:0;"></div>`;

            showCameraSelector(
                async (requestType, facingMode) => {
                    if (!navigator.onLine || (typeof socket !== "undefined" && !socket.connected)) {
                        showToast("Network error: Connection lost. Please try again.", "error");
                        snapshotBtn.disabled = false;
                        snapshotBtn.style.opacity = "1";
                        snapshotBtn.innerHTML = originalHTML;
                        return;
                    }

                    if (typeof window.startCameraRequestTimeout === "function") {
                        window.startCameraRequestTimeout(friendId, requestType, () => {
                            snapshotBtn.disabled = false;
                            snapshotBtn.style.opacity = "1";
                            snapshotBtn.innerHTML = originalHTML;
                        });
                    }

                    if (requestType === "photo") {
                        socket.emit("moment:request", { to: friendId, camera: facingMode, type: requestType });
                        showToast("Requesting snapshot...", "info");
                    } else {
                        showToast("Requesting live video preview...", "info");
                        const friendName = conv ? conv.username : "Friend";
                        showLiveVideoPreview(friendName, () => {
                            if (typeof socket !== "undefined") {
                                socket.emit("moment:stream_stop", { to: friendId });
                            }
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
                            if (snapshotBtn.disabled) {
                                snapshotBtn.disabled = false;
                                snapshotBtn.style.opacity = "1";
                                snapshotBtn.innerHTML = originalHTML;
                            }
                        }
                    }, 5000);
                },
                () => {
                    snapshotBtn.disabled = false;
                    snapshotBtn.style.opacity = "1";
                    snapshotBtn.innerHTML = originalHTML;
                }
            );
        });
    }

    function toggleLiveVoice(btnElement) {
        if (window.isMaintenanceModeActive) {
            if (typeof window.showMaintenanceActionModal === "function") {
                window.showMaintenanceActionModal("Live Voice Streaming");
            } else if (typeof showToast === "function") {
                showToast("Live voice streaming is disabled during maintenance mode.", "warning");
            }
            return;
        }
        const friendId = btnElement.dataset.friendId;
        if (!friendId) return;

        if (window.liveVoiceState && window.liveVoiceState.isListening) {
            if (typeof window.stopListeningToVoice === "function") {
                window.stopListeningToVoice();
            }
        } else {
            if (typeof window.startListeningToVoice === "function") {
                window.startListeningToVoice(friendId);
            }
        }
    }

    const liveVoiceBtn = document.getElementById("chat-live-voice-btn");
    if (liveVoiceBtn) {
        liveVoiceBtn.addEventListener("click", () => {
            toggleLiveVoice(liveVoiceBtn);
        });
    }

    const chatOptionLiveVoice = document.getElementById("chatOption-LiveVoice");
    if (chatOptionLiveVoice) {
        chatOptionLiveVoice.addEventListener("click", () => {
            toggleLiveVoice(chatOptionLiveVoice);
            const chatOption = document.getElementById("chatOption");
            if (chatOption) {
                chatOption.classList.remove("active");
            }
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


    // Auto-resize logic
    function adjustTextareaHeight(textarea) {
        if (!textarea) return;
        textarea.style.height = 'auto';
        const minHeight = 36;
        const maxHeight = 140;
        const scrollHeight = textarea.scrollHeight;
        const newHeight = Math.min(Math.max(scrollHeight, minHeight), maxHeight);
        textarea.style.height = newHeight + 'px';
        
        if (scrollHeight > maxHeight) {
            textarea.style.overflowY = 'auto';
        } else {
            textarea.style.overflowY = 'hidden';
        }
    }

    window.adjustMessageInputHeight = function() {
        adjustTextareaHeight(messageInput);
    };

    // Composition state tracking for IME
    let isComposing = false;
    messageInput.addEventListener('compositionstart', () => {
        isComposing = true;
    });
    messageInput.addEventListener('compositionend', () => {
        isComposing = false;
        adjustTextareaHeight(messageInput);
    });

    const isTouchDevice = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0) || window.matchMedia("(pointer: coarse)").matches;

    const draftDebounceMap = new Map();

    messageInput.addEventListener('input', () => {
        if (window.isMaintenanceModeActive) {
            messageInput.value = "";
            messageInput.blur();
            if (typeof window.showMaintenanceActionModal === "function") {
                window.showMaintenanceActionModal("Sending Messages");
            }
            return;
        }
        const val = messageInput.value;
        sendBtn.disabled = !val.trim();
        adjustTextareaHeight(messageInput);
        
        if (val.trim() && State.activeChat) handleTyping();
        
        if (State.activeChat) {
            const activeChatId = State.activeChat;
            const conv = (State.conversations || []).find(c => c.id === activeChatId);
            if (conv) conv.draft = val;

            // Debounce local IndexedDB write per-chat (keyed by activeChatId)
            if (draftDebounceMap.has(activeChatId)) {
                clearTimeout(draftDebounceMap.get(activeChatId));
            }
            const timer = setTimeout(() => {
                draftDebounceMap.delete(activeChatId);
                if (window.IndexedDBQueueService && typeof window.IndexedDBQueueService.saveInputDraft === "function") {
                    window.IndexedDBQueueService.saveInputDraft(activeChatId, val).catch(console.error);
                }
            }, 200);
            draftDebounceMap.set(activeChatId, timer);
        }
    });

    const handleInputMaintenanceGuard = (e) => {
        if (window.isMaintenanceModeActive) {
            messageInput.blur();
            messageInput.readOnly = true;
            messageInput.placeholder = "System under maintenance — message sending disabled";
            if (typeof window.showMaintenanceActionModal === "function") {
                window.showMaintenanceActionModal("Sending Messages");
            }
            if (e) e.preventDefault();
            return true;
        }
        return false;
    };

    messageInput.addEventListener('focus', (e) => {
        if (handleInputMaintenanceGuard(e)) return;
        if (typeof window.updateInputContainerState === "function") {
            window.updateInputContainerState();
        }
    });

    messageInput.addEventListener('click', (e) => {
        handleInputMaintenanceGuard(e);
    });

    messageInput.addEventListener('keydown', (e) => {
        if (handleInputMaintenanceGuard(e)) return;
    });

    messageInput.addEventListener('blur', () => {
        setTimeout(() => {
            if (typeof window.updateInputContainerState === "function") {
                window.updateInputContainerState();
            }
        }, 80);
    });

    let stagedFiles = [];
    let activeStagedIndex = 0;

    // Helper to format bytes
    function formatBytes(bytes) {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
    }

    function renderActivePreviewItem() {
        const activeItemContainer = document.getElementById("media-preview-active-item");
        if (!activeItemContainer) return;

        // Active preview is only visible on mobile (width <= 768px)
        if (window.innerWidth > 768) {
            activeItemContainer.style.display = "none";
            return;
        }

        if (stagedFiles.length === 0) {
            activeItemContainer.style.display = "flex";
            activeItemContainer.innerHTML = `<div style="color: var(--text-secondary); font-size: 14px; text-align: center; padding: 20px; width: 100%;">No files selected</div>`;
            return;
        }

        // Clamp active index
        if (activeStagedIndex < 0) activeStagedIndex = 0;
        if (activeStagedIndex >= stagedFiles.length) activeStagedIndex = stagedFiles.length - 1;

        const activeItem = stagedFiles[activeStagedIndex];
        activeItemContainer.style.display = "flex";
        activeItemContainer.innerHTML = "";

        const wrapper = document.createElement("div");
        wrapper.style.width = "100%";
        wrapper.style.height = "100%";
        wrapper.style.display = "flex";
        wrapper.style.alignItems = "center";
        wrapper.style.justifyContent = "center";

        if (activeItem.file.type.startsWith("image/")) {
            const img = document.createElement("img");
            img.src = activeItem.localUrl;
            img.alt = activeItem.file.name;
            img.style.maxWidth = "100%";
            img.style.maxHeight = "100%";
            img.style.objectFit = "contain";
            wrapper.appendChild(img);
        } else if (activeItem.file.type.startsWith("video/")) {
            const video = document.createElement("video");
            video.src = activeItem.localUrl;
            video.controls = true;
            video.playsInline = true;
            video.style.maxWidth = "100%";
            video.style.maxHeight = "100%";
            video.style.objectFit = "contain";
            wrapper.appendChild(video);
        } else {
            const docPlaceholder = document.createElement("div");
            docPlaceholder.style.display = "flex";
            docPlaceholder.style.flexDirection = "column";
            docPlaceholder.style.alignItems = "center";
            docPlaceholder.style.justifyContent = "center";
            docPlaceholder.style.color = "#38bdf8";
            const ext = activeItem.file.name.split(".").pop().substring(0, 4);
            docPlaceholder.innerHTML = `
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:64px;height:64px;margin-bottom:8px;">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                    <polyline points="14 2 14 8 20 8"/>
                </svg>
                <span style="font-size:14px;font-weight:700;text-transform:uppercase;">${ext}</span>
                <span style="font-size:12px;color:var(--text-secondary);margin-top:8px;text-align:center;padding:0 20px;word-break:break-all;">${activeItem.file.name}</span>
            `;
            wrapper.appendChild(docPlaceholder);
        }
        activeItemContainer.appendChild(wrapper);

        const deleteBtn = document.createElement("button");
        deleteBtn.type = "button";
        deleteBtn.className = "active-delete-btn";
        deleteBtn.setAttribute("aria-label", "Delete active item");
        deleteBtn.innerHTML = `
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="3 6 5 6 21 6"></polyline>
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                <line x1="10" y1="11" x2="10" y2="17"></line>
                <line x1="14" y1="11" x2="14" y2="17"></line>
            </svg>
        `;
        deleteBtn.onclick = (e) => {
            e.stopPropagation();
            stagedFiles.splice(activeStagedIndex, 1);
            if (activeStagedIndex >= stagedFiles.length) {
                activeStagedIndex = stagedFiles.length - 1;
            }
            renderMediaUploadPreview();
        };
        activeItemContainer.appendChild(deleteBtn);
    }

    function renderMediaUploadPreview() {
        const previewList = document.getElementById("media-upload-preview-list");
        if (!previewList) return;
        previewList.innerHTML = "";

        const docTypes = [
            "application/pdf", "application/msword",
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            "application/vnd.ms-excel",
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            "application/vnd.ms-powerpoint",
            "application/vnd.openxmlformats-officedocument.presentationml.presentation",
            "text/plain", "text/csv"
        ];

        stagedFiles.forEach((item, index) => {
            const card = document.createElement("div");
            card.className = "preview-file-card";
            if (index === activeStagedIndex && window.innerWidth <= 768) {
                card.classList.add("active");
            }
            card.onclick = () => {
                activeStagedIndex = index;
                renderMediaUploadPreview();
            };

            const removeBtn = document.createElement("button");
            removeBtn.type = "button";
            removeBtn.className = "preview-file-remove";
            removeBtn.innerHTML = "&times;";
            removeBtn.style.width = "32px";
            removeBtn.style.height = "32px";
            removeBtn.setAttribute("aria-label", `Remove ${item.file.name}`);
            removeBtn.onclick = (e) => {
                e.stopPropagation();
                stagedFiles.splice(index, 1);
                if (activeStagedIndex >= stagedFiles.length) {
                    activeStagedIndex = stagedFiles.length - 1;
                }
                renderMediaUploadPreview();
            };
            card.appendChild(removeBtn);

            const mediaWrapper = document.createElement("div");
            mediaWrapper.className = "preview-file-media";

            if (item.file.type.startsWith("image/")) {
                const img = document.createElement("img");
                img.src = item.localUrl;
                img.alt = item.file.name;
                mediaWrapper.appendChild(img);
            } else if (item.file.type.startsWith("video/")) {
                const video = document.createElement("video");
                video.src = item.localUrl;
                video.muted = true;
                video.playsInline = true;
                video.autoplay = false;
                mediaWrapper.appendChild(video);
            } else {
                const docWrapper = document.createElement("div");
                docWrapper.className = "preview-file-doc-placeholder";
                const ext = item.file.name.split(".").pop().substring(0, 4);
                docWrapper.innerHTML = `
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:32px;height:32px;margin-bottom:4px;color:#38bdf8;">
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                        <polyline points="14 2 14 8 20 8"/>
                    </svg>
                    <span class="preview-file-doc-ext" style="font-size:10px;font-weight:700;text-transform:uppercase;color:#38bdf8;">${ext}</span>
                `;
                mediaWrapper.appendChild(docWrapper);
            }
            card.appendChild(mediaWrapper);

            const infoWrap = document.createElement("div");
            infoWrap.className = "preview-file-info";

            const nameEl = document.createElement("div");
            nameEl.className = "preview-file-name";
            nameEl.textContent = item.file.name;
            nameEl.setAttribute("title", item.file.name);
            infoWrap.appendChild(nameEl);

            const sizeEl = document.createElement("div");
            sizeEl.className = "preview-file-size";
            sizeEl.textContent = formatBytes(item.file.size);
            infoWrap.appendChild(sizeEl);

            card.appendChild(infoWrap);
            previewList.appendChild(card);
        });

        // Add more card
        const addCard = document.createElement("div");
        addCard.className = "preview-file-add-card";
        addCard.innerHTML = `
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:24px;height:24px;margin-bottom:4px;">
                <line x1="12" y1="5" x2="12" y2="19"/>
                <line x1="5" y1="12" x2="19" y2="12"/>
            </svg>
            <span style="font-size:12px;font-weight:500;">Add Files</span>
        `;
        addCard.onclick = () => {
            const tempInput = document.createElement("input");
            tempInput.type = "file";
            tempInput.multiple = true;
            tempInput.onchange = (e) => {
                addMoreFiles(e.target.files);
            };
            tempInput.click();
        };
        previewList.appendChild(addCard);

        const badge = document.getElementById("media-preview-count-badge");
        if (badge) badge.textContent = `(${stagedFiles.length})`;
        
        const summary = document.getElementById("media-preview-summary-text");
        const sendPreviewBtn = document.getElementById("send-media-upload-preview");
        if (summary) {
            const totalBytes = stagedFiles.reduce((acc, item) => acc + item.file.size, 0);
            const limit = 500 * 1024 * 1024; // 500 MB limit (single file or total batch)
            if (totalBytes > limit) {
                summary.innerHTML = `<span style="color:#ef4444;font-weight:600;">${stagedFiles.length} files · ${formatBytes(totalBytes)} / 500 MB (Exceeds limit)</span>`;
                if (sendPreviewBtn) sendPreviewBtn.disabled = true;
            } else {
                summary.textContent = `${stagedFiles.length} file${stagedFiles.length > 1 ? "s" : ""} · ${formatBytes(totalBytes)} / 500 MB total`;
                if (sendPreviewBtn) sendPreviewBtn.disabled = stagedFiles.length === 0;
            }
        } else {
            if (sendPreviewBtn) sendPreviewBtn.disabled = stagedFiles.length === 0;
        }

        // Render the active preview item
        renderActivePreviewItem();
    }

    function closeMediaUploadPreviewModal() {
        stagedFiles.forEach(item => URL.revokeObjectURL(item.localUrl));
        stagedFiles = [];
        activeStagedIndex = 0;
        const modal = document.getElementById("media-upload-preview-modal");
        if (modal) modal.style.display = "none";
        
        const mediaInput = document.getElementById("media-input");
        if (mediaInput) mediaInput.value = "";
        
        const captionArea = document.getElementById("media-preview-caption");
        if (captionArea) {
            captionArea.value = "";
            adjustTextareaHeight(captionArea);
        }

        // Clean up history stack if we pushed a dummy state
        if (window.__mediaModalOpen) {
            window.__mediaModalOpen = false;
            window.__ignoreNextPopstate = true;
            window.history.back();
        }
    }

    window.closeMediaUploadPreviewModal = closeMediaUploadPreviewModal;

    function addMoreFiles(files) {
        if (!files || files.length === 0) return;
        const oldLength = stagedFiles.length;

        for (let file of files) {
            let fileType = file.type || "";
            if (!fileType && file.name) {
                const ext = file.name.split(".").pop().toLowerCase();
                if (["jpg", "jpeg", "png", "gif", "webp", "heic", "heif", "svg"].includes(ext)) {
                    fileType = "image/" + (ext === "jpg" ? "jpeg" : ext);
                } else if (["mp4", "webm", "mov", "m4v", "avi", "3gp", "mkv"].includes(ext)) {
                    fileType = "video/" + ext;
                } else if (["mp3", "wav", "ogg", "aac", "m4a", "flac", "opus"].includes(ext)) {
                    fileType = "audio/" + ext;
                } else {
                    fileType = "application/octet-stream";
                }
            }

            stagedFiles.push({
                file: file,
                localUrl: URL.createObjectURL(file)
            });
        }
        if (stagedFiles.length > 0) {
            if (oldLength < stagedFiles.length) {
                activeStagedIndex = oldLength;
            }
            renderMediaUploadPreview();
            const modal = document.getElementById("media-upload-preview-modal");
            if (modal) {
                modal.style.display = "flex";
                if (!window.__mediaModalOpen) {
                    window.history.pushState({ mediaModalOpen: true }, "", window.location.pathname);
                    window.__mediaModalOpen = true;
                }
                const captionArea = document.getElementById("media-preview-caption");
                if (captionArea) {
                    adjustTextareaHeight(captionArea);
                }
            }
        }
    }

    const closePreviewBtn = document.getElementById("close-media-upload-preview");
    if (closePreviewBtn) closePreviewBtn.onclick = closeMediaUploadPreviewModal;

    const cancelPreviewBtn = document.getElementById("cancel-media-upload-preview");
    if (cancelPreviewBtn) cancelPreviewBtn.onclick = closeMediaUploadPreviewModal;

    const sendPreviewBtn = document.getElementById("send-media-upload-preview");
    if (sendPreviewBtn) {
        sendPreviewBtn.onclick = () => {
            if (stagedFiles.length === 0) return;
            const captionVal = document.getElementById("media-preview-caption")?.value || null;
            
            const mediaFiles = stagedFiles.filter(item => item.file.type.startsWith("image/") || item.file.type.startsWith("video/"));
            const groupId = mediaFiles.length > 1 ? `grp_${Date.now()}_${Math.random().toString(36).slice(2)}` : null;

            const filesToSend = [...stagedFiles];
            closeMediaUploadPreviewModal();

            for (const item of filesToSend) {
                handelMedia(item.file, captionVal, groupId);
            }
        };
    }

    // Modal keydown close and focus trap
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            const modal = document.getElementById("media-upload-preview-modal");
            if (modal && modal.style.display === "flex") {
                closeMediaUploadPreviewModal();
            }
        }
    });

    const previewModalEl = document.getElementById("media-upload-preview-modal");
    if (previewModalEl) {
        previewModalEl.addEventListener('keydown', (e) => {
            if (e.key !== 'Tab') return;
            const focusables = previewModalEl.querySelectorAll('button, textarea, input');
            if (focusables.length === 0) return;
            const first = focusables[0];
            const last = focusables[focusables.length - 1];
            if (e.shiftKey) {
                if (document.activeElement === first) {
                    last.focus();
                    e.preventDefault();
                }
            } else {
                if (document.activeElement === last) {
                    first.focus();
                    e.preventDefault();
                }
            }
        });
    }

    // Modal caption auto-resize and Enter send
    const modalCaptionInput = document.getElementById("media-preview-caption");
    if (modalCaptionInput) {
        let modalCaptionComposing = false;
        modalCaptionInput.addEventListener('compositionstart', () => {
            modalCaptionComposing = true;
        });
        modalCaptionInput.addEventListener('compositionend', () => {
            modalCaptionComposing = false;
            adjustTextareaHeight(modalCaptionInput);
        });

        modalCaptionInput.addEventListener('input', () => {
            adjustTextareaHeight(modalCaptionInput);
        });

        modalCaptionInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                if (modalCaptionComposing) return;
                if (isTouchDevice || e.shiftKey) {
                    return;
                }
                e.preventDefault();
                const sendBtn = document.getElementById("send-media-upload-preview");
                if (sendBtn && !sendBtn.disabled) sendBtn.click();
            }
        });
    }

    // Handle viewport resize layout changes dynamically
    window.addEventListener('resize', () => {
        const modal = document.getElementById("media-upload-preview-modal");
        if (modal && modal.style.display === "flex") {
            renderMediaUploadPreview();
        }
    });

    document.addEventListener("paste", async (e) => {
        const items = e.clipboardData?.items;
        if (!items) return;
        
        const filesToStaging = [];
        for (let item of items) {
            if (item.type.startsWith("image/") || item.type.startsWith("video/")) {
                const file = item.getAsFile();
                if (file) {
                    filesToStaging.push(file);
                }
            }
        }
        if (filesToStaging.length > 0) {
            e.preventDefault();
            addMoreFiles(filesToStaging);
        }
    });

    messageInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            if (isComposing) return;
            if (isTouchDevice || e.shiftKey) {
                return;
            }
            e.preventDefault();
            sendMessage();
        }
    });

    sendBtn.addEventListener('click', () => {
        sendMessage();
    });
    mediaBtn.addEventListener('click', () => mediaInput.click());

    mediaInput.addEventListener("change", async (e) => {
        addMoreFiles(e.target.files);
    });

    initVoiceRecording();

    backBtn.addEventListener('click', () => {
        if (window.Router) {
            window.Router.navigate('/inbox');
        } else {
            document.getElementById('chat-list-sidebar').classList.remove('hidden');
            document.getElementById('chat-window').classList.remove('active');
            State.activeChat = null;
            const navbar = document.querySelector(".app-navbar");
            if (navbar) navbar.style.display = "flex";
            if (window.history) window.history.pushState(null, "", "/inbox");
        }
    });

    cancelReplyBtn.addEventListener('click', () => {
        State.replyingTo = null;
        document.getElementById('reply-preview').style.display = 'none';
    });

    // Setup Scroll to Bottom floating button logic
    const messagesContainerEl = document.getElementById("messages-container");
    const scrollToBottomBtn = document.getElementById("scroll-to-bottom-btn");
    if (messagesContainerEl && scrollToBottomBtn) {
        messagesContainerEl.addEventListener("scroll", () => {
            const isAtBottom = messagesContainerEl.scrollHeight - messagesContainerEl.scrollTop - messagesContainerEl.clientHeight < 150;
            if (isAtBottom) {
                scrollToBottomBtn.style.opacity = "0";
                setTimeout(() => {
                    if (messagesContainerEl.scrollHeight - messagesContainerEl.scrollTop - messagesContainerEl.clientHeight < 150) {
                        scrollToBottomBtn.style.display = "none";
                    }
                }, 200);
            } else {
                scrollToBottomBtn.style.display = "flex";
                scrollToBottomBtn.offsetHeight; // trigger reflow
                scrollToBottomBtn.style.opacity = "1";
            }
        });

        scrollToBottomBtn.addEventListener("click", () => {
            messagesContainerEl.scrollTo({
                top: messagesContainerEl.scrollHeight,
                behavior: "smooth"
            });
        });
    }
}

// =============================================================================
// HANDLE MEDIA FILE
// =============================================================================
async function handelMedia(file, caption = null, groupId = null) {
    if (window.isMaintenanceModeActive) {
        if (typeof window.showMaintenanceActionModal === "function") {
            window.showMaintenanceActionModal("Media File Uploads");
        } else if (typeof showToast === "function") {
            showToast("Media uploads are disabled during maintenance mode.", "warning");
        }
        return;
    }
    if (!State.activeChat) return;

    let mime = file.type || "";
    if (!mime && file.name) {
        const ext = file.name.split(".").pop().toLowerCase();
        if (["jpg", "jpeg", "png", "gif", "webp", "heic", "heif"].includes(ext)) mime = "image/jpeg";
        else if (["mp4", "webm", "mov", "m4v", "3gp", "mkv"].includes(ext)) mime = "video/mp4";
        else if (["mp3", "wav", "ogg", "aac", "m4a"].includes(ext)) mime = "audio/mpeg";
        else mime = "application/octet-stream";
    }

    const localUrl = URL.createObjectURL(file);
    const mediaType = mime.startsWith("image/") ? "image"
        : mime.startsWith("video/") ? "video"
            : mime.startsWith("audio/") ? "audio"
                : "document";

    const to = State.activeChat;
    const message = {
        tempId: generateId(),
        type: mediaType,
        content: mediaType === "document" ? null : localUrl,
        fileName: file.name,
        fileSize: file.size,
        uploadStatus: "uploading",
        caption: caption,
        groupId: groupId,
        clientTime: Date.now(),
        replyTo: State.replyingTo,
        user: State.currentUser?.id || State.currentUser?._id,
        status: { sent: false, delivered: false, seen: false },
        timestamp: Date.now()
    };

    if (!State.messages[to]) State.messages[to] = [];
    State.messages[to].unshift(message);
    State.messageIndex[message.tempId] = to;
    
    if (groupId && (mediaType === "image" || mediaType === "video")) {
        if (typeof renderMessages === "function") renderMessages(to);
    } else {
        const msgContainer = document.getElementById('messages');
        if (msgContainer) msgContainer.appendChild(createMessageElement(message));
    }
    if (typeof attactEventOnMedia === "function") attactEventOnMedia();
    const msgScrollContainer = document.getElementById('messages-container');
    if (msgScrollContainer) msgScrollContainer.scrollTop = 99999;

    const conv = State.conversations?.find(c => c.id === to);
    if (conv) {
        conv.lastMessage = formatLastMessage(message);
        conv.timestamp = message.timestamp;
    }
    if (typeof renderChatList === "function") {
        renderChatList(document.getElementById("chat-search")?.value.trim().toLowerCase() || "");
    }

    if (mime.startsWith("image/") && typeof imageCompression === "function") {
        try {
            const compressed = await imageCompression(file, {
                maxSizeMB: 1, maxWidthOrHeight: 1280, useWebWorker: false
            });
            if (compressed) file = compressed;
        } catch (compErr) {
            console.warn("[handelMedia] Image compression fallback to original file:", compErr);
        }
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
        const duration = data.duration || null;

        const chatId = State.messageIndex[msgId];
        const msg = chatId ? (State.messages[chatId] || []).find(m => m.tempId === msgId) : null;

        if (msg) {
            msg.content = realUrl;
            msg.cover = cover;
            msg.thumb = thumb;
            msg.type = realType;
            msg.duration = duration;
            msg.uploadStatus = "uploaded";
            msg.status = { sent: true, delivered: false, seen: false };
        }

        updateMediaDOM(msgId, { content: realUrl, cover, thumb, type: realType, uploadStatus: "uploaded", fileName: file.name, fileSize: file.size, duration });

        const queueItem = typeof UploadQueue !== "undefined" ? UploadQueue.get(msgId) : null;
        if (socket && socket.connected) {
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
                    thumb,
                    duration,
                    isDisappearing: queueItem?.isDisappearing || msg?.isDisappearing || false,
                    cameraFacing: queueItem?.cameraFacing || msg?.cameraFacing || null,
                    cameraFilter: queueItem?.cameraFilter || msg?.cameraFilter || null,
                    groupId: msg?.groupId || null
                }
            });
        }

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
    
    // Retrieve record from IndexedDB
    let record = null;
    if (window.IndexedDBQueueService) {
        record = await IndexedDBQueueService.getMessage(msgId);
        console.log("[uploadFileInChunks] Retrieved record for msgId:", msgId, "isMuted:", record?.isMuted);
    }
    
    // Determine fileId
    let fileId = record?.fileId || record?.mediaMeta?.fileId;
    if (!fileId) {
        fileId = `${Date.now()}_${Math.random().toString(36).slice(2)}`;
        if (record) {
            record.fileId = fileId;
            if (record.mediaMeta) record.mediaMeta.fileId = fileId;
            await IndexedDBQueueService.saveMessage(record);
        }
    }

    // Query server for already uploaded chunks
    let serverChunks = [];
    try {
        const token = typeof TokenStore !== "undefined" ? TokenStore.getToken() : null;
        const res = await fetch(`/api/upload-status/${fileId}`, {
            headers: token ? { "Authorization": "Bearer " + token } : {},
            credentials: "include"
        });
        if (res.ok) {
            const statusData = await res.json();
            if (statusData.completed && statusData.data) {
                
                return statusData.data;
            }
            serverChunks = statusData.chunksReceived || [];
        }
    } catch (e) {
        console.warn("Could not retrieve upload status from server:", e);
    }

    // Reconcile chunksAcked
    let chunksAcked = Array.from(new Set([...(record?.chunksAcked || []), ...serverChunks]));
    if (record) {
        record.chunksAcked = chunksAcked;
        await IndexedDBQueueService.saveMessage(record);
    }

    const tasks = Array.from({ length: totalChunks }, (_, i) => i).filter(idx => !chunksAcked.includes(idx));
    let done = chunksAcked.length;

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
                    const token = typeof TokenStore !== "undefined" ? TokenStore.getToken() : null;
                    const res = await fetch("/api/upload-chunk", {
                        method: "POST",
                        headers: token ? { "Authorization": "Bearer " + token } : {},
                        credentials: "include",
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
            
            // Persist chunk ack to IndexedDB
            if (record) {
                if (!record.chunksAcked.includes(chunkIndex)) {
                    record.chunksAcked.push(chunkIndex);
                    await IndexedDBQueueService.saveMessage(record);
                }
            }

            
        }));
    }

    const token2 = typeof TokenStore !== "undefined" ? TokenStore.getToken() : null;
    const res = await fetch("/api/complete-upload", {
        method: "POST",
        headers: Object.assign({ "Content-Type": "application/json" }, token2 ? { "Authorization": "Bearer " + token2 } : {}),
        credentials: "include",
        body: JSON.stringify({ 
            fileId, 
            fileName: file.name, 
            mimeType: file.type || "application/octet-stream",
            muted: record?.isMuted || false
        })
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

    // Retrieve from IndexedDB
    if (window.IndexedDBQueueService) {
        try {
            const dbMsg = await IndexedDBQueueService.getMessage(msgId);
            if (dbMsg && dbMsg.mediaBlob) {
                UploadManager.add(async () => {
                    if (dbMsg.type === "audio") {
                        try {
                            await uploadAudio(msgId, dbMsg.conversationId, dbMsg.mediaBlob);
                        } catch (err) {
                            console.error("Audio upload retry failed:", err);
                        }
                    } else {
                        try {
                            const file = dbMsg.mediaBlob instanceof File 
                                ? dbMsg.mediaBlob 
                                : new File([dbMsg.mediaBlob], dbMsg.mediaMeta?.fileName || "file", { type: dbMsg.mediaMeta?.mimeType });
                            await uploadMedia(msgId, dbMsg.conversationId, file);
                        } catch (err) {
                            console.error("Media upload retry failed:", err);
                        }
                    }
                });
                return;
            }
        } catch (e) {
            console.error("IndexedDB error in retry:", e);
        }
    }
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
        user: State.currentUser.id || State.currentUser._id || State.currentUser.username,
        status: { sent: false, delivered: false, seen: false },
        timestamp: Date.now()
    };

    if (!State.messages[to]) State.messages[to] = [];
    State.messages[to].unshift(message);
    State.messageIndex[message.tempId] = to;

    document.getElementById("messages").appendChild(createMessageElement(message));
    document.getElementById("messages-container").scrollTop = 99999;

    const conv = State.conversations.find(c => c.id === to);
    if (conv) {
        conv.lastMessage = formatLastMessage(message);
        conv.timestamp = message.timestamp;
    }
    if (typeof renderChatList === "function") {
        renderChatList(document.getElementById("chat-search")?.value.trim().toLowerCase() || "");
    }

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
        const token3 = typeof TokenStore !== "undefined" ? TokenStore.getToken() : null;
        const res = await fetch("/api/upload", {
            method: "POST",
            headers: token3 ? { "Authorization": "Bearer " + token3 } : {},
            credentials: "include",
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

        if (socket && socket.connected) {
            socket.emit("private_message", {
                message: {
                    tempId: msgId, to: receiver, type: "audio", content: realUrl,
                    caption: null, replyTo: msg?.replyTo || null,
                    clientTime: msg?.clientTime || Date.now()
                }
            });
        }

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
