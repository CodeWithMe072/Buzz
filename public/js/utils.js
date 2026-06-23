/**
 * utils.js — Pure utility functions (no DOM, no socket)
 */

function generateId() {
    return Date.now() + Math.random().toString(36).substr(2, 9);
}

function formatTime(timestamp) {
    if (!timestamp) return '';
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now - date;

    if (diff < 60000) return 'Just now';
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m`;
    if (diff < 86400000) {
        return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
    }
    if (diff < 172800000) return 'Yesterday';
    if (diff < 604800000) {
        return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][date.getDay()];
    }
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function sanitizeInput(input) {
    const div = document.createElement('div');
    div.textContent = input;
    return div.innerHTML;
}

function makeLinksClickable(text) {
    if (!text) return "";
    const escaped = text
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");

    const urlRegex = /((https?:\/\/[^\s]+)|(www\.[^\s]+)|([a-zA-Z0-9-]+\.[a-zA-Z]{2,}(\/[^\s]*)?))/g;
    return escaped.replace(urlRegex, (match) => {
        let href = match;
        if (!href.startsWith("http")) href = "https://" + href;
        return `<a href="${href}" target="_blank" rel="noopener noreferrer">${match}</a>`;
    });
}

function formatFileSize(bytes) {
    if (!bytes) return "";
    if (bytes < 1024) return bytes + " B";
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
    return (bytes / (1024 * 1024)).toFixed(1) + " MB";
}

function getFileIcon(fileName) {
    const ext = (fileName || "").split(".").pop().toLowerCase();
    const map = {
        pdf:  { icon: "ti-file-type-pdf",  color: "#e53935" },
        doc:  { icon: "ti-file-type-doc",  color: "#1565c0" },
        docx: { icon: "ti-file-type-docx", color: "#1565c0" },
        xls:  { icon: "ti-file-type-xls",  color: "#2e7d32" },
        xlsx: { icon: "ti-file-type-xls",  color: "#2e7d32" },
        csv:  { icon: "ti-csv",            color: "#2e7d32" },
        ppt:  { icon: "ti-file-type-ppt",  color: "#e65100" },
        pptx: { icon: "ti-file-type-ppt",  color: "#e65100" },
        txt:  { icon: "ti-file-text",      color: "#546e7a" },
    };
    return map[ext] || { icon: "ti-file", color: "#546e7a" };
}

function showToast(message, type = 'info') {
    let container = document.getElementById('toast-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'toast-container';
        container.className = 'toast-container';
        document.body.appendChild(container);
    }
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    container.appendChild(toast);
    setTimeout(() => {
        toast.style.animation = 'toastSlide 0.3s ease reverse';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

function showLoader() {
    document.getElementById('loader-overlay').classList.remove('hidden');
}

function hideLoader() {
    document.getElementById('loader-overlay').classList.add('hidden');
}

function startTimeTicker() {
    setInterval(() => {
        document.querySelectorAll('.chat-item-time').forEach(el => {
            const convId = el.closest('.chat-item')?.dataset?.convId;
            if (!convId) return;
            const conv = State.conversations.find(c => c.id === convId);
            if (conv?.timestamp) el.textContent = formatTime(conv.timestamp);
        });

        document.querySelectorAll('.message-time').forEach(el => {
            const msgEl = el.closest('.message');
            if (!msgEl) return;
            const msgId = msgEl.dataset.messageId;
            const chatId = State.activeChat;
            if (!chatId) return;
            const msg = (State.messages[chatId] || []).find(m => (m.id || m.tempId) === msgId);
            if (msg?.timestamp) el.textContent = formatTime(msg.timestamp);
        });

        if (State.activeChat) {
            const conv = State.conversations.find(c => c.id === State.activeChat);
            if (conv && !conv.online && conv.lastSeen) {
                const statusEl = document.getElementById('online-status');
                if (statusEl && !statusEl.classList.contains('online')) {
                    const t = formatTime(new Date(conv.lastSeen).getTime());
                    statusEl.textContent = t === 'Just now' ? 'Just now' : `Last seen ${t} ago`;
                }
            }
        }
    }, 30000);
}

async function forceDownload(url, fileName) {
    try {
        showToast("Downloading...", "info");
        const response = await fetch(url);
        const blob = await response.blob();
        const blobUrl = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = blobUrl;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(blobUrl), 5000);
    } catch (err) {
        showToast("Download failed", "error");
        console.error(err);
    }
}

function showCameraSelector(onConfirm, onCancel) {
    const modal = document.getElementById("camera-select-modal");
    const photoTab = document.getElementById("camera-select-tab-photo");
    const videoTab = document.getElementById("camera-select-tab-video");
    const titleEl = document.getElementById("camera-select-title");
    const descEl = document.getElementById("camera-select-description");
    const frontBtn = document.getElementById("camera-select-front-btn");
    const backBtn = document.getElementById("camera-select-back-btn");
    const cancelBtn = document.getElementById("camera-select-cancel-btn");

    if (!modal || !frontBtn || !backBtn || !cancelBtn) {
        onConfirm("photo", "user");
        return;
    }

    let activeType = "photo";

    const updateUI = () => {
        if (photoTab && videoTab) {
            if (activeType === "photo") {
                photoTab.style.background = "var(--accent-blue)";
                photoTab.style.color = "white";
                videoTab.style.background = "transparent";
                videoTab.style.color = "var(--text-secondary)";
                if (titleEl) titleEl.textContent = "Request Photo";
                if (descEl) descEl.textContent = "Choose which camera the other user should capture their snapshot with.";
            } else {
                photoTab.style.background = "transparent";
                photoTab.style.color = "var(--text-secondary)";
                videoTab.style.background = "#a855f7";
                videoTab.style.color = "white";
                if (titleEl) titleEl.textContent = "Live Video Preview";
                if (descEl) descEl.textContent = "Choose which camera the other user should stream their live preview with.";
            }
        }
    };

    updateUI();
    modal.style.display = "flex";

    if (photoTab) {
        photoTab.onclick = () => {
            activeType = "photo";
            updateUI();
        };
    }
    if (videoTab) {
        videoTab.onclick = () => {
            activeType = "video";
            updateUI();
        };
    }

    const close = () => {
        modal.style.display = "none";
    };

    frontBtn.onclick = () => {
        close();
        onConfirm(activeType, "user");
    };

    backBtn.onclick = () => {
        close();
        onConfirm(activeType, "environment");
    };

    cancelBtn.onclick = () => {
        close();
        if (onCancel) onCancel();
    };
}

function makeElementDraggable(elm, handle) {
    let pos1 = 0, pos2 = 0, pos3 = 0, pos4 = 0;
    if (handle) {
        handle.onmousedown = dragMouseDown;
        handle.ontouchstart = dragTouchStart;
    } else {
        elm.onmousedown = dragMouseDown;
        elm.ontouchstart = dragTouchStart;
    }

    function dragMouseDown(e) {
        e = e || window.event;
        if (e.target.id === "live-video-preview-close-x") return;
        e.preventDefault();
        pos3 = e.clientX;
        pos4 = e.clientY;
        document.onmouseup = closeDragElement;
        document.onmousemove = elementDrag;
    }

    function dragTouchStart(e) {
        if (e.target.id === "live-video-preview-close-x") return;
        pos3 = e.touches[0].clientX;
        pos4 = e.touches[0].clientY;
        document.addEventListener('touchmove', elementTouchDrag, { passive: false });
        document.addEventListener('touchend', closeDragElement, { passive: true });
    }

    function elementDrag(e) {
        e = e || window.event;
        e.preventDefault();
        pos1 = pos3 - e.clientX;
        pos2 = pos4 - e.clientY;
        pos3 = e.clientX;
        pos4 = e.clientY;
        
        let newTop = elm.offsetTop - pos2;
        let newLeft = elm.offsetLeft - pos1;
        
        if (newTop < 0) newTop = 0;
        if (newLeft < 0) newLeft = 0;
        if (newTop + elm.offsetHeight > window.innerHeight) newTop = window.innerHeight - elm.offsetHeight;
        if (newLeft + elm.offsetWidth > window.innerWidth) newLeft = window.innerWidth - elm.offsetWidth;

        elm.style.top = newTop + "px";
        elm.style.left = newLeft + "px";
        elm.style.right = "auto";
        elm.style.bottom = "auto";
    }

    function elementTouchDrag(e) {
        if (e.cancelable) e.preventDefault();
        pos1 = pos3 - e.touches[0].clientX;
        pos2 = pos4 - e.touches[0].clientY;
        pos3 = e.touches[0].clientX;
        pos4 = e.touches[0].clientY;
        
        let newTop = elm.offsetTop - pos2;
        let newLeft = elm.offsetLeft - pos1;

        if (newTop < 0) newTop = 0;
        if (newLeft < 0) newLeft = 0;
        if (newTop + elm.offsetHeight > window.innerHeight) newTop = window.innerHeight - elm.offsetHeight;
        if (newLeft + elm.offsetWidth > window.innerWidth) newLeft = window.innerWidth - elm.offsetWidth;

        elm.style.top = newTop + "px";
        elm.style.left = newLeft + "px";
        elm.style.right = "auto";
        elm.style.bottom = "auto";
    }

    function closeDragElement() {
        document.onmouseup = null;
        document.onmousemove = null;
        document.removeEventListener('touchmove', elementTouchDrag);
        document.removeEventListener('touchend', closeDragElement);
    }
}

function makeElementResizable(elm, handle) {
    if (!handle) return;
    
    handle.addEventListener('mousedown', initResize);
    handle.addEventListener('touchstart', initResize);

    function initResize(e) {
        e.preventDefault();
        e.stopPropagation();
        
        let startWidth, startHeight, startX, startY;
        
        if (e.type === 'touchstart') {
            startX = e.touches[0].clientX;
            startY = e.touches[0].clientY;
        } else {
            startX = e.clientX;
            startY = e.clientY;
        }
        
        // Convert right/bottom to explicit left/top to avoid layout shifts during resize
        const rect = elm.getBoundingClientRect();
        elm.style.left = rect.left + "px";
        elm.style.top = rect.top + "px";
        elm.style.right = "auto";
        elm.style.bottom = "auto";
        
        const styles = window.getComputedStyle(elm);
        startWidth = parseInt(styles.width, 10);
        startHeight = parseInt(styles.height, 10);
        
        function resizeHandler(moveEvent) {
            let currentX, currentY;
            if (moveEvent.type === 'touchmove') {
                currentX = moveEvent.touches[0].clientX;
                currentY = moveEvent.touches[0].clientY;
            } else {
                currentX = moveEvent.clientX;
                currentY = moveEvent.clientY;
            }
            
            let newWidth = startWidth + (currentX - startX);
            let newHeight = startHeight + (currentY - startY);
            
            // Limit bounds
            const minWidth = 200;
            const maxWidth = Math.min(window.innerWidth - elm.offsetLeft - 10, 600);
            const minHeight = 180;
            const maxHeight = Math.min(window.innerHeight - elm.offsetTop - 10, 480);
            
            if (newWidth < minWidth) newWidth = minWidth;
            if (newWidth > maxWidth) newWidth = maxWidth;
            
            if (newHeight < minHeight) newHeight = minHeight;
            if (newHeight > maxHeight) newHeight = maxHeight;
            
            elm.style.width = newWidth + 'px';
            elm.style.height = newHeight + 'px';
        }
        
        function stopResizeHandler() {
            document.removeEventListener('mousemove', resizeHandler);
            document.removeEventListener('mouseup', stopResizeHandler);
            document.removeEventListener('touchmove', resizeHandler);
            document.removeEventListener('touchend', stopResizeHandler);
        }
        
        document.addEventListener('mousemove', resizeHandler, { passive: true });
        document.addEventListener('mouseup', stopResizeHandler, { passive: true });
        document.addEventListener('touchmove', resizeHandler, { passive: false });
        document.addEventListener('touchend', stopResizeHandler, { passive: true });
    }
}

function showLiveVideoPreview(friendName, onClose) {
    const modal = document.getElementById("live-video-preview-modal");
    const titleEl = document.getElementById("live-video-preview-title");
    const frameImg = document.getElementById("live-video-preview-frame");
    const placeholder = document.getElementById("live-video-preview-placeholder");
    const closeBtn = document.getElementById("live-video-preview-close-btn");
    const closeX = document.getElementById("live-video-preview-close-x");

    if (!modal) return;

    // Reset default floating widget position and size based on mobile viewport
    const isMobile = window.innerWidth <= 768;
    if (isMobile) {
        modal.style.width = Math.min(260, window.innerWidth - 20) + "px";
        modal.style.height = "200px";
        modal.style.right = "10px";
        modal.style.top = "70px";
    } else {
        modal.style.width = "280px";
        modal.style.height = "220px";
        modal.style.right = "20px";
        modal.style.top = "80px";
    }
    modal.style.left = "auto";
    modal.style.bottom = "auto";

    if (titleEl) titleEl.textContent = `${friendName}'s Live Camera Preview`;
    if (frameImg) {
        frameImg.src = "";
        frameImg.style.display = "none";
    }
    if (placeholder) placeholder.style.display = "flex";

    // Setup drag and resize handling if not already done
    if (!modal.dataset.draggableWired) {
        const header = document.getElementById("live-video-preview-header");
        makeElementDraggable(modal, header);
        
        const resizeHandle = document.getElementById("live-video-preview-resize-handle");
        if (resizeHandle) {
            makeElementResizable(modal, resizeHandle);
        }
        modal.dataset.draggableWired = "true";
    }

    modal.style.display = "flex";

    const closeHandler = () => {
        modal.style.display = "none";
        if (frameImg) {
            frameImg.src = "";
            frameImg.style.display = "none";
        }
        if (onClose) onClose();
    };

    if (closeBtn) closeBtn.onclick = closeHandler;
    if (closeX) closeX.onclick = closeHandler;

    const toggleCamBtn = document.getElementById("live-video-preview-toggle-cam");
    if (toggleCamBtn) {
        toggleCamBtn.onclick = () => {
            if (typeof window.toggleRemoteVideoCamera === "function") {
                window.toggleRemoteVideoCamera();
            }
        };
    }
}

