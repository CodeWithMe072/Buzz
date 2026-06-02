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
