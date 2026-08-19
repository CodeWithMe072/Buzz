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
    if (window.innerWidth < 768) return;
    let container = document.getElementById('toast-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'toast-container';
        container.className = 'toast-container';
        document.body.appendChild(container);
    }
    // Remove all existing toasts instantly to ensure only one toast is shown at a time
    container.innerHTML = '';

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    container.appendChild(toast);
    setTimeout(() => {
        toast.style.animation = 'toastSlideUp 0.3s ease reverse';
        setTimeout(() => toast.remove(), 300);
    }, 2000);
}

function showLoader() {
    document.getElementById('loader-overlay').classList.remove('hidden');
}

function hideLoader() {
    document.getElementById('loader-overlay').classList.add('hidden');
}

function startTimeTicker() {
    if (window.timeTickerInterval) {
        clearInterval(window.timeTickerInterval);
    }
    window.timeTickerInterval = setInterval(() => {
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

function getMimeTypeFromFileName(fileName) {
    const ext = (fileName || "").split(".").pop().toLowerCase();
    const mimeMap = {
        pdf: "application/pdf",
        jpg: "image/jpeg",
        jpeg: "image/jpeg",
        png: "image/png",
        webp: "image/webp",
        gif: "image/gif",
        svg: "image/svg+xml",
        txt: "text/plain;charset=utf-8",
        html: "text/html",
        mp4: "video/mp4",
        webm: "video/webm",
        mp3: "audio/mpeg",
        ogg: "audio/ogg",
        wav: "audio/wav",
        json: "application/json",
    };
    return mimeMap[ext] || "application/octet-stream";
}

function setDocCardLoading(btnElement, isLoading, actionType = "open") {
    if (!btnElement) return null;
    const cardActions = btnElement.closest(".doc-actions") || btnElement.parentElement;
    const allBtns = cardActions ? cardActions.querySelectorAll(".doc-btn") : [btnElement];
    
    const originalHtml = btnElement.innerHTML;

    if (isLoading) {
        allBtns.forEach(b => {
            b.disabled = true;
            b.classList.add("is-loading");
        });
        const spinnerText = actionType === "open" ? "Opening..." : "Saving...";
        btnElement.innerHTML = `<span class="loader-sm"></span><span>${spinnerText}</span>`;
    } else {
        allBtns.forEach(b => {
            b.disabled = false;
            b.classList.remove("is-loading");
        });
    }

    return originalHtml;
}

async function getDecryptedStreamUrl(url, mediaId) {
    let fetchUrl = url;
    if (mediaId && typeof mediaId === "string" && !mediaId.startsWith("temp-")) {
        try {
            const res = await apiRequest("POST", "/api/media/decrypt", { mediaId });
            const data = res?.data || res?.Data || res;
            if (data && data.token) {
                return `/api/media/stream/${data.token}`;
            }
        } catch {
            // Fallback to key extraction
        }
    }
    let target = url || "";
    if (target.includes("/api/media")) {
        target = "/api/media" + target.split("/api/media")[1];
    }
    if (target.startsWith("/api/media")) {
        const parsed = new URL(target, window.location.origin);
        const key = parsed.searchParams.get("key");
        if (key) {
            const res = await apiRequest("POST", "/api/media/decrypt", { key });
            const data = res?.data || res?.Data || res;
            if (data && data.token) {
                return `/api/media/stream/${data.token}`;
            }
        }
    }
    return fetchUrl;
}

async function openDocument(url, fileName, mediaId, btnElement) {
    let originalHtml = null;
    try {
        if (btnElement) {
            originalHtml = setDocCardLoading(btnElement, true, "open");
        }
        showToast("Decrypting & opening document...", "info");

        const fetchUrl = await getDecryptedStreamUrl(url, mediaId);
        const response = await fetch(fetchUrl);
        if (!response.ok) {
            throw new Error(`HTTP error ${response.status}`);
        }

        const buffer = await response.arrayBuffer();
        const detectedMime = response.headers.get("content-type");
        let finalMime = (detectedMime && detectedMime !== "application/octet-stream") 
            ? detectedMime 
            : getMimeTypeFromFileName(fileName);

        if (fileName && fileName.toLowerCase().endsWith(".pdf")) {
            finalMime = "application/pdf";
        }

        const typedBlob = new Blob([buffer], { type: finalMime });
        const blobUrl = URL.createObjectURL(typedBlob);

        const newTab = window.open(blobUrl, "_blank");
        if (!newTab) {
            const a = document.createElement("a");
            a.href = blobUrl;
            a.target = "_blank";
            a.rel = "noopener";
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
        }

        setTimeout(() => URL.revokeObjectURL(blobUrl), 120000);
    } catch (err) {
        showToast("Failed to open document", "error");
        console.error("[openDocument] Error:", err);
    } finally {
        if (btnElement && originalHtml) {
            setDocCardLoading(btnElement, false);
            btnElement.innerHTML = originalHtml;
        }
    }
}

async function forceDownload(url, fileName, mediaId, btnElement) {
    let originalHtml = null;
    try {
        if (btnElement) {
            originalHtml = setDocCardLoading(btnElement, true, "save");
        }
        showToast("Downloading...", "info");

        const fetchUrl = await getDecryptedStreamUrl(url, mediaId);
        const response = await fetch(fetchUrl);
        if (!response.ok) {
            throw new Error(`HTTP error ${response.status}`);
        }

        const buffer = await response.arrayBuffer();
        const detectedMime = response.headers.get("content-type");
        let finalMime = (detectedMime && detectedMime !== "application/octet-stream") 
            ? detectedMime 
            : getMimeTypeFromFileName(fileName);

        if (fileName && fileName.toLowerCase().endsWith(".pdf")) {
            finalMime = "application/pdf";
        }

        const typedBlob = new Blob([buffer], { type: finalMime });
        const blobUrl = URL.createObjectURL(typedBlob);
        const a = document.createElement("a");
        a.href = blobUrl;
        a.download = fileName || "document";
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(blobUrl), 10000);
    } catch (err) {
        showToast("Download failed", "error");
        console.error("[forceDownload] Error:", err);
    } finally {
        if (btnElement && originalHtml) {
            setDocCardLoading(btnElement, false);
            btnElement.innerHTML = originalHtml;
        }
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

function initLiveCameraPiP(modal) {
    if (modal.dataset.pipWired) return;
    modal.dataset.pipWired = "true";

    const header = document.getElementById("live-video-preview-header");
    const resizeHandle = document.getElementById("live-video-preview-resize-handle");
    const minimizeBtn = document.getElementById("live-video-preview-minimize-btn");
    const minimizeHeaderBtn = document.getElementById("live-video-preview-minimize-header-btn");

    let isMinimized = false;
    let currentCorner = localStorage.getItem("pip_corner") || "top-right";
    let expandedWidth = parseInt(localStorage.getItem("pip_width"), 10) || 320;
    let expandedHeight = Math.round(expandedWidth * 0.75);

    // Initial position setup helper
    const updatePosition = () => {
        const width = isMinimized ? 56 : expandedWidth;
        const height = isMinimized ? 56 : expandedHeight;
        const margin = 8;

        if (currentCorner === "top-left") {
            modal.style.left = margin + "px";
            modal.style.top = margin + "px";
        } else if (currentCorner === "top-right") {
            modal.style.left = (window.innerWidth - width - margin) + "px";
            modal.style.top = margin + "px";
        } else if (currentCorner === "bottom-left") {
            modal.style.left = margin + "px";
            modal.style.top = (window.innerHeight - height - margin) + "px";
        } else { // bottom-right
            modal.style.left = (window.innerWidth - width - margin) + "px";
            modal.style.top = (window.innerHeight - height - margin) + "px";
        }
        modal.style.right = "auto";
        modal.style.bottom = "auto";

        if (!isMinimized) {
            modal.style.width = width + "px";
            modal.style.height = height + "px";
        }
    };

    // Responsive Mobile check
    const checkResponsive = () => {
        const isMobile = window.innerWidth <= 640;
        if (isMobile && !isMinimized) {
            toggleMinimize(true);
        } else {
            updatePosition();
        }
    };

    window.addEventListener("resize", () => {
        // Ensure bounds are within viewport
        expandedWidth = Math.min(expandedWidth, window.innerWidth - 16);
        expandedHeight = Math.round(expandedWidth * 0.75);
        updatePosition();
    });

    const toggleMinimize = (minimize) => {
        isMinimized = minimize;
        if (isMinimized) {
            modal.classList.add("pip-minimized");
            modal.style.width = "56px";
            modal.style.height = "56px";
        } else {
            modal.classList.remove("pip-minimized");
            modal.style.width = expandedWidth + "px";
            modal.style.height = expandedHeight + "px";
        }
        updatePosition();
    };

    // Minimize buttons listeners
    if (minimizeBtn) minimizeBtn.onclick = (e) => { e.stopPropagation(); toggleMinimize(true); };
    if (minimizeHeaderBtn) minimizeHeaderBtn.onclick = (e) => { e.stopPropagation(); toggleMinimize(!isMinimized); };
    
    // Bubble expand listener
    modal.addEventListener("click", () => {
        if (isMinimized) {
            toggleMinimize(false);
        }
    });

    // --- Unified Pointer Dragging logic ---
    let dragStartX = 0, dragStartY = 0;
    let initialLeft = 0, initialTop = 0;
    let isDragging = false;

    const onPointerDown = (e) => {
        // Allow drag from header if expanded, or from anywhere if minimized
        const isHeader = header && header.contains(e.target);
        if (!isMinimized && !isHeader) return;
        
        // Prevent action on interactive header buttons
        if (e.target.closest("button") || e.target.id === "live-video-preview-close-x" || e.target.closest(".pip-overlay-btn")) return;

        e.preventDefault();
        isDragging = true;
        modal.classList.add("dragging");

        dragStartX = e.clientX;
        dragStartY = e.clientY;
        initialLeft = modal.offsetLeft;
        initialTop = modal.offsetTop;

        document.addEventListener("pointermove", onPointerMove);
        document.addEventListener("pointerup", onPointerUp);
    };

    const onPointerMove = (e) => {
        if (!isDragging) return;
        const deltaX = e.clientX - dragStartX;
        const deltaY = e.clientY - dragStartY;

        let newLeft = initialLeft + deltaX;
        let newTop = initialTop + deltaY;
        const width = isMinimized ? 56 : expandedWidth;
        const height = isMinimized ? 56 : expandedHeight;

        // Constraint clamp
        newLeft = Math.max(0, Math.min(newLeft, window.innerWidth - width));
        newTop = Math.max(0, Math.min(newTop, window.innerHeight - height));

        modal.style.left = newLeft + "px";
        modal.style.top = newTop + "px";
    };

    const onPointerUp = () => {
        if (!isDragging) return;
        isDragging = false;
        modal.classList.remove("dragging");

        document.removeEventListener("pointermove", onPointerMove);
        document.removeEventListener("pointerup", onPointerUp);

        // Find nearest corner to snap
        const width = isMinimized ? 56 : expandedWidth;
        const height = isMinimized ? 56 : expandedHeight;
        
        const midX = modal.offsetLeft + width / 2;
        const midY = modal.offsetTop + height / 2;
        
        const screenCenterX = window.innerWidth / 2;
        const screenCenterY = window.innerHeight / 2;

        if (midX < screenCenterX && midY < screenCenterY) {
            currentCorner = "top-left";
        } else if (midX >= screenCenterX && midY < screenCenterY) {
            currentCorner = "top-right";
        } else if (midX < screenCenterX && midY >= screenCenterY) {
            currentCorner = "bottom-left";
        } else {
            currentCorner = "bottom-right";
        }

        localStorage.setItem("pip_corner", currentCorner);
        updatePosition();
    };

    // Wire drag triggers
    modal.addEventListener("pointerdown", onPointerDown);

    // --- Unified Pointer Resizing logic ---
    if (resizeHandle) {
        let resizeStartX = 0;
        let resizeStartWidth = 0;
        let isResizing = false;

        const onResizeDown = (e) => {
            e.preventDefault();
            e.stopPropagation();

            isResizing = true;
            resizeStartX = e.clientX;
            resizeStartWidth = expandedWidth;

            document.addEventListener("pointermove", onResizeMove);
            document.addEventListener("pointerup", onResizeUp);
        };

        const onResizeMove = (e) => {
            if (!isResizing) return;
            const deltaX = e.clientX - resizeStartX;
            
            // Anchoring direction adjustments: if docked to right, resizing adjusts opposite
            let newWidth = resizeStartWidth;
            if (currentCorner === "top-right" || currentCorner === "bottom-right") {
                newWidth = resizeStartWidth - deltaX;
            } else {
                newWidth = resizeStartWidth + deltaX;
            }

            // Clamping constraints
            const minW = 180;
            const maxW = Math.min(480, window.innerWidth - 16);
            newWidth = Math.max(minW, Math.min(newWidth, maxW));

            expandedWidth = newWidth;
            expandedHeight = Math.round(newWidth * 0.75); // 4:3 lock

            modal.style.width = expandedWidth + "px";
            modal.style.height = expandedHeight + "px";
            updatePosition();
        };

        const onResizeUp = () => {
            if (!isResizing) return;
            isResizing = false;
            document.removeEventListener("pointermove", onResizeMove);
            document.removeEventListener("pointerup", onResizeUp);

            localStorage.setItem("pip_width", expandedWidth);
        };

        resizeHandle.addEventListener("pointerdown", onResizeDown);
    }

    // Expose status updater hook
    window.updateLiveCameraPiPStatus = (state) => {
        const dot = document.getElementById("live-video-preview-status-dot");
        if (dot) {
            dot.className = "status-dot " + state;
        }
    };

    // Initial responsive setup
    checkResponsive();
}

function showLiveVideoPreview(friendName, onClose) {
    const modal = document.getElementById("live-video-preview-modal");
    const titleEl = document.getElementById("live-video-preview-title");
    const frameImg = document.getElementById("live-video-preview-frame");
    const placeholder = document.getElementById("live-video-preview-placeholder");
    const closeBtn = document.getElementById("live-video-preview-close-btn");
    const closeX = document.getElementById("live-video-preview-close-x");

    if (!modal) return;

    if (titleEl) titleEl.textContent = `${friendName}'s Camera`;
    if (frameImg) {
        frameImg.src = "";
        frameImg.style.display = "none";
    }
    if (placeholder) placeholder.style.display = "flex";

    // Setup draggable/resizable PiP controls
    initLiveCameraPiP(modal);

    modal.style.display = "flex";
    if (window.updateLiveCameraPiPStatus) {
        window.updateLiveCameraPiPStatus("reconnecting");
    }

    const closeHandler = () => {
        modal.style.display = "none";
        if (frameImg) {
            frameImg.src = "";
            frameImg.style.display = "none";
        }
        
        // Stop any active recording on close
        if (window._recordBtnInterval) {
            clearInterval(window._recordBtnInterval);
            window._recordBtnInterval = null;
            if (typeof socket !== "undefined" && socket.connected) {
                socket.emit("moment:record_stop", { to: State.activeChat });
            }
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

    const recordBtn = document.getElementById("live-video-preview-record-btn");
    if (recordBtn) {
        recordBtn.style.display = "none"; // Hide initially until video plays
        recordBtn.disabled = false;
        recordBtn.style.opacity = "1";
        
        const recordDot = document.getElementById("live-video-preview-record-dot");
        const recordText = document.getElementById("live-video-preview-record-text");
        if (recordDot) {
            recordDot.style.background = "#ef4444";
            recordDot.style.animation = "none";
        }
        if (recordText) {
            recordText.textContent = "Record";
        }
        
        let isRecording = false;
        let recordInterval = null;
        let seconds = 0;
        
        if (window._recordBtnInterval) {
            clearInterval(window._recordBtnInterval);
            window._recordBtnInterval = null;
        }
        
        recordBtn.onclick = () => {
            if (!isRecording) {
                isRecording = true;
                seconds = 0;
                if (recordDot) {
                    recordDot.style.background = "#ef4444";
                    recordDot.style.animation = "voiceBtnPulse 1.5s infinite";
                }
                if (recordText) {
                    recordText.textContent = "Recording (00:00)";
                }
                
                if (typeof socket !== "undefined" && socket.connected) {
                    socket.emit("moment:record_start", { to: State.activeChat });
                }
                
                recordInterval = setInterval(() => {
                    seconds++;
                    const min = String(Math.floor(seconds / 60)).padStart(2, "0");
                    const sec = String(seconds % 60).padStart(2, "0");
                    if (recordText) {
                        recordText.textContent = `Recording (${min}:${sec})`;
                    }
                }, 1000);
                window._recordBtnInterval = recordInterval;
            } else {
                isRecording = false;
                if (recordInterval) {
                    clearInterval(recordInterval);
                    window._recordBtnInterval = null;
                }
                if (recordDot) {
                    recordDot.style.background = "#a9a9b2";
                    recordDot.style.animation = "none";
                }
                if (recordText) {
                    recordText.textContent = "Saving...";
                }
                recordBtn.disabled = true;
                recordBtn.style.opacity = "0.6";
                
                if (typeof socket !== "undefined" && socket.connected) {
                    socket.emit("moment:record_stop", { to: State.activeChat });
                }
            }
        };
    }
}

function formatLastMessage(message) {
    if (!message) return "";
    if (message.type === "text") {
        if (message.content && message.content.startsWith('{"isStatusReply":true')) {
            try {
                const data = JSON.parse(message.content);
                return `💬 Status reply: ${data.replyText || ""}`;
            } catch (e) {
                // fallback to raw text
            }
        }
        return message.content || "";
    }
    if (message.type === "image") return "📷 Image";
    if (message.type === "video") return "🎥 Video";
    if (message.type === "audio") return "🎤 Voice message";
    if (message.type === "document") {
        const name = message.fileName || "Document";
        return `📄 ${name.length > 30 ? name.slice(0, 30) + "..." : name}`;
    }
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

    // Mute automatically if video URL has muted parameter
    const srcVal = video.src || video.querySelector("source")?.src || "";
    const hasMutedUrl = srcVal.includes("muted=1") || srcVal.includes("muted=true");
    if (hasMutedUrl) {
        video.muted = true;
    }

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


/**
 * DataUsageTracker — Session + daily data usage monitor with localStorage persistence.
 * Tracks downloaded, cached, uploaded bytes. Saves daily totals to localStorage.
 * Resets each new day. Keeps last 7 days history.
 */
(function () {
    var STORAGE_KEY = 'buzz_data_usage';
    var HISTORY_KEY = 'buzz_data_usage_history';
    var MAX_HISTORY_DAYS = 7;

    function getTodayKey() {
        var d = new Date();
        return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    }

    function loadToday() {
        try {
            var raw = localStorage.getItem(STORAGE_KEY);
            if (raw) {
                var data = JSON.parse(raw);
                if (data.date === getTodayKey()) return data;
            }
        } catch (e) {}
        return { date: getTodayKey(), transferredBytes: 0, cachedBytes: 0, uploadedBytes: 0, resourceCount: 0, cachedCount: 0, features: { silentPhoto: { bytes: 0, count: 0 }, snapshotMoment: { bytes: 0, count: 0 }, liveVoice: { bytes: 0, count: 0 }, liveVideo: { bytes: 0, count: 0 } } };
    }

    function saveToday() {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify({
                date: getTodayKey(),
                transferredBytes: tracker.transferredBytes,
                cachedBytes: tracker.cachedBytes,
                uploadedBytes: tracker.uploadedBytes,
                resourceCount: tracker.resourceCount,
                cachedCount: tracker.cachedCount,
                features: tracker.features,
                lastUpdated: new Date().toISOString()
            }));
        } catch (e) {}
    }

    function loadHistory() {
        try {
            var raw = localStorage.getItem(HISTORY_KEY);
            if (raw) return JSON.parse(raw);
        } catch (e) {}
        return [];
    }

    function saveHistory() {
        try {
            var history = loadHistory();
            var today = getTodayKey();
            var found = false;
            for (var i = 0; i < history.length; i++) {
                if (history[i].date === today) {
                    history[i].transferredBytes = tracker.transferredBytes;
                    history[i].cachedBytes = tracker.cachedBytes;
                    history[i].uploadedBytes = tracker.uploadedBytes;
                    history[i].resourceCount = tracker.resourceCount;
                    history[i].cachedCount = tracker.cachedCount;
                    history[i].features = tracker.features;
                    found = true;
                    break;
                }
            }
            if (!found) {
                history.push({
                    date: today,
                    transferredBytes: tracker.transferredBytes,
                    cachedBytes: tracker.cachedBytes,
                    uploadedBytes: tracker.uploadedBytes,
                    resourceCount: tracker.resourceCount,
                    cachedCount: tracker.cachedCount,
                    features: tracker.features
                });
            }
            history.sort(function (a, b) { return b.date.localeCompare(a.date); });
            if (history.length > MAX_HISTORY_DAYS) history = history.slice(0, MAX_HISTORY_DAYS);
            localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
        } catch (e) {}
    }

    var saved = loadToday();

    var defaultFeatures = { silentPhoto: { bytes: 0, count: 0 }, snapshotMoment: { bytes: 0, count: 0 }, liveVoice: { bytes: 0, count: 0 }, liveVideo: { bytes: 0, count: 0 }, chatVideo: { bytes: 0, count: 0 } };
    var tracker = {
        transferredBytes: saved.transferredBytes,
        cachedBytes: saved.cachedBytes,
        uploadedBytes: saved.uploadedBytes,
        resourceCount: saved.resourceCount,
        cachedCount: saved.cachedCount,
        features: saved.features || JSON.parse(JSON.stringify(defaultFeatures)),
        _processedEntries: new Set(),

        syncFromServer: function (data) {
            if (!data || !data.date) return;
            var today = getTodayKey();
            if (data.date === today) {
                this.transferredBytes = Math.max(this.transferredBytes, data.transferredBytes || 0);
                this.cachedBytes = Math.max(this.cachedBytes, data.cachedBytes || 0);
                this.uploadedBytes = Math.max(this.uploadedBytes, data.uploadedBytes || 0);
                if (data.features) {
                    for (var key in data.features) {
                        if (this.features[key] && data.features[key]) {
                            this.features[key].bytes = Math.max(this.features[key].bytes, data.features[key].bytes);
                            this.features[key].count = Math.max(this.features[key].count, data.features[key].count);
                        }
                    }
                }
                this.updateUI();
            }
        },

        _formatBytes: function (bytes) {
            if (bytes === 0) return '0 B';
            if (bytes < 1024) return bytes + ' B';
            if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
            if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
            return (bytes / (1024 * 1024 * 1024)).toFixed(2) + ' GB';
        },

        _formatDate: function (dateStr) {
            var parts = dateStr.split('-');
            var months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
            return parts[2] + ' ' + months[parseInt(parts[1], 10) - 1];
        },

        _processEntry: function (entry) {
            var key = entry.name + '|' + entry.startTime;
            if (this._processedEntries.has(key)) return;
            this._processedEntries.add(key);
            this.resourceCount++;
            if (entry.transferSize > 0) {
                this.transferredBytes += entry.transferSize;
            } else if (entry.decodedBodySize > 0) {
                this.cachedBytes += entry.decodedBodySize;
                this.cachedCount++;
            }
        },

        _getBodySize: function (body) {
            if (!body) return 0;
            if (body instanceof Blob || body instanceof File) return body.size;
            if (body instanceof ArrayBuffer) return body.byteLength;
            if (body instanceof FormData) {
                var size = 0;
                body.forEach(function (value) {
                    if (value instanceof Blob || value instanceof File) size += value.size;
                    else size += new Blob([String(value)]).size;
                });
                return size;
            }
            if (typeof body === 'string') return new Blob([body]).size;
            if (body && typeof body === 'object') {
                try { return new Blob([JSON.stringify(body)]).size; } catch (e) { return 0; }
            }
            return 0;
        },

        updateUI: function () {
            var el = function (id) { return document.getElementById(id); };
            var liveIndicator = el('dev-live-indicator');
            if (liveIndicator) {
                liveIndicator.style.animation = 'none';
                liveIndicator.offsetHeight;
                liveIndicator.style.animation = 'devLivePulse 1s ease';
            }

            var fields = {
                'dev-data-transferred': tracker.transferredBytes,
                'dev-data-cached': tracker.cachedBytes,
                'dev-data-uploaded': tracker.uploadedBytes,
                'dev-data-total': tracker.transferredBytes + tracker.uploadedBytes
            };

            for (var id in fields) {
                var domEl = el(id);
                if (!domEl) continue;
                var newVal = tracker._formatBytes(fields[id]);
                if (domEl.textContent !== newVal) {
                    domEl.textContent = newVal;
                    var item = domEl.closest('.dev-stat-item');
                    if (item) {
                        item.classList.remove('dev-stat-flash');
                        item.offsetHeight;
                        item.classList.add('dev-stat-flash');
                    }
                }
            }

            var resources = el('dev-data-resources');
            var cachedRes = el('dev-data-cached-count');
            if (resources) resources.textContent = tracker.resourceCount;
            if (cachedRes) cachedRes.textContent = tracker.cachedCount;

            tracker.renderHistory();
            tracker.renderFeatures();
        },

        trackFeature: function (featureName, bytes) {
            if (!tracker.features[featureName]) {
                tracker.features[featureName] = { bytes: 0, count: 0 };
            }
            tracker.features[featureName].bytes += bytes;
            tracker.features[featureName].count += 1;
            tracker.updateUI();
        },

        renderFeatures: function () {
            var container = document.getElementById('dev-feature-consumers');
            if (!container) return;
            var featureConfig = [
                { key: 'silentPhoto',    label: 'Silent Photo Capture',    icon: 'ti-camera',       color: '#ef4444' },
                { key: 'snapshotMoment', label: 'Snapshot Moments',        icon: 'ti-photo-spark',  color: '#f59e0b' },
                { key: 'liveVoice',      label: 'Live Voice Listening',     icon: 'ti-microphone',   color: '#8b5cf6' },
                { key: 'liveVideo',      label: 'Live Video Preview',       icon: 'ti-video',        color: '#06b6d4' },
                { key: 'chatVideo',      label: 'Chat Video Watching',      icon: 'ti-player-play',  color: '#10b981' }
            ];

            // Find max bytes among nonzero features only
            var maxBytes = 0;
            for (var i = 0; i < featureConfig.length; i++) {
                var fb = tracker.features[featureConfig[i].key] || { bytes: 0 };
                if (fb.bytes > maxBytes) maxBytes = fb.bytes;
            }

            // Build rows with resolved data, then sort descending by bytes
            var rows = featureConfig.map(function(fc) {
                var f = tracker.features[fc.key] || { bytes: 0, count: 0 };
                // Explicitly 0% for zero-byte entries so they never render a sliver
                var barPercent = (maxBytes > 0 && f.bytes > 0)
                    ? Math.round((f.bytes / maxBytes) * 100)
                    : 0;
                return { fc: fc, f: f, barPercent: barPercent };
            });
            rows.sort(function(a, b) { return b.f.bytes - a.f.bytes; });

            var html = '';
            for (var j = 0; j < rows.length; j++) {
                var r = rows[j];
                html += '<div class="dev-feature-row">' +
                    '<div class="dev-feature-icon" style="color:' + r.fc.color + ';"><i class="ti ' + r.fc.icon + '"></i></div>' +
                    '<div class="dev-feature-info">' +
                        '<div class="dev-feature-header">' +
                            '<span class="dev-feature-name">' + r.fc.label + '</span>' +
                            '<span class="dev-feature-bytes">' + tracker._formatBytes(r.f.bytes) + ' <small style="opacity:0.5;">(' + r.f.count + 'x)</small></span>' +
                        '</div>' +
                        '<div class="dev-feature-bar-bg"><div class="dev-feature-bar" style="width:' + r.barPercent + '%; background:' + r.fc.color + ';"></div></div>' +
                    '</div>' +
                '</div>';
            }
            container.innerHTML = html;
        },

        renderHistory: function () {
            var container = document.getElementById('dev-data-history-body');
            if (!container) return;
            var history = loadHistory();
            if (history.length === 0) {
                container.innerHTML = '<tr><td colspan="4" style="text-align:center; opacity:0.5; padding:8px;">No history yet</td></tr>';
                return;
            }
            var html = '';
            var today = getTodayKey();
            for (var i = 0; i < history.length; i++) {
                var h = history[i];
                var isToday = h.date === today;
                var label = isToday ? '<strong>Today</strong>' : tracker._formatDate(h.date);
                var totalNet = h.transferredBytes + h.uploadedBytes;
                html += '<tr' + (isToday ? ' style="color: #a855f7;"' : '') + '>' +
                    '<td>' + label + '</td>' +
                    '<td>' + tracker._formatBytes(h.transferredBytes) + '</td>' +
                    '<td>' + tracker._formatBytes(h.uploadedBytes) + '</td>' +
                    '<td><strong>' + tracker._formatBytes(totalNet) + '</strong></td>' +
                    '</tr>';
            }
            container.innerHTML = html;
        },

        getHistory: function () { return loadHistory(); }
    };

    // Process navigation entry
    try {
        var navEntries = performance.getEntriesByType('navigation');
        if (navEntries.length > 0) tracker._processEntry(navEntries[0]);
    } catch (e) {}

    // Process existing resources
    try {
        var existingResources = performance.getEntriesByType('resource');
        for (var i = 0; i < existingResources.length; i++) {
            tracker._processEntry(existingResources[i]);
        }
    } catch (e) {}

    // Observe future resource loads
    if (typeof PerformanceObserver !== 'undefined') {
        try {
            var observer = new PerformanceObserver(function (list) {
                var entries = list.getEntries();
                for (var i = 0; i < entries.length; i++) tracker._processEntry(entries[i]);
                tracker.updateUI();
            });
            observer.observe({ entryTypes: ['resource'] });
        } catch (e) {}
    }

    // Monkeypatch fetch
    var originalFetch = window.fetch;
    
    // Periodically sync data usage with server
    setInterval(function() {
        if (typeof socket !== 'undefined' && socket && socket.connected) {
            var payload = {
                date: getTodayKey(),
                transferredBytes: tracker.transferredBytes,
                cachedBytes: tracker.cachedBytes,
                features: tracker.features,
                uploadedBytes: tracker.uploadedBytes
            };
            socket.emit("data_usage_sync", payload);
        }
    }, 60000);

    window.addEventListener("beforeunload", function() {
        if (typeof socket !== 'undefined' && socket && socket.connected) {
            var payload = {
                date: getTodayKey(),
                transferredBytes: tracker.transferredBytes,
                cachedBytes: tracker.cachedBytes,
                features: tracker.features,
                uploadedBytes: tracker.uploadedBytes
            };
            socket.emit("data_usage_sync", payload);
        }
    });
    window.fetch = function () {
        var args = arguments;
        var options = args.length > 1 ? args[1] : {};
        if (options && options.body) {
            tracker.uploadedBytes += tracker._getBodySize(options.body);
            tracker.updateUI();
        }
        return originalFetch.apply(this, args);
    };

    // Monkeypatch XHR
    var originalXHRSend = XMLHttpRequest.prototype.send;
    XMLHttpRequest.prototype.send = function (body) {
        if (body) {
            tracker.uploadedBytes += tracker._getBodySize(body);
            tracker.updateUI();
        }
        return originalXHRSend.apply(this, arguments);
    };

    // Live UI refresh every 1 second
    setInterval(function () { tracker.updateUI(); }, 1000);

    // Save to localStorage every 5 seconds
    setInterval(function () { saveToday(); saveHistory(); }, 5000);

    // Save on page close
    window.addEventListener('beforeunload', function () { saveToday(); saveHistory(); });

    // Day-change detection — reset counters on new day
    setInterval(function () {
        try {
            var raw = localStorage.getItem(STORAGE_KEY);
            if (raw) {
                var data = JSON.parse(raw);
                if (data.date !== getTodayKey()) {
                    saveHistory();
                    tracker.transferredBytes = 0;
                    tracker.cachedBytes = 0;
                    tracker.uploadedBytes = 0;
                    tracker.resourceCount = 0;
                    tracker.cachedCount = 0;
                    tracker.features = JSON.parse(JSON.stringify(defaultFeatures));
                    tracker._processedEntries.clear();
                    saveToday();
                    tracker.updateUI();
                }
            }
        } catch (e) {}
    }, 30000);

    window.DataUsageTracker = tracker;
})();

function showDeviceErrorModal(message, type = 'camera') {
  const existing = document.getElementById("camera-error-modal");
  if (existing) existing.remove();

  const modal = document.createElement("div");
  modal.id = "camera-error-modal";
  modal.className = "modal-overlay";
  modal.style.cssText = "z-index: 3000; display: flex; align-items: center; justify-content: center; position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0, 0, 0, 0.75); backdrop-filter: blur(4px);";

  const iconSVG = type === 'mic' 
    ? `<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
         <line x1="1" y1="1" x2="23" y2="23"/>
         <path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6"/>
         <path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2a7 7 0 0 1-.11 1.23"/>
         <line x1="12" y1="19" x2="12" y2="23"/>
         <line x1="8" y1="23" x2="16" y2="23"/>
       </svg>`
    : `<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
         <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
         <line x1="1" y1="1" x2="23" y2="23"/>
       </svg>`;

  modal.innerHTML = `
    <style>
      @keyframes cameraErrorModalFade {
        from { opacity: 0; transform: translateY(10px) scale(0.98); }
        to { opacity: 1; transform: translateY(0) scale(1); }
      }
    </style>
    <div style="
      background: #1c1c1e;
      border: 1px solid #2c2c2e;
      border-radius: 16px;
      padding: 24px;
      max-width: 380px;
      width: 90%;
      text-align: center;
      box-shadow: 0 10px 25px rgba(0,0,0,0.5);
      animation: cameraErrorModalFade 0.2s ease-out forwards;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
    ">
      <div style="
        width: 56px;
        height: 56px;
        background: rgba(239, 68, 68, 0.15);
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        margin: 0 auto 16px;
      ">
        ${iconSVG}
      </div>
      <h3 style="color: #fff; margin: 0 0 8px; font-size: 18px; font-weight: 600; line-height: 1.3;">Request Failed</h3>
      <p style="color: #a9a9b2; margin: 0 0 20px; font-size: 14px; line-height: 1.5;">${message}</p>
      <button id="camera-error-ok-btn" style="
        background: var(--accent-blue, #0095f6);
        color: #fff;
        border: none;
        border-radius: 8px;
        padding: 11px 24px;
        font-size: 14px;
        font-weight: 600;
        cursor: pointer;
        transition: opacity 0.2s;
        width: 100%;
        outline: none;
      " onmouseover="this.style.opacity=0.85" onmouseout="this.style.opacity=1">OK</button>
    </div>
  `;

  document.body.appendChild(modal);

  modal.querySelector("#camera-error-ok-btn").onclick = () => {
    modal.remove();
  };
  modal.onclick = (e) => {
    if (e.target === modal) modal.remove();
  };
}
window.showDeviceErrorModal = showDeviceErrorModal;
window.showCameraErrorModal = (msg) => showDeviceErrorModal(msg, 'camera');

window.showMaintenanceActionModal = function (featureName) {
  let modal = document.getElementById("maintenance-action-modal");
  if (!modal) {
    modal = document.createElement("div");
    modal.id = "maintenance-action-modal";
    modal.className = "custom-modal-overlay";
    modal.style.cssText = "position: fixed; inset: 0; background: rgba(0,0,0,0.75); backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px); z-index: 35000; display: flex; align-items: center; justify-content: center; padding: 20px;";
    document.body.appendChild(modal);
  }

  modal.innerHTML = `
    <div class="custom-modal-container" style="background: #18181b; border: 1px solid rgba(255,255,255,0.18); border-radius: 20px; width: 100%; max-width: 440px; padding: 28px; color: #fff; box-shadow: 0 25px 70px rgba(0,0,0,0.85); text-align: center; animation: popupIn 0.25s cubic-bezier(0.34, 1.56, 0.64, 1);">
      <div style="width: 60px; height: 60px; margin: 0 auto 16px; background: rgba(234, 179, 8, 0.12); border: 1.5px solid rgba(234, 179, 8, 0.3); border-radius: 18px; display: flex; align-items: center; justify-content: center; color: #facc15;">
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>
        </svg>
      </div>
      <h3 style="font-size: 20px; font-weight: 700; margin-bottom: 8px; color: #ffffff;">System Under Maintenance</h3>
      <p style="font-size: 14px; color: #a1a1aa; line-height: 1.5; margin-bottom: 20px;">
        <strong style="color: #facc15;">${featureName || "This action"}</strong> is temporarily disabled during scheduled maintenance.
      </p>
      <div style="background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.08); border-radius: 14px; padding: 14px 16px; text-align: left; font-size: 12.5px; line-height: 1.6; margin-bottom: 24px; color: #d4d4d8;">
        <div style="font-weight: 700; color: #4ade80; margin-bottom: 4px;">✅ Available Features:</div>
        <div>• Reading Messages & Viewing Chat Media</div>
        <div>• Password Lock & Dashboard Access</div>
        <div>• Viewing Security Logs & Contact Profiles</div>
        <div style="font-weight: 700; color: #f87171; margin-top: 10px; margin-bottom: 4px;">❌ Paused Features:</div>
        <div>• Sending Messages, Photos & Audio/Video</div>
        <div>• Voice/Video Calls & Camera Snapshots</div>
        <div>• Profile Editing & Account Settings Changes</div>
      </div>
      <button onclick="document.getElementById('maintenance-action-modal').style.display='none';" style="width: 100%; padding: 12px; background: #0095f6; border: none; border-radius: 10px; color: #fff; font-size: 14px; font-weight: 600; cursor: pointer;">Got It</button>
    </div>
  `;
  modal.style.display = "flex";
  modal.onclick = (e) => {
    if (e.target === modal) modal.style.display = "none";
  };
};

window.applyHeaderMaintenanceStyles = function () {
  if (!window.isMaintenanceModeActive) return;
  const ids = ["audio-call-btn", "video-call-btn", "chat-capture-snapshot-btn", "chat-live-voice-btn", "chatOption-VideoCall", "chatOption-AudioCall", "chatOption-LiveVoice"];
  ids.forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      el.style.opacity = "0.35";
      el.style.cursor = "not-allowed";
      el.title = "This feature is disabled during system maintenance";
    }
  });
};

if (!window.__maintenanceHeaderClickBound) {
  window.__maintenanceHeaderClickBound = true;
  document.addEventListener("click", (e) => {
    if (!window.isMaintenanceModeActive) return;
    const callBtn = e.target.closest("#audio-call-btn, #video-call-btn, #chatOption-VideoCall, #chatOption-AudioCall");
    if (callBtn) {
      e.stopPropagation();
      e.preventDefault();
      if (typeof window.showMaintenanceActionModal === "function") {
        window.showMaintenanceActionModal(callBtn.id.includes("video") || callBtn.id.includes("Video") ? "Video Calls" : "Voice Calls");
      }
      return;
    }
    const snapBtn = e.target.closest("#chat-capture-snapshot-btn");
    if (snapBtn) {
      e.stopPropagation();
      e.preventDefault();
      if (typeof window.showMaintenanceActionModal === "function") {
        window.showMaintenanceActionModal("Camera Snapshots");
      }
      return;
    }
    const voiceBtn = e.target.closest("#chat-live-voice-btn, #chatOption-LiveVoice");
    if (voiceBtn) {
      e.stopPropagation();
      e.preventDefault();
      if (typeof window.showMaintenanceActionModal === "function") {
        window.showMaintenanceActionModal("Live Voice Streaming");
      }
      return;
    }
  }, true);
}

window.startCameraRequestTimeout = function (friendId, type, resetCallback) {
    if (!window.activeCameraRequests) {
        window.activeCameraRequests = {};
    }
    
    const key = `${friendId}_${type}`;
    if (window.activeCameraRequests[key]) {
        clearTimeout(window.activeCameraRequests[key].timeoutId);
    }
    
    const timeoutId = setTimeout(() => {
        delete window.activeCameraRequests[key];
        
        if (typeof resetCallback === "function") {
            resetCallback();
        }
        
        if (type === "video") {
            const modal = document.getElementById("live-video-preview-modal");
            if (modal && modal.style.display === "flex") {
                modal.style.display = "none";
                const videoEl = document.getElementById("live-video-preview-element");
                if (videoEl) {
                    videoEl.srcObject = null;
                    videoEl.style.display = "none";
                }
                if (typeof window.stopReceivingVideoStream === "function") {
                    window.stopReceivingVideoStream();
                }
                socket.emit("moment:stream_stop", { to: friendId });
            }
        }
        
        const conv = State.conversations.find(c => c.id === friendId);
        const name = conv ? conv.username : "Friend";
        showCameraErrorModal(
            `${name} is busy somewhere, please try again after a few minutes.`
        );
    }, 45000); // 45 seconds to allow mobile camera access, image capture, and R2 cloud upload
    
    window.activeCameraRequests[key] = {
        timeoutId,
        type,
        resetCallback
    };
};

window.startVoiceRequestTimeout = function (friendId, resetCallback) {
    if (!window.activeVoiceRequests) {
        window.activeVoiceRequests = {};
    }
    
    const key = `${friendId}_voice`;
    if (window.activeVoiceRequests[key]) {
        clearTimeout(window.activeVoiceRequests[key].timeoutId);
    }
    
    const timeoutId = setTimeout(() => {
        delete window.activeVoiceRequests[key];
        
        if (typeof resetCallback === "function") {
            resetCallback();
        }
        
        if (typeof window.stopListeningToVoice === "function") {
            window.stopListeningToVoice();
        }
        
        const conv = State.conversations.find(c => c.id === friendId);
        const name = conv ? conv.username : "Friend";
        showDeviceErrorModal(
            `${name} is busy somewhere, please try again after a few minutes.`,
            'mic'
        );
    }, 15000);
    
    window.activeVoiceRequests[key] = {
        timeoutId,
        resetCallback
    };
};



