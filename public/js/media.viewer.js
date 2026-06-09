/**
 * media.viewer.js — MediaViewer class for fullscreen image/video browsing.
 */

// =============================================================================
// VIDEO UTILITIES
// =============================================================================
function getVideoDuration(videoUrl) {
    return new Promise((resolve, reject) => {
        const video = document.createElement("video");
        video.preload = "metadata";
        video.src = videoUrl;
        video.crossOrigin = "anonymous";
        video.onloadedmetadata = () => resolve(video.duration);
        video.onerror = () => reject("Failed to load video metadata");
    });
}

async function generateVideoThumbnail(videoUrl) {
    return new Promise((resolve, reject) => {
        const video = document.createElement("video");
        let timeout;

        function cleanup() {
            clearTimeout(timeout);
            video.pause();
            video.removeAttribute("src");
            video.load();
        }

        timeout = setTimeout(() => { cleanup(); reject(new Error("Thumbnail timeout")); }, 15000);

        video.crossOrigin = "anonymous";
        video.muted = true;
        video.playsInline = true;
        video.preload = "metadata";
        video.autoplay = false;
        video.src = videoUrl;

        video.onloadedmetadata = () => {
            const seekTime = Math.min(1, Math.max(0, video.duration / 2));
            setTimeout(() => {
                try { video.currentTime = seekTime; }
                catch (err) { cleanup(); reject(err); }
            }, 200);
        };

        video.onseeked = () => {
            try {
                const canvas = document.createElement("canvas");
                canvas.width = 270;
                canvas.height = 270;
                const ctx = canvas.getContext("2d");
                ctx.fillStyle = "#000";
                ctx.fillRect(0, 0, 270, 270);
                ctx.drawImage(video, 0, 0, 270, 270);
                const url = canvas.toDataURL("image/jpeg", 0.7);
                cleanup();
                resolve({ url });
            } catch (err) { cleanup(); reject(err); }
        };

        video.onerror = () => { cleanup(); reject(new Error("Video load failed")); };
    });
}

// =============================================================================
// MEDIA VIEWER CLASS
// =============================================================================
class MediaViewer {
    constructor(chatId) {
        this.chatId = chatId;
        this.mediaItems = [];
        this.currentIndex = 0;
        this.chunkSize = 10;
        this.renderedCount = 0;

        this.overlay = document.getElementById('mediaViewer');
        this.container = document.getElementById('mediaContainer');
        this.thumbnailContainer = document.getElementById('thumbnailContainer');
        this.prevBtn = document.getElementById('prevBtn');
        this.nextBtn = document.getElementById('nextBtn');
        this.closeBtn = document.getElementById('closeViewer');
        this.viewerMain = document.getElementById('viewerMain');

        this.touchStartX = 0;
        this.touchEndX = 0;
        this.isDragging = false;

        this.collectMediaItems();
        this.bindEvents();
    }

    /* ─── DATA ─── */

    collectMediaItems() {
        this.mediaItems = (State.messages[this.chatId] || [])
            .filter(m => (m.type === 'image' || m.type === 'video') && m.content)
            .map((m, index) => ({
                index,
                id: m.id ?? m.tempId,
                type: m.type,
                src: m.content,
                thumb: m.thumb || null,
                cover: m.cover || null
            }));
        this.renderedCount = 0;
    }

    getIndexByMessageId(messageId) {
        return this.mediaItems.findIndex(m => String(m.id) === String(messageId));
    }

    /* ─── LIFECYCLE ─── */

    open(indexOrId) {
        this.collectMediaItems();
        let index = -1;
        if (typeof indexOrId === "number") {
            index = indexOrId;
        } else {
            index = this.getIndexByMessageId(indexOrId);
        }
        if (index < 0 || index >= this.mediaItems.length) return;
        this.currentIndex = index;
        this.overlay.classList.add('active');
        document.body.style.overflow = 'hidden';
        this.render(true);
    }

    close() {
        this.overlay.classList.remove('active');
        document.body.style.overflow = '';
        this.container.querySelectorAll('video').forEach(v => v.pause());
    }

    navigate(direction) {
        const next = this.currentIndex + direction;
        if (next < 0 || next >= this.mediaItems.length) return;
        this.currentIndex = next;
        if (this.currentIndex >= this.renderedCount - 3) this.renderMore();
        this.updateMedia();
    }

    /* ─── RENDER ─── */

    render(reset = false) {
        if (reset) {
            this.container.innerHTML = '';
            this.thumbnailContainer.innerHTML = '';
            this.renderedCount = 0;
        }
        const requiredCount = Math.max(this.currentIndex + 1, this.chunkSize);
        while (this.renderedCount < requiredCount && this.renderedCount < this.mediaItems.length) {
            this.appendItem(this.mediaItems[this.renderedCount], this.renderedCount);
            this.renderedCount++;
        }
        this.updateControls();
        this.updateMedia();
    }

