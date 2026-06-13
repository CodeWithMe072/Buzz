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
        document.ontouchend = closeDragElement;
        document.ontouchmove = elementTouchDrag;
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
        document.ontouchend = null;
        document.ontouchmove = null;
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

    // Reset default floating widget position and mini size on open
    modal.style.top = "80px";
    modal.style.right = "20px";
    modal.style.left = "auto";
    modal.style.bottom = "auto";
    modal.style.width = "280px";
    modal.style.height = "220px";

    if (titleEl) titleEl.textContent = `${friendName}'s Live Camera Preview`;
    if (frameImg) {
        frameImg.src = "";
        frameImg.style.display = "none";
    }
    if (placeholder) placeholder.style.display = "flex";

    // Setup drag handling if not already done
    if (!modal.dataset.draggableWired) {
        const header = document.getElementById("live-video-preview-header");
        makeElementDraggable(modal, header);
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
}
