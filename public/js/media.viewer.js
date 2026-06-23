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
    constructor(chatId, data = []) {
        this.chatId = chatId;
        this.data = data;
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

        this.hasMore = true;
        this.isLoading = false;
        this.lastCreatedAt = null;

        this.collectMediaItems();
        this.bindEvents();
    }

    /* ─── DATA ─── */

    collectMediaItems() {
        if (this.data && this.data.length) {
            this.mediaItems = this.data.map((m, index) => ({
                index,
                id: m.id ?? m.tempId,
                type: m.type,
                src: m.content || m.src,
                thumb: m.thumb || null,
                cover: m.cover || null,
                createdAt: m.createdAt || m.timestamp || null
            }));
        } else {
            this.mediaItems = (State.messages[this.chatId] || [])
                .filter(m => (m.type === 'image' || m.type === 'video' || m.type === 'gif') && m.content)
                .map((m, index) => ({
                    index,
                    id: m.id ?? m.tempId,
                    type: m.type,
                    src: m.content,
                    thumb: m.thumb || null,
                    cover: m.cover || null,
                    createdAt: m.createdAt || m.timestamp || null
                }));
        }
        this.renderedCount = 0;
        this.lastCreatedAt = this.mediaItems[this.mediaItems.length - 1]?.createdAt || null;
    }

    getIndexByMessageId(messageId) {
        const idx = this.mediaItems.findIndex(m => String(m.id) === String(messageId));
        console.log("[DEBUG MediaViewer] getIndexByMessageId messageId:", messageId, "found index:", idx, "items:", this.mediaItems.map(x => ({ id: x.id, type: x.type })));
        return idx;
    }

    /* ─── LIFECYCLE ─── */

    open(indexOrId, initialItems = null) {
        console.log("[DEBUG MediaViewer] open called with:", indexOrId, "initialItems:", initialItems);
        if (initialItems && initialItems.length) {
            this.mediaItems = initialItems.map((m, index) => ({
                ...m,
                index
            }));
            this.renderedCount = 0;
            this.hasMore = initialItems.length === 10;
        } else {
            this.collectMediaItems();
            this.hasMore = true;
        }
        console.log("[DEBUG MediaViewer] collected items:", this.mediaItems.map(x => ({ id: x.id, type: x.type })));
        this.isLoading = false;
        this.lastCreatedAt = this.mediaItems[this.mediaItems.length - 1]?.createdAt || null;

        let index = -1;
        if (typeof indexOrId === "number") {
            index = indexOrId;
        } else {
            index = this.getIndexByMessageId(indexOrId);
        }
        console.log("[DEBUG MediaViewer] resolved index:", index);
        if (index < 0 || index >= this.mediaItems.length) {
            console.warn("[DEBUG MediaViewer] resolved index out of bounds or not found!", index);
            return;
        }
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

    async loadMoreFromDB() {
        if (this.isLoading || !this.hasMore) return;
        this.isLoading = true;
        try {
            const data = await fetchMedia(this.chatId, this.lastCreatedAt, 10);
            const mediaMessages = data.Data?.data || [];
            if (mediaMessages.length < 10) {
                this.hasMore = false;
            }
            if (mediaMessages.length > 0) {
                this.lastCreatedAt = mediaMessages[mediaMessages.length - 1].createdAt;
                mediaMessages.forEach(m => {
                    const id = m.id ?? m.tempId;
                    if (this.mediaItems.some(item => String(item.id) === String(id))) return;
                    this.mediaItems.push({
                        index: this.mediaItems.length,
                        id,
                        type: m.type,
                        src: m.content,
                        thumb: m.thumb || null,
                        cover: m.cover || null,
                        createdAt: m.createdAt
                    });
                });
                this.updateControls();
                this.renderMore();
            }
        } catch (err) {
            console.error("Failed to load more media:", err);
        } finally {
            this.isLoading = false;
        }
    }

    async navigate(direction) {
        const next = this.currentIndex + direction;
        if (next < 0) return;
        if (direction > 0 && next >= this.mediaItems.length - 4) {
            await this.loadMoreFromDB();
        }
        if (next >= this.mediaItems.length) return;
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
            if (window.initCustomVideoPlayer) {
                window.initCustomVideoPlayer(video);
            }
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
        thumbImg.src = item.type !== 'video'
            ? (item.thumb || item.src)
            : (item.cover || item.thumb || item.src);
        if (item.type === 'video') thumb.classList.add('video');

        thumb.appendChild(thumbImg);
        thumb.addEventListener('click', async () => {
            this.currentIndex = index;
            if (this.currentIndex >= this.mediaItems.length - 4) {
                await this.loadMoreFromDB();
            }
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
        const currentIdEl = document.getElementById('currentIndex');
        const totalMediaEl = document.getElementById('totalMedia');
        if (currentIdEl) currentIdEl.textContent = this.currentIndex + 1;
        if (totalMediaEl) totalMediaEl.textContent = this.mediaItems.length;
        if (this.prevBtn) this.prevBtn.disabled = this.currentIndex === 0;
        if (this.nextBtn) this.nextBtn.disabled = this.currentIndex === this.mediaItems.length - 1;
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

        this.thumbnailContainer.addEventListener("scroll", async () => {
            const nearEnd =
                this.thumbnailContainer.scrollLeft + this.thumbnailContainer.clientWidth >=
                this.thumbnailContainer.scrollWidth - 200;
            if (nearEnd) {
                if (this.renderedCount < this.mediaItems.length) {
                    this.renderMore();
                } else if (this.hasMore && !this.isLoading) {
                    await this.loadMoreFromDB();
                }
            }
        });
    }

    handleSwipe() {
        const diff = this.touchStartX - this.touchEndX;
        if (Math.abs(diff) < 50) return;
        diff > 0 ? this.navigate(1) : this.navigate(-1);
    }

    addItem(msg) {
        if (!msg?.content) return;
        if (!(msg.type === "image" || msg.type === "video" || msg.type === "gif")) return;
        const id = msg.id ?? msg.tempId;
        if (this.mediaItems.some(item => String(item.id) === String(id))) return;

        const index = this.mediaItems.length;
        this.mediaItems.push({
            index,
            id,
            type: msg.type,
            src: msg.content,
            thumb: msg.thumb || null,
            cover: msg.cover || null,
            createdAt: msg.createdAt || msg.timestamp || null
        });
        if (this.overlay.classList.contains("active")) {
            if (this.currentIndex >= this.renderedCount - 3) this.renderMore();
            this.updateControls();
        }
    }
}
