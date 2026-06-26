/**
 * media.viewer.js — MediaViewer class for fullscreen image/video/audio/pdf browsing.
 */

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

        // Decryption controller to allow cancelling pending decryption requests
        this.activeDecryptController = null;

        this.collectMediaItems();
        this.bindEvents();
    }

    /* ─── DATA ─── */

    collectMediaItems() {
        if (this.data && this.data.length) {
            this.mediaItems = this.data.map((m, index) => ({
                index,
                id: m.id ?? m.tempId ?? m._id,
                type: m.type,
                thumbnail: m.thumbnail || m.thumb || m.cover || null,
                size: m.size || m.fileSize || 0,
                duration: m.duration || null,
                encryptedFileId: m.encryptedFileId || null,
                createdAt: m.createdAt || m.timestamp || null,
                state: 'waiting' // Initial state
            }));
        } else {
            // Support scanning chat messages
            this.mediaItems = (State.messages[this.chatId] || [])
                .filter(m => (m.type === 'image' || m.type === 'video' || m.type === 'audio' || m.type === 'document' || m.type === 'gif') && m.content)
                .map((m, index) => {
                    const isPdf = m.type === 'document' && m.fileName && m.fileName.toLowerCase().endsWith('.pdf');
                    // Only include image, video, audio, gif, and PDF documents
                    if (m.type !== 'image' && m.type !== 'video' && m.type !== 'audio' && m.type !== 'gif' && !isPdf) {
                        return null;
                    }
                    
                    // Extract encryptedFileId if possible
                    let encryptedFileId = m.content;
                    if (m.content && m.content.startsWith("/api/media")) {
                        try {
                            const parsed = new URL(m.content, window.location.origin);
                            encryptedFileId = parsed.searchParams.get("key") || m.content;
                        } catch {
                            // ignore
                        }
                    }

                    return {
                        index,
                        id: m.id ?? m.tempId ?? m._id,
                        type: isPdf ? 'pdf' : m.type,
                        thumbnail: m.thumb || m.cover || `/api/thumbnail/${m.id ?? m.tempId ?? m._id}`,
                        size: m.fileSize || 0,
                        duration: m.duration || null,
                        encryptedFileId: encryptedFileId,
                        createdAt: m.createdAt || m.timestamp || null,
                        state: 'waiting'
                    };
                }).filter(Boolean);

            // Re-index after filtering
            this.mediaItems.forEach((m, idx) => m.index = idx);
        }
        this.renderedCount = 0;
        this.lastCreatedAt = this.mediaItems[this.mediaItems.length - 1]?.createdAt || null;
    }

    getIndexByMessageId(messageId) {
        return this.mediaItems.findIndex(m => String(m.id) === String(messageId));
    }

    /* ─── LIFECYCLE ─── */

    open(indexOrId, initialItems = null) {
        console.log("[DEBUG MediaViewer] open called with:", indexOrId, "initialItems:", initialItems);
        if (initialItems && initialItems.length) {
            this.mediaItems = initialItems.map((m, index) => ({
                index,
                id: m.id ?? m.tempId ?? m._id,
                type: m.type,
                thumbnail: m.thumbnail || m.thumb || m.cover || `/api/thumbnail/${m.id ?? m.tempId ?? m._id}`,
                size: m.size || m.fileSize || 0,
                duration: m.duration || null,
                encryptedFileId: m.encryptedFileId || null,
                createdAt: m.createdAt || null,
                state: 'waiting'
            }));
            this.renderedCount = 0;
            this.hasMore = initialItems.length === 10;
        } else {
            this.collectMediaItems();
            this.hasMore = true;
        }
        this.isLoading = false;
        this.lastCreatedAt = this.mediaItems[this.mediaItems.length - 1]?.createdAt || null;

        let index = -1;
        if (typeof indexOrId === "number") {
            index = indexOrId;
        } else {
            index = this.getIndexByMessageId(indexOrId);
        }
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
        
        // Cancel any pending decryption request
        if (this.activeDecryptController) {
            this.activeDecryptController.abort();
            this.activeDecryptController = null;
        }

        // Pause and unload all media elements
        this.container.querySelectorAll('video, audio').forEach(el => {
            el.pause();
            el.removeAttribute('src');
            el.load();
        });
        this.container.innerHTML = '';
        this.thumbnailContainer.innerHTML = '';
        this.renderedCount = 0;
    }

    async loadMoreFromDB() {
        if (this.isLoading || !this.hasMore) return;
        this.isLoading = true;
        try {
            const data = await window.fetchMedia(this.chatId, this.lastCreatedAt, 10);
            const mediaMessages = data.Data?.data || [];
            if (mediaMessages.length < 10) {
                this.hasMore = false;
            }
            if (mediaMessages.length > 0) {
                this.lastCreatedAt = mediaMessages[mediaMessages.length - 1].createdAt;
                mediaMessages.forEach(m => {
                    const id = m.id ?? m.tempId ?? m._id;
                    if (this.mediaItems.some(item => String(item.id) === String(id))) return;
                    
                    this.mediaItems.push({
                        index: this.mediaItems.length,
                        id,
                        type: m.type,
                        thumbnail: m.thumbnail || `/api/thumbnail/${id}`,
                        size: m.size || m.fileSize || 0,
                        duration: m.duration || null,
                        encryptedFileId: m.encryptedFileId || null,
                        createdAt: m.createdAt,
                        state: 'waiting'
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
        slide.className = 'media-slide waiting';
        slide.dataset.index = index;

        // Slide state overlay for loading/error indicators
        const overlay = document.createElement('div');
        overlay.className = 'slide-state-overlay';
        overlay.innerHTML = `<div class="loader"></div><div class="state-text">Loading...</div>`;
        slide.appendChild(overlay);

        // Thumbnail placeholder
        const placeholderImg = document.createElement('img');
        placeholderImg.className = 'thumbnail-placeholder';
        placeholderImg.src = item.thumbnail || `/api/thumbnail/${item.id}`;
        placeholderImg.onload = () => {
            this.setMediaState(index, 'thumbnailLoaded');
        };
        
        let thumbRetries = 0;
        placeholderImg.onerror = () => {
            if (thumbRetries < 4) {
                thumbRetries++;
                setTimeout(() => {
                    placeholderImg.src = (item.thumbnail || `/api/thumbnail/${item.id}`) + `?retry=${thumbRetries}`;
                }, 300);
            } else {
                // Fallback if thumbnail fails after retries
                placeholderImg.src = '/images/default-video-cover.png';
                this.setMediaState(index, 'thumbnailLoaded');
            }
        };
        slide.appendChild(placeholderImg);

        this.container.appendChild(slide);

        /* Thumbnail Strip Item */
        const thumb = document.createElement('div');
        thumb.className = 'thumbnail-item';
        thumb.dataset.index = index;

        const thumbImg = document.createElement('img');
        thumbImg.loading = "lazy";
        thumbImg.src = item.thumbnail || `/api/thumbnail/${item.id}`;
        
        let stripRetries = 0;
        thumbImg.onerror = () => {
            if (stripRetries < 4) {
                stripRetries++;
                setTimeout(() => {
                    thumbImg.src = (item.thumbnail || `/api/thumbnail/${item.id}`) + `?retry=${stripRetries}`;
                }, 300);
            } else {
                thumbImg.src = '/images/default-video-cover.png';
            }
        };
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

    setMediaState(index, state) {
        const item = this.mediaItems[index];
        if (item) {
            item.state = state;
        }
        const slide = this.container.querySelector(`.media-slide[data-index="${index}"]`);
        if (slide) {
            slide.classList.remove('waiting', 'thumbnailLoaded', 'decryptRequested', 'streamReady', 'displaying', 'playing', 'error');
            slide.classList.add(state);

            const textEl = slide.querySelector('.slide-state-overlay .state-text');
            const loaderEl = slide.querySelector('.slide-state-overlay .loader');

            if (state === 'decryptRequested') {
                if (textEl) textEl.textContent = 'Decrypting...';
                if (loaderEl) loaderEl.style.display = 'block';
            } else if (state === 'streamReady') {
                if (textEl) textEl.textContent = 'Streaming...';
                if (loaderEl) loaderEl.style.display = 'block';
            } else if (state === 'error') {
                if (textEl) textEl.textContent = 'Decryption failed';
                if (loaderEl) loaderEl.style.display = 'none';
            } else {
                if (loaderEl) loaderEl.style.display = 'none';
            }
        }
    }

    async decryptAndLoadItem(index, retryCount = 0) {
        const item = this.mediaItems[index];
        if (!item || item.state === 'displaying' || item.state === 'playing' || item.state === 'streamReady') {
            return;
        }

        // Cancel any active decryption requests on initial attempt
        if (this.activeDecryptController && retryCount === 0) {
            this.activeDecryptController.abort();
            this.activeDecryptController = null;
        }

        const controller = retryCount === 0 ? new AbortController() : this.activeDecryptController;
        if (retryCount === 0) {
            this.activeDecryptController = controller;
        }
        
        this.setMediaState(index, 'decryptRequested');

        try {
            const res = await apiRequest("POST", "/api/media/decrypt", { mediaId: item.id }, "json", false);
            const data = res?.data || res?.Data || res;
            
            if (controller && controller.signal.aborted) return;

            if (data && data.token) {
                this.setMediaState(index, 'streamReady');
                const streamUrl = `/api/media/stream/${data.token}`;
                this.loadMediaSource(item, streamUrl);
            } else {
                throw new Error("No token returned");
            }
        } catch (err) {
            if (err.name === 'AbortError' || (controller && controller.signal.aborted)) {
                console.log("[MediaViewer] Decrypt request aborted for index:", index);
            } else {
                console.error("[MediaViewer] Decrypt request failed:", err);
                if (retryCount < 4) {
                    console.log(`[MediaViewer] Retrying decryption for index ${index} in 300ms (attempt ${retryCount + 1})...`);
                    await new Promise(resolve => setTimeout(resolve, 300));
                    if (this.activeDecryptController === controller) {
                        return this.decryptAndLoadItem(index, retryCount + 1);
                    }
                } else {
                    this.setMediaState(index, 'error');
                }
            }
        } finally {
            if (this.activeDecryptController === controller && retryCount === 0) {
                this.activeDecryptController = null;
            }
        }
    }

    loadMediaSource(item, streamUrl) {
        const index = item.index;
        const slide = this.container.querySelector(`.media-slide[data-index="${index}"]`);
        if (!slide) return;

        if (item.type === 'video') {
            let video = slide.querySelector('video');
            if (!video) {
                video = document.createElement('video');
                video.controls = true;
                slide.appendChild(video);
                if (window.initCustomVideoPlayer) {
                    window.initCustomVideoPlayer(video);
                }
            }
            video.src = streamUrl;
            video.preload = "auto";
            
            video.onplay = () => {
                this.setMediaState(index, 'playing');
                if (item.size && window.DataUsageTracker) {
                    let bytes = parseInt(item.size, 10);
                    if (isNaN(bytes)) bytes = 0;
                    window.DataUsageTracker.trackFeature('chatVideo', bytes);
                    item.size = 0; // Prevent double tracking
                }
            };
            
            video.play().catch(err => {
                console.warn("[MediaViewer] Autoplay prevented:", err);
                this.setMediaState(index, 'streamReady');
            });

        } else if (item.type === 'audio') {
            let audio = slide.querySelector('audio');
            if (!audio) {
                audio = document.createElement('audio');
                audio.controls = true;
                slide.appendChild(audio);
            }
            audio.src = streamUrl;
            audio.preload = "auto";
            
            audio.onplay = () => {
                this.setMediaState(index, 'playing');
            };
            
            audio.play().catch(err => {
                console.warn("[MediaViewer] Autoplay prevented:", err);
                this.setMediaState(index, 'streamReady');
            });

        } else if (item.type === 'pdf') {
            let iframe = slide.querySelector('iframe.pdf-viewer');
            if (!iframe) {
                iframe = document.createElement('iframe');
                iframe.className = 'pdf-viewer';
                slide.appendChild(iframe);
            }
            iframe.src = streamUrl;
            iframe.onload = () => {
                this.setMediaState(index, 'displaying');
            };
            iframe.onerror = () => {
                this.setMediaState(index, 'error');
            };

        } else {
            // Image / GIF
            let img = slide.querySelector('img.original-image');
            if (!img) {
                img = document.createElement('img');
                img.className = 'original-image';
                slide.appendChild(img);
            }
            img.src = streamUrl;
            img.onload = () => {
                this.setMediaState(index, 'displaying');
            };
            img.onerror = () => {
                this.setMediaState(index, 'error');
            };
        }
    }

    cleanMemoryCache() {
        this.container.querySelectorAll('.media-slide').forEach((slide, idx) => {
            // Unload files outside [currentIndex - 1, currentIndex + 1] range
            if (Math.abs(idx - this.currentIndex) > 1) {
                const video = slide.querySelector('video');
                if (video) {
                    video.pause();
                    video.removeAttribute('src');
                    video.load();
                    video.remove();
                }

                const audio = slide.querySelector('audio');
                if (audio) {
                    audio.pause();
                    audio.removeAttribute('src');
                    audio.load();
                    audio.remove();
                }

                const img = slide.querySelector('img.original-image');
                if (img) {
                    img.src = '';
                    img.remove();
                }

                const iframe = slide.querySelector('iframe.pdf-viewer');
                if (iframe) {
                    iframe.src = '';
                    iframe.remove();
                }

                this.setMediaState(idx, 'thumbnailLoaded');
            }
        });
    }

    updateMedia() {
        // Toggle active class on slides
        this.container.querySelectorAll('.media-slide').forEach((slide, i) => {
            const active = i === this.currentIndex;
            slide.classList.toggle('active', active);
            
            const video = slide.querySelector('video');
            const audio = slide.querySelector('audio');
            if (!active) {
                if (video) video.pause();
                if (audio) audio.pause();
            }
        });

        this.thumbnailContainer.querySelectorAll('.thumbnail-item').forEach((t, i) => {
            t.classList.toggle('active', i === this.currentIndex);
            if (i === this.currentIndex) t.scrollIntoView({ block: 'nearest', inline: 'center' });
        });

        this.updateControls();

        // 1. Clean memory cache of distant elements
        this.cleanMemoryCache();

        // 2. Decrypt and load the current active item
        this.decryptAndLoadItem(this.currentIndex);
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
        const isPdf = msg.type === "document" && msg.fileName && msg.fileName.toLowerCase().endsWith(".pdf");
        if (!(msg.type === "image" || msg.type === "video" || msg.type === "gif" || msg.type === "audio" || isPdf)) return;
        
        const id = msg.id ?? msg.tempId ?? msg._id;
        if (this.mediaItems.some(item => String(item.id) === String(id))) return;

        // Extract encryptedFileId if possible
        let encryptedFileId = msg.content;
        if (msg.content && msg.content.startsWith("/api/media")) {
            try {
                const parsed = new URL(msg.content, window.location.origin);
                encryptedFileId = parsed.searchParams.get("key") || msg.content;
            } catch {
                // ignore
            }
        }

        const index = this.mediaItems.length;
        this.mediaItems.push({
            index,
            id,
            type: isPdf ? 'pdf' : msg.type,
            thumbnail: msg.thumb || msg.cover || `/api/thumbnail/${id}`,
            size: msg.fileSize || 0,
            duration: msg.duration || null,
            encryptedFileId: encryptedFileId,
            createdAt: msg.createdAt || msg.timestamp || null,
            state: 'waiting'
        });
        if (this.overlay.classList.contains("active")) {
            if (this.currentIndex >= this.renderedCount - 3) this.renderMore();
            this.updateControls();
        }
    }
}
