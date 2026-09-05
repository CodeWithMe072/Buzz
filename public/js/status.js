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
    let isBuffering = false;
    let currentSegmentDurationMs = 5000;
    let segmentStartTime = 0;
    let isMuted = false;
    const statusViewerAudio = new Audio();
    let preloadCleanup = null;
    let prefetchVideoEl = null;

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
                        cx="${size / 2}" cy="${size / 2}" r="${r}"
                        fill="none"
                        stroke="rgba(255,255,255,0.15)"
                        stroke-width="${stroke}"
                    />
                    <circle
                        cx="${size / 2}" cy="${size / 2}" r="${r}"
                        fill="none"
                        stroke="#25d366"
                        stroke-width="${stroke}"
                        stroke-dasharray="${circ}"
                        stroke-dashoffset="${circ * 0.35}"
                        stroke-linecap="round"
                        transform="rotate(-90 ${size / 2} ${size / 2})"
                        style="animation: status-sending-spin 1.2s linear infinite; transform-origin: ${size / 2}px ${size / 2}px;"
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
        console.log("openStatusComposer CALLED! Modal element:", document.getElementById("status-composer-modal"));
        const modal = document.getElementById("status-composer-modal");
        const selectorView = document.getElementById("status-composer-selector-view");
        const textView = document.getElementById("status-composer-text-view");
        const textarea = document.getElementById("status-composer-textarea");
        const canvas = document.getElementById("status-composer-canvas");

        if (!modal || !selectorView || !textView) {
            console.error("Missing elements for openStatusComposer:", { modal, selectorView, textView });
            if (typeof showToast === "function") {
                showToast("Error opening status composer: elements missing", "error");
            }
            return;
        }

        // Reset composer state
        modal.style.display = "flex";
        selectorView.style.display = "flex";
        textView.style.display = "none";
        if (textarea) textarea.value = "";
        
        console.log("Modal display style set to flex. Current z-index:", modal.style.zIndex || window.getComputedStyle(modal).zIndex);
        if (typeof showToast === "function") {
            showToast("Opening status composer...", "info");
        }

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
        const composerTriggerBtn = document.getElementById("status-composer-trigger-btn");
        if (!composerTriggerBtn) {
            return;
        }
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
        console.log("model", modal)
        if (closeBtn) closeBtn.onclick = closeStatusComposer;
        if (modal) {

            modal.onclick = (e) => {
                console.log("------------------------button click...")

                if (e.target === modal) closeStatusComposer();
            };
        }

        // Options trigger
        if (composerTriggerBtn) {
            composerTriggerBtn.onclick = openStatusComposer;
        }

        const myStatusItem = document.getElementById("my-status-item");
        if (myStatusItem) {
            console.log("-------------myStatusItem", myStatusItem)
            myStatusItem.onclick = () => {
                console.log("gjhsgfsjkfgsjkdgk")
                openStatusComposer();
            };
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
                    videoPreview.play().catch(() => { });
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
                        trimmerAudio.play().catch(() => { });
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
                            trimmerAudio.play().catch(() => { });
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

                    // Push history state to intercept browser Back button
                    if (!window.__cameraPreviewActive) {
                        window.history.pushState({ cameraPreviewActive: true }, "", window.location.pathname);
                        window.__cameraPreviewActive = true;
                    }

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
                            videoPreview.play().catch(() => { });
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

        // Camera status option
        const cameraOpt = document.getElementById("status-composer-opt-camera");
        if (cameraOpt) {
            cameraOpt.onclick = async () => {
                closeStatusComposer();
                if (window.State) window.State.cameraMode = "status";
                if (typeof window.openCameraCaptureOverlay === "function") {
                    await window.openCameraCaptureOverlay();
                } else if (typeof showToast === "function") {
                    showToast("Camera module is loading...", "info");
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
        const screenCloseBtn = document.getElementById("status-viewer-screen-close");
        const arrowLeftBtn = document.getElementById("status-viewer-arrow-left");
        const arrowRightBtn = document.getElementById("status-viewer-arrow-right");
        const navLeft = document.getElementById("status-viewer-nav-left");
        const navRight = document.getElementById("status-viewer-nav-right");
        const viewerOverlay = document.getElementById("status-viewer-overlay");

        if (screenCloseBtn) {
            screenCloseBtn.onclick = (e) => {
                if (e) e.stopPropagation();
                closeStatusViewer(false);
            };
        }
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
                if (e.target === viewerOverlay) closeStatusViewer(false);
            };
        }

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

        // ── Discord-Style Status Viewer Emoji Reaction Modal ──
        const DISCORD_EMOJI_DATASET = [
            // Smileys & Emotion
            { char: "😀", name: "grinning face", keywords: "smile happy grin joy face", cat: "smileys" },
            { char: "😃", name: "grinning face big eyes", keywords: "happy joy smile face", cat: "smileys" },
            { char: "😄", name: "grinning face smiling eyes", keywords: "happy joy laugh smile", cat: "smileys" },
            { char: "😁", name: "beaming face", keywords: "teeth smile happy grin", cat: "smileys" },
            { char: "😆", name: "grinning squinting face", keywords: "laugh XD lol happy", cat: "smileys" },
            { char: "😅", name: "sweat smile", keywords: "nervous laugh sweat whew", cat: "smileys" },
            { char: "😂", name: "joy crying laugh", keywords: "tears lol rofl laugh happy", cat: "smileys" },
            { char: "🤣", name: "rofl rolling on floor", keywords: "lmao lol rofl laugh", cat: "smileys" },
            { char: "😊", name: "smiling face", keywords: "blush happy sweet smile", cat: "smileys" },
            { char: "😇", name: "innocent halo", keywords: "angel innocent halo smile", cat: "smileys" },
            { char: "🥰", name: "smiling face hearts", keywords: "love heart adore affectionate", cat: "smileys" },
            { char: "😍", name: "heart eyes", keywords: "love heart eyes adore wow", cat: "smileys" },
            { char: "🤩", name: "star struck", keywords: "star amazed excited wow", cat: "smileys" },
            { char: "😘", name: "kissing heart", keywords: "kiss love heart smooch", cat: "smileys" },
            { char: "😋", name: "yum delicious", keywords: "silly yum food tongue taste", cat: "smileys" },
            { char: "😛", name: "stuck out tongue", keywords: "silly tongue playful", cat: "smileys" },
            { char: "😜", name: "winking tongue", keywords: "wink silly joke tongue", cat: "smileys" },
            { char: "🤪", name: "zany face", keywords: "crazy goofy silly zany", cat: "smileys" },
            { char: "😝", name: "squinting tongue", keywords: "silly joke tongue XD", cat: "smileys" },
            { char: "🤑", name: "money mouth", keywords: "cash dollar rich money", cat: "smileys" },
            { char: "🤗", name: "hugging face", keywords: "hug warm friendly affection", cat: "smileys" },
            { char: "🤭", name: "hand over mouth", keywords: "giggle oops teehee whisper", cat: "smileys" },
            { char: "🤫", name: "shushing face", keywords: "quiet silence hush secret", cat: "smileys" },
            { char: "🤔", name: "thinking face", keywords: "hmm think ponder curious", cat: "smileys" },
            { char: "🤐", name: "zipper mouth", keywords: "sealed secret quiet mute", cat: "smileys" },
            { char: "🤨", name: "raised eyebrow", keywords: "suspicious skeptical eyebrow doubt", cat: "smileys" },
            { char: "😐", name: "neutral face", keywords: "pokerface meh straight neutral", cat: "smileys" },
            { char: "😑", name: "expressionless", keywords: "meh unamused blank face", cat: "smileys" },
            { char: "😶", name: "no mouth face", keywords: "silent speechless blank", cat: "smileys" },
            { char: "😏", name: "smirking face", keywords: "smirk sly coy flirty", cat: "smileys" },
            { char: "😒", name: "unamused face", keywords: "bored annoyed unimpressed meh", cat: "smileys" },
            { char: "🙄", name: "eye roll", keywords: "whatever roll eyes annoyed", cat: "smileys" },
            { char: "😬", name: "grimacing face", keywords: "awkward yikes cringe teeth", cat: "smileys" },
            { char: "😌", name: "relieved face", keywords: "peaceful calm relieved serene", cat: "smileys" },
            { char: "😔", name: "pensive face", keywords: "sad thoughtful depressed pensive", cat: "smileys" },
            { char: "😴", name: "sleeping face", keywords: "sleep zzz tired bedtime", cat: "smileys" },
            { char: "😷", name: "medical mask", keywords: "sick mask virus flu doctor", cat: "smileys" },
            { char: "🤒", name: "thermometer face", keywords: "sick fever ill temperature", cat: "smileys" },
            { char: "🥵", name: "hot face", keywords: "heat summer sweaty thirsty", cat: "smileys" },
            { char: "🥶", name: "cold face", keywords: "freezing ice cold winter frost", cat: "smileys" },
            { char: "🤯", name: "exploding head", keywords: "mind blown explode shock omg", cat: "smileys" },
            { char: "🥳", name: "partying face", keywords: "party celebrate hat horn birthday", cat: "smileys" },
            { char: "😎", name: "sunglasses cool", keywords: "cool chill awesome shades", cat: "smileys" },
            { char: "🤓", name: "nerd face", keywords: "geek glasses smart nerd", cat: "smileys" },
            { char: "🧐", name: "monocle face", keywords: "fancy examine inspect monocle", cat: "smileys" },
            { char: "😡", name: "pouting red angry", keywords: "mad angry furious rage", cat: "smileys" },
            { char: "💀", name: "skull dead", keywords: "skeleton dead dying laugh I'm dead", cat: "smileys" },
            { char: "💩", name: "poop hankey", keywords: "pooh poop funny turd", cat: "smileys" },
            { char: "🤡", name: "clown face", keywords: "clown fool funny joke", cat: "smileys" },
            { char: "👻", name: "ghost spooky", keywords: "halloween ghost boo phantom", cat: "smileys" },
            { char: "👽", name: "alien space", keywords: "alien ufo extraterrestrial", cat: "smileys" },
            { char: "🤖", name: "robot face", keywords: "bot robot ai machine", cat: "smileys" },

            // Animals & Nature
            { char: "🐶", name: "dog face", keywords: "puppy dog pet animal woof", cat: "animals" },
            { char: "🐱", name: "cat face", keywords: "kitty cat pet meow animal", cat: "animals" },
            { char: "🐭", name: "mouse face", keywords: "rat mouse rodent animal", cat: "animals" },
            { char: "🐹", name: "hamster face", keywords: "hamster pet rodent cute", cat: "animals" },
            { char: "🐰", name: "rabbit face", keywords: "bunny rabbit pet animal", cat: "animals" },
            { char: "🦊", name: "fox face", keywords: "fox wild animal red", cat: "animals" },
            { char: "🐻", name: "bear face", keywords: "bear wild animal teddy", cat: "animals" },
            { char: "🐼", name: "panda face", keywords: "panda bear china cute", cat: "animals" },
            { char: "🐨", name: "koala bear", keywords: "australia koala cute", cat: "animals" },
            { char: "🐯", name: "tiger face", keywords: "tiger wild cat predator", cat: "animals" },
            { char: "🦁", name: "lion face", keywords: "lion king predator safari", cat: "animals" },
            { char: "🐮", name: "cow face", keywords: "cow cattle farm animal moo", cat: "animals" },
            { char: "🐷", name: "pig face", keywords: "pig oink farm animal pork", cat: "animals" },
            { char: "🐸", name: "frog face", keywords: "frog toad amphibian ribbit", cat: "animals" },
            { char: "🐵", name: "monkey face", keywords: "monkey ape primate banana", cat: "animals" },
            { char: "🐔", name: "chicken hen", keywords: "rooster chicken farm bird", cat: "animals" },
            { char: "🐧", name: "penguin bird", keywords: "penguin ice arctic bird", cat: "animals" },
            { char: "🐦", name: "bird tweet", keywords: "bird tweet fly animal", cat: "animals" },
            { char: "🐤", name: "baby chick", keywords: "chick bird duck yellow", cat: "animals" },
            { char: "🦄", name: "unicorn face", keywords: "unicorn magic fantasy pony", cat: "animals" },
            { char: "🐝", name: "honeybee insect", keywords: "bee honey insect bug fly", cat: "animals" },
            { char: "🦋", name: "butterfly insect", keywords: "butterfly bug nature pretty", cat: "animals" },
            { char: "🐙", name: "octopus sea", keywords: "octopus ocean sea squid tentacle", cat: "animals" },
            { char: "🐬", name: "dolphin ocean", keywords: "dolphin sea water mammal", cat: "animals" },
            { char: "🦈", name: "shark ocean", keywords: "shark predator ocean sea jaw", cat: "animals" },
            { char: "🌺", name: "hibiscus flower", keywords: "flower nature plant blossom", cat: "animals" },
            { char: "🌸", name: "cherry blossom", keywords: "flower sakura spring pink", cat: "animals" },
            { char: "🌲", name: "evergreen tree", keywords: "tree forest nature pine", cat: "animals" },
            { char: "⭐", name: "star yellow", keywords: "star sky space shiny gold", cat: "animals" },
            { char: "🔥", name: "fire flame", keywords: "fire hot flame lit energy", cat: "animals" },

            // Food & Drink
            { char: "🍏", name: "green apple", keywords: "apple fruit food healthy", cat: "food" },
            { char: "🍎", name: "red apple", keywords: "apple fruit food red", cat: "food" },
            { char: "🍊", name: "tangerine orange", keywords: "orange fruit citrus food", cat: "food" },
            { char: "🍋", name: "lemon sour", keywords: "lemon fruit sour citrus", cat: "food" },
            { char: "🍌", name: "banana fruit", keywords: "banana fruit monkey food", cat: "food" },
            { char: "🍉", name: "watermelon fruit", keywords: "watermelon summer fruit melon", cat: "food" },
            { char: "🍇", name: "grapes fruit", keywords: "grapes fruit wine berry", cat: "food" },
            { char: "🍓", name: "strawberry fruit", keywords: "strawberry berry fruit sweet", cat: "food" },
            { char: "🍒", name: "cherries fruit", keywords: "cherry fruit sweet red", cat: "food" },
            { char: "🥑", name: "avocado food", keywords: "avocado fruit toast guacamole", cat: "food" },
            { char: "🍔", name: "hamburger burger", keywords: "burger fastfood meat cheese", cat: "food" },
            { char: "🍟", name: "french fries", keywords: "fries potato snack fastfood", cat: "food" },
            { char: "🍕", name: "pizza slice", keywords: "pizza cheese Italian food", cat: "food" },
            { char: "🌭", name: "hotdog sausage", keywords: "hotdog sausage mustard food", cat: "food" },
            { char: "🌮", name: "taco mexican", keywords: "taco mexican food spicy", cat: "food" },
            { char: "🌯", name: "burrito wrap", keywords: "burrito mexican food wrap", cat: "food" },
            { char: "🍿", name: "popcorn movie", keywords: "popcorn cinema movie snack", cat: "food" },
            { char: "🍩", name: "donut doughnut", keywords: "donut sweet dessert bakery", cat: "food" },
            { char: "🍦", name: "soft ice cream", keywords: "ice cream dessert cone sweet", cat: "food" },
            { char: "🍰", name: "strawberry shortcake", keywords: "cake dessert birthday sweet", cat: "food" },
            { char: "🎂", name: "birthday cake", keywords: "cake birthday party candles", cat: "food" },
            { char: "🍫", name: "chocolate bar", keywords: "chocolate sweet candy dessert", cat: "food" },
            { char: "☕", name: "hot coffee tea", keywords: "coffee espresso tea drink morning", cat: "food" },
            { char: "🧃", name: "beverage juice box", keywords: "juice drink straw beverage", cat: "food" },
            { char: "🥤", name: "cup with straw", keywords: "soda drink cup beverage", cat: "food" },
            { char: "🧋", name: "boba bubble tea", keywords: "boba tea drink tapioca milk", cat: "food" },
            { char: "🍺", name: "beer mug", keywords: "beer drink pub alcohol cheers", cat: "food" },
            { char: "🍻", name: "clinking beer mugs", keywords: "beers cheers pub drink party", cat: "food" },
            { char: "🥂", name: "clinking glasses champagne", keywords: "toast celebration champagne drink", cat: "food" },
            { char: "🍷", name: "wine glass", keywords: "wine drink alcohol red dinner", cat: "food" },

            // Activities
            { char: "⚽", name: "soccer ball", keywords: "soccer football sports ball game", cat: "activities" },
            { char: "🏀", name: "basketball", keywords: "basketball sports ball NBA game", cat: "activities" },
            { char: "🏈", name: "american football", keywords: "football NFL sports ball", cat: "activities" },
            { char: "⚾", name: "baseball", keywords: "baseball MLB sports ball", cat: "activities" },
            { char: "🎾", name: "tennis ball", keywords: "tennis sports racket ball", cat: "activities" },
            { char: "🏐", name: "volleyball", keywords: "volleyball sports beach ball", cat: "activities" },
            { char: "🏓", name: "ping pong table tennis", keywords: "ping pong paddle ball sport", cat: "activities" },
            { char: "🎯", name: "bullseye dart target", keywords: "target dart hit bullseye game", cat: "activities" },
            { char: "🎮", name: "video game controller", keywords: "gaming controller console game playstation xbox nintendo", cat: "activities" },
            { char: "🎲", name: "game die dice", keywords: "dice casino gamble game luck", cat: "activities" },
            { char: "♟️", name: "chess pawn", keywords: "chess strategy boardgame pawn", cat: "activities" },
            { char: "🏆", name: "trophy cup award", keywords: "trophy win winner first award prize", cat: "activities" },
            { char: "🥇", name: "1st place medal", keywords: "gold medal winner first place", cat: "activities" },
            { char: "🥈", name: "2nd place medal", keywords: "silver medal second place", cat: "activities" },
            { char: "🥉", name: "3rd place medal", keywords: "bronze medal third place", cat: "activities" },
            { char: "🎨", name: "artist palette", keywords: "art paint draw palette creative", cat: "activities" },
            { char: "🎬", name: "clapper board movie", keywords: "movie cinema film Hollywood act", cat: "activities" },
            { char: "🎤", name: "microphone sing", keywords: "mic sing music karaoke audio", cat: "activities" },
            { char: "🎧", name: "headphone audio", keywords: "music headphones listen audio sound", cat: "activities" },
            { char: "🎸", name: "guitar music", keywords: "guitar instrument rock music song", cat: "activities" },

            // Travel & Places
            { char: "🚗", name: "automobile car", keywords: "car auto drive travel vehicle", cat: "travel" },
            { char: "🚕", name: "taxi cab", keywords: "taxi cab ride transport yellow", cat: "travel" },
            { char: "🚌", name: "bus transit", keywords: "bus transport vehicle ride", cat: "travel" },
            { char: "🏎️", name: "racing car", keywords: "race fast car f1 speed", cat: "travel" },
            { char: "🏍️", name: "motorcycle bike", keywords: "bike moto motorcycle ride", cat: "travel" },
            { char: "🛵", name: "motor scooter", keywords: "scooter vespa bike delivery", cat: "travel" },
            { char: "🚲", name: "bicycle bike", keywords: "bike cycle exercise sport ride", cat: "travel" },
            { char: "✈️", name: "airplane flight", keywords: "plane fly flight travel airport", cat: "travel" },
            { char: "🚀", name: "rocket ship", keywords: "rocket space moon launch speed", cat: "travel" },
            { char: "🛸", name: "flying saucer ufo", keywords: "ufo alien space saucer", cat: "travel" },
            { char: "🚁", name: "helicopter", keywords: "chopper helicopter fly travel", cat: "travel" },
            { char: "⛵", name: "sailboat boat", keywords: "boat sea ocean sail water", cat: "travel" },
            { char: "🏠", name: "house home", keywords: "home house building residential", cat: "travel" },
            { char: "🏢", name: "office building", keywords: "office work building company", cat: "travel" },
            { char: "🏖️", name: "beach umbrella", keywords: "beach vacation sea sand summer", cat: "travel" },
            { char: "🏕️", name: "camping tent", keywords: "camping tent nature outdoor trip", cat: "travel" },
            { char: "🗿", name: "moai easter island", keywords: "statue moai stone meme bruh", cat: "travel" },

            // Objects
            { char: "⌚", name: "watch clock", keywords: "watch time clock wrist", cat: "objects" },
            { char: "📱", name: "mobile phone smartphone", keywords: "phone iphone android mobile call text", cat: "objects" },
            { char: "💻", name: "laptop computer", keywords: "laptop pc code dev tech computer work", cat: "objects" },
            { char: "💡", name: "light bulb idea", keywords: "idea bulb light bright smart genius", cat: "objects" },
            { char: "🔦", name: "flashlight torch", keywords: "flashlight torch light dark", cat: "objects" },
            { char: "📖", name: "open book", keywords: "book read study learn literature", cat: "objects" },
            { char: "📚", name: "books stack", keywords: "books school study library college", cat: "objects" },
            { char: "💰", name: "money bag", keywords: "money dollar cash wealth rich bag", cat: "objects" },
            { char: "💵", name: "dollar bill cash", keywords: "cash dollar money green buck", cat: "objects" },
            { char: "💎", name: "gem stone diamond", keywords: "diamond gem jewel luxury precious", cat: "objects" },
            { char: "🔑", name: "key lock", keywords: "key unlock password secret access", cat: "objects" },
            { char: "🔒", name: "locked pad lock", keywords: "lock secure safety privacy closed", cat: "objects" },
            { char: "🎁", name: "wrapped gift present", keywords: "gift present surprise birthday unwrap", cat: "objects" },
            { char: "🔔", name: "bell notification", keywords: "bell ring alert notice sound", cat: "objects" },
            { char: "📌", name: "pushpin pin", keywords: "pin pushpin mark location important", cat: "objects" },

            // Symbols & Flags
            { char: "❤️", name: "red heart love", keywords: "heart love red romance favorite like", cat: "symbols" },
            { char: "🧡", name: "orange heart", keywords: "heart love orange like", cat: "symbols" },
            { char: "💛", name: "yellow heart", keywords: "heart love yellow friend", cat: "symbols" },
            { char: "💚", name: "green heart", keywords: "heart love green eco nature", cat: "symbols" },
            { char: "💙", name: "blue heart", keywords: "heart love blue chill cool", cat: "symbols" },
            { char: "💜", name: "purple heart", keywords: "heart love purple bts", cat: "symbols" },
            { char: "🖤", name: "black heart", keywords: "heart black dark emo goth", cat: "symbols" },
            { char: "🤍", name: "white heart", keywords: "heart white pure clean peace", cat: "symbols" },
            { char: "💔", name: "broken heart", keywords: "broken heart breakup sad hurt", cat: "symbols" },
            { char: "💯", name: "hundred points 100", keywords: "100 percent perfect score KeepItReal", cat: "symbols" },
            { char: "👍", name: "thumbs up yes", keywords: "thumbs up approve like yes good ok +1", cat: "symbols" },
            { char: "👎", name: "thumbs down no", keywords: "thumbs down dislike no bad -1", cat: "symbols" },
            { char: "👏", name: "clapping hands bravo", keywords: "clap applaud congratulations bravo props", cat: "symbols" },
            { char: "🙌", name: "raising hands praise", keywords: "praise celebrate highfive hooray", cat: "symbols" },
            { char: "🙏", name: "folded hands pray please", keywords: "pray please thank you thanks namaste", cat: "symbols" },
            { char: "🤝", name: "handshake agree", keywords: "handshake deal agreement partner", cat: "symbols" },
            { char: "✌️", name: "victory hand peace", keywords: "peace victory v sign two", cat: "symbols" },
            { char: "🤘", name: "sign of horns rock", keywords: "rock metal horns heavy cool", cat: "symbols" },
            { char: "💪", name: "flexed biceps strong", keywords: "flex muscle strong power gym workout", cat: "symbols" },
            { char: "🎉", name: "party popper tada", keywords: "tada party celebration congratulations congrats", cat: "symbols" },
            { char: "✨", name: "sparkles magic", keywords: "sparkles shiny clean new magic star", cat: "symbols" },
            { char: "💥", name: "collision boom blast", keywords: "boom blast pow impact collision explosion", cat: "symbols" },
            { char: "⚡", name: "high voltage lightning", keywords: "lightning flash thunder electric power fast", cat: "symbols" },
            { char: "✅", name: "check mark button", keywords: "check done yes correct pass checkmark", cat: "symbols" },
            { char: "❌", name: "cross mark x", keywords: "x wrong cancel no reject error", cat: "symbols" },
            { char: "⚠️", name: "warning sign", keywords: "warning caution alert danger exclam", cat: "symbols" },
            { char: "⛔", name: "no entry stop", keywords: "stop forbidden denied no entry", cat: "symbols" }
        ];

        const categoryLabels = {
            smileys: "Smileys & Emotion",
            animals: "Animals & Nature",
            food: "Food & Drink",
            activities: "Activities",
            travel: "Travel & Places",
            objects: "Objects",
            symbols: "Symbols & Flags"
        };

        let currentActiveCat = "all";

        const emojiBtn = document.getElementById("status-viewer-emoji-btn");
        const emojiModal = document.getElementById("status-viewer-emoji-modal");
        const emojiCloseBtn = document.getElementById("status-viewer-emoji-close-btn");
        const emojiGrid = document.getElementById("status-viewer-emoji-grid");
        const emojiCard = document.getElementById("status-viewer-emoji-card");
        const emojiSearchInput = document.getElementById("status-viewer-emoji-search-input");
        const emojiCatContainer = document.getElementById("status-viewer-emoji-categories");
        const emojiNoResults = document.getElementById("status-viewer-emoji-no-results");

        function createDiscordEmojiCellBtn(item) {
            const btn = document.createElement("button");
            btn.type = "button";
            btn.className = "discord-emoji-item";
            btn.title = item.name;
            btn.textContent = item.char;

            btn.onclick = (e) => {
                e.stopPropagation();
                if (replyInput) {
                    replyInput.value += item.char;
                    replyInput.focus();
                }
                if (emojiModal) emojiModal.style.display = "none";
                if (isPaused) togglePlayPause();
            };

            return btn;
        }

        function renderDiscordEmojiGrid(searchTerm = "", catFilter = "all") {
            if (!emojiGrid) return;
            emojiGrid.innerHTML = "";

            const cleanSearch = searchTerm.trim().toLowerCase();

            let filtered = DISCORD_EMOJI_DATASET.filter(item => {
                const matchesCat = (catFilter === "all" || item.cat === catFilter);
                if (!matchesCat) return false;
                if (!cleanSearch) return true;

                return item.name.toLowerCase().includes(cleanSearch) ||
                       item.keywords.toLowerCase().includes(cleanSearch) ||
                       item.char.includes(cleanSearch);
            });

            if (filtered.length === 0) {
                if (emojiNoResults) emojiNoResults.style.display = "block";
                return;
            } else {
                if (emojiNoResults) emojiNoResults.style.display = "none";
            }

            // Group by category if viewing 'all' and no search term is entered
            if (catFilter === "all" && !cleanSearch) {
                const categories = ["smileys", "animals", "food", "activities", "travel", "objects", "symbols"];
                categories.forEach(cat => {
                    const catItems = filtered.filter(i => i.cat === cat);
                    if (catItems.length > 0) {
                        const header = document.createElement("div");
                        header.className = "discord-emoji-section-header";
                        header.dataset.section = cat;
                        header.textContent = categoryLabels[cat] || cat.toUpperCase();
                        emojiGrid.appendChild(header);

                        catItems.forEach(item => {
                            emojiGrid.appendChild(createDiscordEmojiCellBtn(item));
                        });
                    }
                });
            } else {
                filtered.forEach(item => {
                    emojiGrid.appendChild(createDiscordEmojiCellBtn(item));
                });
            }
        }

        if (emojiBtn && emojiModal && emojiGrid) {
            // Search Input Listener
            if (emojiSearchInput) {
                emojiSearchInput.oninput = (e) => {
                    const query = e.target.value;
                    renderDiscordEmojiGrid(query, currentActiveCat);
                };
            }

            // Category Tabs Listener
            if (emojiCatContainer) {
                const tabs = emojiCatContainer.querySelectorAll(".discord-emoji-cat-tab");
                tabs.forEach(tab => {
                    tab.onclick = (e) => {
                        e.stopPropagation();
                        tabs.forEach(t => t.classList.remove("active"));
                        tab.classList.add("active");

                        currentActiveCat = tab.dataset.category || "all";
                        const query = emojiSearchInput ? emojiSearchInput.value : "";
                        renderDiscordEmojiGrid(query, currentActiveCat);

                        const scrollArea = document.getElementById("status-viewer-emoji-scroll-container");
                        if (scrollArea) scrollArea.scrollTop = 0;
                    };
                });
            }

            emojiBtn.onclick = (e) => {
                e.stopPropagation();
                if (!isPaused) togglePlayPause();
                emojiModal.style.display = "flex";

                if (emojiSearchInput) emojiSearchInput.value = "";
                currentActiveCat = "all";

                if (emojiCatContainer) {
                    const tabs = emojiCatContainer.querySelectorAll(".discord-emoji-cat-tab");
                    tabs.forEach(t => {
                        if (t.dataset.category === "all") t.classList.add("active");
                        else t.classList.remove("active");
                    });
                }

                renderDiscordEmojiGrid("", "all");
            };

            if (emojiCloseBtn) {
                emojiCloseBtn.onclick = (e) => {
                    e.stopPropagation();
                    emojiModal.style.display = "none";
                    if (isPaused) togglePlayPause();
                };
            }

            emojiModal.onclick = (e) => {
                if (e.target === emojiModal) {
                    e.stopPropagation();
                    emojiModal.style.display = "none";
                    if (isPaused) togglePlayPause();
                }
            };

            if (emojiCard) {
                emojiCard.onclick = (e) => {
                    e.stopPropagation();
                };
            }
        }

        // Status video buffering & loader events
        const videoEl = document.getElementById("status-viewer-video");
        const loaderEl = document.getElementById("status-viewer-loader");
        if (videoEl) {
            const handleBuffering = () => {
                if (preloadCleanup !== null) return;
                if (activeGroup && activeIndex >= 0) {
                    const moment = activeGroup.moments[activeIndex];
                    const resolvedType = moment.type || moment.mediaType || (moment.url ? (moment.url.match(/\.(mp4|webm|ogg|mov)/i) ? "video" : "image") : "text");
                    if (resolvedType === "video") {
                        if (loaderEl) loaderEl.style.display = "flex";
                        if (!isPaused && !isBuffering && segmentStartTime > 0) {
                            isBuffering = true;
                            clearStatusTimers();
                            pausedAtMs = Date.now() - segmentStartTime;
                        }
                    }
                }
            };

            const handlePlaying = () => {
                if (preloadCleanup !== null) return;
                if (loaderEl) loaderEl.style.display = "none";
                if (isBuffering) {
                    isBuffering = false;
                    if (!isPaused && activeGroup && activeIndex >= 0) {
                        segmentStartTime = Date.now() - pausedAtMs;
                        const remaining = currentSegmentDurationMs - pausedAtMs;
                        const fill = document.getElementById(`status-fill-${activeIndex}`);

                        statusProgressInterval = setInterval(() => {
                            const elapsed = Date.now() - segmentStartTime;
                            const percentage = Math.min(100, (elapsed / currentSegmentDurationMs) * 100);
                            if (fill) fill.style.width = `${percentage}%`;
                        }, 50);

                        statusTimer = setTimeout(() => {
                            advanceSegment(1);
                        }, remaining);
                    }
                }
            };

            videoEl.onwaiting = handleBuffering;
            videoEl.onloadstart = handleBuffering;
            videoEl.onplaying = handlePlaying;
            videoEl.oncanplay = handlePlaying;
        }
    }

    // ── Status Playback Viewer Overlay ──
    async function openStatusViewer(group, startIndex = 0) {

        activeGroup = group;
        activeIndex = (typeof startIndex === "number" && startIndex >= 0 && group?.moments && startIndex < group.moments.length) ? startIndex : 0;
        isPaused = false;

        const overlay = document.getElementById("status-viewer-overlay");
        if (!overlay) {
            console.error("[DEBUG] #status-viewer-overlay not found in DOM!");
            return;
        }

        overlay.style.display = "flex";

        const rawUsername = group?.user?.username || group?.username || group?.moments?.[0]?.user?.username;
        const validUsername = (rawUsername && rawUsername !== "My Status") ? rawUsername : (window.State?.currentUser?.username || "");
        const targetPath = validUsername ? `/status/${validUsername}` : `/status`;

        if (!window.__statusViewerActive) {
            window.__statusViewerActive = true;
            if (window.location.pathname !== targetPath) {
                window.history.pushState({ statusViewerActive: true, username: validUsername }, "", targetPath);
            }
        } else {
            if (validUsername && window.location.pathname !== targetPath) {
                window.history.replaceState({ statusViewerActive: true, username: validUsername }, "", targetPath);
            }
        }

        // Build segments
        buildProgressSegments();

        // Play first status
        await playCurrentStatusSegment();
    }

    function closeStatusViewer(fromPopstate = false) {
        if (preloadCleanup) {
            preloadCleanup();
            preloadCleanup = null;
        }
        if (prefetchVideoEl) {
            prefetchVideoEl.src = "";
            prefetchVideoEl.load();
            prefetchVideoEl = null;
        }
        const overlay = document.getElementById("status-viewer-overlay");
        const video = document.getElementById("status-viewer-video");
        const img = document.getElementById("status-viewer-img");
        const loader = document.getElementById("status-viewer-loader");

        clearStatusTimers();
        isBuffering = false;

        const remainingTimeEl = document.getElementById("status-viewer-remaining-time");
        if (remainingTimeEl) remainingTimeEl.textContent = "";

        // Reset status viewer audio stream
        statusViewerAudio.pause();
        statusViewerAudio.src = "";

        if (overlay) overlay.style.display = "none";
        if (loader) loader.style.display = "none";
        if (video) {
            video.onloadedmetadata = null;
            video.ondurationchange = null;
            video.onerror = null;
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
        const emojiModal = document.getElementById("status-viewer-emoji-modal");
        if (songSheet) {
            songSheet.style.display = "none";
            songSheet.style.transform = "translateY(100%)";
        }
        if (emojiModal) emojiModal.style.display = "none";

        if (typeof fromPopstate !== "boolean") {
            fromPopstate = false;
        }

        if (window.__statusViewerActive || window.location.pathname !== "/status") {
            window.__statusViewerActive = false;
            if (!fromPopstate) {
                if (window.location.pathname !== "/status" && window.location.pathname.startsWith("/status")) {
                    window.history.replaceState({ path: "/status" }, "", "/status");
                }
            }
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
        if (preloadCleanup) {
            preloadCleanup();
            preloadCleanup = null;
        }
        clearStatusTimers();
        isPaused = false;
        pausedAtMs = 0;
        isBuffering = false;
        segmentStartTime = 0;

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

        // Reset media element states and per-segment handlers to prevent stale callback pollution
        if (video) {
            video.onloadedmetadata = null;
            video.ondurationchange = null;
            video.onerror = null;
            video.pause();
            if (resolvedType !== "video") {
                video.src = "";
                video.removeAttribute("src");
                video.style.display = "none";
            }
        }
        if (img && resolvedType !== "image" && resolvedType !== "photo") {
            img.src = "";
            img.style.display = "none";
        }
        if (textCanvas && resolvedType !== "text") {
            textCanvas.style.display = "none";
            textCanvas.textContent = "";
        }
        if (captionBar) {
            captionBar.style.display = "none";
            captionBar.textContent = "";
        }

        // Volume/Mute Icon: disable and gray out when status has no audio
        const muteBtn = document.getElementById("status-viewer-mute-btn");
        if (muteBtn) {
            muteBtn.style.display = "flex";
            const hasAudio = (resolvedType === "video" || resolvedType === "audio" || !!(moment.songRef && (moment.songRef.audioUrl || moment.songRef.youtubeVideoId || moment.songRef.title)));
            if (hasAudio) {
                muteBtn.disabled = false;
                muteBtn.style.opacity = "1";
                muteBtn.style.color = "white";
                muteBtn.style.cursor = "pointer";
                muteBtn.title = "Toggle Mute";
            } else {
                muteBtn.disabled = true;
                muteBtn.style.opacity = "0.35";
                muteBtn.style.color = "rgba(255, 255, 255, 0.4)";
                muteBtn.style.cursor = "not-allowed";
                muteBtn.title = "No audio on this status";
            }
        }

        // Set header details
        const avatarFallback = document.getElementById("status-viewer-avatar-fallback");
        const usernameStr = activeGroup?.user?.username || "";
        const initialLetter = usernameStr ? usernameStr.charAt(0).toUpperCase() : "?";

        if (username) username.textContent = usernameStr;

        if (avatar) {
            avatar.onerror = () => {
                avatar.style.display = "none";
                if (avatarFallback) {
                    avatarFallback.textContent = initialLetter;
                    avatarFallback.style.display = "flex";
                }
            };

            const userAvatarUrl = activeGroup?.user?.avatar;
            const isValidAvatarUrl = userAvatarUrl && userAvatarUrl !== "/images/default-avatar.png" && userAvatarUrl.trim().length > 5;

            if (isValidAvatarUrl) {
                avatar.src = userAvatarUrl;
                avatar.style.display = "block";
                if (avatarFallback) avatarFallback.style.display = "none";
            } else {
                avatar.style.display = "none";
                if (avatarFallback) {
                    avatarFallback.textContent = initialLetter;
                    avatarFallback.style.display = "flex";
                }
            }
        }
        if (timeEl) {
            const relativeTime = typeof formatRelativeTime === "function"
                ? formatRelativeTime(new Date(moment.createdAt))
                : new Date(moment.createdAt).toLocaleTimeString();
            timeEl.textContent = relativeTime;
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
        if (preloadCleanup) {
            preloadCleanup();
            preloadCleanup = null;
        }
        if (img) img.style.display = "none";
        if (video) {
            video.style.display = "none";
            video.pause();
            video.src = "";
            video.removeAttribute("src");
        }
        const loader = document.getElementById("status-viewer-loader");
        if (loader) loader.style.display = "none";
        isBuffering = false;
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

                const dbDuration = (moment.duration && moment.duration > 0) ? moment.duration : 15;
                let activeDuration = (video.duration && !isNaN(video.duration) && video.duration !== Infinity && video.duration > 0) ? video.duration : dbDuration;
                currentSegmentDurationMs = activeDuration * 1000;

                const updateVideoDuration = (newDur) => {
                    if (!newDur || isNaN(newDur) || newDur === Infinity || newDur <= 0) return;
                    const newDurMs = newDur * 1000;
                    if (Math.abs(newDurMs - currentSegmentDurationMs) > 300) {
                        console.log(`[Status Viewer] Updating video segment duration dynamically from ${currentSegmentDurationMs}ms to ${newDurMs}ms`);
                        currentSegmentDurationMs = newDurMs;
                        
                        const remainingTimeEl = document.getElementById("status-viewer-remaining-time");
                        if (remainingTimeEl && segmentStartTime > 0 && !isPaused && !isBuffering) {
                            const elapsed = Date.now() - segmentStartTime;
                            const remainingSec = Math.max(0, Math.ceil((currentSegmentDurationMs - elapsed) / 1000));
                            remainingTimeEl.textContent = `${remainingSec}s`;
                        }

                        if (statusTimer && segmentStartTime > 0 && !isPaused && !isBuffering) {
                            clearTimeout(statusTimer);
                            const elapsed = Date.now() - segmentStartTime;
                            const remaining = Math.max(0, currentSegmentDurationMs - elapsed);
                            statusTimer = setTimeout(() => {
                                advanceSegment(1);
                            }, remaining);
                        }
                    }
                };

                video.ondurationchange = () => {
                    updateVideoDuration(video.duration);
                };

                video.onloadedmetadata = () => {
                    const duration = (video.duration && !isNaN(video.duration) && video.duration !== Infinity && video.duration > 0) ? video.duration : dbDuration;
                    currentSegmentDurationMs = duration * 1000;

                    const remainingTimeEl = document.getElementById("status-viewer-remaining-time");
                    if (remainingTimeEl) {
                        remainingTimeEl.textContent = `${Math.ceil(duration)}s`;
                    }

                    const loaderEl = document.getElementById("status-viewer-loader");
                    if (loaderEl) loaderEl.style.display = "flex";

                    video.pause();

                    preloadCleanup = preloadVideoBuffer(video, 11, () => {
                        preloadCleanup = null;
                        video.play().then(() => {
                            startSegmentProgressAnimation(currentSegmentDurationMs);
                        }).catch(err => {
                            console.warn("Video play failed:", err);
                            startSegmentProgressAnimation(currentSegmentDurationMs);
                        });
                    });
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
                const textStr = moment.textContent || moment.caption || "";
                textCanvas.textContent = textStr;
                textCanvas.style.background = moment.backgroundColor || "#3f51b5";

                if (moment.font) {
                    textCanvas.style.fontFamily = moment.font;
                } else {
                    textCanvas.style.fontFamily = "'Outfit', 'Inter', sans-serif";
                }

                if (textStr.length > 80) {
                    textCanvas.style.fontSize = "20px";
                } else if (textStr.length > 40) {
                    textCanvas.style.fontSize = "24px";
                } else {
                    textCanvas.style.fontSize = "28px";
                }
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

        const remainingTimeEl = document.getElementById("status-viewer-remaining-time");
        if (remainingTimeEl) {
            remainingTimeEl.textContent = `${Math.ceil(durationMs / 1000)}s`;
        }

        statusProgressInterval = setInterval(() => {
            const elapsed = Date.now() - segmentStartTime;
            const percentage = Math.min(100, (elapsed / durationMs) * 100);
            fill.style.width = `${percentage}%`;

            const remainingSec = Math.max(0, Math.ceil((durationMs - elapsed) / 1000));
            if (remainingTimeEl) {
                remainingTimeEl.textContent = `${remainingSec}s`;
            }
        }, 50);

        statusTimer = setTimeout(() => {
            advanceSegment(1);
        }, durationMs);

        // Prefetch next segment in background
        prefetchNextSegment();
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
                statusViewerAudio.play().catch(() => { });
            }

            segmentStartTime = Date.now() - pausedAtMs;
            const remaining = currentSegmentDurationMs - pausedAtMs;

            const remainingTimeEl = document.getElementById("status-viewer-remaining-time");
            if (remainingTimeEl) {
                remainingTimeEl.textContent = `${Math.ceil(remaining / 1000)}s`;
            }

            statusProgressInterval = setInterval(() => {
                const elapsed = Date.now() - segmentStartTime;
                const percentage = Math.min(100, (elapsed / currentSegmentDurationMs) * 100);
                if (fill) fill.style.width = `${percentage}%`;

                const remainingSec = Math.max(0, Math.ceil((currentSegmentDurationMs - elapsed) / 1000));
                if (remainingTimeEl) {
                    remainingTimeEl.textContent = `${remainingSec}s`;
                }
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
        const muteBtn = document.getElementById("status-viewer-mute-btn");
        if (muteBtn && muteBtn.disabled) return;

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
            let transitionedToPrevGroup = false;
            if (window.allStatusGroups && window.allStatusGroups.length > 0) {
                const currentGroupIdx = window.allStatusGroups.findIndex(g => {
                    const currentId = activeGroup.user._id ? activeGroup.user._id.toString() : (activeGroup.user.id ? activeGroup.user.id.toString() : "");
                    const gId = g.user._id ? g.user._id.toString() : (g.user.id ? g.user.id.toString() : "");
                    return currentId === gId;
                });
                if (currentGroupIdx > 0) {
                    const prevGroup = window.allStatusGroups[currentGroupIdx - 1];
                    console.log(`[Tap-Back] Transitioning to previous user status group: ${prevGroup.user.username}`);
                    openStatusViewer(prevGroup, prevGroup.moments ? prevGroup.moments.length - 1 : 0);
                    transitionedToPrevGroup = true;
                }
            }

            if (!transitionedToPrevGroup) {
                activeIndex = 0; // lock at beginning
                playCurrentStatusSegment();
            }
        } else if (nextIdx >= activeGroup.moments.length) {
            // End of statuses for this user. Check if there is a next user's status group in allStatusGroups
            let transitionedToNextGroup = false;
            if (window.allStatusGroups && window.allStatusGroups.length > 0) {
                const currentGroupIdx = window.allStatusGroups.findIndex(g => {
                    const currentId = activeGroup.user._id ? activeGroup.user._id.toString() : (activeGroup.user.id ? activeGroup.user.id.toString() : "");
                    const gId = g.user._id ? g.user._id.toString() : (g.user.id ? g.user.id.toString() : "");
                    return currentId === gId;
                });
                if (currentGroupIdx !== -1 && currentGroupIdx + 1 < window.allStatusGroups.length) {
                    const nextGroup = window.allStatusGroups[currentGroupIdx + 1];
                    console.log(`[Auto-Advance] Transitioning to next user status group: ${nextGroup.user.username}`);
                    openStatusViewer(nextGroup, 0);
                    transitionedToNextGroup = true;
                }
            }

            if (!transitionedToNextGroup) {
                closeStatusViewer(false);

                // Reload connection sidebar status rings
                if (typeof window.renderStatusSidebar === "function") {
                    window.renderStatusSidebar();
                }
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

                let duration = null;
                if (file.type.startsWith("video")) {
                    try {
                        duration = await new Promise((resolve) => {
                            const tempVideo = document.createElement("video");
                            tempVideo.preload = "metadata";
                            const url = URL.createObjectURL(file);
                            tempVideo.src = url;
                            tempVideo.onloadedmetadata = () => {
                                URL.revokeObjectURL(url);
                                resolve(tempVideo.duration || null);
                            };
                            tempVideo.onerror = () => {
                                URL.revokeObjectURL(url);
                                resolve(null);
                            };
                            setTimeout(() => {
                                URL.revokeObjectURL(url);
                                resolve(null);
                            }, 5000);
                        });
                    } catch (e) {
                        console.error("[StatusUploadQueue] Failed to read video duration:", e);
                    }
                }

                const statusRes = await apiRequest("POST", "/api/status", {
                    mediaUrl: finalUrl,
                    mediaType: file.type.startsWith("video") ? "video" : "image",
                    caption: caption,
                    duration: duration,
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

    window.saveStatusPendingUpload = async function (file) {
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

    window.updateStatusPendingCaptionAndUpload = async function (tempId, caption, wasMuted, songRef) {
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
                trimmerAudio.play().catch(() => { });
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
                    videoPreview.play().catch(() => { });
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
            if (!window.__songPickerActive && !window.__cameraTrimmerActive) {
                window.history.pushState({ songPickerOpen: true }, "", window.location.pathname);
                window.__songPickerActive = true;
            }
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
                if (window.__songPickerActive) {
                    window.__songPickerActive = false;
                    window.__ignoreNextPopstate = true;
                    window.history.back();
                }
                // Resume video preview when closing picker
                const videoPreview = document.getElementById("camera-capture-video-preview");
                if (videoPreview && videoPreview.style.display !== "none" && videoPreview.src) {
                    videoPreview.play().catch(() => { });
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

                // Pop history stack if it is active (could be clicked from status preview or trimmer)
                if (window.__cameraTrimmerActive) {
                    window.__cameraTrimmerActive = false;
                    window.__ignoreNextPopstate = true;
                    window.history.back();
                }
            };
        }

        // Trimmer Cancel / Back button
        if (trimmerCancelBtn) {
            trimmerCancelBtn.onclick = (e) => {
                e.stopPropagation();
                if (typeof window.showCameraTrimmerDiscardConfirmation === "function") {
                    window.showCameraTrimmerDiscardConfirmation(false);
                }
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

                // Pop history stack
                if (window.__cameraTrimmerActive) {
                    window.__cameraTrimmerActive = false;
                    window.__ignoreNextPopstate = true;
                    window.history.back();
                }
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
                        videoPreview.play().catch(() => { });
                    }
                    trimmerAudio.currentTime = trimmerStartTime;
                    trimmerAudio.play().catch(() => { });

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
                            videoPreview.play().catch(() => { });
                        }
                        trimmerAudio.currentTime = trimmerStartTime;
                        trimmerAudio.play().catch(() => { });

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
                            videoPreview.play().catch(() => { });
                        }
                        trimmerAudio.currentTime = trimmerStartTime;
                        trimmerAudio.play().catch(() => { });

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

                        // Transition history state active flag
                        if (window.__songPickerActive) {
                            window.__songPickerActive = false;
                            window.__cameraTrimmerActive = true;
                        }
                    };
                }

                songList.appendChild(item);
            });
        }
        window.initAudioTrimmer = initAudioTrimmer;

        function discardSongAndGoBackToPicker() {
            window.pendingStatusSongRef = null;
            updateSongBadgeVisibility();
            if (trimmerAudio) {
                trimmerAudio.pause();
                trimmerAudio.src = "";
            }
            if (trimmerOverlay) trimmerOverlay.style.display = "none";
            
            // Show picker sheet again
            if (pickerOverlay) {
                pickerOverlay.style.display = "flex";
                if (searchInput) {
                    searchInput.value = "";
                    searchInput.focus();
                }
            }
        }
        window.discardSongAndGoBackToPicker = discardSongAndGoBackToPicker;
    }

    function prefetchNextSegment() {
        if (!activeGroup || activeIndex < 0) return;
        const nextIdx = activeIndex + 1;
        if (nextIdx >= activeGroup.moments.length) return;

        const nextMoment = activeGroup.moments[nextIdx];
        const resolvedType = nextMoment.type || nextMoment.mediaType || (nextMoment.url ? (nextMoment.url.match(/\.(mp4|webm|ogg|mov)/i) ? "video" : "image") : "text");

        console.log(`[Prefetch] Preloading next status segment at index ${nextIdx} (Type: ${resolvedType})...`);

        if (resolvedType === "image" || resolvedType === "photo") {
            const prefetchImg = new Image();
            prefetchImg.src = nextMoment.url;
        } else if (resolvedType === "video") {
            if (prefetchVideoEl) {
                prefetchVideoEl.src = "";
                prefetchVideoEl.load();
                prefetchVideoEl = null;
            }

            prefetchVideoEl = document.createElement("video");
            prefetchVideoEl.preload = "auto";
            prefetchVideoEl.muted = true;
            
            prefetchVideoEl.onloadedmetadata = () => {
                console.log(`[Prefetch] Next video metadata loaded successfully.`);
            };

            prefetchVideoEl.src = nextMoment.url;
            prefetchVideoEl.load();
        }
    }

    function preloadVideoBuffer(video, targetBufferSec, onReady) {
        const loaderEl = document.getElementById("status-viewer-loader");
        if (loaderEl) loaderEl.style.display = "flex";

        let isReadyCalled = false;
        
        const checkBuffer = () => {
            if (isReadyCalled) return;

            const duration = video.duration || 0;
            if (!duration) return;

            const target = Math.min(duration * 0.25, targetBufferSec);
            
            let bufferedAhead = 0;
            const currentTime = video.currentTime;
            
            for (let i = 0; i < video.buffered.length; i++) {
                const start = video.buffered.start(i);
                const end = video.buffered.end(i);
                if (currentTime >= start && currentTime <= end) {
                    bufferedAhead = end - currentTime;
                    break;
                }
            }

            if (bufferedAhead >= target || bufferedAhead >= duration - 0.2) {
                isReadyCalled = true;
                clearInterval(bufferInterval);
                video.removeEventListener("progress", checkBuffer);
                video.removeEventListener("canplaythrough", checkBuffer);
                if (loaderEl) loaderEl.style.display = "none";
                onReady();
            }
        };

        video.addEventListener("progress", checkBuffer);
        video.addEventListener("canplaythrough", checkBuffer);

        const bufferInterval = setInterval(checkBuffer, 150);

        // Fallback timeout: if buffering doesn't reach the target within 1.5s, start playback anyway to prevent browser-paused download deadlock
        const fallbackTimeout = setTimeout(() => {
            if (isReadyCalled) return;
            console.warn("[preloadVideoBuffer] Buffering target not reached in 1.5s (fallback). Starting playback...");
            isReadyCalled = true;
            clearInterval(bufferInterval);
            video.removeEventListener("progress", checkBuffer);
            video.removeEventListener("canplaythrough", checkBuffer);
            if (loaderEl) loaderEl.style.display = "none";
            onReady();
        }, 1500);

        return () => {
            clearTimeout(fallbackTimeout);
            clearInterval(bufferInterval);
            video.removeEventListener("progress", checkBuffer);
            video.removeEventListener("canplaythrough", checkBuffer);
        };
    }

    window.isStatusUploading = async function() {
        if (!window.IndexedDBQueueService) return false;
        try {
            const items = await window.IndexedDBQueueService.getAllStatusUploads();
            return items.some(item => 
                item.status !== "status_pending_preview" && 
                !(item.status === "status_failed_upload" && item.retries >= 5)
            );
        } catch (e) {
            return false;
        }
    };
    window.showStatusSendingState = showStatusSendingState;

    window.openStatusPreviewForBlob = async function(blob, fileType) {
        // Construct a File object from the blob
        const extension = fileType.includes("video") ? "mp4" : "jpg";
        const mimeType = fileType.includes("video") ? "video/mp4" : "image/jpeg";
        const file = new File([blob], `status_${Date.now()}.${extension}`, { type: mimeType });

        // Save status pending upload in IndexedDB
        let tempId = null;
        if (typeof window.saveStatusPendingUpload === "function") {
            tempId = await window.saveStatusPendingUpload(file);
            window.currentStatusUploadId = tempId;
        }

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
                    videoPreview.play().catch(() => { });
                }
            } else {
                if (videoPreview) videoPreview.style.display = "none";
                if (imgPreview) {
                    imgPreview.src = url;
                    imgPreview.style.display = "block";
                }
            }
        }
    };

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