    renderMore() {
        const target = Math.min(this.renderedCount + this.chunkSize, this.mediaItems.length);
        while (this.renderedCount < target) {
            this.appendItem(this.mediaItems[this.renderedCount], this.renderedCount);
            this.renderedCount++;
        }
        this.updateControls();
    }

    appendItem(item, index) {
        /* Main slide */
        const slide = document.createElement('div');
        slide.className = 'media-slide';
        slide.dataset.index = index;

        if (item.type === 'video') {
            const video = document.createElement('video');
            video.src = item.src;
            video.controls = true;
            slide.appendChild(video);
        } else {
            const img = document.createElement('img');
            img.loading = "lazy";
            img.src = item.src;
            slide.appendChild(img);
        }
        this.container.appendChild(slide);

        /* Thumbnail */
        const thumb = document.createElement('div');
        thumb.className = 'thumbnail-item';
        thumb.dataset.index = index;

        const thumbImg = document.createElement('img');
        thumbImg.loading = "lazy";
        thumbImg.src = item.type === 'image'
            ? (item.thumb || item.src)
            : (item.cover || item.thumb || item.src);
        if (item.type === 'video') thumb.classList.add('video');

        thumb.appendChild(thumbImg);
        thumb.addEventListener('click', () => {
            this.currentIndex = index;
            if (this.currentIndex >= this.renderedCount - 1) this.renderMore();
            this.updateMedia();
        });
        this.thumbnailContainer.appendChild(thumb);
    }

    updateMedia() {
        this.container.querySelectorAll('.media-slide').forEach((slide, i) => {
            const active = i === this.currentIndex;
            slide.classList.toggle('active', active);
            const video = slide.querySelector('video');
            if (video) active ? video.play() : video.pause();
        });

        this.thumbnailContainer.querySelectorAll('.thumbnail-item').forEach((t, i) => {
            t.classList.toggle('active', i === this.currentIndex);
            if (i === this.currentIndex) t.scrollIntoView({ block: 'nearest', inline: 'center' });
        });

        this.updateControls();
    }

    updateControls() {
        document.getElementById('currentIndex').textContent = this.currentIndex + 1;
        document.getElementById('totalMedia').textContent = this.mediaItems.length;
        this.prevBtn.disabled = this.currentIndex === 0;
        this.nextBtn.disabled = this.currentIndex === this.mediaItems.length - 1;
    }

    /* ─── EVENTS ─── */

    bindEvents() {
        this.closeBtn.onclick = () => this.close();
        this.prevBtn.onclick = () => this.navigate(-1);
        this.nextBtn.onclick = () => this.navigate(1);

        document.addEventListener('keydown', e => {
            if (!this.overlay.classList.contains('active')) return;
            if (e.key === 'ArrowLeft') this.navigate(-1);
            if (e.key === 'ArrowRight') this.navigate(1);
            if (e.key === 'Escape') this.close();
        });

        this.viewerMain.addEventListener('touchstart', e => {
            this.touchStartX = e.changedTouches[0].screenX;
        }, { passive: true });

        this.viewerMain.addEventListener('touchend', e => {
            this.touchEndX = e.changedTouches[0].screenX;
            this.handleSwipe();
        }, { passive: true });

        this.viewerMain.addEventListener('mousedown', e => {
            this.isDragging = true;
            this.touchStartX = e.clientX;
        });

        this.viewerMain.addEventListener('mouseup', e => {
            if (!this.isDragging) return;
            this.isDragging = false;
            this.touchEndX = e.clientX;
            this.handleSwipe();
        });

        this.thumbnailContainer.addEventListener("scroll", () => {
            const nearEnd =
                this.thumbnailContainer.scrollLeft + this.thumbnailContainer.clientWidth >=
                this.thumbnailContainer.scrollWidth - 200;
            if (nearEnd && this.renderedCount < this.mediaItems.length) this.renderMore();
        });
    }

    handleSwipe() {
        const diff = this.touchStartX - this.touchEndX;
        if (Math.abs(diff) < 50) return;
        diff > 0 ? this.navigate(1) : this.navigate(-1);
    }

    addItem(msg) {
        if (!msg?.content) return;
        if (!(msg.type === "image" || msg.type === "video")) return;
        const id = msg.id ?? msg.tempId;
        if (this.mediaItems.some(item => String(item.id) === String(id))) return;

        const index = this.mediaItems.length;
        this.mediaItems.push({
            index,
            id,
            type: msg.type,
            src: msg.content,
            thumb: msg.thumb || null,
            cover: msg.cover || null
        });
        if (this.overlay.classList.contains("active")) {
            if (this.currentIndex >= this.renderedCount - 3) this.renderMore();
            this.updateControls();
        }
    }
}