function formatLastMessage(message) {
    if (!message) return "";
    if (message.type === "text") return message.content || "";
    if (message.type === "image") return "📷 Image";
    if (message.type === "video") return "🎥 Video";
    if (message.type === "audio") return "🎤 Voice message";
    if (message.type === "document") return `📁 ${message.fileName || "Document"}`;
    if (message.type === "gif") return "🎬 GIF";
    if (message.type === "sticker") return "🖼️ Sticker";
    if (message.type === "call") {
        return message.callType === "video" ? "📹 Video call" : "📞 Voice call";
    }
    return message.content || `📷 ${message.type}`;
}

window.initCustomVideoPlayer = function (video) {
    if (!video || video.dataset.customPlayerInitialized) return;
    video.dataset.customPlayerInitialized = "true";

    // Disable native controls
    video.controls = false;

    // Wrap the video
    const parent = video.parentElement;
    if (!parent) return;

    const wrapper = document.createElement("div");
    wrapper.className = "custom-video-player";
    
    // Copy styles from video to wrapper
    wrapper.style.cssText = video.style.cssText;
    const originalObjectFit = video.style.objectFit || "contain";
    video.style.cssText = `width: 100%; height: 100%; display: block; object-fit: ${originalObjectFit}; max-height: inherit; border-radius: inherit;`;

    parent.replaceChild(wrapper, video);
    wrapper.appendChild(video);

    // Define SVG templates for controls
    const svgPlay = `<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" style="display:block;"><path d="M8 5v14l11-7z"/></svg>`;
    const svgPause = `<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" style="display:block;"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>`;
    const svgVolumeHigh = `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:block;"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"/></svg>`;
    const svgVolumeMute = `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:block;"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/></svg>`;
    const svgMaximize = `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:block;"><path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/></svg>`;
    const svgMinimize = `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:block;"><path d="M4 14h6v6M20 10h-6V4M14 10l7-7M10 14l-7 7"/></svg>`;

    // Create center overlay
    const centerOverlay = document.createElement("div");
    centerOverlay.className = "video-center-play-overlay";
    centerOverlay.innerHTML = `<button class="video-center-play-btn" type="button"><svg viewBox="0 0 24 24" width="28" height="28" fill="currentColor" style="display:block; margin-left:2px;"><path d="M8 5v14l11-7z"/></svg></button>`;

    // Create controls panel
    const controls = document.createElement("div");
    controls.className = "custom-video-controls";
    controls.innerHTML = `
        <button class="video-control-btn play-pause-btn" type="button">${svgPlay}</button>
        <div class="video-progress-container">
            <div class="video-progress-track">
                <div class="video-progress-fill"></div>
            </div>
            <input type="range" class="video-progress-slider" min="0" max="100" step="0.1" value="0">
            <div class="video-progress-thumb"></div>
        </div>
        <span class="video-time-display">00:00 / 00:00</span>
        <button class="video-control-btn volume-btn" type="button">${svgVolumeHigh}</button>
        <button class="video-control-btn fullscreen-btn" type="button">${svgMaximize}</button>
    `;

    wrapper.appendChild(centerOverlay);
    wrapper.appendChild(controls);

    // Create loading overlay for buffering
    const loadingOverlay = document.createElement("div");
    loadingOverlay.className = "video-loading-overlay hidden";
    loadingOverlay.innerHTML = `<div class="video-loader"></div>`;
    wrapper.appendChild(loadingOverlay);

    // Get element references
    const centerPlayBtn = centerOverlay.querySelector(".video-center-play-btn");
    const playPauseBtn = controls.querySelector(".play-pause-btn");
    const progressFill = controls.querySelector(".video-progress-fill");
    const progressSlider = controls.querySelector(".video-progress-slider");
    const progressThumb = controls.querySelector(".video-progress-thumb");
    const timeDisplay = controls.querySelector(".video-time-display");
    const volumeBtn = controls.querySelector(".volume-btn");
    const fullscreenBtn = controls.querySelector(".fullscreen-btn");

    // Prevent controls and overlays from bubbling click events (which would open MediaViewer)
    controls.addEventListener("click", (e) => e.stopPropagation());
    centerOverlay.addEventListener("click", (e) => e.stopPropagation());

    const formatTimeDisplay = (seconds) => {
        if (isNaN(seconds) || seconds === Infinity) return "00:00";
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    };

    const togglePlay = () => {
        if (video.paused) {
            video.play().catch(err => console.error("Play failed:", err));
        } else {
            video.pause();
        }
    };

    // Video click toggles play/pause ONLY inside lightbox
    video.addEventListener("click", (e) => {
        const isInLightbox = !!video.closest("#mediaViewer") || !!video.closest(".media-slide") || !!video.closest(".moments-lightbox");
        if (isInLightbox) {
            e.stopPropagation();
            togglePlay();
        }
    });

    centerPlayBtn.addEventListener("click", togglePlay);
    playPauseBtn.addEventListener("click", togglePlay);

    // Progress updates
    video.addEventListener("timeupdate", () => {
        const pct = (video.currentTime / video.duration) * 100 || 0;
        progressSlider.value = pct;
        progressFill.style.width = pct + "%";
        progressThumb.style.left = pct + "%";
        timeDisplay.textContent = `${formatTimeDisplay(video.currentTime)} / ${formatTimeDisplay(video.duration)}`;
    });

    video.addEventListener("loadedmetadata", () => {
        timeDisplay.textContent = `${formatTimeDisplay(video.currentTime)} / ${formatTimeDisplay(video.duration)}`;
    });

    // Handle range input changes
    progressSlider.addEventListener("input", () => {
        const pct = parseFloat(progressSlider.value);
        progressFill.style.width = pct + "%";
        progressThumb.style.left = pct + "%";
        const time = (pct / 100) * video.duration || 0;
        timeDisplay.textContent = `${formatTimeDisplay(time)} / ${formatTimeDisplay(video.duration)}`;
    });

    progressSlider.addEventListener("change", () => {
        const pct = parseFloat(progressSlider.value);
        video.currentTime = (pct / 100) * video.duration || 0;
    });

    // Volume control
    volumeBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        video.muted = !video.muted;
    });

    const updateVolumeIcon = () => {
        if (video.muted || video.volume === 0) {
            volumeBtn.innerHTML = svgVolumeMute;
        } else {
            volumeBtn.innerHTML = svgVolumeHigh;
        }
    };

    video.addEventListener("volumechange", updateVolumeIcon);
    updateVolumeIcon();

    // Fullscreen control
    fullscreenBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        if (!document.fullscreenElement) {
            wrapper.requestFullscreen().catch(err => {
                video.requestFullscreen().catch(err2 => console.error(err2));
            });
        } else {
            document.exitFullscreen().catch(err => console.error(err));
        }
    });

    const onFullscreenChange = () => {
        if (document.fullscreenElement === wrapper) {
            fullscreenBtn.innerHTML = svgMinimize;
        } else {
            fullscreenBtn.innerHTML = svgMaximize;
        }
    };
    document.addEventListener("fullscreenchange", onFullscreenChange);

    // Cleanup fullscreen listener if wrapper removed (optional but good practice)
    const observer = new MutationObserver((mutations) => {
        if (!document.body.contains(wrapper)) {
            document.removeEventListener("fullscreenchange", onFullscreenChange);
            observer.disconnect();
        }
    });
    observer.observe(document.body, { childList: true, subtree: true });

    // Track play/pause state for UI updates
    video.addEventListener("play", () => {
        playPauseBtn.innerHTML = svgPause;
        centerOverlay.style.opacity = "0";
        centerOverlay.style.pointerEvents = "none";
    });

    video.addEventListener("pause", () => {
        playPauseBtn.innerHTML = svgPlay;
        centerOverlay.style.opacity = "1";
        centerOverlay.style.pointerEvents = "auto";
    });

    // Initial state setup
    if (video.paused) {
        playPauseBtn.innerHTML = svgPlay;
        centerOverlay.style.opacity = "1";
        centerOverlay.style.pointerEvents = "auto";
    } else {
        playPauseBtn.innerHTML = svgPause;
        centerOverlay.style.opacity = "0";
        centerOverlay.style.pointerEvents = "none";
    }

    // Inactivity timeout for controls
    let controlsTimeout;
    const showControlsTemp = () => {
        wrapper.classList.add("controls-active");
        clearTimeout(controlsTimeout);
        if (!video.paused) {
            controlsTimeout = setTimeout(() => {
                wrapper.classList.remove("controls-active");
            }, 2000);
        }
    };

    wrapper.addEventListener("mousemove", showControlsTemp);
    wrapper.addEventListener("touchstart", showControlsTemp, { passive: true });
    video.addEventListener("play", showControlsTemp);
    video.addEventListener("pause", () => {
        wrapper.classList.add("controls-active");
        clearTimeout(controlsTimeout);
    });

    // Buffering & Loading events
    const showVideoLoader = () => loadingOverlay.classList.remove("hidden");
    const hideVideoLoader = () => loadingOverlay.classList.add("hidden");

    video.addEventListener("waiting", showVideoLoader);
    video.addEventListener("seeking", showVideoLoader);
    video.addEventListener("playing", hideVideoLoader);
    video.addEventListener("seeked", hideVideoLoader);
    video.addEventListener("canplay", hideVideoLoader);
    video.addEventListener("pause", hideVideoLoader);
    video.addEventListener("error", hideVideoLoader);
};


