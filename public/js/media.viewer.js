/**
 * media.viewer.js — MediaViewer class for fullscreen image/video/audio/pdf browsing.
 */

const audioDefaultThumbnail = `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100" height="100"><rect width="100" height="100" rx="10" fill="%231a1a1a"/><rect x="25" y="40" width="6" height="20" rx="3" fill="%23667eea"/><rect x="37" y="30" width="6" height="40" rx="3" fill="%23764ba2"/><rect x="49" y="20" width="6" height="60" rx="3" fill="%23667eea"/><rect x="61" y="30" width="6" height="40" rx="3" fill="%23764ba2"/><rect x="73" y="40" width="6" height="20" rx="3" fill="%23667eea"/></svg>`;

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

        // Zoom & Rotate state
        this.zoomScale = 1.0;
        this.rotationAngle = 0;
        this.translateX = 0;
        this.translateY = 0;
        this.lastTranslateX = 0;
        this.lastTranslateY = 0;
        this.isPanning = false;
        this.panStartX = 0;
        this.panStartY = 0;

        // Button references
        this.zoomOutBtn = document.getElementById('viewerZoomOut');
        this.zoomInBtn = document.getElementById('viewerZoomIn');
        this.rotateBtn = document.getElementById('viewerRotate');
        this.starBtn = document.getElementById('viewerStar');
        this.pinBtn = document.getElementById('viewerPin');
        this.reactBtn = document.getElementById('viewerReact');
        this.forwardBtn = document.getElementById('viewerForward');
        this.addToStatusBtn = document.getElementById('viewerAddToStatus');
        this.replyBtn = document.getElementById('viewerReply');
        this.downloadBtn = document.getElementById('viewerDownload');
        this.moreBtn = document.getElementById('viewerMore');
        this.backBtn = document.getElementById('viewerBack');

        // Meta elements
        this.viewerAvatar = document.getElementById('viewerAvatar');
        this.viewerAvatarFallback = document.getElementById('viewerAvatarFallback');
        this.viewerSenderName = document.getElementById('viewerSenderName');
        this.viewerMediaTime = document.getElementById('viewerMediaTime');

        if (this.viewerAvatar) {
            this.viewerAvatar.onload = () => {
                this.viewerAvatar.style.display = "block";
                if (this.viewerAvatarFallback) this.viewerAvatarFallback.style.display = "none";
            };
            this.viewerAvatar.onerror = () => {
                this.viewerAvatar.style.display = "none";
                if (this.viewerAvatarFallback) {
                    const name = this.viewerSenderName?.textContent || "Friend";
                    this.viewerAvatarFallback.textContent = name.charAt(0).toUpperCase();
                    this.viewerAvatarFallback.style.display = "flex";
                    const colors = ["#ff453a", "#ff9f0a", "#30d158", "#0095f6", "#bf5af2", "#ff375f"];
                    const charCodeSum = name.split("").reduce((acc, char) => acc + char.charCodeAt(0), 0);
                    this.viewerAvatarFallback.style.background = colors[charCodeSum % colors.length];
                }
            };
        }

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
                id: m.id || m._id || m.tempId,
                type: m.type,
                thumbnail: m.type === 'audio' ? audioDefaultThumbnail : (m.thumbnail || m.thumb || m.cover || null),
                size: m.size || m.fileSize || 0,
                duration: m.duration || null,
                encryptedFileId: m.encryptedFileId || null,
                createdAt: m.createdAt || m.timestamp || null,
                sender: m.sender || null,
                state: 'waiting', // Initial state
                originalMsg: m.originalMsg || m
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
                        id: m.id || m._id || m.tempId,
                        type: isPdf ? 'pdf' : m.type,
                        thumbnail: m.type === 'audio' ? audioDefaultThumbnail : (m.thumb || m.cover || `/api/thumbnail/${m.id || m._id || m.tempId}`),
                        size: m.fileSize || 0,
                        duration: m.duration || null,
                        encryptedFileId: encryptedFileId,
                        createdAt: m.createdAt || m.timestamp || null,
                        sender: m.sender || null,
                        state: 'waiting',
                        originalMsg: m.originalMsg || m
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

    open(indexOrId, initialItems = null, onlyChatMedia = false) {
        this.onlyChatMedia = onlyChatMedia;
        if (onlyChatMedia) {
            this.data = null;
        }
        
        if (initialItems && initialItems.length) {
            this.mediaItems = initialItems.map((m, index) => ({
                index,
                id: m.id || m._id || m.tempId,
                type: m.type,
                thumbnail: m.type === 'audio' ? audioDefaultThumbnail : (m.thumbnail || m.thumb || m.cover || `/api/thumbnail/${m.id || m._id || m.tempId}`),
                size: m.size || m.fileSize || 0,
                duration: m.duration || null,
                encryptedFileId: m.encryptedFileId || null,
                createdAt: m.createdAt || null,
                sender: m.sender || null,
                state: 'waiting',
                originalMsg: m.originalMsg || m
            }));
            this.renderedCount = 0;
            this.hasMore = initialItems.length === 10 && !onlyChatMedia;
        } else {
            this.collectMediaItems();
            this.hasMore = !onlyChatMedia;
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

        // Bind dynamic keydown listener
        this.keydownHandler = (e) => {
            if (!this.overlay.classList.contains('active')) return;
            if (e.key === 'ArrowLeft') this.navigate(-1);
            if (e.key === 'ArrowRight') this.navigate(1);
            if (e.key === 'Escape') this.close();
        };
        document.addEventListener('keydown', this.keydownHandler);

        this.render(true);
    }

    close() {
        this.overlay.classList.remove('active');
        document.body.style.overflow = '';
        
        // Remove keydown listener to prevent leaks
        if (this.keydownHandler) {
            document.removeEventListener('keydown', this.keydownHandler);
            this.keydownHandler = null;
        }

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

        // Pause and remove custom audio players
        this.container.querySelectorAll('.message-audio').forEach(el => {
            const audioId = el.dataset.audioId;
            if (audioId) {
                const audioObj = audioPlayers.get(audioId);
                if (audioObj) {
                    audioObj.pause();
                    audioObj.src = '';
                    audioObj.load();
                    audioPlayers.delete(audioId);
                }
            }
            el.remove();
        });

        this.container.innerHTML = '';
        this.thumbnailContainer.innerHTML = '';
        this.renderedCount = 0;
    }

    async loadMoreFromDB() {
        if (this.onlyChatMedia || this.isLoading || !this.hasMore) return;
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
                    const id = m.id || m._id || m.tempId;
                    if (this.mediaItems.some(item => String(item.id) === String(id))) return;
                    
                    this.mediaItems.push({
                        index: this.mediaItems.length,
                        id,
                        type: m.type,
                        thumbnail: m.type === 'audio' ? audioDefaultThumbnail : (m.thumbnail || `/api/thumbnail/${id}`),
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
        if (!this.onlyChatMedia && direction > 0 && next >= this.mediaItems.length - 4) {
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
        if (item.type === 'audio') thumb.classList.add('audio');

        thumb.appendChild(thumbImg);
        thumb.addEventListener('click', async () => {
            this.currentIndex = index;
            if (!this.onlyChatMedia && this.currentIndex >= this.mediaItems.length - 4) {
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
                
            } else {
                console.error("[MediaViewer] Decrypt request failed:", err);
                if (retryCount < 4) {
                    
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
        item.currentStreamUrl = streamUrl;
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
            let audioContainer = slide.querySelector('.message-audio');
            if (!audioContainer) {
                const placeholder = slide.querySelector('.thumbnail-placeholder');
                if (placeholder) {
                    placeholder.style.display = 'none';
                }
                audioContainer = createAudioPlayer(streamUrl, item.id);
                slide.appendChild(audioContainer);
            }
            
            const audioObj = audioPlayers.get(item.id);
            if (audioObj) {
                audioObj.play().then(() => {
                    this.setMediaState(index, 'playing');
                    const playBtn = audioContainer.querySelector('.audio-play-btn');
                    if (playBtn) {
                        playBtn.innerHTML = `<svg viewBox="0 0 24 24" fill="currentColor">
                            <rect x="6" y="4" width="4" height="16"/>
                            <rect x="14" y="4" width="4" height="16"/>
                        </svg>`;
                    }
                }).catch(err => {
                    console.warn("[MediaViewer] Audio autoplay failed or prevented:", err);
                    this.setMediaState(index, 'streamReady');
                });
            } else {
                this.setMediaState(index, 'streamReady');
            }

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

                const audioContainer = slide.querySelector('.message-audio');
                if (audioContainer) {
                    const audioObj = audioPlayers.get(this.mediaItems[idx]?.id);
                    if (audioObj) {
                        audioObj.pause();
                        audioObj.src = '';
                        audioObj.load();
                        audioPlayers.delete(this.mediaItems[idx]?.id);
                    }
                    audioContainer.remove();
                }

                const placeholder = slide.querySelector('.thumbnail-placeholder');
                if (placeholder) {
                    placeholder.style.display = 'block';
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
        this.container.querySelectorAll('.media-slide').forEach((slide) => {
            const indexAttr = Number(slide.dataset.index);
            const active = indexAttr === this.currentIndex;
            slide.classList.toggle('active', active);
            
            const video = slide.querySelector('video');
            const audio = slide.querySelector('audio');
            const audioContainer = slide.querySelector('.message-audio');
            if (!active) {
                if (video) video.pause();
                if (audio) audio.pause();
                if (audioContainer) {
                    const audioId = audioContainer.dataset.audioId;
                    if (audioId) {
                        const audioObj = audioPlayers.get(audioId);
                        if (audioObj) {
                            audioObj.pause();
                            const playBtn = audioContainer.querySelector('.audio-play-btn');
                            if (playBtn) {
                                playBtn.innerHTML = `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>`;
                            }
                        }
                    }
                }
            }
        });

        this.thumbnailContainer.querySelectorAll('.thumbnail-item').forEach((t) => {
            const indexAttr = Number(t.dataset.index);
            const active = indexAttr === this.currentIndex;
            t.classList.toggle('active', active);
            if (active) t.scrollIntoView({ block: 'nearest', inline: 'center' });
        });

        this.updateControls();

        // Reset Zoom & Rotate state
        this.zoomScale = 1.0;
        this.rotationAngle = 0;
        this.translateX = 0;
        this.translateY = 0;
        this.lastTranslateX = 0;
        this.lastTranslateY = 0;
        this.applyZoomRotate();

        // Update header metadata
        this.updateHeaderMeta();

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

    updateHeaderMeta() {
        const activeItem = this.mediaItems[this.currentIndex];
        if (!activeItem) return;

        let username = "Friend";
        let avatar = "/images/default-avatar.png";
        let timestamp = activeItem.createdAt;

        // Try to find the message in State.messages
        const msg = (State.messages[this.chatId] || []).find(m => String(m.id || m._id || m.tempId) === String(activeItem.id));
        if (msg) {
            const isMe = msg.sender === "me" || msg.user?.toString() === (State.currentUser.id || State.currentUser._id)?.toString();
            username = isMe ? "You" : (State.conversations.find(c => c.id === this.chatId)?.username || "Friend");
            avatar = isMe ? (State.currentUser.avatar || "/images/default-avatar.png") : (State.conversations.find(c => c.id === this.chatId)?.avatar || "/images/default-avatar.png");
            timestamp = msg.createdAt || msg.timestamp;
        } else {
            // Fallback for security logs or moments
            const selectEl = document.getElementById("log-user-select");
            const selectVal = selectEl?.value;
            const isMe = !selectVal || selectVal === "me";
            if (isMe) {
                username = "You";
                avatar = State.currentUser.avatar || "/images/default-avatar.png";
            } else {
                const friend = State.conversations.find(c => String(c.id) === String(selectVal));
                username = friend ? friend.username : "Friend";
                avatar = friend ? friend.avatar || "/images/default-avatar.png" : "/images/default-avatar.png";
            }
        }

        if (this.viewerAvatar) {
            const isDefault = !avatar || avatar === "/images/default-avatar.png" || avatar === "/images/default-avatar.jpg";
            if (isDefault) {
                this.viewerAvatar.removeAttribute("src");
                this.viewerAvatar.style.display = "none";
                if (this.viewerAvatarFallback) {
                    this.viewerAvatarFallback.textContent = username.charAt(0).toUpperCase();
                    this.viewerAvatarFallback.style.display = "flex";
                    const colors = ["#ff453a", "#ff9f0a", "#30d158", "#0095f6", "#bf5af2", "#ff375f"];
                    const charCodeSum = username.split("").reduce((acc, char) => acc + char.charCodeAt(0), 0);
                    this.viewerAvatarFallback.style.background = colors[charCodeSum % colors.length];
                }
            } else {
                if (this.viewerAvatarFallback) this.viewerAvatarFallback.style.display = "none";
                this.viewerAvatar.style.display = "none";
                this.viewerAvatar.src = avatar;
            }
        }
        if (this.viewerSenderName) this.viewerSenderName.textContent = username;
        if (this.viewerMediaTime) {
            this.viewerMediaTime.textContent = this.formatMediaTime(timestamp);
        }
    }

    formatMediaTime(timestamp) {
        if (!timestamp) return "";
        const date = new Date(timestamp);
        if (isNaN(date.getTime())) return "";

        const now = new Date();
        const isToday = date.toDateString() === now.toDateString();
        
        const yesterday = new Date(now);
        yesterday.setDate(now.getDate() - 1);
        const isYesterday = date.toDateString() === yesterday.toDateString();

        const timeOptions = { hour: 'numeric', minute: '2-digit', hour12: true };
        const timeStr = date.toLocaleTimeString([], timeOptions).toLowerCase();

        if (isToday) {
            return `Today at ${timeStr}`;
        } else if (isYesterday) {
            return `Yesterday at ${timeStr}`;
        } else {
            const dateOptions = { month: 'long', day: 'numeric', year: 'numeric' };
            const dateStr = date.toLocaleDateString([], dateOptions);
            return `${dateStr} at ${timeStr}`;
        }
    }

    applyZoomRotate() {
        const slide = this.container.querySelector('.media-slide.active');
        if (!slide) return;
        const mediaEl = slide.querySelector('img.original-image') || slide.querySelector('video') || slide.querySelector('.thumbnail-placeholder');
        if (mediaEl) {
            mediaEl.style.transform = `translate(${this.translateX}px, ${this.translateY}px) scale(${this.zoomScale}) rotate(${this.rotationAngle}deg)`;
            mediaEl.style.cursor = this.zoomScale > 1.0 ? 'grab' : 'zoom-in';
        }
    }

    /* ─── EVENTS ─── */

    bindEvents() {
        this.closeBtn.onclick = () => this.close();
        if (this.backBtn) {
            this.backBtn.onclick = () => this.close();
        }
        this.prevBtn.onclick = () => this.navigate(-1);
        this.nextBtn.onclick = () => this.navigate(1);

        // Zoom Out
        if (this.zoomOutBtn) {
            this.zoomOutBtn.onclick = (e) => {
                e.stopPropagation();
                this.zoomScale = Math.max(0.25, this.zoomScale - 0.25);
                if (this.zoomScale <= 1.0) {
                    this.translateX = 0;
                    this.translateY = 0;
                    this.lastTranslateX = 0;
                    this.lastTranslateY = 0;
                }
                this.applyZoomRotate();
            };
        }

        // Zoom In
        if (this.zoomInBtn) {
            this.zoomInBtn.onclick = (e) => {
                e.stopPropagation();
                this.zoomScale = Math.min(4.0, this.zoomScale + 0.25);
                this.applyZoomRotate();
            };
        }

        // Rotate
        if (this.rotateBtn) {
            this.rotateBtn.onclick = (e) => {
                e.stopPropagation();
                this.rotationAngle = (this.rotationAngle + 90) % 360;
                this.applyZoomRotate();
            };
        }

        // Star
        if (this.starBtn) {
            this.starBtn.onclick = (e) => {
                e.stopPropagation();
                showToast("Message starred", "success");
            };
        }

        // Pin
        if (this.pinBtn) {
            this.pinBtn.onclick = (e) => {
                e.stopPropagation();
                showToast("Message pinned", "success");
            };
        }

        // React
        if (this.reactBtn) {
            this.reactBtn.onclick = (e) => {
                e.stopPropagation();
                // Close any existing floating emoji bars first
                document.querySelectorAll(".viewer-emoji-bar").forEach(el => el.remove());

                const emojiBar = document.createElement("div");
                emojiBar.className = "whatsapp-emoji-bar viewer-emoji-bar";
                emojiBar.innerHTML = `
                    <button class="emoji-btn" data-emoji="👍">👍</button>
                    <button class="emoji-btn" data-emoji="❤️">❤️</button>
                    <button class="emoji-btn" data-emoji="😂">😂</button>
                    <button class="emoji-btn" data-emoji="😮">😮</button>
                    <button class="emoji-btn" data-emoji="😢">😢</button>
                    <button class="emoji-btn" data-emoji="🙏">🙏</button>
                    <button class="emoji-btn plus-btn" data-emoji="plus"><i class="ti ti-plus"></i></button>
                `;

                const rect = this.reactBtn.getBoundingClientRect();
                emojiBar.style.position = "fixed";
                emojiBar.style.top = `${rect.bottom + 8}px`;
                emojiBar.style.left = `${rect.left + rect.width / 2 - 150}px`; // Center align
                emojiBar.style.zIndex = "1100";
                document.body.appendChild(emojiBar);

                emojiBar.querySelectorAll(".emoji-btn:not(.plus-btn)").forEach(btn => {
                    btn.addEventListener("click", (evt) => {
                        evt.stopPropagation();
                        const activeItem = this.mediaItems[this.currentIndex];
                        const msg = (State.messages[this.chatId] || []).find(m => String(m.id || m._id || m.tempId) === String(activeItem.id));
                        if (msg && typeof socket !== 'undefined' && socket.emit) {
                            socket.emit("react", { messageId: msg.id || msg._id || msg.tempId, to: this.chatId, emoji: btn.dataset.emoji });
                            showToast("Reaction sent", "success");
                        } else {
                            showToast("Unable to send reaction", "error");
                        }
                        emojiBar.remove();
                    });
                });

                emojiBar.querySelector(".plus-btn").onclick = (evt) => {
                    evt.stopPropagation();
                    const activeItem = this.mediaItems[this.currentIndex];
                    const msg = (State.messages[this.chatId] || []).find(m => String(m.id || m._id || m.tempId) === String(activeItem.id));
                    const msgId = msg ? (msg.id || msg._id || msg.tempId) : activeItem.id;
                    emojiBar.remove();
                    if (typeof window.openEmojiPickerModal === "function") {
                        window.openEmojiPickerModal(msgId, this.chatId);
                    } else {
                        showToast("More reactions coming soon!", "info");
                    }
                };

                // Close on click outside
                setTimeout(() => {
                    const closeReact = (ev) => {
                        if (!emojiBar.contains(ev.target)) {
                            emojiBar.remove();
                            document.removeEventListener("click", closeReact, true);
                        }
                    };
                    document.addEventListener("click", closeReact, true);
                }, 0);
            };
        }

        // Reply
        if (this.replyBtn) {
            this.replyBtn.onclick = (e) => {
                e.stopPropagation();
                const activeItem = this.mediaItems[this.currentIndex];
                const msg = (State.messages[this.chatId] || []).find(m => String(m.id || m._id || m.tempId) === String(activeItem.id));
                if (msg) {
                    this.close();
                    State.replyingTo = msg.id || msg._id || msg.tempId;
                    if (typeof window.updateReplyPreviewBar === "function") {
                        window.updateReplyPreviewBar(msg);
                    }
                    const inputEl = document.getElementById("message-input");
                    if (inputEl) inputEl.focus();
                } else {
                    showToast("Reply not available for this item", "error");
                }
            };
        }

        // Forward
        if (this.forwardBtn) {
            this.forwardBtn.onclick = (e) => {
                e.stopPropagation();
                const activeItem = this.mediaItems[this.currentIndex];
                let msg = (State.messages[this.chatId] || []).find(m => String(m.id || m._id || m.tempId) === String(activeItem.id));
                
                // Fallback 1: Use originalMsg if available
                if (!msg) {
                    msg = activeItem.originalMsg;
                }

                // Fallback 2: Construct custom message metadata from activeItem fields if needed
                if (!msg && activeItem) {
                    msg = {
                        type: activeItem.type === "pdf" ? "document" : (activeItem.type || "image"),
                        content: activeItem.encryptedFileId || activeItem.src || (activeItem.originalMsg ? (activeItem.originalMsg.content || activeItem.originalMsg.src) : null),
                        caption: activeItem.caption || null,
                        fileName: activeItem.fileName || (activeItem.type === "pdf" ? "document.pdf" : null),
                        fileSize: activeItem.size || null,
                        cover: activeItem.cover || null,
                        thumb: activeItem.thumbnail || null,
                        isDisappearing: false
                    };
                }

                if (msg && typeof openForwardModal === "function") {
                    this.close();
                    openForwardModal(msg);
                } else {
                    showToast("Forward not available for this item", "error");
                }
            };
        }

        // Add to Status
        if (this.addToStatusBtn) {
            this.addToStatusBtn.onclick = async (e) => {
                e.stopPropagation();
                const activeItem = this.mediaItems[this.currentIndex];
                if (!activeItem) return;

                // Let's resolve the decrypted/stream URL
                const streamUrl = activeItem.currentStreamUrl || activeItem.src || (activeItem.originalMsg ? (activeItem.originalMsg.content || activeItem.originalMsg.src) : null);
                if (!streamUrl) {
                    showToast("No media URL found to post to status", "error");
                    return;
                }

                showToast("Preparing status update...", "info");

                try {
                    // Fetch the decrypted/streamed file as a Blob
                    const response = await fetch(streamUrl);
                    if (!response.ok) throw new Error("Failed to retrieve media file");
                    const blob = await response.blob();

                    // Close the media viewer overlay
                    this.close();

                    // Forward blob to status preview screen/composer to allow adding caption/song
                    if (typeof window.openStatusPreviewForBlob === "function") {
                        await window.openStatusPreviewForBlob(blob, activeItem.type || "image");
                    } else if (typeof window.handleStatusMediaUpload === "function") {
                        const mimeType = activeItem.type === "video" ? "video/mp4" : "image/jpeg";
                        await window.handleStatusMediaUpload(blob, mimeType);
                    } else {
                        showToast("Status module not loaded. Please try again.", "error");
                    }
                } catch (err) {
                    console.error("[MediaViewer] Add to Status error:", err);
                    showToast("Failed to prepare status media", "error");
                }
            };
        }

        // Download
        if (this.downloadBtn) {
            this.downloadBtn.onclick = (e) => {
                e.stopPropagation();
                const activeItem = this.mediaItems[this.currentIndex];
                const fileName = activeItem.type === 'video' ? 'video.mp4' : activeItem.type === 'pdf' ? 'document.pdf' : 'image.jpg';
                const slide = this.container.querySelector(`.media-slide[data-index="${this.currentIndex}"]`);
                const mediaEl = slide ? (slide.querySelector('img.original-image') || slide.querySelector('video') || slide.querySelector('audio') || slide.querySelector('iframe.pdf-viewer')) : null;
                const url = mediaEl?.src || activeItem.thumbnail || '';
                forceDownload(url, fileName, activeItem.id);
            };
        }

        // More Options
        if (this.moreBtn) {
            this.moreBtn.onclick = (e) => {
                e.stopPropagation();
                // Close any existing dropdowns first
                document.querySelectorAll(".viewer-dropdown-menu").forEach(el => el.remove());

                const activeItem = this.mediaItems[this.currentIndex];
                let msg = (State.messages[this.chatId] || []).find(m => String(m.id || m._id || m.tempId) === String(activeItem.id));
                
                // Fallback 1: Use originalMsg if available
                if (!msg) {
                    msg = activeItem.originalMsg;
                }

                // Fallback 2: Construct custom message metadata from activeItem fields if needed
                if (!msg && activeItem) {
                    msg = {
                        id: activeItem.id,
                        tempId: activeItem.id,
                        type: activeItem.type === "pdf" ? "document" : (activeItem.type || "image"),
                        content: activeItem.encryptedFileId || activeItem.src || null,
                        caption: activeItem.caption || null,
                        fileName: activeItem.fileName || null,
                        fileSize: activeItem.size || null,
                        cover: activeItem.cover || null,
                        thumb: activeItem.thumbnail || null,
                        sender: activeItem.sender || null,
                        isDisappearing: false
                    };
                }

                if (!msg) return;

                const targetEl = document.querySelector(`.message[data-message-id="${msg.id || msg._id || msg.tempId}"]`);
                const showInChatHTML = targetEl ? `
                    <button class="context-menu-item show-opt">
                        <i class="ti ti-message"></i>
                        <span>Show in chat</span>
                    </button>
                ` : '';

                const dropdown = document.createElement("div");
                dropdown.className = "whatsapp-context-menu viewer-dropdown-menu";
                dropdown.innerHTML = `
                    <button class="context-menu-item rotate-opt">
                        <i class="ti ti-rotate"></i>
                        <span>Rotate</span>
                    </button>
                    ${showInChatHTML}
                    <button class="context-menu-item delete-opt" style="color: #ff453a;">
                        <i class="ti ti-trash" style="color: #ff453a;"></i>
                        <span>Delete</span>
                    </button>
                `;

                const rect = this.moreBtn.getBoundingClientRect();
                dropdown.style.position = "fixed";
                dropdown.style.top = `${rect.bottom + 8}px`;
                dropdown.style.right = `${window.innerWidth - rect.right}px`;
                dropdown.style.zIndex = "12000";
                document.body.appendChild(dropdown);

                // Rotate action
                dropdown.querySelector(".rotate-opt").onclick = (evt) => {
                    evt.stopPropagation();
                    this.rotationAngle = (this.rotationAngle + 90) % 360;
                    this.applyZoomRotate();
                    dropdown.remove();
                };

                // Show in chat action
                const showOpt = dropdown.querySelector(".show-opt");
                if (showOpt) {
                    showOpt.onclick = (evt) => {
                        evt.stopPropagation();
                        dropdown.remove();
                        this.close();

                        // Scroll to message bubble
                        if (targetEl) {
                            targetEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
                            // Flash/blink highlight effect
                            targetEl.classList.add("message-highlight-blink");
                            setTimeout(() => {
                                targetEl.classList.remove("message-highlight-blink");
                            }, 2000);
                        } else {
                            showToast("Message not found in view", "info");
                        }
                    };
                }

                // Delete action
                dropdown.querySelector(".delete-opt").onclick = (evt) => {
                    evt.stopPropagation();
                    dropdown.remove();
                    
                    const msgId = msg.id || msg._id || msg.tempId;
                    const isMe = msg.sender === "me" || 
                                 msg.user?.toString() === (State.currentUser?.id || State.currentUser?._id)?.toString() ||
                                 msg.from?.toString() === (State.currentUser?.id || State.currentUser?._id)?.toString();

                    // Create and append the confirmation modal dynamically
                    const modal = document.createElement("div");
                    modal.className = "modal-overlay delete-message-modal";
                    modal.style.zIndex = "3200";
                    modal.innerHTML = `
                      <div class="delete-confirm-box">
                        <h3>Delete message?</h3>
                        <div class="delete-confirm-actions">
                          ${isMe ? '<button type="button" class="delete-btn everyone-btn">Delete for everyone</button>' : ''}
                          <button type="button" class="delete-btn me-btn">Delete for me</button>
                          <button type="button" class="delete-btn cancel-btn">Cancel</button>
                        </div>
                      </div>
                    `;
                    document.body.appendChild(modal);

                    const cancelBtn = modal.querySelector(".cancel-btn");
                    const meBtn = modal.querySelector(".me-btn");
                    const everyoneBtn = modal.querySelector(".everyone-btn");

                    cancelBtn.onclick = () => {
                      modal.remove();
                    };

                    modal.onclick = (event) => {
                      if (event.target === modal) modal.remove();
                    };

                    const performDelete = async (type) => {
                      try {
                        const res = await apiRequest("DELETE", `/api/message/${msgId}`, { type });
                        if (res && res.status) {
                          // Emit socket deletion sync event
                          if (typeof socket !== "undefined" && socket.emit) {
                            socket.emit("delete_message", { messageId: msgId, to: State.activeChat, type });
                          }
                          showToast("Message deleted", "success");
                          
                          // Animate and delete message from DOM immediately
                          if (typeof window.animateAndDeleteMessageFromDom === "function") {
                            window.animateAndDeleteMessageFromDom(msgId);
                          }
                          
                          // Update viewer index or close viewer
                          this.mediaItems.splice(this.currentIndex, 1);
                          if (this.mediaItems.length === 0) {
                              this.close();
                          } else {
                              if (this.currentIndex >= this.mediaItems.length) {
                                  this.currentIndex = this.mediaItems.length - 1;
                              }
                              // Re-index remaining items
                              this.mediaItems.forEach((item, idx) => item.index = idx);
                              this.render(true);
                          }
                        } else {
                          showToast("Error deleting message", "error");
                        }
                      } catch (err) {
                        console.error("Delete media message error:", err);
                        showToast("Error deleting message", "error");
                      }
                      modal.remove();
                    };

                    meBtn.onclick = () => performDelete("me");
                    if (everyoneBtn) {
                      everyoneBtn.onclick = () => performDelete("everyone");
                    }
                };

                // Close on click outside
                setTimeout(() => {
                    const closeDropdown = (ev) => {
                        if (!dropdown.contains(ev.target)) {
                            dropdown.remove();
                            document.removeEventListener("click", closeDropdown, true);
                        }
                    };
                    document.addEventListener("click", closeDropdown, true);
                }, 0);
            };
        }

        // Tap/click event listeners for double-tap zoom / single-tap toggle fullscreen
        let lastTap = 0;
        let clickTimeout = null;
        let touchStartPos = { x: 0, y: 0 };

        this.container.addEventListener('touchstart', (e) => {
            if (e.touches && e.touches.length > 0) {
                touchStartPos = { x: e.touches[0].clientX, y: e.touches[0].clientY };
            }
        }, { passive: true });

        this.container.addEventListener('touchend', (e) => {
            const mediaEl = e.target.closest('img, video');
            if (!mediaEl) return;

            if (e.changedTouches && e.changedTouches.length > 0) {
                const touchEndPos = { x: e.changedTouches[0].clientX, y: e.changedTouches[0].clientY };
                const dx = touchEndPos.x - touchStartPos.x;
                const dy = touchEndPos.y - touchStartPos.y;
                // If user dragged/swiped, skip tap action
                if (Math.abs(dx) > 10 || Math.abs(dy) > 10) {
                    return;
                }
            }

            const currentTime = new Date().getTime();
            const tapLength = currentTime - lastTap;
            if (tapLength < 300 && tapLength > 0) {
                // Double tap zoom
                e.preventDefault();
                if (clickTimeout) {
                    clearTimeout(clickTimeout);
                    clickTimeout = null;
                }
                this.zoomScale = this.zoomScale === 1.0 ? 2.5 : 1.0;
                if (this.zoomScale === 1.0) {
                    this.translateX = 0;
                    this.translateY = 0;
                    this.lastTranslateX = 0;
                    this.lastTranslateY = 0;
                }
                this.applyZoomRotate();
            } else {
                // Single tap fullscreen toggle
                clickTimeout = setTimeout(() => {
                    if (e.target.closest('button, input, video') && e.target.tagName !== 'IMG') {
                        return;
                    }
                    this.overlay.classList.toggle('fullscreen-clean');
                }, 250);
            }
            lastTap = currentTime;
        });

        // Mouse double click zoom (Desktop)
        this.container.addEventListener('dblclick', (e) => {
            const mediaEl = e.target.closest('img, video');
            if (mediaEl) {
                e.stopPropagation();
                if (clickTimeout) {
                    clearTimeout(clickTimeout);
                    clickTimeout = null;
                }
                this.zoomScale = this.zoomScale === 1.0 ? 2.5 : 1.0;
                if (this.zoomScale === 1.0) {
                    this.translateX = 0;
                    this.translateY = 0;
                    this.lastTranslateX = 0;
                    this.lastTranslateY = 0;
                }
                this.applyZoomRotate();
            }
        });

        // Mouse single click fullscreen toggle (Desktop)
        this.container.addEventListener('click', (e) => {
            // Avoid duplicate triggers on touch-enabled devices
            if ('ontouchstart' in window || navigator.maxTouchPoints > 0) {
                return;
            }
            if (e.target.closest('button, input, video') && e.target.tagName !== 'IMG') {
                return;
            }
            e.stopPropagation();

            if (clickTimeout) {
                clearTimeout(clickTimeout);
                clickTimeout = null;
            }

            clickTimeout = setTimeout(() => {
                this.overlay.classList.toggle('fullscreen-clean');
            }, 250);
        });



        // Desktop mouse panning listeners
        this.viewerMain.addEventListener('mousedown', (e) => {
            if (this.zoomScale <= 1.0) {
                this.isDragging = true;
                this.touchStartX = e.clientX;
                return;
            }
            // Zoomed in -> start panning
            const mediaEl = e.target.closest('img, video');
            if (!mediaEl) return;

            e.preventDefault();
            this.isPanning = true;
            this.panStartX = e.clientX;
            this.panStartY = e.clientY;
            mediaEl.style.cursor = 'grabbing';
        });

        document.addEventListener('mousemove', (e) => {
            if (!this.isPanning) return;
            const dx = e.clientX - this.panStartX;
            const dy = e.clientY - this.panStartY;
            this.translateX = this.lastTranslateX + dx;
            this.translateY = this.lastTranslateY + dy;
            this.applyZoomRotate();
        });

        document.addEventListener('mouseup', (e) => {
            if (this.isPanning) {
                this.isPanning = false;
                this.lastTranslateX = this.translateX;
                this.lastTranslateY = this.translateY;

                const activeSlide = this.container.querySelector('.media-slide.active');
                const mediaEl = activeSlide ? (activeSlide.querySelector('img.original-image') || activeSlide.querySelector('video')) : null;
                if (mediaEl) {
                    mediaEl.style.cursor = this.zoomScale > 1.0 ? 'grab' : 'zoom-in';
                }
                return;
            }
            if (this.isDragging) {
                this.isDragging = false;
                this.touchEndX = e.clientX;
                this.handleSwipe();
            }
        });

        // Mobile touch panning listeners
        this.viewerMain.addEventListener('touchstart', (e) => {
            if (this.zoomScale <= 1.0) {
                this.touchStartX = e.changedTouches[0].screenX;
                return;
            }
            // Zoomed in -> start panning
            const mediaEl = e.target.closest('img, video');
            if (!mediaEl) return;

            this.isPanning = true;
            this.panStartX = e.touches[0].clientX;
            this.panStartY = e.touches[0].clientY;
        }, { passive: true });

        this.viewerMain.addEventListener('touchmove', (e) => {
            if (!this.isPanning) return;
            // Prevent browser scroll/bounce when panning zoomed image
            e.preventDefault();

            const currentX = e.touches[0].clientX;
            const currentY = e.touches[0].clientY;
            const dx = currentX - this.panStartX;
            const dy = currentY - this.panStartY;
            this.translateX = this.lastTranslateX + dx;
            this.translateY = this.lastTranslateY + dy;
            this.applyZoomRotate();
        }, { passive: false });

        this.viewerMain.addEventListener('touchend', (e) => {
            if (this.zoomScale <= 1.0) {
                this.touchEndX = e.changedTouches[0].screenX;
                this.handleSwipe();
                return;
            }
            if (this.isPanning) {
                this.isPanning = false;
                this.lastTranslateX = this.translateX;
                this.lastTranslateY = this.translateY;
            }
        }, { passive: true });

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
        if (this.zoomScale > 1.0) return;
        const diff = this.touchStartX - this.touchEndX;
        if (Math.abs(diff) < 50) return;
        diff > 0 ? this.navigate(1) : this.navigate(-1);
    }

    addItem(msg) {
        if (!msg?.content) return;
        const isPdf = msg.type === "document" && msg.fileName && msg.fileName.toLowerCase().endsWith(".pdf");
        if (!(msg.type === "image" || msg.type === "video" || msg.type === "gif" || msg.type === "audio" || isPdf)) return;
        
        const id = msg.id || msg._id || msg.tempId;
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
            thumbnail: msg.type === 'audio' ? audioDefaultThumbnail : (msg.thumb || msg.cover || `/api/thumbnail/${id}`),
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
