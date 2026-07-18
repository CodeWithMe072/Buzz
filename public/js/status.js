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
    const statusViewerAudio = new Audio();

    // ── WhatsApp-style "Sending..." state on My Status card ─────────────────
    function showStatusSendingState() {
        const myStatusCard = document.getElementById("my-status-item");
        if (!myStatusCard) return;

        const avatarContainer = myStatusCard.querySelector(".avatar-container");
        const myStatusSubtext = myStatusCard.querySelector(".my-status-subtext");

        // Animated dashed ring — mimics WhatsApp's uploading indicator
        if (avatarContainer) {
            const size = 48;
            const stroke = 2.5;
            const r = (size / 2) - stroke;
            const circ = 2 * Math.PI * r;
            avatarContainer.className = "avatar-container";
            avatarContainer.setAttribute("style", "position: relative; width: 48px; height: 48px; flex-shrink: 0;");
            avatarContainer.innerHTML = `
                <svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" style="position:absolute;top:0;left:0;z-index:3;">
                    <circle
                        cx="${size/2}" cy="${size/2}" r="${r}"
                        fill="none"
                        stroke="rgba(255,255,255,0.15)"
                        stroke-width="${stroke}"
                    />
                    <circle
                        cx="${size/2}" cy="${size/2}" r="${r}"
                        fill="none"
                        stroke="#25d366"
                        stroke-width="${stroke}"
                        stroke-dasharray="${circ}"
                        stroke-dashoffset="${circ * 0.35}"
                        stroke-linecap="round"
                        transform="rotate(-90 ${size/2} ${size/2})"
                        style="animation: status-sending-spin 1.2s linear infinite; transform-origin: ${size/2}px ${size/2}px;"
                    />
                </svg>
                <div style="position:absolute;top:4px;left:4px;width:40px;height:40px;border-radius:50%;background:var(--elevated-bg);border:2px solid var(--border-color);display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;color:rgba(255,255,255,0.5);">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
                        <polyline points="22 2 11 13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>
                    </svg>
                </div>
            `;
        }

        if (myStatusSubtext) {
            myStatusSubtext.innerHTML = `<span style="color:#25d366;font-size:12px;">⏳ Sending...</span>`;
        }

        myStatusCard.onclick = null; // Disable click while sending
    }

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

        if (typeof initStatusSongFeatures === "function") {
            initStatusSongFeatures();
        }

        const videoPreview = document.getElementById("camera-capture-video-preview");
        const trimmerAudio = document.getElementById("camera-preview-audio");

        if (videoPreview) {
            const playOverlay = document.getElementById("video-preview-play-overlay");

            videoPreview.onclick = () => {
                if (videoPreview.paused) {
                    videoPreview.play().catch(() => {});
                } else {
                    videoPreview.pause();
                }
            };

            videoPreview.onplay = () => {
                if (playOverlay) playOverlay.style.display = "none";
                if (window.pendingStatusSongRef && trimmerAudio) {
                    videoPreview.muted = true;
                    if (trimmerAudio.paused) {
                        const startT = window.pendingStatusSongRef.startTime || 0;
                        trimmerAudio.currentTime = startT;
                        trimmerAudio.muted = window.isPreviewMuted || false;
                        trimmerAudio.play().catch(() => {});
                    }
                } else {
                    videoPreview.muted = window.isPreviewMuted || false;
                    if (trimmerAudio) {
                        trimmerAudio.pause();
                    }
                }
            };

            videoPreview.onpause = () => {
                if (playOverlay) playOverlay.style.display = "flex";
                if (trimmerAudio) {
                    trimmerAudio.pause();
                }
            };

            videoPreview.ontimeupdate = () => {
                if (window.pendingStatusSongRef && trimmerAudio) {
                    videoPreview.muted = true;
                    // If video loops (currentTime goes back to near 0), restart the trimmer audio from selection start
                    if (videoPreview.currentTime < 0.25 && Math.abs(trimmerAudio.currentTime - (window.pendingStatusSongRef.startTime || 0)) > 1.0) {
                        const startT = window.pendingStatusSongRef.startTime || 0;
                        trimmerAudio.currentTime = startT;
                        trimmerAudio.muted = window.isPreviewMuted || false;
                        if (trimmerAudio.paused) {
                            trimmerAudio.play().catch(() => {});
                        }
                    }
                }
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
                
                if (typeof window.saveStatusPendingUpload === "function") {
                    const tempId = await window.saveStatusPendingUpload(file);
                    window.currentStatusUploadId = tempId;
                }

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

                    // Set send button text to Update Status
                    const sendBtn = document.getElementById("camera-preview-send-btn");
                    if (sendBtn) {
                        const span = sendBtn.querySelector("span");
                        if (span) span.textContent = "Update Status";
                    }

                    // Hide save draft for gallery uploads
                    const draftBtn = document.getElementById("camera-preview-draft-btn");
                    if (draftBtn) draftBtn.style.display = "none";

                    // Show/hide mute button for gallery preview
                    const isVideo = file.type.startsWith("video");
                    const muteBtn = document.getElementById("camera-preview-mute-btn");
                    if (muteBtn) {
                        muteBtn.style.display = isVideo ? "flex" : "none";
                    }
                    const songBtn = document.getElementById("camera-preview-song-btn");
                    if (songBtn) {
                        songBtn.style.display = (State.cameraMode === "status") ? "flex" : "none";
                    }
                    if (typeof updateSongBadgeVisibility === "function") {
                        updateSongBadgeVisibility();
                    }
                    if (isVideo && videoPreview) {
                        videoPreview.muted = window.isPreviewMuted;
                    }

                    // Save captured variables globally
                    window.capturedBlob = file;
                    window.capturedFileType = file.type.startsWith("video") ? "video" : "photo";

                    if (window.capturedFileType === "video") {
                        if (imgPreview) imgPreview.style.display = "none";
                        if (videoPreview) {
                            videoPreview.src = url;
                            videoPreview.style.display = "block";
                            videoPreview.play().catch(() => {});
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
                closeStatusComposer();
                showStatusSendingState(); // Show WhatsApp-style sending indicator

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
        
        // Reset status viewer audio stream
        statusViewerAudio.pause();
        statusViewerAudio.src = "";

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

        const viewedCard = document.getElementById("status-viewer-viewed-by-card");
        const eyeContainer = document.getElementById("status-viewer-eye-container");
        if (viewedCard) viewedCard.style.display = "none";
        if (eyeContainer) eyeContainer.style.display = "none";

        const songSheet = document.getElementById("status-viewer-song-sheet");
        if (songSheet) {
            songSheet.style.display = "none";
            songSheet.style.transform = "translateY(100%)";
        }

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
        
        // Pause status viewer audio on transition/pause
        statusViewerAudio.pause();
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

        clearStatusTimers();
        isPaused = false;
        pausedAtMs = 0;

        // Reset play/pause buttons
        const playIcon = document.getElementById("status-play-icon");
        const pauseIcon = document.getElementById("status-pause-icon");
        if (playIcon) playIcon.style.display = "none";
        if (pauseIcon) pauseIcon.style.display = "block";

        if (!activeGroup || activeIndex < 0 || activeIndex >= activeGroup.moments.length) {

            closeStatusViewer();
            return;
        }

        const moment = activeGroup.moments[activeIndex];

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

        // Song Attribution Row configuration
        const songAttributionEl = document.getElementById("status-viewer-song-attribution");
        const songNameEl = document.getElementById("status-viewer-song-name");
        const songMarqueeWrapper = document.getElementById("status-viewer-song-marquee-wrapper");
        
        if (songAttributionEl && songNameEl && songMarqueeWrapper) {
            // Close song sheet on segment transitions
            const songSheet = document.getElementById("status-viewer-song-sheet");
            if (songSheet) {
                songSheet.style.display = "none";
                songSheet.style.transform = "translateY(100%)";
            }

            if (moment.songRef && moment.songRef.title) {
                songAttributionEl.style.display = "flex";
                const displayText = moment.songRef.channelTitle 
                    ? `${moment.songRef.title} — ${moment.songRef.channelTitle}`
                    : moment.songRef.title;
                songNameEl.textContent = displayText;
                
                // Reset wrapper state
                songMarqueeWrapper.style.animation = "none";
                songMarqueeWrapper.style.transform = "translateX(0)";
                const duplicate = songMarqueeWrapper.querySelector(".marquee-duplicate");
                if (duplicate) duplicate.remove();
                
                // Measure after layout stabilizes
                setTimeout(() => {
                    const marqueeContainer = document.getElementById("status-viewer-song-marquee-container");
                    if (!marqueeContainer) return;
                    const containerWidth = marqueeContainer.clientWidth;
                    const textWidth = songNameEl.offsetWidth;
                    
                    if (textWidth > containerWidth) {
                        // Create clone for seamless loop
                        const clone = songNameEl.cloneNode(true);
                        clone.classList.add("marquee-duplicate");
                        clone.style.paddingLeft = "30px";
                        songMarqueeWrapper.appendChild(clone);
                        
                        const scrollDistance = textWidth + 30;
                        
                        // Inject or update dynamic keyframe style
                        let styleTag = document.getElementById("status-marquee-dynamic-style");
                        if (!styleTag) {
                            styleTag = document.createElement("style");
                            styleTag.id = "status-marquee-dynamic-style";
                            document.head.appendChild(styleTag);
                        }
                        
                        // Speed: 35px per second
                        const duration = scrollDistance / 35;
                        styleTag.innerHTML = `
                            @keyframes statusMarqueeAnim {
                                0% { transform: translateX(0); }
                                100% { transform: translate3d(-${scrollDistance}px, 0, 0); }
                            }
                        `;
                        
                        songMarqueeWrapper.style.animation = `statusMarqueeAnim ${duration}s linear infinite`;
                    }
                }, 50);
                
                // Set up click/tap on the row to open the bottom sheet
                songAttributionEl.onclick = (e) => {
                    e.stopPropagation();
                    openSongSheet(moment.songRef);
                };
            } else {
                songAttributionEl.style.display = "none";
                songNameEl.textContent = "";
                songMarqueeWrapper.style.animation = "none";
                songMarqueeWrapper.style.transform = "translateX(0)";
                const duplicate = songMarqueeWrapper.querySelector(".marquee-duplicate");
                if (duplicate) duplicate.remove();
            }
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

        const optExtend = document.getElementById("status-viewer-opt-extend");
        const extendModal = document.getElementById("status-extend-modal");
        const extendCancelBtn = document.getElementById("status-extend-cancel-btn");
        const extendConfirmBtn = document.getElementById("status-extend-confirm-btn");
        const extendAmountInput = document.getElementById("status-extend-amount");
        const extendUnitSelect = document.getElementById("status-extend-unit");

        // Show Delete and Extend only for own, Download only for others
        if (optDelete) optDelete.style.display = isOwn ? "flex" : "none";
        if (optExtend) optExtend.style.display = isOwn ? "flex" : "none";
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

        if (optExtend) {
            optExtend.onclick = (e) => {
                e.stopPropagation();
                if (optionsMenu) optionsMenu.style.display = "none";
                if (extendModal) {
                    extendModal.style.display = "flex";
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
                    const url = URL.createObjectURL(blob);
                    
                    const a = document.createElement("a");
                    a.href = url;
                    a.download = moment.fileName || `status_${moment._id}.${resolvedType === "video" ? "mp4" : "jpg"}`;
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

        if (extendCancelBtn) {
            extendCancelBtn.onclick = (e) => {
                e.stopPropagation();
                if (extendModal) extendModal.style.display = "none";
                if (isPaused) togglePlayPause();
            };
        }

        if (extendConfirmBtn) {
            extendConfirmBtn.onclick = async (e) => {
                e.stopPropagation();
                const amount = parseInt(extendAmountInput?.value, 10);
                const unit = extendUnitSelect?.value;

                if (!amount || isNaN(amount) || amount <= 0) {
                    showToast("Please enter a valid positive number", "error");
                    return;
                }

                if (extendModal) extendModal.style.display = "none";

                try {
                    showToast("Extending status...", "info");
                    const res = await apiRequest("POST", `/api/status/${moment._id}/extend`, { amount, unit });
                    const data = await res.json();
                    if (res && res.ok) {
                        showToast(data.message || "Status extended", "success");
                        
                        // Update local State.myActiveStatuses
                        if (State.myActiveStatuses) {
                            const myStatus = State.myActiveStatuses.find(m => m._id === moment._id);
                            if (myStatus) {
                                myStatus.expiresAt = data.newExpiresAt;
                            }
                        }
                        
                        // Update current moment object so the viewer knows
                        moment.expiresAt = data.newExpiresAt;

                        // Resume playback
                        if (isPaused) togglePlayPause();
                    } else {
                        showToast(data.message || "Failed to extend status", "error");
                        if (isPaused) togglePlayPause();
                    }
                } catch (err) {
                    console.error("[Status Extend]", err);
                    showToast("Failed to extend status", "error");
                    if (isPaused) togglePlayPause();
                }
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

                // ── Update in-memory State — no API refetch needed ────────────────
                const currentId = State.currentUser?._id?.toString() || State.currentUser?.id?.toString() || "";
                const hasViewed = moment.viewers.some(v => {
                    const vId = v?.userId?._id ? v.userId._id.toString() : (v?.userId ? v.userId.toString() : "");
                    return vId === currentId;
                });
                if (!hasViewed) {
                    moment.viewers.push({ userId: currentId, viewedAt: new Date() });
                }

                // Also update the matching moment in State.statusFeed
                if (State.statusFeed) {
                    for (const group of State.statusFeed) {
                        const m = (group.moments || []).find(m => m._id === moment._id);
                        if (m) {
                            const alreadyIn = m.viewers.some(v => {
                                const vId = v?.userId?._id ? v.userId._id.toString() : (v?.userId ? v.userId.toString() : "");
                                return vId === currentId;
                            });
                            if (!alreadyIn) m.viewers.push({ userId: currentId, viewedAt: new Date() });
                            break;
                        }
                    }
                }

                // Re-render sidebar + dot from State (both are now synchronous, zero API calls)
                if (typeof window.renderStatusSidebar === "function") {
                    window.renderStatusSidebar();
                }
                if (typeof window.updateStatusUnseenIndicator === "function") {
                    window.updateStatusUnseenIndicator();
                }
            } catch (err) {
                console.warn("Failed to mark status viewed:", err);
            }
        }


        // Hide Viewed-by card when segment changes
        const viewedByCard = document.getElementById("status-viewer-viewed-by-card");
        if (viewedByCard) viewedByCard.style.display = "none";

        // Show/hide reply container based on ownership
        if (replyContainer) {
            replyContainer.style.display = isOwn ? "none" : "flex";
            const replyInput = document.getElementById("status-viewer-reply-input");
            if (replyInput) replyInput.value = "";
        }

        // Show/hide eye container and viewed list trigger for own status
        const eyeBtn = document.getElementById("status-viewer-eye-container");
        const eyeCount = document.getElementById("status-viewer-eye-count");
        if (eyeBtn) {
            if (isOwn) {
                const viewCount = moment.viewers ? moment.viewers.length : 0;
                if (eyeCount) eyeCount.textContent = viewCount;
                eyeBtn.style.display = "flex";
                if (captionBar) captionBar.style.bottom = "52px";

                eyeBtn.onclick = (e) => {
                    e.stopPropagation();
                    if (!viewedByCard) return;

                    const isOpen = viewedByCard.style.display === "flex";
                    if (isOpen) {
                        viewedByCard.style.display = "none";
                        if (isPaused) togglePlayPause();
                    } else {
                        viewedByCard.style.display = "flex";
                        if (!isPaused) togglePlayPause();

                        const viewedByTitle = document.getElementById("status-viewer-viewed-by-title");
                        const viewedByList = document.getElementById("status-viewer-viewed-by-list");
                        if (viewedByTitle) viewedByTitle.textContent = `Viewed by ${viewCount}`;
                        if (viewedByList) {
                            viewedByList.innerHTML = "";
                            const viewers = moment.viewers || [];
                            if (viewers.length === 0) {
                                viewedByList.innerHTML = `
                                    <div style="flex: 1; display: flex; align-items: center; justify-content: center; font-size: 13.5px; color: rgba(255,255,255,0.45); font-weight: 500; height: 180px;">
                                        No views yet
                                    </div>`;
                            } else {
                                viewers.forEach(v => {
                                    const avatarHtml = (v.avatar && v.avatar.length > 2)
                                        ? `<img src="${v.avatar}" style="width: 38px; height: 38px; border-radius: 50%; object-fit: cover;" />`
                                        : `<div style="width: 38px; height: 38px; border-radius: 50%; background: #dd2a7b; color: white; display: flex; align-items: center; justify-content: center; font-weight: bold; font-size: 14px;">${v.avatar || "S"}</div>`;
                                    
                                    const rawDate = new Date(v.viewedAt);
                                    const hours = rawDate.getHours();
                                    const minutes = rawDate.getMinutes().toString().padStart(2, '0');
                                    const ampm = hours >= 12 ? 'pm' : 'am';
                                    const displayHours = hours % 12 || 12;
                                    const timeStr = `${displayHours}:${minutes} ${ampm}`;

                                    viewedByList.innerHTML += `
                                        <div style="display: flex; align-items: center; gap: 12px; padding: 6px 0; border-bottom: 1px solid rgba(255,255,255,0.03);">
                                            ${avatarHtml}
                                            <div style="display: flex; flex-direction: column; gap: 1px;">
                                                <span style="font-size: 13.5px; font-weight: 600; color: white;">${v.username}</span>
                                                <span style="font-size: 11px; color: rgba(255,255,255,0.55);">Today at ${timeStr}</span>
                                            </div>
                                        </div>`;
                                });
                            }
                        }
                    }
                };
            } else {
                eyeBtn.style.display = "none";
                if (captionBar) captionBar.style.bottom = "16px";
            }
        }

        // Viewed-by card close handler
        const closeViewedBtn = document.getElementById("status-viewer-viewed-by-close");
        if (closeViewedBtn && viewedByCard) {
            closeViewedBtn.onclick = (e) => {
                e.stopPropagation();
                viewedByCard.style.display = "none";
                if (isPaused) togglePlayPause();
            };
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
        const songInfoEl = document.getElementById("status-viewer-song-info");
        const songTextEl = document.getElementById("status-viewer-song-text");
        if (songInfoEl) {
            songInfoEl.style.display = "none";
            songInfoEl.onclick = null;
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
                
                // Mute if the source URL specifies it is muted, or global mute is on
                const hasMutedUrl = moment.url && (moment.url.includes("muted=1") || moment.url.includes("muted=true"));
                video.muted = hasMutedUrl || isMuted;
                
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
        
        // Reset status viewer audio on segment transition
        statusViewerAudio.pause();
        statusViewerAudio.src = "";
        if (songInfoEl) songInfoEl.style.display = "none";

        if (moment.songRef) {
            if (songInfoEl && songTextEl) {
                songTextEl.textContent = `${moment.songRef.title} — ${moment.songRef.channelTitle}`;
                songInfoEl.style.display = "flex";
                songInfoEl.onclick = (e) => {
                    e.stopPropagation();
                    if (moment.songRef.youtubeVideoId) {
                        window.open(`https://www.youtube.com/watch?v=${moment.songRef.youtubeVideoId}`, "_blank");
                    }
                };
            }

            // Play background music if song has audioUrl AND moment is not a video
            if (moment.songRef.audioUrl && moment.type !== "video" && moment.mediaType !== "video") {
                statusViewerAudio.src = moment.songRef.audioUrl;
                statusViewerAudio.muted = isMuted; // Use current mute state
                
                const startOffset = moment.songRef.startTime || 0;
                statusViewerAudio.currentTime = startOffset;
                
                statusViewerAudio.play().catch(err => {
                    console.warn("[Status Viewer] Audio playback failed:", err.message);
                });

                // Loop playback inside the 15s window
                statusViewerAudio.ontimeupdate = () => {
                    if (statusViewerAudio.paused) return;
                    const elapsed = statusViewerAudio.currentTime - startOffset;
                    if (elapsed >= 15 || statusViewerAudio.currentTime >= statusViewerAudio.duration || elapsed < 0) {
                        statusViewerAudio.currentTime = startOffset;
                    }
                };
            }
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
            if (statusViewerAudio.src) {
                statusViewerAudio.play().catch(() => {});
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
            statusViewerAudio.pause();

            clearStatusTimers();
            pausedAtMs = Date.now() - segmentStartTime;
        }
    }

    function openSongSheet(songRef) {
        const sheet = document.getElementById("status-viewer-song-sheet");
        const thumb = document.getElementById("status-viewer-sheet-thumb");
        const title = document.getElementById("status-viewer-sheet-title");
        const artist = document.getElementById("status-viewer-sheet-artist");
        const youtubeBtn = document.getElementById("status-viewer-sheet-youtube");
        const closeBtn = document.getElementById("status-viewer-sheet-close");

        if (!sheet) return;

        // Set song details
        if (thumb) thumb.src = songRef.thumbnailUrl || "/images/default-avatar.png";
        if (title) title.textContent = songRef.title || "Unknown Song";
        if (artist) artist.textContent = songRef.channelTitle || "Unknown Artist";

        if (youtubeBtn) {
            youtubeBtn.onclick = (e) => {
                e.stopPropagation();
                if (songRef.youtubeVideoId) {
                    window.open(`https://www.youtube.com/watch?v=${songRef.youtubeVideoId}`, "_blank");
                }
            };
        }

        if (closeBtn) {
            closeBtn.onclick = (e) => {
                e.stopPropagation();
                closeSongSheet();
            };
        }

        // Show sheet and slide it up
        sheet.style.display = "block";
        sheet.offsetHeight; // Force reflow
        sheet.style.transform = "translateY(0)";

        // Pause status playback if not already paused
        if (!isPaused) {
            togglePlayPause();
        }
    }

    function closeSongSheet() {
        const sheet = document.getElementById("status-viewer-song-sheet");
        if (!sheet) return;

        sheet.style.transform = "translateY(100%)";
        setTimeout(() => {
            sheet.style.display = "none";
        }, 300);

        // Resume status playback if paused
        if (isPaused) {
            togglePlayPause();
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
        statusViewerAudio.muted = isMuted;

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
        let statusPreviewText = "Status";
        if (moment.type === "image" || moment.type === "photo") {
            statusPreviewText = moment.caption || "Photo";
        } else if (moment.type === "video") {
            statusPreviewText = moment.caption || "Video";
        }
        
        const replyData = {
            isStatusReply: true,
            statusId: moment._id,
            statusType: moment.type,
            statusUrl: moment.url || null,
            statusText: statusPreviewText,
            statusBg: moment.backgroundColor || null,
            replyText: replyText,
            senderName: activeGroup.user.id === (State.currentUser._id || State.currentUser.id) ? "My Status" : activeGroup.user.username
        };
        const content = JSON.stringify(replyData);
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

    // ── Background Status Upload & Retry Queue ──
    const StatusUploadQueue = {
        isFlushing: false,

        async init() {
            if (!window.IndexedDBQueueService || !window.IndexedDBQueueService.db) {
                setTimeout(() => this.init(), 100);
                return;
            }

            this.flush().catch(err => console.error("[StatusUploadQueue] Init flush error:", err));
        },

        async add(tempId, file, caption) {

            const uploadRecord = {
                localId: tempId,
                status: "status_queued",
                mediaBlob: file,
                caption: caption,
                isMuted: window.isPreviewMuted || false,
                songRef: window.pendingStatusSongRef || null,
                createdAt: Date.now(),
                retries: 0
            };
            if (window.IndexedDBQueueService) {
                await window.IndexedDBQueueService.saveMessage(uploadRecord);
            }
            this.flush();
        },

        async remove(tempId) {

            if (window.IndexedDBQueueService) {
                await window.IndexedDBQueueService.deleteMessage(tempId);
            }
        },

        async flush() {
            if (this.isFlushing) return;
            this.isFlushing = true;
            try {
                if (!window.IndexedDBQueueService) return;
                const items = await window.IndexedDBQueueService.getAllStatusUploads();
                const online = typeof NetworkMonitor !== "undefined" ? NetworkMonitor.isOnline : navigator.onLine;
                if (!online) {

                    this.isFlushing = false;
                    return;
                }

                for (const item of items) {
                    if (item.status === "status_pending_preview") {
                        continue;
                    }
                    if (item.status === "status_failed_upload" && item.retries >= 5) {
                        continue;
                    }
                    if (navigator.locks) {
                        await navigator.locks.request(`status_upload_${item.localId}`, { ifAvailable: true }, async (lock) => {
                            if (!lock) {

                                return;
                            }
                            await this.uploadItem(item);
                        });
                    } else {
                        await this.uploadItem(item);
                    }
                }
            } catch (err) {
                console.error("[StatusUploadQueue] Flush error:", err);
            } finally {
                this.isFlushing = false;
            }
        },

        async uploadItem(item) {
            showStatusSendingState(); // Show WhatsApp-style sending indicator

            const tempId = item.localId;
            const file = item.mediaBlob;
            const caption = item.caption;

            item.status = "status_uploading_media";
            await window.IndexedDBQueueService.saveMessage(item);

            try {
                const uploadRes = await uploadFileInChunks(file, tempId);
                let finalUrl = uploadRes?.original || uploadRes?.data?.url;
                if (!finalUrl) {
                    throw new Error("No final url returned from chunked upload");
                }

                item.status = "status_creating";
                await window.IndexedDBQueueService.saveMessage(item);

                if (item.isMuted) {
                    finalUrl += (finalUrl.includes('?') ? '&' : '?') + 'muted=1';
                }

                const statusRes = await apiRequest("POST", "/api/status", {
                    mediaUrl: finalUrl,
                    mediaType: file.type.startsWith("video") ? "video" : "image",
                    caption: caption,
                    songRef: item.songRef || null
                });

                if (statusRes && statusRes.status) {
                    await this.remove(tempId);
                    if (statusRes.data && statusRes.data.songMergeFailed) {
                        showToast("Music couldn't be merged into video — playing it alongside your status instead", "warning");
                    } else {
                        showToast("Status updated successfully!", "success");
                    }
                    if (typeof window.renderStatusSidebar === "function") {
                        window.renderStatusSidebar();
                    }
                } else {
                    throw new Error(statusRes?.message || "Failed to create status");
                }
            } catch (err) {
                console.error("[StatusUploadQueue] Failed uploading status item:", tempId, err);
                item.status = "status_failed_upload";
                item.retries = (item.retries || 0) + 1;
                await window.IndexedDBQueueService.saveMessage(item);
                
                if (item.retries < 5) {
                    const delay = Math.pow(2, item.retries) * 1000;

                    setTimeout(() => {
                        this.flush();
                    }, delay);
                } else {
                    showToast("Status upload failed after maximum retries.", "error");
                }
            }
        }
    };

    window.saveStatusPendingUpload = async function(file) {
        const tempId = "status_" + Date.now();
        const uploadRecord = {
            localId: tempId,
            status: "status_pending_preview",
            mediaBlob: file,
            caption: "",
            createdAt: Date.now(),
            retries: 0
        };
        if (window.IndexedDBQueueService) {
            await window.IndexedDBQueueService.saveMessage(uploadRecord);
        }
        return tempId;
    };

    window.updateStatusPendingCaptionAndUpload = async function(tempId, caption, wasMuted, songRef) {
        if (!tempId) return;
        if (window.IndexedDBQueueService) {
            const record = await window.IndexedDBQueueService.getMessage(tempId);
            if (record) {
                record.caption = caption;
                record.status = "status_queued";
                record.isMuted = wasMuted !== undefined ? wasMuted : (window.isPreviewMuted || false); // Save final preview mute state
                record.songRef = songRef !== undefined ? songRef : (window.pendingStatusSongRef || null);
                await window.IndexedDBQueueService.saveMessage(record);
            }
        }
        StatusUploadQueue.flush();
    };

    async function handleStatusMediaUpload(blobToUpload, typeToUpload) {
        const captionInput = document.getElementById("camera-preview-caption-input");
        const caption = captionInput ? captionInput.value.trim() : "";
        const wasMuted = window.isPreviewMuted || false;
        
        // Capture the songRef BEFORE we close the overlay (which nulls it)
        const songRef = window.pendingStatusSongRef || null;
        
        let tempId = window.currentStatusUploadId;
        if (!tempId) {
            const extension = (typeToUpload || "").includes("video") ? "mp4" : "jpg";
            const mimeType = (typeToUpload || "").includes("video") ? "video/mp4" : "image/jpeg";
            const file = new File([blobToUpload], `status_${Date.now()}.${extension}`, { type: mimeType });
            tempId = await window.saveStatusPendingUpload(file);
        }

        window.currentStatusUploadId = null;

        if (typeof window.closeCameraCaptureOverlay === "function") {
            window.closeCameraCaptureOverlay();
        }

        if (window.updateStatusPendingCaptionAndUpload) {
            window.updateStatusPendingCaptionAndUpload(tempId, caption, wasMuted, songRef);
        }

        showToast("Status uploading in background...", "info");
    }

    // Auto run initialization
    if (document.readyState !== "loading") {
        initStatusModule();
        StatusUploadQueue.init();
    } else {
        document.addEventListener("DOMContentLoaded", () => {
            initStatusModule();
            StatusUploadQueue.init();
        });
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

        const viewedCard = document.getElementById("status-viewer-viewed-by-card");
        const eyeBtn = document.getElementById("status-viewer-eye-container");
        if (viewedCard && viewedCard.style.display === "flex") {
            if (!viewedCard.contains(e.target) && (!eyeBtn || !eyeBtn.contains(e.target))) {
                viewedCard.style.display = "none";
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

    // ── YouTube Status Song Features ──
    window.pendingStatusSongRef = null;

    function updateSongBadgeVisibility() {
        const badge = document.getElementById("camera-preview-song-badge");
        const badgeText = document.getElementById("camera-preview-song-badge-text");
        const songBtn = document.getElementById("camera-preview-song-btn");

        if (badge) {
            if (window.pendingStatusSongRef) {
                if (badgeText) {
                    badgeText.textContent = `${window.pendingStatusSongRef.title}`;
                }
                badge.style.display = "flex";
            } else {
                badge.style.display = "none";
            }
        }

        if (songBtn) {
            songBtn.style.display = "flex";
            if (window.pendingStatusSongRef && window.pendingStatusSongRef.thumbnailUrl) {
                songBtn.innerHTML = `<img src="${window.pendingStatusSongRef.thumbnailUrl}" style="width: 100%; height: 100%; border-radius: 50%; object-fit: cover;" alt="Song Thumb">`;
                songBtn.style.padding = "0";
                songBtn.style.border = "2px solid #25d366";
            } else {
                songBtn.innerHTML = `
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M9 18V5l12-2v13"></path><circle cx="6" cy="18" r="3"></circle><circle cx="18" cy="16" r="3"></circle>
                    </svg>
                `;
                songBtn.style.padding = "";
                songBtn.style.border = "none";
            }
        }
    }

    function initStatusSongFeatures() {
        const previewSongBtn = document.getElementById("camera-preview-song-btn");
        const pickerOverlay = document.getElementById("camera-song-picker-overlay");
        const closeBtn = document.getElementById("camera-song-picker-close-btn");
        const searchInput = document.getElementById("camera-song-search-input");
        const songList = document.getElementById("camera-song-list");
        const loadingIndicator = document.getElementById("camera-song-loading");
        const badgeRemoveBtn = document.getElementById("camera-preview-song-badge-remove");

        // Fullscreen Trimmer elements
        const trimmerOverlay = document.getElementById("camera-song-trimmer-overlay");
        const trimmerCancelBtn = document.getElementById("camera-trimmer-cancel-btn");
        const trimmerDoneBtn = document.getElementById("camera-trimmer-done-btn");
        const trimmerCoverImg = document.getElementById("trimmer-top-avatar");
        const trimmerBg = null;
        const trimmerSpinContainer = null;

        const trimmerAudio = document.getElementById("camera-preview-audio");
        const trimmerPlayBtn = document.getElementById("camera-preview-audio-play-btn");
        const trimmerProgressFill = document.getElementById("camera-preview-audio-progress-fill");
        const trimmerTimer = document.getElementById("camera-preview-audio-timer");
        const trimmerStartSlider = document.getElementById("trimmer-start-slider");
        const trimmerHighlightWindow = document.getElementById("trimmer-highlight-window");
        const trimmerStartLabel = document.getElementById("trimmer-start-time-label");
        const trimmerEndLabel = document.getElementById("trimmer-end-time-label");
        const trimmerSongTitle = document.getElementById("trimmer-song-title");
        const trimmerSongChannel = null;

        let PX_PER_SECOND = 10;
        let isPlaying = false;
        let trimmerStartTime = 0;
        let trimmerDuration = 15; // 15 seconds slot (mutable for videos)
        let totalAudioDuration = 30; // fallback

        let currentSearchSource = "db";
        let currentQuery = "";
        let dbPage = 1;
        let dbHasMore = true;
        let youtubeNextPageToken = "";
        let isFetchingPage = false;

        function hideCameraPreviewControls() {
            const caption = document.getElementById("camera-preview-caption-container");
            const controls = document.getElementById("camera-preview-controls-section");
            const songBtn = document.getElementById("camera-preview-song-btn");
            const muteBtn = document.getElementById("camera-preview-mute-btn");
            const closeBtn = document.getElementById("camera-preview-close-btn");
            const badge = document.getElementById("camera-preview-song-badge");

            if (caption) caption.style.display = "none";
            if (controls) controls.style.display = "none";
            if (songBtn) songBtn.style.display = "none";
            if (muteBtn) muteBtn.style.display = "none";
            if (closeBtn) closeBtn.style.display = "none";
            if (badge) badge.style.display = "none";
        }

        function restoreCameraPreviewControls() {
            const caption = document.getElementById("camera-preview-caption-container");
            const controls = document.getElementById("camera-preview-controls-section");
            const songBtn = document.getElementById("camera-preview-song-btn");
            const muteBtn = document.getElementById("camera-preview-mute-btn");
            const closeBtn = document.getElementById("camera-preview-close-btn");

            if (caption) caption.style.display = "block";
            if (controls) controls.style.display = "flex";
            if (closeBtn) closeBtn.style.display = "flex";
            
            // Show song button
            if (songBtn) {
                songBtn.style.display = "flex";
            }
            
            // Show mute button only if it's a video preview
            const videoPreview = document.getElementById("camera-capture-video-preview");
            const isVideo = videoPreview && videoPreview.style.display !== "none" && videoPreview.src;
            if (muteBtn) {
                muteBtn.style.display = isVideo ? "flex" : "none";
            }

            updateSongBadgeVisibility();

            // If it is a video status and a song is selected, start playing the song in sync
            const trimmerAudio = document.getElementById("camera-preview-audio");
            if (isVideo && videoPreview && !videoPreview.paused && window.pendingStatusSongRef && trimmerAudio) {
                videoPreview.muted = true;
                const startT = window.pendingStatusSongRef.startTime || 0;
                trimmerAudio.currentTime = startT;
                trimmerAudio.muted = window.isPreviewMuted || false;
                trimmerAudio.play().catch(() => {});
            }
        }

        window.hideCameraPreviewControls = hideCameraPreviewControls;
        window.restoreCameraPreviewControls = restoreCameraPreviewControls;

        if (!previewSongBtn || !pickerOverlay) return;

        // Open Picker Sheet click handler
        previewSongBtn.onclick = (e) => {
            e.stopPropagation();

            const videoPreview = document.getElementById("camera-capture-video-preview");
            // Block song selection if video is longer than 60 seconds
            if (videoPreview && window.capturedFileType === "video" && !isNaN(videoPreview.duration) && videoPreview.duration > 60) {
                showToast("Videos must be 60 seconds or shorter to add music", "error");
                if (videoPreview.style.display !== "none" && videoPreview.src) {
                    videoPreview.play().catch(() => {});
                }
                return;
            }

            // Stop all sounds (both video preview and song preview) when opening picker
            if (videoPreview) {
                videoPreview.pause();
            }
            if (trimmerAudio) {
                trimmerAudio.pause();
            }

            pickerOverlay.style.display = "flex";
            if (searchInput) {
                searchInput.value = "";
                searchInput.focus();
            }
            currentSearchSource = "db";
            updateToggleStyles();
            fetchYouTubeSongs("");
        };

        // Close picker click handler
        if (closeBtn) {
            closeBtn.onclick = () => {
                pickerOverlay.style.display = "none";
                // Resume video preview when closing picker
                const videoPreview = document.getElementById("camera-capture-video-preview");
                if (videoPreview && videoPreview.style.display !== "none" && videoPreview.src) {
                    videoPreview.play().catch(() => {});
                }
            };
        }

        // Toggle buttons click handlers and styles
        const dbTabBtn = document.getElementById("search-source-db-btn");
        const ytTabBtn = document.getElementById("search-source-yt-btn");

        function updateToggleStyles() {
            if (dbTabBtn && ytTabBtn) {
                if (currentSearchSource === "db") {
                    dbTabBtn.style.background = "#25d366";
                    dbTabBtn.style.color = "black";
                    dbTabBtn.style.borderColor = "#25d366";

                    ytTabBtn.style.background = "rgba(255,255,255,0.05)";
                    ytTabBtn.style.color = "rgba(255,255,255,0.6)";
                    ytTabBtn.style.borderColor = "rgba(255,255,255,0.15)";
                } else {
                    ytTabBtn.style.background = "#25d366";
                    ytTabBtn.style.color = "black";
                    ytTabBtn.style.borderColor = "#25d366";

                    dbTabBtn.style.background = "rgba(255,255,255,0.05)";
                    dbTabBtn.style.color = "rgba(255,255,255,0.6)";
                    dbTabBtn.style.borderColor = "rgba(255,255,255,0.15)";
                }
            }
        }

        if (dbTabBtn) {
            dbTabBtn.onclick = () => {
                if (currentSearchSource === "db") return;
                currentSearchSource = "db";
                updateToggleStyles();
                fetchYouTubeSongs(searchInput ? searchInput.value.trim() : "");
            };
        }

        if (ytTabBtn) {
            ytTabBtn.onclick = () => {
                if (currentSearchSource === "youtube") return;
                currentSearchSource = "youtube";
                updateToggleStyles();
                fetchYouTubeSongs(searchInput ? searchInput.value.trim() : "");
            };
        }

        // Scroll event listener for infinite pagination
        if (songList) {
            songList.onscroll = () => {
                const threshold = 60; // px near bottom
                const isNearBottom = songList.scrollHeight - songList.scrollTop - songList.clientHeight < threshold;
                if (isNearBottom) {
                    loadNextPage();
                }
            };
        }

        function loadNextPage() {
            if (isFetchingPage) return;
            
            if (currentSearchSource === "db") {
                if (!dbHasMore) return;
                dbPage++;
                fetchYouTubeSongsPage(currentQuery, dbPage, "");
            } else {
                if (!youtubeNextPageToken) return;
                fetchYouTubeSongsPage(currentQuery, 1, youtubeNextPageToken);
            }
        }

        // Search input with debouncing (450ms protects quota)
        if (searchInput) {
            let searchTimeout = null;
            searchInput.oninput = () => {
                clearTimeout(searchTimeout);
                searchTimeout = setTimeout(() => {
                    const query = searchInput.value.trim();
                    fetchYouTubeSongs(query);
                }, 450);
            };
        }

        // Remove Song from Badge handler
        if (badgeRemoveBtn) {
            badgeRemoveBtn.onclick = (e) => {
                e.stopPropagation();
                window.pendingStatusSongRef = null;
                updateSongBadgeVisibility();
                if (trimmerAudio) {
                    trimmerAudio.pause();
                    trimmerAudio.src = "";
                }
                if (trimmerOverlay) trimmerOverlay.style.display = "none";
            };
        }

        // Trimmer Cancel / Back button
        if (trimmerCancelBtn) {
            trimmerCancelBtn.onclick = (e) => {
                e.stopPropagation();
                window.pendingStatusSongRef = null;
                updateSongBadgeVisibility();
                if (trimmerAudio) {
                    trimmerAudio.pause();
                    trimmerAudio.src = "";
                }
                if (trimmerOverlay) trimmerOverlay.style.display = "none";
                restoreCameraPreviewControls();
            };
        }

        // Trimmer Done button
        if (trimmerDoneBtn) {
            trimmerDoneBtn.onclick = (e) => {
                e.stopPropagation();
                if (trimmerAudio) {
                    trimmerAudio.pause();
                }
                updateSongBadgeVisibility();
                if (trimmerOverlay) trimmerOverlay.style.display = "none";
                restoreCameraPreviewControls();
            };
        }

        // Play/Pause button on trimmer
        if (trimmerPlayBtn) {
            trimmerPlayBtn.onclick = (e) => {
                e.stopPropagation();
                if (isPlaying) {
                    pauseTrimmer();
                } else {
                    playTrimmer();
                }
            };
        }

        function playTrimmer() {
            if (!trimmerAudio || !trimmerAudio.src) return;
            
            // If play cursor is out of bounds of the selected 15s window, seek back to start
            const elapsed = trimmerAudio.currentTime - trimmerStartTime;
            if (elapsed < 0 || elapsed >= trimmerDuration) {
                trimmerAudio.currentTime = trimmerStartTime;
            }

            trimmerAudio.play()
                .then(() => {
                    isPlaying = true;
                    updatePlayBtnState(true);
                    if (trimmerSpinContainer) trimmerSpinContainer.style.animationPlayState = "running";
                })
                .catch(err => console.error("Trimmer audio play failed:", err));
        }

        function pauseTrimmer() {
            if (!trimmerAudio) return;
            trimmerAudio.pause();
            isPlaying = false;
            updatePlayBtnState(false);
            if (trimmerSpinContainer) trimmerSpinContainer.style.animationPlayState = "paused";
        }

        function updatePlayBtnState(playing) {
            const playIcon = document.getElementById("audio-play-icon");
            const pauseIcon = document.getElementById("audio-pause-icon");
            if (playIcon && pauseIcon) {
                playIcon.style.display = playing ? "none" : "block";
                pauseIcon.style.display = playing ? "block" : "none";
            }
        }

        function formatTime(seconds) {
            if (isNaN(seconds) || seconds === null) return "0:00";
            const m = Math.floor(seconds / 60);
            const s = Math.floor(seconds % 60);
            return `${m}:${s.toString().padStart(2, "0")}`;
        }

        function drawDecorativeWaveform() {
            const container = document.getElementById("trimmer-waveform-bars");
            if (!container) return;
            container.innerHTML = "";
            
            const paddingX = 150;
            const totalWidth = paddingX + (totalAudioDuration * PX_PER_SECOND) + paddingX;
            container.style.position = "relative";
            container.style.width = totalWidth + "px";
            container.style.height = "100%";
            
            const numBars = Math.floor(totalAudioDuration);
            for (let i = 0; i <= numBars; i++) {
                const bar = document.createElement("div");
                let heightPct = 30;
                let opacity = 0.35;
                if (i % 5 === 0) {
                    heightPct = 65; // Major ticks every 5s
                    opacity = 0.7;
                } else {
                    heightPct = 40; // Minor ticks every 1s
                    opacity = 0.4;
                }
                bar.style.cssText = `position: absolute; left: ${paddingX + (i * PX_PER_SECOND)}px; width: 2px; height: ${heightPct}%; background: rgba(255, 255, 255, ${opacity}); border-radius: 1px; top: 50%; transform: translateY(-50%);`;
                container.appendChild(bar);
            }
        }

        function initAudioTrimmer(song) {
            if (!trimmerAudio) return;

            trimmerAudio.pause();
            trimmerAudio.src = song.audioUrl || "";
            
            trimmerSongTitle.textContent = song.title;
            if (trimmerSongChannel) {
                trimmerSongChannel.textContent = song.channelTitle;
            }
            
            if (trimmerCoverImg) {
                trimmerCoverImg.src = song.thumbnailUrl || "";
            }
            
            isPlaying = false;
            updatePlayBtnState(false);
            trimmerProgressFill.style.width = "0%";
            const playhead = document.getElementById("trimmer-playhead-line");
            if (playhead) playhead.style.left = "0%";

            // Set dynamic trimmer duration based on media type
            const videoPreview = document.getElementById("camera-capture-video-preview");
            if (window.capturedFileType === "video" && videoPreview && !isNaN(videoPreview.duration) && videoPreview.duration > 0) {
                trimmerDuration = videoPreview.duration;
            } else {
                trimmerDuration = 15;
            }
            PX_PER_SECOND = 150 / trimmerDuration;

            trimmerHighlightWindow.style.width = "150px";
            const trimmerWindowLabel = document.getElementById("trimmer-window-label");
            if (trimmerWindowLabel) {
                if (window.capturedFileType === "video") {
                    trimmerWindowLabel.textContent = formatTime(trimmerDuration);
                } else {
                    trimmerWindowLabel.textContent = "15s";
                }
            }

            trimmerTimer.textContent = formatTime(trimmerDuration);
            
            trimmerStartTime = window.pendingStatusSongRef?.startTime || 0;
            const initialPaddingX = 150;
            trimmerHighlightWindow.style.left = (initialPaddingX + (trimmerStartTime * PX_PER_SECOND)) + "px";

            trimmerStartLabel.textContent = "0:00";
            trimmerEndLabel.textContent = "Loading...";

            // Apply current camera preview mute state
            trimmerAudio.muted = window.isPreviewMuted || false;

            const scrollWrapper = document.getElementById("trimmer-scroll-wrapper");
            let isScrollingFromCode = false;

            trimmerAudio.onloadedmetadata = () => {
                totalAudioDuration = trimmerAudio.duration;

                // Cap trimmer duration at total audio duration to avoid overflow
                trimmerDuration = Math.min(trimmerDuration, totalAudioDuration);
                PX_PER_SECOND = 150 / trimmerDuration;

                // Update trimmerHighlightWindow width and labels in case duration got capped
                trimmerHighlightWindow.style.width = "150px";
                const trimmerWindowLabel = document.getElementById("trimmer-window-label");
                if (trimmerWindowLabel) {
                    if (window.capturedFileType === "video") {
                        trimmerWindowLabel.textContent = formatTime(trimmerDuration);
                    } else {
                        trimmerWindowLabel.textContent = "15s";
                    }
                }
                trimmerTimer.textContent = formatTime(trimmerDuration);

                // Dynamically size and draw the waveform ticks track
                drawDecorativeWaveform();

                const initialStart = window.pendingStatusSongRef?.startTime || 0;
                const maxStart = Math.max(0, totalAudioDuration - trimmerDuration);
                trimmerStartTime = Math.min(initialStart, maxStart);
                
                const paddingX = 150;
                trimmerHighlightWindow.style.left = (paddingX + (trimmerStartTime * PX_PER_SECOND)) + "px";

                // Position scroll container so the selection is in view
                isScrollingFromCode = true;
                if (scrollWrapper) {
                    scrollWrapper.scrollLeft = Math.max(0, (paddingX + (trimmerStartTime * PX_PER_SECOND)) - 50);
                }
                isScrollingFromCode = false;

                trimmerStartLabel.textContent = formatTime(trimmerStartTime);
                trimmerEndLabel.textContent = formatTime(totalAudioDuration);
                trimmerProgressFill.style.width = ((trimmerStartTime / totalAudioDuration) * 100) + "%";

                playTrimmer();
            };

            // Draggable Highlight Window with auto-scroll support
            if (trimmerHighlightWindow && scrollWrapper) {
                let isDragging = false;
                let dragStartX = 0;
                let dragStartLeft = 0;
                let autoScrollInterval = null;

                const startDrag = (clientX) => {
                    isDragging = true;
                    dragStartX = clientX;
                    dragStartLeft = parseFloat(trimmerHighlightWindow.style.left) || 0;
                    trimmerHighlightWindow.style.cursor = "grabbing";
                    trimmerAudio.pause();
                    
                    if (autoScrollInterval) {
                        clearInterval(autoScrollInterval);
                        autoScrollInterval = null;
                    }
                };

                const moveDrag = (clientX) => {
                    if (!isDragging) return;
                    
                    const dx = clientX - dragStartX;
                    let newLeft = dragStartLeft + dx;
                    const windowWidth = 150;
                    const paddingX = 150;
                    
                    const maxLeft = Math.max(0, (totalAudioDuration * PX_PER_SECOND) - windowWidth);
                    newLeft = Math.max(paddingX, Math.min(paddingX + maxLeft, newLeft));

                    trimmerHighlightWindow.style.left = newLeft + "px";
                    trimmerStartTime = (newLeft - paddingX) / PX_PER_SECOND;
                    if (window.pendingStatusSongRef) {
                        window.pendingStatusSongRef.startTime = trimmerStartTime;
                    }
                    trimmerAudio.currentTime = trimmerStartTime;

                    // Update seek progress fill
                    trimmerProgressFill.style.width = ((trimmerStartTime / totalAudioDuration) * 100) + "%";
                    const playhead = document.getElementById("trimmer-playhead-line");
                    if (playhead) playhead.style.left = "0%";

                    // Auto-scroll checks
                    const relativeLeft = newLeft - scrollWrapper.scrollLeft;
                    const relativeRight = relativeLeft + windowWidth;
                    const edgeThreshold = 15;

                    if (relativeLeft < edgeThreshold) {
                        // Scroll Left
                        if (!autoScrollInterval) {
                            autoScrollInterval = setInterval(() => {
                                const prevScroll = scrollWrapper.scrollLeft;
                                scrollWrapper.scrollLeft -= 5;
                                const actualDiff = prevScroll - scrollWrapper.scrollLeft;
                                if (actualDiff > 0) {
                                    let currentLeft = parseFloat(trimmerHighlightWindow.style.left) || 0;
                                    currentLeft = Math.max(paddingX, currentLeft - actualDiff);
                                    trimmerHighlightWindow.style.left = currentLeft + "px";
                                    trimmerStartTime = (currentLeft - paddingX) / PX_PER_SECOND;
                                    if (window.pendingStatusSongRef) {
                                        window.pendingStatusSongRef.startTime = trimmerStartTime;
                                    }
                                    trimmerAudio.currentTime = trimmerStartTime;
                                    trimmerProgressFill.style.width = ((trimmerStartTime / totalAudioDuration) * 100) + "%";
                                } else {
                                    clearInterval(autoScrollInterval);
                                    autoScrollInterval = null;
                                }
                            }, 16);
                        }
                    } else if (relativeRight > scrollWrapper.clientWidth - edgeThreshold) {
                        // Scroll Right
                        if (!autoScrollInterval) {
                            autoScrollInterval = setInterval(() => {
                                const prevScroll = scrollWrapper.scrollLeft;
                                scrollWrapper.scrollLeft += 5;
                                const actualDiff = scrollWrapper.scrollLeft - prevScroll;
                                if (actualDiff > 0) {
                                    let currentLeft = parseFloat(trimmerHighlightWindow.style.left) || 0;
                                    const maxL = Math.max(0, (totalAudioDuration * PX_PER_SECOND) - windowWidth);
                                    currentLeft = Math.min(paddingX + maxL, currentLeft + actualDiff);
                                    trimmerHighlightWindow.style.left = currentLeft + "px";
                                    trimmerStartTime = (currentLeft - paddingX) / PX_PER_SECOND;
                                    if (window.pendingStatusSongRef) {
                                        window.pendingStatusSongRef.startTime = trimmerStartTime;
                                    }
                                    trimmerAudio.currentTime = trimmerStartTime;
                                    trimmerProgressFill.style.width = ((trimmerStartTime / totalAudioDuration) * 100) + "%";
                                } else {
                                    clearInterval(autoScrollInterval);
                                    autoScrollInterval = null;
                                }
                            }, 16);
                        }
                    } else {
                        // Not near edges
                        if (autoScrollInterval) {
                            clearInterval(autoScrollInterval);
                            autoScrollInterval = null;
                        }
                    }
                };

                const endDrag = () => {
                    if (!isDragging) return;
                    isDragging = false;
                    trimmerHighlightWindow.style.cursor = "grab";
                    if (autoScrollInterval) {
                        clearInterval(autoScrollInterval);
                        autoScrollInterval = null;
                    }
                    
                    // Restart video preview and trimmer audio in sync
                    const videoPreview = document.getElementById("camera-capture-video-preview");
                    if (videoPreview) {
                        videoPreview.currentTime = 0;
                        videoPreview.play().catch(() => {});
                    }
                    trimmerAudio.currentTime = trimmerStartTime;
                    trimmerAudio.play().catch(() => {});
                    
                    isPlaying = true;
                    updatePlayBtnState(true);
                };

                trimmerHighlightWindow.addEventListener("mousedown", (e) => {
                    e.stopPropagation();
                    startDrag(e.clientX);
                });

                window.addEventListener("mousemove", (e) => {
                    moveDrag(e.clientX);
                });

                window.addEventListener("mouseup", () => {
                    endDrag();
                });

                // Touch support
                trimmerHighlightWindow.addEventListener("touchstart", (e) => {
                    e.stopPropagation();
                    if (e.touches.length > 0) {
                        startDrag(e.touches[0].clientX);
                    }
                });

                window.addEventListener("touchmove", (e) => {
                    if (e.touches.length > 0) {
                        moveDrag(e.touches[0].clientX);
                    }
                });

                window.addEventListener("touchend", () => {
                    endDrag();
                });
            }

            if (scrollWrapper) {
                // Grab-to-scroll functionality for desktop mouse interaction
                let isDown = false;
                let startX;
                let scrollLeftStart;

                scrollWrapper.addEventListener("mousedown", (e) => {
                    isDown = true;
                    scrollWrapper.style.cursor = "grabbing";
                    startX = e.pageX - scrollWrapper.offsetLeft;
                    scrollLeftStart = scrollWrapper.scrollLeft;
                    trimmerAudio.pause();
                });

                scrollWrapper.addEventListener("mouseleave", () => {
                    if (isDown) {
                        isDown = false;
                        scrollWrapper.style.cursor = "grab";
                        
                        // Restart video preview and trimmer audio in sync
                        const videoPreview = document.getElementById("camera-capture-video-preview");
                        if (videoPreview) {
                            videoPreview.currentTime = 0;
                            videoPreview.play().catch(() => {});
                        }
                        trimmerAudio.currentTime = trimmerStartTime;
                        trimmerAudio.play().catch(() => {});
                        
                        isPlaying = true;
                        updatePlayBtnState(true);
                    }
                });

                scrollWrapper.addEventListener("mouseup", () => {
                    if (isDown) {
                        isDown = false;
                        scrollWrapper.style.cursor = "grab";
                        
                        // Restart video preview and trimmer audio in sync
                        const videoPreview = document.getElementById("camera-capture-video-preview");
                        if (videoPreview) {
                            videoPreview.currentTime = 0;
                            videoPreview.play().catch(() => {});
                        }
                        trimmerAudio.currentTime = trimmerStartTime;
                        trimmerAudio.play().catch(() => {});
                        
                        isPlaying = true;
                        updatePlayBtnState(true);
                    }
                });

                scrollWrapper.addEventListener("mousemove", (e) => {
                    if (!isDown) return;
                    e.preventDefault();
                    const x = e.pageX - scrollWrapper.offsetLeft;
                    const walk = (x - startX) * 1.5;
                    scrollWrapper.scrollLeft = scrollLeftStart - walk;
                });
            }

            trimmerAudio.ontimeupdate = () => {
                if (trimmerAudio.paused) return;

                const curr = trimmerAudio.currentTime;
                const elapsed = curr - trimmerStartTime;

                if (elapsed >= trimmerDuration || curr >= totalAudioDuration || elapsed < 0) {
                    trimmerAudio.currentTime = trimmerStartTime;
                    trimmerProgressFill.style.width = ((trimmerStartTime / totalAudioDuration) * 100) + "%";
                    const playhead = document.getElementById("trimmer-playhead-line");
                    if (playhead) playhead.style.left = "0%";
                } else {
                    const row1Pct = (curr / totalAudioDuration) * 100;
                    trimmerProgressFill.style.width = row1Pct + "%";
                    
                    const playheadPct = (elapsed / trimmerDuration) * 100;
                    const playhead = document.getElementById("trimmer-playhead-line");
                    if (playhead) playhead.style.left = playheadPct + "%";
                    
                    trimmerTimer.textContent = formatTime(Math.max(0, trimmerDuration - elapsed));
                }
            };
        }

        async function fetchYouTubeSongs(search) {
            currentQuery = search;
            dbPage = 1;
            dbHasMore = true;
            youtubeNextPageToken = "";
            isFetchingPage = false;
            
            if (songList) songList.innerHTML = "";
            await fetchYouTubeSongsPage(search, 1, "");
        }

        async function fetchYouTubeSongsPage(search, page = 1, token = "") {
            if (isFetchingPage) return;
            isFetchingPage = true;

            if (loadingIndicator && page === 1 && !token) {
                loadingIndicator.style.display = "flex";
            }

            // Show page loading spinner/indicator at the bottom of the list
            let pageLoader = document.getElementById("song-list-page-loader");
            if (!pageLoader && songList) {
                pageLoader = document.createElement("div");
                pageLoader.id = "song-list-page-loader";
                pageLoader.style.cssText = "display:flex;justify-content:center;align-items:center;padding:15px;width:100%;flex-shrink:0;";
                pageLoader.innerHTML = `<div style="width:20px;height:20px;border:2px solid #25d366;border-top-color:transparent;border-radius:50%;animation:trimmer-spin 0.8s linear infinite;"></div>`;
                songList.appendChild(pageLoader);
            } else if (pageLoader) {
                songList.appendChild(pageLoader);
                pageLoader.style.display = "flex";
            }

            try {
                let url = `/api/songs/search?q=${encodeURIComponent(search)}&source=${currentSearchSource}&limit=10`;
                if (currentSearchSource === "db") {
                    url += `&page=${page}`;
                } else {
                    if (token) {
                        url += `&pageToken=${encodeURIComponent(token)}`;
                    }
                }

                const res = await apiRequest("GET", url);
                
                if (pageLoader) pageLoader.style.display = "none";

                if (res && res.ok && res.data && res.data.status && Array.isArray(res.data.data)) {
                    const fetchedSongs = res.data.data;
                    
                    if (currentSearchSource === "db") {
                        dbHasMore = res.data.hasMore === true;
                    } else {
                        youtubeNextPageToken = res.data.nextPageToken || "";
                    }

                    renderSongListAppend(fetchedSongs, page === 1 && !token);
                } else {
                    if (page === 1 && !token && songList) {
                        songList.innerHTML = `<div style="text-align:center;color:#ff5a5a;font-size:13.5px;padding:20px;">Failed to load songs</div>`;
                    }
                }
            } catch (err) {
                console.error("YouTube search page error:", err);
                if (pageLoader) pageLoader.style.display = "none";
                if (page === 1 && !token && songList) {
                    songList.innerHTML = `<div style="text-align:center;color:#ff5a5a;font-size:13.5px;padding:20px;">Error searching songs</div>`;
                }
            } finally {
                if (loadingIndicator) loadingIndicator.style.display = "none";
                isFetchingPage = false;
            }
        }

        function renderSongListAppend(songs, isReset) {
            if (!songList) return;
            if (isReset) {
                songList.innerHTML = "";
            }

            // Remove page loader if it exists so we append new items before it, then we can re-append loader if needed
            const pageLoader = document.getElementById("song-list-page-loader");
            if (pageLoader) {
                pageLoader.remove();
            }

            if (isReset && songs.length === 0) {
                songList.innerHTML = `<div style="text-align:center;color:#aaa;font-size:13.5px;padding:20px;">No results found</div>`;
                return;
            }

            songs.forEach(song => {
                const item = document.createElement("div");
                item.style.cssText = "display:flex;align-items:center;gap:12px;background:rgba(255,255,255,0.06);border-radius:12px;padding:8px 12px;cursor:pointer;transition:background 0.2s;border:1.5px solid transparent;";
                
                const isSelected = window.pendingStatusSongRef && window.pendingStatusSongRef.videoId === song.videoId;
                if (isSelected) {
                    item.style.background = "rgba(255,0,0,0.15)";
                    item.style.borderColor = "rgba(255,0,0,0.5)";
                }

                item.onmouseover = () => {
                    if (!isSelected) item.style.background = "rgba(255,255,255,0.12)";
                };
                item.onmouseout = () => {
                    if (!isSelected) item.style.background = "rgba(255,255,255,0.06)";
                };

                const thumbHtml = song.thumbnailUrl
                    ? `<img src="${song.thumbnailUrl}" style="width:48px;height:48px;border-radius:8px;object-fit:cover;flex-shrink:0;" />`
                    : `<div style="width:48px;height:48px;border-radius:8px;background:#333;display:flex;align-items:center;justify-content:center;flex-shrink:0;"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#666" stroke-width="2"><path d="M9 18V5l12-2v13"></path><circle cx="6" cy="18" r="3"></circle><circle cx="18" cy="16" r="3"></circle></svg></div>`;

                const isYoutube = song.source === "youtube";
                const badgeHtml = isYoutube ? `<span style="font-size:9px;background:rgba(255,255,255,0.15);color:#aaa;border-radius:4px;padding:1px 4px;font-weight:bold;width:fit-content;margin-top:2px;">YouTube</span>` : ``;
                
                let actionHtml = "";
                if (isYoutube) {
                    if (song.requestStatus === "pending") {
                        actionHtml = `<span class="request-status-label" style="font-size:11px;color:#aaa;font-style:italic;">Requested</span>`;
                    } else if (song.requestStatus === "processing") {
                        actionHtml = `<span class="request-status-label" style="font-size:11px;color:#eab308;font-weight:bold;">Processing...</span>`;
                    } else if (song.requestStatus === "failed") {
                        actionHtml = `<button class="request-song-btn" style="background:#ff4d4d;color:white;border:none;border-radius:8px;padding:5px 10px;font-size:11px;font-weight:bold;cursor:pointer;transition:transform 0.1s;">Retry</button>`;
                    } else {
                        actionHtml = `<button class="request-song-btn" style="background:#25d366;color:black;border:none;border-radius:8px;padding:5px 10px;font-size:11px;font-weight:bold;cursor:pointer;transition:transform 0.1s;">Request</button>`;
                    }
                }

                item.innerHTML = `
                    ${thumbHtml}
                    <div style="flex:1;overflow:hidden;display:flex;flex-direction:column;gap:2px;">
                        <span style="font-size:13.5px;font-weight:600;color:white;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${song.title}</span>
                        <div style="display:flex;align-items:center;gap:6px;">
                            <span style="font-size:11px;color:#aaa;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:120px;">${song.channelTitle}</span>
                            ${badgeHtml}
                        </div>
                    </div>
                    ${actionHtml ? `<div class="action-container" style="flex-shrink:0;margin-left:8px;">${actionHtml}</div>` : ""}
                `;

                const triggerRequest = async (e) => {
                    if (e) e.stopPropagation();
                    const actionContainer = item.querySelector(".action-container");
                    if (actionContainer) {
                        actionContainer.innerHTML = `<span style="font-size:11px;color:#aaa;">Requesting...</span>`;
                    }
                    
                    try {
                        const res = await apiRequest("POST", "/api/songs/request", {
                            videoId: song.videoId,
                            title: song.title,
                            channelTitle: song.channelTitle
                        });
                        if (res && res.ok && res.data && res.data.status) {
                            showToast(res.data.message || "Song requested successfully!", "success");
                            if (actionContainer) {
                                const status = res.data.data?.status || "pending";
                                if (status === "processing") {
                                    actionContainer.innerHTML = `<span class="request-status-label" style="font-size:11px;color:#eab308;font-weight:bold;">Processing...</span>`;
                                } else {
                                    actionContainer.innerHTML = `<span class="request-status-label" style="font-size:11px;color:#aaa;font-style:italic;">Requested</span>`;
                                }
                            }
                        } else {
                            showToast("Failed to request song", "error");
                            if (actionContainer) {
                                actionContainer.innerHTML = actionHtml;
                                bindButton();
                            }
                        }
                    } catch (err) {
                        console.error("Song request error:", err);
                        showToast("Error requesting song", "error");
                        if (actionContainer) {
                            actionContainer.innerHTML = actionHtml;
                            bindButton();
                        }
                    }
                };

                const bindButton = () => {
                    const btn = item.querySelector(".request-song-btn");
                    if (btn) {
                        btn.onclick = triggerRequest;
                    }
                };

                if (isYoutube) {
                    item.onclick = (e) => {
                        e.stopPropagation();
                        const btn = item.querySelector(".request-song-btn");
                        if (btn) {
                            triggerRequest(e);
                        }
                    };
                    bindButton();
                } else {
                    item.onclick = (e) => {
                        e.stopPropagation();
                        window.pendingStatusSongRef = {
                            videoId: song.videoId,
                            title: song.title,
                            channelTitle: song.channelTitle,
                            thumbnailUrl: song.thumbnailUrl,
                            audioUrl: song.audioUrl,
                            startTime: 0
                        };
                        updateSongBadgeVisibility();
                        
                        initAudioTrimmer(song);
                        if (trimmerOverlay) {
                            trimmerOverlay.style.display = "flex";
                            hideCameraPreviewControls();
                        }

                        pickerOverlay.style.display = "none";
                    };
                }

                songList.appendChild(item);
            });
        }
        window.initAudioTrimmer = initAudioTrimmer;
    }

    window.updateSongBadgeVisibility = updateSongBadgeVisibility;

    // Expose helpers
    window.openStatusComposer = openStatusComposer;
    window.openStatusViewer = openStatusViewer;
    window.closeStatusViewer = closeStatusViewer;
    window.initStatusModule = initStatusModule;
    window.handleStatusMediaUpload = handleStatusMediaUpload;
    window.handleRemoteStatusDeletion = handleRemoteStatusDeletion;
    window.StatusUploadQueue = StatusUploadQueue;
})();

