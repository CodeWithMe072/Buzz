/**
 * status.js — WhatsApp-style status composer, viewer, and API integrations.
 */

(function () {
    // Current playing group details
    let activeGroup = null;
    let activeIndex = -1;
    let statusTimer = null;
    let statusProgressInterval = null;
    let currentBgColor = "#3f51b5"; // Default text status background

    // Playback state variables
    let isPaused = false;
    let pausedAtMs = 0;
    let currentSegmentDurationMs = 5000;
    let segmentStartTime = 0;
    let isMuted = false;

    // Initialize Status Composer
    function openStatusComposer() {
        const modal = document.getElementById("status-composer-modal");
        const selectorView = document.getElementById("status-composer-selector-view");
        const textView = document.getElementById("status-composer-text-view");
        const textarea = document.getElementById("status-composer-textarea");
        const canvas = document.getElementById("status-composer-canvas");

        if (!modal || !selectorView || !textView) return;

        // Reset composer state
        modal.style.display = "flex";
        selectorView.style.display = "flex";
        textView.style.display = "none";
        if (textarea) textarea.value = "";
        
        // Reset color dots active outline
        currentBgColor = "#3f51b5";
        if (canvas) canvas.style.background = currentBgColor;
        document.querySelectorAll(".status-canvas-color-dot").forEach(dot => {
            if (dot.dataset.color === currentBgColor) {
                dot.classList.add("active");
            } else {
                dot.classList.remove("active");
            }
        });
    }

    function closeStatusComposer() {
        const modal = document.getElementById("status-composer-modal");
        if (modal) modal.style.display = "none";
    }

    // Bind all status composer clicks and canvas color dots
    function initStatusModule() {
        if (window.statusModuleInitialized) return;
        window.statusModuleInitialized = true;

        console.log("[Status Module] Initializing events and bindings...");

        const modal = document.getElementById("status-composer-modal");
        const closeBtn = document.getElementById("status-composer-close-btn");
        const galleryOpt = document.getElementById("status-composer-opt-gallery");
        const textOpt = document.getElementById("status-composer-opt-text");
        const backBtn = document.getElementById("status-composer-text-back-btn");
        const sendTextBtn = document.getElementById("status-composer-text-send-btn");
        const textarea = document.getElementById("status-composer-textarea");
        const canvas = document.getElementById("status-composer-canvas");
        const galleryInput = document.getElementById("status-gallery-input");
        const optionsBtn = document.getElementById("status-options-btn");
        const composerTriggerBtn = document.getElementById("status-composer-trigger-btn");

        if (closeBtn) closeBtn.onclick = closeStatusComposer;
        if (modal) {
            modal.onclick = (e) => {
                if (e.target === modal) closeStatusComposer();
            };
        }

        // Options trigger
        if (composerTriggerBtn) {
            composerTriggerBtn.onclick = openStatusComposer;
        }

        if (optionsBtn) {
            optionsBtn.onclick = () => {
                showToast("Status privacy is set to: Mutual Connections", "info");
            };
        }

        // Dynamic binder for gallery file input
        function bindGalleryInputIfNeeded(gInput) {
            if (!gInput || gInput.dataset.listenerBound === "true") return;
            gInput.dataset.listenerBound = "true";

            gInput.onchange = async (e) => {
                const file = e.target.files?.[0];
                if (!file) return;

                closeStatusComposer();
                
                // Wrap in preview in camera overlay
                const url = URL.createObjectURL(file);
                window.statusGalleryFile = file; // Save reference for upload
                State.cameraMode = "status";

                if (typeof window.openCameraCaptureOverlay === "function") {
                    await window.openCameraCaptureOverlay();
                    
                    // Immediately switch camera capture to preview state
                    const videoStream = document.getElementById("camera-capture-video");
                    const imgPreview = document.getElementById("camera-capture-img-preview");
                    const videoPreview = document.getElementById("camera-capture-video-preview");
                    const captureControls = document.getElementById("camera-capture-controls-section");
                    const previewControls = document.getElementById("camera-preview-controls-section");
                    const captionContainer = document.getElementById("camera-preview-caption-container");
                    const captionInput = document.getElementById("camera-preview-caption-input");

                    if (videoStream) videoStream.style.display = "none";
                    if (captureControls) captureControls.style.display = "none";
                    if (previewControls) previewControls.style.display = "flex";
                    if (captionContainer) captionContainer.style.display = "block";
                    if (captionInput) captionInput.value = "";

                    // Hide save draft for gallery uploads
                    const draftBtn = document.getElementById("camera-preview-draft-btn");
                    if (draftBtn) draftBtn.style.display = "none";

                    // Save captured variables globally
                    window.capturedBlob = file;
                    window.capturedFileType = file.type.startsWith("video") ? "video" : "photo";

                    if (window.capturedFileType === "video") {
                        if (imgPreview) imgPreview.style.display = "none";
                        if (videoPreview) {
                            videoPreview.src = url;
                            videoPreview.style.display = "block";
                        }
                    } else {
                        if (videoPreview) videoPreview.style.display = "none";
                        if (imgPreview) {
                            imgPreview.src = url;
                            imgPreview.style.display = "block";
                        }
                    }
                }
                
                // Clear input
                gInput.value = "";
            };
        }

        // Gallery option click trigger
        if (galleryOpt) {
            galleryOpt.onclick = () => {
                const dynamicGalleryInput = document.getElementById("status-gallery-input");
                if (dynamicGalleryInput) {
                    bindGalleryInputIfNeeded(dynamicGalleryInput);
                    dynamicGalleryInput.click();
                } else {
                    console.warn("[Status Module] status-gallery-input not found in DOM");
                    showToast("Unable to start file upload.", "error");
                }
            };
        }

        // Text status option
        if (textOpt) {
            textOpt.onclick = () => {
                const selectorView = document.getElementById("status-composer-selector-view");
                const textView = document.getElementById("status-composer-text-view");
                if (selectorView && textView) {
                    selectorView.style.display = "none";
                    textView.style.display = "flex";
                    if (textarea) textarea.focus();
                }
            };
        }

        if (backBtn) {
            backBtn.onclick = () => {
                const selectorView = document.getElementById("status-composer-selector-view");
                const textView = document.getElementById("status-composer-text-view");
                if (selectorView && textView) {
                    selectorView.style.display = "flex";
                    textView.style.display = "none";
                }
            };
        }

        // Color Presets selection
        document.querySelectorAll(".status-canvas-color-dot").forEach(dot => {
            dot.onclick = () => {
                document.querySelectorAll(".status-canvas-color-dot").forEach(d => d.classList.remove("active"));
                dot.classList.add("active");
                currentBgColor = dot.dataset.color || "#3f51b5";
                if (canvas) canvas.style.background = currentBgColor;
                if (textarea) textarea.focus();
            };
        });

        // Send Text status submission
        if (sendTextBtn) {
            sendTextBtn.onclick = async () => {
                const text = textarea ? textarea.value.trim() : "";
                if (!text) {
                    showToast("Status message cannot be empty!", "error");
                    return;
                }

                sendTextBtn.disabled = true;
                sendTextBtn.style.opacity = "0.6";

                try {
                    const res = await apiRequest("POST", "/api/status", {
                        mediaType: "text",
                        textContent: text,
                        backgroundColor: currentBgColor
                    });

                    if (res && res.ok) {
                        showToast("Status updated successfully!", "success");
                        closeStatusComposer();
                        if (typeof window.renderStatusSidebar === "function") {
                            window.renderStatusSidebar();
                        }
                    } else {
                        showToast(res?.data?.message || "Failed to post status update", "error");
                    }
                } catch (err) {
                    console.error("Text status upload error:", err);
                    showToast("Failed to post status update", "error");
                } finally {
                    sendTextBtn.disabled = false;
                    sendTextBtn.style.opacity = "1";
                }
            };
        }

        // Bind left/right navigation and close clicks inside Status Viewer
        const screenBackBtn = document.getElementById("status-viewer-screen-back");
        const screenCloseBtn = document.getElementById("status-viewer-screen-close");
        const arrowLeftBtn = document.getElementById("status-viewer-arrow-left");
        const arrowRightBtn = document.getElementById("status-viewer-arrow-right");
        const navLeft = document.getElementById("status-viewer-nav-left");
        const navRight = document.getElementById("status-viewer-nav-right");
        const viewerOverlay = document.getElementById("status-viewer-overlay");

        if (screenBackBtn) screenBackBtn.onclick = closeStatusViewer;
        if (screenCloseBtn) screenCloseBtn.onclick = closeStatusViewer;
        if (arrowLeftBtn) {
            arrowLeftBtn.onclick = (e) => {
                e.stopPropagation();
                advanceSegment(-1);
            };
        }
        if (arrowRightBtn) {
            arrowRightBtn.onclick = (e) => {
                e.stopPropagation();
                advanceSegment(1);
            };
        }
        if (navLeft) {
            navLeft.onclick = (e) => {
                e.stopPropagation();
                advanceSegment(-1);
            };
        }
        if (navRight) {
            navRight.onclick = (e) => {
                e.stopPropagation();
                advanceSegment(1);
            };
        }
        if (viewerOverlay) {
            viewerOverlay.onclick = (e) => {
                if (e.target === viewerOverlay) closeStatusViewer();
            };
        }

        // Play/Pause button
        const playPauseBtn = document.getElementById("status-viewer-play-pause-btn");
        if (playPauseBtn) playPauseBtn.onclick = togglePlayPause;

        // Mute button
        const muteBtn = document.getElementById("status-viewer-mute-btn");
        if (muteBtn) muteBtn.onclick = toggleMute;

        // Reply inputs send triggers
        const replyInput = document.getElementById("status-viewer-reply-input");
        const replySendBtn = document.getElementById("status-viewer-reply-send-btn");

        if (replySendBtn) replySendBtn.onclick = handleSendStatusReply;
        if (replyInput) {
            replyInput.onkeydown = (e) => {
                if (e.key === "Enter") {
                    e.preventDefault();
                    handleSendStatusReply();
                }
            };
            // Pause status playback while user is typing a reply
            replyInput.onfocus = () => {
                if (!isPaused) togglePlayPause();
            };
        }
    }

    // ── Status Playback Viewer Overlay ──
    async function openStatusViewer(group) {
        console.log("[DEBUG] openStatusViewer called with group:", JSON.stringify(group));
        activeGroup = group;
        activeIndex = 0;
        isPaused = false;
        
        const overlay = document.getElementById("status-viewer-overlay");
        if (!overlay) {
            console.error("[DEBUG] #status-viewer-overlay not found in DOM!");
            return;
        }

        overlay.style.display = "flex";
        
        // Build segments
        buildProgressSegments();
        
        // Play first status
        await playCurrentStatusSegment();
    }

    function closeStatusViewer() {
        const overlay = document.getElementById("status-viewer-overlay");
        const video = document.getElementById("status-viewer-video");
        const img = document.getElementById("status-viewer-img");

        clearStatusTimers();

        if (overlay) overlay.style.display = "none";
        if (video) {
            video.pause();
            video.src = "";
            video.removeAttribute("src");
        }
        if (img) img.src = "";

        const optionsMenu = document.getElementById("status-viewer-options-menu");
        const confirmModal = document.getElementById("status-delete-confirm-modal");
        if (optionsMenu) optionsMenu.style.display = "none";
        if (confirmModal) confirmModal.style.display = "none";

        activeGroup = null;
        activeIndex = -1;
        isPaused = false;
    }

    function clearStatusTimers() {
        if (statusTimer) {
            clearTimeout(statusTimer);
            statusTimer = null;
        }
        if (statusProgressInterval) {
            clearInterval(statusProgressInterval);
            statusProgressInterval = null;
        }
    }

    function buildProgressSegments() {
        const container = document.getElementById("status-viewer-progress-container");
        if (!container || !activeGroup) return;

        container.innerHTML = "";
        const count = activeGroup.moments.length;
        
        for (let i = 0; i < count; i++) {
            const track = document.createElement("div");
            track.className = "status-progress-track";
            track.innerHTML = `<div class="status-progress-fill" id="status-fill-${i}"></div>`;
            container.appendChild(track);
        }
    }

    async function playCurrentStatusSegment() {
        console.log("[DEBUG] playCurrentStatusSegment activeIndex:", activeIndex, "moments:", JSON.stringify(activeGroup?.moments));
        clearStatusTimers();
        isPaused = false;
        pausedAtMs = 0;

        // Reset play/pause buttons
        const playIcon = document.getElementById("status-play-icon");
        const pauseIcon = document.getElementById("status-pause-icon");
        if (playIcon) playIcon.style.display = "none";
        if (pauseIcon) pauseIcon.style.display = "block";

        if (!activeGroup || activeIndex < 0 || activeIndex >= activeGroup.moments.length) {
            console.log("[DEBUG] playCurrentStatusSegment empty or bounds condition met. Closing viewer.");
            closeStatusViewer();
            return;
        }

        const moment = activeGroup.moments[activeIndex];
        console.log("[DEBUG] playCurrentStatusSegment playing moment:", JSON.stringify(moment));
        const resolvedType = moment.type || moment.mediaType || (moment.url ? (moment.url.match(/\.(mp4|webm|ogg|mov)/i) ? "video" : "image") : "text");
        const avatar = document.getElementById("status-viewer-avatar");
        const username = document.getElementById("status-viewer-username");
        const timeEl = document.getElementById("status-viewer-time");
        const img = document.getElementById("status-viewer-img");
        const video = document.getElementById("status-viewer-video");
        const textCanvas = document.getElementById("status-viewer-text-canvas");
        const captionBar = document.getElementById("status-viewer-caption-bar");
        const deleteBtn = document.getElementById("status-viewer-delete-btn");
        const replyContainer = document.getElementById("status-viewer-reply-container");

        // Set header details
        if (avatar) avatar.src = activeGroup.user.avatar || "/images/default-avatar.png";
        if (username) username.textContent = activeGroup.user.username;
        if (timeEl) {
            const relativeTime = typeof formatRelativeTime === "function" 
                ? formatRelativeTime(new Date(moment.createdAt)) 
                : new Date(moment.createdAt).toLocaleTimeString();
            timeEl.textContent = `Today at ${relativeTime}`;
        }

        // Viewers / Own status delete option
        const isOwn = activeGroup.user.id === (State.currentUser._id || State.currentUser.id);
        const optionsMenu = document.getElementById("status-viewer-options-menu");
        const confirmModal = document.getElementById("status-delete-confirm-modal");
        const optDelete = document.getElementById("status-viewer-opt-delete");
        const optDownload = document.getElementById("status-viewer-opt-download");

        // Always show the three-dot button for all statuses
        if (deleteBtn) {
            deleteBtn.style.display = "block";
            deleteBtn.onclick = (e) => {
                e.stopPropagation();
                if (!optionsMenu) return;
                
                const isOpen = optionsMenu.style.display === "block";
                if (isOpen) {
                    optionsMenu.style.display = "none";
                    if (isPaused) togglePlayPause();
                } else {
                    optionsMenu.style.display = "block";
                    if (!isPaused) togglePlayPause();
                }
            };
        }

        // Show Delete only for own, Download only for others
        if (optDelete) optDelete.style.display = isOwn ? "flex" : "none";
        if (optDownload) optDownload.style.display = isOwn ? "none" : "flex";

        if (optDelete) {
            optDelete.onclick = (e) => {
                e.stopPropagation();
                if (optionsMenu) optionsMenu.style.display = "none";
                if (confirmModal) {
                    confirmModal.style.display = "flex";
                }
            };
        }

        // Download handler — fetches the media blob and triggers browser download
        if (optDownload) {
            optDownload.onclick = async (e) => {
                e.stopPropagation();
                if (optionsMenu) optionsMenu.style.display = "none";
                if (isPaused) togglePlayPause();

                if (!moment.url && resolvedType === "text") {
                    showToast("Text statuses cannot be downloaded", "info");
                    return;
                }
                if (!moment.url) {
                    showToast("No media to download", "error");
                    return;
                }

                try {
                    showToast("Downloading status...", "info");
                    const response = await fetch(moment.url);
                    if (!response.ok) throw new Error("Download failed");
                    
                    const blob = await response.blob();
                    const ext = resolvedType === "video" ? "mp4" : "jpg";
                    const filename = `status_${activeGroup.user.username}_${Date.now()}.${ext}`;
                    
                    const a = document.createElement("a");
                    a.href = URL.createObjectURL(blob);
                    a.download = filename;
                    document.body.appendChild(a);
                    a.click();
                    document.body.removeChild(a);
                    URL.revokeObjectURL(a.href);
                    
                    showToast("Status downloaded!", "success");
                } catch (err) {
                    console.error("[Status Download]", err);
                    showToast("Failed to download status", "error");
                }
            };
        }

        const cancelBtn = document.getElementById("status-delete-cancel-btn");
        const confirmBtn = document.getElementById("status-delete-confirm-btn");

        if (cancelBtn) {
            cancelBtn.onclick = (e) => {
                e.stopPropagation();
                if (confirmModal) confirmModal.style.display = "none";
                if (isPaused) togglePlayPause();
            };
        }

        if (confirmBtn) {
            confirmBtn.onclick = async (e) => {
                e.stopPropagation();
                if (confirmModal) confirmModal.style.display = "none";
                
                clearStatusTimers();
                try {
                    const res = await apiRequest("DELETE", `/api/status/${moment._id}`);
                    if (res && res.ok) {
                        showToast("Status deleted", "success");
                        
                        if (typeof window.renderStatusSidebar === "function") {
                            window.renderStatusSidebar();
                        }
                        
                        activeGroup.moments.splice(activeIndex, 1);
                        if (activeGroup.moments.length === 0) {
                            closeStatusViewer();
                        } else {
                            buildProgressSegments();
                            if (activeIndex >= activeGroup.moments.length) {
                                activeIndex = activeGroup.moments.length - 1;
                            }
                            playCurrentStatusSegment();
                        }
                    } else {
                        showToast("Failed to delete status", "error");
                        if (isPaused) togglePlayPause();
                    }
                } catch (err) {
                    console.error(err);
                    showToast("Failed to delete status", "error");
                    if (isPaused) togglePlayPause();
                }
            };
        }

        // Mark status as viewed (only if not own)
        if (!isOwn) {
            try {
                await apiRequest("POST", `/api/status/${moment._id}/view`);
                // Update local seen state if active
                const hasViewed = moment.viewers.some(v => v.userId === State.currentUser._id);
                if (!hasViewed) {
                    moment.viewers.push({ userId: State.currentUser._id, viewedAt: new Date() });
                }
            } catch (err) {
                console.warn("Failed to mark status viewed:", err);
            }
        }

        // Show/hide reply container based on ownership
        if (replyContainer) {
            replyContainer.style.display = isOwn ? "none" : "flex";
            const replyInput = document.getElementById("status-viewer-reply-input");
            if (replyInput) replyInput.value = "";
        }

        // Set previous segments filled state
        for (let i = 0; i < activeGroup.moments.length; i++) {
            const fill = document.getElementById(`status-fill-${i}`);
            if (fill) {
                if (i < activeIndex) {
                    fill.style.width = "100%";
                    fill.classList.add("completed");
                } else {
                    fill.style.width = "0%";
                    fill.classList.remove("completed");
                }
            }
        }

        // Reset visibility
        if (img) img.style.display = "none";
        if (video) {
            video.style.display = "none";
            video.pause();
            video.src = "";
            video.removeAttribute("src");
        }
        if (textCanvas) textCanvas.style.display = "none";
        if (captionBar) {
            captionBar.style.display = "none";
            captionBar.textContent = "";
        }

        // Update blurred copy background
        const blurBg = document.getElementById("status-viewer-blurred-bg");
        if (blurBg) {
            if (resolvedType === "image" || resolvedType === "photo") {
                blurBg.style.backgroundImage = `url(${moment.url})`;
                blurBg.style.backgroundColor = "transparent";
            } else if (resolvedType === "text") {
                blurBg.style.backgroundImage = "none";
                blurBg.style.backgroundColor = moment.backgroundColor || "#3f51b5";
            } else if (resolvedType === "video") {
                blurBg.style.backgroundImage = "none";
                blurBg.style.backgroundColor = "#111112";
            }
        }

        // Handle Type
        if (resolvedType === "image" || resolvedType === "photo") {
            if (img) {
                img.src = moment.url;
                img.style.display = "block";
            }
            if (captionBar && moment.caption) {
                captionBar.textContent = moment.caption;
                captionBar.style.display = "block";
            }
            currentSegmentDurationMs = 5000;
            startSegmentProgressAnimation(currentSegmentDurationMs);
        } else if (resolvedType === "video") {
            if (video) {
                video.src = moment.url;
                video.style.display = "block";
                video.muted = isMuted;
                
                video.onloadedmetadata = () => {
                    const duration = video.duration || 5;
                    video.play();
                    currentSegmentDurationMs = duration * 1000;
                    startSegmentProgressAnimation(currentSegmentDurationMs);
                };
                
                video.onerror = () => {
                    showToast("Failed to load status video", "error");
                    advanceSegment(1);
                };
            }
            if (captionBar && moment.caption) {
                captionBar.textContent = moment.caption;
                captionBar.style.display = "block";
            }
        } else if (resolvedType === "text") {
            if (textCanvas) {
                textCanvas.style.display = "flex";
                textCanvas.textContent = moment.textContent;
                textCanvas.style.background = moment.backgroundColor || "#3f51b5";
            }
            currentSegmentDurationMs = 5000;
            startSegmentProgressAnimation(currentSegmentDurationMs);
        }
    }

    function startSegmentProgressAnimation(durationMs) {
        const fill = document.getElementById(`status-fill-${activeIndex}`);
        if (!fill) return;

        segmentStartTime = Date.now();
        
        statusProgressInterval = setInterval(() => {
            const elapsed = Date.now() - segmentStartTime;
            const percentage = Math.min(100, (elapsed / durationMs) * 100);
            fill.style.width = `${percentage}%`;
        }, 50);

        statusTimer = setTimeout(() => {
            advanceSegment(1);
        }, durationMs);
    }

    function togglePlayPause() {
        if (!activeGroup || activeIndex < 0) return;

        const fill = document.getElementById(`status-fill-${activeIndex}`);
        const video = document.getElementById("status-viewer-video");
        const playIcon = document.getElementById("status-play-icon");
        const pauseIcon = document.getElementById("status-pause-icon");

        if (isPaused) {
            // Resume playback
            isPaused = false;
            if (playIcon) playIcon.style.display = "none";
            if (pauseIcon) pauseIcon.style.display = "block";

            const moment = activeGroup.moments[activeIndex];
            if (moment.type === "video" && video) {
                video.play();
            }

            segmentStartTime = Date.now() - pausedAtMs;
            const remaining = currentSegmentDurationMs - pausedAtMs;

            statusProgressInterval = setInterval(() => {
                const elapsed = Date.now() - segmentStartTime;
                const percentage = Math.min(100, (elapsed / currentSegmentDurationMs) * 100);
                if (fill) fill.style.width = `${percentage}%`;
            }, 50);

            statusTimer = setTimeout(() => {
                advanceSegment(1);
            }, remaining);

        } else {
            // Pause playback
            isPaused = true;
            if (playIcon) playIcon.style.display = "block";
            if (pauseIcon) pauseIcon.style.display = "none";

            const moment = activeGroup.moments[activeIndex];
            if (moment.type === "video" && video) {
                video.pause();
            }

            clearStatusTimers();
            pausedAtMs = Date.now() - segmentStartTime;
        }
    }

    function toggleMute() {
        const video = document.getElementById("status-viewer-video");
        const unmuteIcon = document.getElementById("status-unmute-icon");
        const muteIcon = document.getElementById("status-mute-icon");

        isMuted = !isMuted;

        if (video) {
            video.muted = isMuted;
        }

        if (isMuted) {
            if (unmuteIcon) unmuteIcon.style.display = "none";
            if (muteIcon) muteIcon.style.display = "block";
        } else {
            if (unmuteIcon) unmuteIcon.style.display = "block";
            if (muteIcon) muteIcon.style.display = "none";
        }
    }

    function handleSendStatusReply() {
        const replyInput = document.getElementById("status-viewer-reply-input");
        const replyText = replyInput ? replyInput.value.trim() : "";
        
        if (!replyText || !activeGroup) return;

        const recipientId = activeGroup.user.id;
        const moment = activeGroup.moments[activeIndex];

        // Format message context block
        let statusPreviewText = "Photo/Video";
        if (moment.type === "text") {
            statusPreviewText = moment.textContent;
        } else if (moment.caption) {
            statusPreviewText = moment.caption;
        }
        
        const content = `💬 Replied to status:\n"${statusPreviewText}"\n\n${replyText}`;
        const tempId = generateId();

        // 1. Add to local state message cache if active or loaded
        if (State.messages[recipientId]) {
            const message = {
                tempId,
                id: tempId,
                type: "text",
                content,
                sender: "me",
                user: State.currentUser.id || State.currentUser._id,
                timestamp: Date.now(),
                replyTo: null,
                reactions: {},
                status: { sent: false, delivered: false, seen: false },
            };
            State.messages[recipientId].unshift(message);
            State.messageIndex[tempId] = recipientId;
            
            // If we are currently chatting with this user, append to DOM!
            if (State.activeChat === recipientId) {
                const messagesContainer = document.getElementById("messages");
                if (messagesContainer) {
                    messagesContainer.appendChild(createMessageElement(message));
                }
                const messagesScroll = document.getElementById("messages-container");
                if (messagesScroll) {
                    messagesScroll.scrollTop = 99999;
                }
            }
        }

        // 2. Update conversation list preview
        const conv = State.conversations.find(c => c.id === recipientId);
        if (conv) {
            conv.lastMessage = content;
            conv.timestamp = Date.now();
        }
        const searchInput = document.getElementById("chat-search");
        const searchQuery = searchInput ? searchInput.value.trim().toLowerCase() : "";
        if (typeof renderChatList === "function") {
            renderChatList(searchQuery);
        }

        // 3. Queue to Outbox for offline reliability
        if (typeof OutboxQueue !== "undefined" && OutboxQueue.add) {
            OutboxQueue.add({
                tempId, to: recipientId, type: "text", content,
                replyTo: null, clientTime: Date.now()
            });
        }

        // 4. Emit private message socket event
        if (typeof socket !== "undefined" && socket && socket.connected) {
            socket.emit("private_message", {
                message: {
                    tempId, to: recipientId, type: "text", content,
                    replyTo: null, clientTime: Date.now()
                }
            });
        }

        showToast("Reply sent successfully!", "success");

        // Clear and unfocus input
        if (replyInput) {
            replyInput.value = "";
            replyInput.blur();
        }

        // Resume status playback
        if (isPaused) {
            togglePlayPause();
        }
    }

    function advanceSegment(direction) {
        clearStatusTimers();
        
        const nextIdx = activeIndex + direction;
        
        if (nextIdx < 0) {
            activeIndex = 0; // lock at beginning
            playCurrentStatusSegment();
        } else if (nextIdx >= activeGroup.moments.length) {
            // End of statuses for this user
            closeStatusViewer();
            
            // Reload connection sidebar status rings
            if (typeof window.renderStatusSidebar === "function") {
                window.renderStatusSidebar();
            }
        } else {
            activeIndex = nextIdx;
            playCurrentStatusSegment();
        }
    }

    async function handleStatusMediaUpload(blobToUpload, typeToUpload) {
        const sendBtn = document.getElementById("camera-preview-send-btn");
        if (sendBtn) {
            sendBtn.disabled = true;
            sendBtn.style.opacity = "0.5";
            sendBtn.textContent = "Uploading status...";
        }
        
        const captionInput = document.getElementById("camera-preview-caption-input");
        const caption = captionInput ? captionInput.value.trim() : "";
        
        const tempId = "status_" + Date.now();
        const extension = (typeToUpload || "").includes("video") ? "mp4" : "jpg";
        const mimeType = (typeToUpload || "").includes("video") ? "video/mp4" : "image/jpeg";
        const file = new File([blobToUpload], `status_${Date.now()}.${extension}`, { type: mimeType });

        try {
            // Upload using existing chunked upload pipeline
            const uploadRes = await uploadFileInChunks(file, tempId);
            const finalUrl = uploadRes?.original || uploadRes?.data?.url;
            if (uploadRes && finalUrl) {
                const statusRes = await apiRequest("POST", "/api/status", {
                    mediaUrl: finalUrl,
                    mediaType: (typeToUpload || "").includes("video") ? "video" : "image",
                    caption: caption
                });

                if (statusRes && statusRes.status) {
                    showToast("Status posted successfully!", "success");
                    if (typeof window.closeCameraCaptureOverlay === "function") {
                        window.closeCameraCaptureOverlay();
                    }
                    if (typeof window.renderStatusSidebar === "function") {
                        window.renderStatusSidebar();
                    }
                } else {
                    showToast(statusRes?.message || "Failed to upload status", "error");
                }
            } else {
                showToast("Failed to upload status media", "error");
            }
        } catch (err) {
            console.error("Status upload error:", err);
            showToast("Failed to upload status", "error");
        } finally {
            if (sendBtn) {
                sendBtn.disabled = false;
                sendBtn.style.opacity = "1";
                sendBtn.textContent = "Send to Chat";
            }
        }
    }

    // Auto run initialization
    if (document.readyState !== "loading") {
        initStatusModule();
    } else {
        document.addEventListener("DOMContentLoaded", initStatusModule);
    }

    document.addEventListener("click", (e) => {
        const menu = document.getElementById("status-viewer-options-menu");
        if (menu && menu.style.display === "block") {
            const deleteBtn = document.getElementById("status-viewer-delete-btn");
            if (!menu.contains(e.target) && e.target !== deleteBtn && (!deleteBtn || !deleteBtn.contains(e.target))) {
                menu.style.display = "none";
                if (isPaused && activeGroup) {
                    togglePlayPause();
                }
            }
        }
    });

    /**
     * handleRemoteStatusDeletion — called via socket when another session
     * (or the user themselves on another tab) deletes a status.
     * Removes the moment from the active viewer; closes the viewer if none remain.
     */
    function handleRemoteStatusDeletion(statusId, ownerUserId) {
        if (!activeGroup) return; // viewer is not open, nothing to do

        // Check if the viewer is currently showing statuses from the user who deleted
        if (activeGroup.user && activeGroup.user.id !== ownerUserId) return;

        // Find and remove the deleted moment
        const idx = activeGroup.moments.findIndex(m => m._id === statusId);
        if (idx === -1) return; // this status is not in the current viewer

        activeGroup.moments.splice(idx, 1);

        // If no moments remain, close the viewer entirely
        if (activeGroup.moments.length === 0) {
            closeStatusViewer();
            return;
        }

        // Adjust the active index if the deleted item was at or before the current position
        if (idx < activeIndex) {
            activeIndex--;
        } else if (idx === activeIndex) {
            // We were viewing the deleted status — clamp index and replay
            if (activeIndex >= activeGroup.moments.length) {
                activeIndex = activeGroup.moments.length - 1;
            }
        }

        // Rebuild progress bar and continue playback
        buildProgressSegments();
        playCurrentStatusSegment();
    }

    // Expose helpers
    window.openStatusComposer = openStatusComposer;
    window.openStatusViewer = openStatusViewer;
    window.closeStatusViewer = closeStatusViewer;
    window.initStatusModule = initStatusModule;
    window.handleStatusMediaUpload = handleStatusMediaUpload;
    window.handleRemoteStatusDeletion = handleRemoteStatusDeletion;
})();

