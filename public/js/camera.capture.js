/**
 * camera.capture.js — Instagram-like camera capture (Photo/Video recording)
 * and auto-closing story viewer.
 */

(function () {
    let stream = null;
    let mediaRecorder = null;
    let recordedChunks = [];
    let recordStartTime = 0;
    let recordTimerInterval = null;
    let currentCameraFacing = "user"; // "user" or "environment"
    let currentCaptureMode = "photo"; // "photo" or "video"
    let capturedBlob = null;
    let capturedFileType = ""; // "image/jpeg" or "video/webm"
    let currentFlashMode = "off"; // "off", "on", "auto"
    
    // Story Viewer Timers
    let storyDurationTimer = null;
    let storyProgressInterval = null;

    // Camera Filter States & Preset Configurations
    let currentFilter = "normal";
    const FILTERS = [
        { name: "normal", label: "Normal", css: "none" },
        { name: "clarendon", label: "Clarendon", css: "contrast(1.2) saturate(1.35) brightness(1.1) hue-rotate(-5deg)" },
        { name: "juno", label: "Juno", css: "contrast(1.15) saturate(1.3) sepia(0.08) hue-rotate(-5deg) brightness(1.05)" },
        { name: "lark", label: "Lark", css: "brightness(1.08) contrast(0.95) saturate(1.15) hue-rotate(5deg)" },
        { name: "gingham", label: "Gingham", css: "brightness(1.05) contrast(0.9) saturate(0.85) sepia(0.18)" },
        { name: "crema", label: "Crema", css: "contrast(0.95) saturate(0.9) brightness(1.05) sepia(0.25) hue-rotate(-10deg)" },
        { name: "slumber", label: "Slumber", css: "brightness(1.05) contrast(0.9) saturate(0.8) sepia(0.35) hue-rotate(15deg)" },
        { name: "valencia", label: "Valencia", css: "contrast(1.08) saturate(1.08) sepia(0.25) brightness(1.05) hue-rotate(-5deg)" },
        { name: "inkwell", label: "Inkwell", css: "grayscale(1) contrast(1.15) brightness(1.05)" },
        { name: "glasses", label: "Glasses 🕶️", css: "none" },
        { name: "retro8mm", label: "8mm Film 📹", css: "sepia(0.3) contrast(0.9) saturate(0.9) brightness(0.95)" },
        { name: "time", label: "Time 🤍", css: "contrast(0.95) saturate(0.9) brightness(1.05) sepia(0.25)" },
        { name: "day", label: "Day 📅", css: "brightness(1.05) contrast(0.95) saturate(1.1) hue-rotate(5deg)" }
    ];

    function initCameraCapture() {
        const cameraBtn = document.getElementById("camera-btn-custom");
        if (cameraBtn) {
            if (cameraBtn.dataset.listenerAttached === "true") return;
            cameraBtn.dataset.listenerAttached = "true";
            cameraBtn.addEventListener("click", () => {
                // Close action options menu
                const actionsPopup = document.getElementById("chat-actions-popup");
                if (actionsPopup) {
                    actionsPopup.classList.remove("active");
                }
                openCameraCaptureOverlay();
            });
        }
    }
    window.initCameraCapture = initCameraCapture;

    function bindStaticCameraEvents() {
        // Overlay Close Button
        const closeBtn = document.getElementById("camera-capture-close-btn");
        if (closeBtn && closeBtn.dataset.listenerAttached !== "true") {
            closeBtn.dataset.listenerAttached = "true";
            closeBtn.addEventListener("click", closeCameraCaptureOverlay);
        }

        // Flash Toggle Button
        const flashBtn = document.getElementById("camera-capture-flash-btn");
        if (flashBtn && flashBtn.dataset.listenerAttached !== "true") {
            flashBtn.dataset.listenerAttached = "true";
            flashBtn.addEventListener("click", toggleFlashMode);
        }

        // Camera Flip Toggle Button
        const flipBtn = document.getElementById("camera-capture-flip-btn");
        if (flipBtn && flipBtn.dataset.listenerAttached !== "true") {
            flipBtn.dataset.listenerAttached = "true";
            flipBtn.addEventListener("click", toggleCameraFacing);
        }

        // PHOTO Mode Tab Button
        const tabPhoto = document.getElementById("camera-capture-tab-photo");
        if (tabPhoto && tabPhoto.dataset.listenerAttached !== "true") {
            tabPhoto.dataset.listenerAttached = "true";
            tabPhoto.addEventListener("click", () => setCaptureMode("photo"));
        }

        // VIDEO Mode Tab Button
        const tabVideo = document.getElementById("camera-capture-tab-video");
        if (tabVideo && tabVideo.dataset.listenerAttached !== "true") {
            tabVideo.dataset.listenerAttached = "true";
            tabVideo.addEventListener("click", () => setCaptureMode("video"));
        }

        // Trigger Button Action (Capture / Record)
        const triggerBtn = document.getElementById("camera-capture-trigger");
        if (triggerBtn && triggerBtn.dataset.listenerAttached !== "true") {
            triggerBtn.dataset.listenerAttached = "true";
            triggerBtn.addEventListener("click", handleTriggerAction);
        }

        // Retake Preview Action Button
        const retakeBtn = document.getElementById("camera-preview-retake-btn");
        if (retakeBtn && retakeBtn.dataset.listenerAttached !== "true") {
            retakeBtn.dataset.listenerAttached = "true";
            retakeBtn.addEventListener("click", resetCameraCaptureToLive);
        }

        // Send Captured File to Chat Action Button
        const sendBtn = document.getElementById("camera-preview-send-btn");
        if (sendBtn && sendBtn.dataset.listenerAttached !== "true") {
            sendBtn.dataset.listenerAttached = "true";
            sendBtn.addEventListener("click", sendCapturedMedia);
        }

        // Disappearing Story Viewer Close Actions
        const storyCloseX = document.getElementById("story-viewer-close");
        if (storyCloseX && storyCloseX.dataset.listenerAttached !== "true") {
            storyCloseX.dataset.listenerAttached = "true";
            storyCloseX.addEventListener("click", closeDisappearingStoryViewer);
        }

        // Initialize Filter Selector Options
        initCameraFilters();
    }

    // Call static bindings immediately on script execution
    bindStaticCameraEvents();

    /* =============================================================================
       CAMERA CONTROL LIFECYCLE
       ============================================================================= */
    async function openCameraCaptureOverlay() {
        const overlay = document.getElementById("camera-capture-overlay");
        if (!overlay) return;

        overlay.style.display = "flex";
        setCaptureMode("photo"); // reset default mode
        await startLiveCameraStream();
    }

    async function startLiveCameraStream() {
        stopLiveCameraStream();

        const videoEl = document.getElementById("camera-capture-video");
        if (!videoEl) return;

        // Try high quality constraints ladder
        const constraintsLadder = [
            {
                video: {
                    facingMode: currentCameraFacing,
                    width: { ideal: 1920 },
                    height: { ideal: 1080 },
                    frameRate: { ideal: 30 }
                },
                audio: {
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true
                }
            },
            {
                video: {
                    facingMode: currentCameraFacing,
                    width: { ideal: 1280 },
                    height: { ideal: 720 },
                    frameRate: { ideal: 30 }
                },
                audio: {
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true
                }
            },
            {
                video: {
                    facingMode: currentCameraFacing,
                    width: { ideal: 640 },
                    height: { ideal: 480 }
                },
                audio: true
            }
        ];

        let loadedStream = null;
        let lastError = null;

        for (const constraints of constraintsLadder) {
            try {
                loadedStream = await navigator.mediaDevices.getUserMedia(constraints);
                console.log("[Camera] Successfully obtained stream with constraints:", constraints);
                break;
            } catch (err) {
                console.warn("[Camera] Constraint selection failed, trying next fallback...", err);
                lastError = err;
            }
        }

        if (!loadedStream) {
            console.error("Camera access failed:", lastError);
            showToast("Failed to access camera", "error");
            closeCameraCaptureOverlay();
            return;
        }

        stream = loadedStream;
        videoEl.srcObject = stream;
        videoEl.style.display = "block";
        if (currentCameraFacing === "user") {
            videoEl.classList.add("mirrored-media");
        } else {
            videoEl.classList.remove("mirrored-media");
        }
        applyFilterToCaptureVideo();
        try {
            await videoEl.play();
        } catch (playErr) {
            console.warn("Camera video play failed:", playErr);
        }
    }

    function stopLiveCameraStream() {
        const videoEl = document.getElementById("camera-capture-video");
        if (videoEl) {
            videoEl.pause();
            videoEl.srcObject = null;
        }
        if (stream) {
            try {
                const videoTrack = stream.getVideoTracks()[0];
                if (videoTrack && typeof videoTrack.getCapabilities === "function") {
                    const capabilities = videoTrack.getCapabilities();
                    if (capabilities.torch) {
                        videoTrack.applyConstraints({ advanced: [{ torch: false }] }).catch(() => {});
                    }
                }
            } catch (err) {}
            stream.getTracks().forEach(track => track.stop());
            stream = null;
        }
        stopRecordingTimer();
    }

    function closeCameraCaptureOverlay() {
        stopLiveCameraStream();
        
        // Reset flash mode to off only when closing the camera modal
        currentFlashMode = "off";
        const flashBtn = document.getElementById("camera-capture-flash-btn");
        const badge = document.getElementById("camera-capture-flash-badge");
        if (flashBtn && badge) {
            flashBtn.title = "Flash Off";
            badge.textContent = "OFF";
            badge.style.background = "#4b5563";
            badge.style.color = "#fff";
        }

        const overlay = document.getElementById("camera-capture-overlay");
        if (overlay) {
            overlay.style.display = "none";
        }
        resetCameraCaptureToLive();
    }

    async function toggleCameraFacing() {
        currentCameraFacing = currentCameraFacing === "user" ? "environment" : "user";
        // Flip animation effect on trigger
        const flipBtn = document.getElementById("camera-capture-flip-btn");
        if (flipBtn) {
            flipBtn.style.transform = "rotate(180deg)";
            setTimeout(() => { flipBtn.style.transform = "none"; }, 300);
        }
        await startLiveCameraStream();
    }

    function toggleFlashMode() {
        const flashBtn = document.getElementById("camera-capture-flash-btn");
        const badge = document.getElementById("camera-capture-flash-badge");
        if (!flashBtn || !badge) return;

        if (currentFlashMode === "off") {
            currentFlashMode = "on";
            flashBtn.title = "Flash On";
            badge.textContent = "ON";
            badge.style.background = "#eab308";
            badge.style.color = "#000";
        } else if (currentFlashMode === "on") {
            currentFlashMode = "auto";
            flashBtn.title = "Auto Flash";
            badge.textContent = "AUTO";
            badge.style.background = "#a855f7";
            badge.style.color = "#fff";
        } else {
            currentFlashMode = "off";
            flashBtn.title = "Flash Off";
            badge.textContent = "OFF";
            badge.style.background = "#4b5563";
            badge.style.color = "#fff";
        }
        console.log("[Camera] Flash mode changed to:", currentFlashMode);
    }

    function checkIsDark() {
        const videoEl = document.getElementById("camera-capture-video");
        if (!videoEl || videoEl.paused || videoEl.ended) return false;
        try {
            const canvas = document.createElement("canvas");
            canvas.width = 16;
            canvas.height = 16;
            const ctx = canvas.getContext("2d");
            ctx.drawImage(videoEl, 0, 0, 16, 16);
            const imgData = ctx.getImageData(0, 0, 16, 16).data;
            let totalLuminance = 0;
            for (let i = 0; i < imgData.length; i += 4) {
                const r = imgData[i];
                const g = imgData[i+1];
                const b = imgData[i+2];
                const luminance = 0.299 * r + 0.587 * g + 0.114 * b;
                totalLuminance += luminance;
            }
            const avgLuminance = totalLuminance / (imgData.length / 4);
            console.log("[Camera] Average stream luminance:", avgLuminance);
            return avgLuminance < 65;
        } catch (e) {
            console.warn("[Camera] Ambient light calculation failed, defaulting to dark:", e);
            return true;
        }
    }

    async function enableHardwareTorch(enable) {
        if (!stream) return false;
        const videoTrack = stream.getVideoTracks()[0];
        if (!videoTrack) return false;
        try {
            const capabilities = typeof videoTrack.getCapabilities === "function" ? videoTrack.getCapabilities() : {};
            if (capabilities.torch) {
                await videoTrack.applyConstraints({
                    advanced: [{ torch: !!enable }]
                });
                console.log(`[Camera] Hardware torch set to: ${enable}`);
                return true;
            } else {
                console.log("[Camera] Hardware torch is not supported on this track/device.");
            }
        } catch (err) {
            console.warn("[Camera] Failed to apply torch constraint:", err);
        }
        return false;
    }

    function setCaptureMode(mode) {
        currentCaptureMode = mode;
        const tabPhoto = document.getElementById("camera-capture-tab-photo");
        const tabVideo = document.getElementById("camera-capture-tab-video");
        const triggerInner = document.getElementById("camera-capture-trigger-inner");

        if (mode === "photo") {
            if (tabPhoto) {
                tabPhoto.style.color = "#fff";
                tabPhoto.style.opacity = "1";
                tabPhoto.style.borderBottomColor = "#a855f7";
            }
            if (tabVideo) {
                tabVideo.style.color = "#aaa";
                tabVideo.style.opacity = "0.7";
                tabVideo.style.borderBottomColor = "transparent";
            }
            if (triggerInner) {
                triggerInner.style.background = "#a855f7";
                triggerInner.style.borderRadius = "50%";
            }
        } else {
            if (tabVideo) {
                tabVideo.style.color = "#fff";
                tabVideo.style.opacity = "1";
                tabVideo.style.borderBottomColor = "#a855f7";
            }
            if (tabPhoto) {
                tabPhoto.style.color = "#aaa";
                tabPhoto.style.opacity = "0.7";
                tabPhoto.style.borderBottomColor = "transparent";
            }
            if (triggerInner) {
                triggerInner.style.background = "#ef4444";
                triggerInner.style.borderRadius = "50%";
            }
        }
    }

    /* =============================================================================
       CAPTURE AND RECORDING HANDLING
       ============================================================================= */
    function handleTriggerAction() {
        if (currentCaptureMode === "photo") {
            takePhotoSnapshot();
        } else {
            if (mediaRecorder && mediaRecorder.state === "recording") {
                stopVideoRecording();
            } else {
                startVideoRecording();
            }
        }
    }

    async function takePhotoSnapshot() {
        const videoEl = document.getElementById("camera-capture-video");
        const imgPreview = document.getElementById("camera-capture-img-preview");
        const screenFlash = document.getElementById("camera-screen-flash");
        if (!videoEl || !imgPreview) return;

        const isDark = checkIsDark();
        const shouldFlash = currentFlashMode === "on" || (currentFlashMode === "auto" && isDark);

        if (shouldFlash) {
            console.log("[Camera] Flash active. Triggering hardware and screen overlay flash.");
            if (screenFlash) {
                screenFlash.style.display = "block";
                screenFlash.style.opacity = "0.95";
            }
            await enableHardwareTorch(true);
            
            // Wait for camera stream to recover from applyConstraints black/blank transition
            const startTime = Date.now();
            while (Date.now() - startTime < 800) {
                const tempCanvas = document.createElement("canvas");
                tempCanvas.width = 1;
                tempCanvas.height = 1;
                const tempCtx = tempCanvas.getContext("2d");
                tempCtx.drawImage(videoEl, 0, 0, 1, 1);
                const pixel = tempCtx.getImageData(0, 0, 1, 1).data;
                const brightness = 0.299 * pixel[0] + 0.587 * pixel[1] + 0.114 * pixel[2];
                if (brightness > 2) {
                    console.log(`[Camera] Stream recovered after ${Date.now() - startTime}ms (brightness: ${brightness})`);
                    break;
                }
                await new Promise(r => setTimeout(r, 30));
            }
            
            // Ensure the total stabilization/exposure adjustment delay is at least 650ms
            const elapsed = Date.now() - startTime;
            const remaining = Math.max(0, 650 - elapsed);
            if (remaining > 0) {
                await new Promise(resolve => setTimeout(resolve, remaining));
            }
        }

        // Capture snapshot canvas frame
        const canvas = document.createElement("canvas");
        canvas.width = videoEl.videoWidth || 640;
        canvas.height = videoEl.videoHeight || 480;
        const ctx = canvas.getContext("2d");
        
        // Enable high-quality image smoothing
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = "high";
        
        // Apply canvas context filter matching current selected filter
        const activeFilter = FILTERS.find(f => f.name === currentFilter);
        let filterCss = activeFilter ? activeFilter.css : "none";
        if (shouldFlash) {
            if (filterCss === "none") {
                filterCss = "brightness(1.2) contrast(1.05)";
            } else {
                filterCss += " brightness(1.2) contrast(1.05)";
            }
        }
        ctx.filter = filterCss;

        // Draw camera frame (mirrored if using front camera)
        ctx.save();
        if (currentCameraFacing === "user") {
            ctx.translate(canvas.width, 0);
            ctx.scale(-1, 1);
        }
        ctx.drawImage(videoEl, 0, 0, canvas.width, canvas.height);
        ctx.restore();

        if (shouldFlash) {
            await enableHardwareTorch(false);
            if (screenFlash) {
                screenFlash.style.opacity = "0";
                setTimeout(() => {
                    screenFlash.style.display = "none";
                }, 150);
            }
        }

        // Helper to output to blob and preview once all baking is done
        const bakeOverlaysAndSave = () => {
            canvas.toBlob((blob) => {
                if (!blob) return;
                capturedBlob = blob;
                capturedFileType = "image/jpeg";
                
                const objectUrl = URL.createObjectURL(blob);
                imgPreview.src = objectUrl;
                imgPreview.style.display = "block";
                videoEl.style.display = "none";
                
                showPreviewStateControls();
                stopLiveCameraStream();
                // Hide floating overlays during photo preview since they are already baked into the photo pixels!
                updateCameraOverlayVisibility(false);
            }, "image/jpeg", 1.0);
        };

        // Bake overlays into photo based on active filter
        if (currentFilter === "glasses") {
            const svgString = `
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 60" width="200" height="60">
                <path d="M10 25 C10 10, 80 10, 85 25 C90 40, 15 40, 10 25 Z" fill="#181818" stroke="#d4af37" stroke-width="1.8" />
                <text x="47" y="29" fill="#fff" font-size="9" font-family="sans-serif" text-anchor="middle" font-weight="bold" letter-spacing="1.5">vibes</text>
                <path d="M115 25 C120 10, 190 10, 190 25 C185 40, 110 40, 115 25 Z" fill="#181818" stroke="#d4af37" stroke-width="1.8" />
                <text x="152" y="29" fill="#fff" font-size="9" font-family="sans-serif" text-anchor="middle" font-weight="bold" letter-spacing="1.5">vibes</text>
                <path d="M85 22 Q100 15 115 22" fill="none" stroke="#d4af37" stroke-width="2.2" />
                <path d="M10 22 C3 22, 1 12, 1 12" fill="none" stroke="#d4af37" stroke-width="1.5" />
                <path d="M190 22 C197 22, 199 12, 199 12" fill="none" stroke="#d4af37" stroke-width="1.5" />
            </svg>
            `;
            const img = new Image();
            const svgBlob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
            const url = URL.createObjectURL(svgBlob);
            img.onload = () => {
                const glassesWidth = canvas.width * 0.45;
                const glassesHeight = glassesWidth * (60 / 200);
                const glassesX = (canvas.width - glassesWidth) / 2;
                const glassesY = canvas.height * 0.4 - glassesHeight / 2;
                ctx.drawImage(img, glassesX, glassesY, glassesWidth, glassesHeight);
                URL.revokeObjectURL(url);
                bakeOverlaysAndSave();
            };
            img.src = url;
        } else if (currentFilter === "retro8mm") {
            const borderWidth = Math.max(15, canvas.width * 0.035);
            ctx.fillStyle = "#000000";
            ctx.fillRect(0, 0, canvas.width, borderWidth);
            ctx.fillRect(0, canvas.height - borderWidth, canvas.width, borderWidth);
            ctx.fillRect(0, 0, borderWidth, canvas.height);
            ctx.fillRect(canvas.width - borderWidth, 0, borderWidth, canvas.height);

            // sprocket holes
            ctx.fillStyle = "#222222";
            const numHoles = 10;
            const holeWidth = borderWidth * 0.25;
            const holeHeight = holeWidth * 2.2;
            const holeXLeft = borderWidth * 0.25;
            const holeXRight = canvas.width - borderWidth * 0.55;
            for (let i = 0; i < numHoles; i++) {
                const holeY = (canvas.height / numHoles) * (i + 0.5) - holeHeight / 2;
                ctx.fillRect(holeXLeft, holeY, holeWidth, holeHeight);
                ctx.fillRect(holeXRight, holeY, holeWidth, holeHeight);
            }
            bakeOverlaysAndSave();
        } else if (currentFilter === "time") {
            const now = new Date();
            let hours = now.getHours();
            const ampm = hours >= 12 ? 'pm' : 'am';
            hours = hours % 12;
            hours = hours ? hours : 12;
            const minutes = now.getMinutes().toString().padStart(2, '0');
            const timeStr = `${hours}:${minutes} ${ampm}`;

            const fontSize = Math.max(16, canvas.width * 0.045);
            ctx.font = `italic ${fontSize}px Georgia, serif`;
            ctx.fillStyle = "#ffffff";
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.shadowColor = "rgba(0, 0, 0, 0.8)";
            ctx.shadowBlur = 8;
            ctx.shadowOffsetX = 0;
            ctx.shadowOffsetY = 2;
            ctx.fillText(`life at ${timeStr} 🤍`, canvas.width / 2, canvas.height / 2);
            ctx.shadowColor = "transparent";
            ctx.shadowBlur = 0;
            ctx.shadowOffsetX = 0;
            ctx.shadowOffsetY = 0;
            bakeOverlaysAndSave();
        } else if (currentFilter === "day") {
            const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
            const dayStr = days[new Date().getDay()];
            const dayFontSize = Math.max(26, canvas.width * 0.065);
            ctx.font = `900 ${dayFontSize}px 'Arial Black', sans-serif`;
            ctx.fillStyle = "#ffffff";
            ctx.textAlign = "center";
            ctx.textBaseline = "alphabetic";
            ctx.shadowColor = "rgba(0, 0, 0, 0.9)";
            ctx.shadowBlur = 10;
            ctx.shadowOffsetX = 0;
            ctx.shadowOffsetY = 4;
            const dayY = canvas.height - Math.max(120, canvas.height * 0.15);
            ctx.fillText(dayStr.toUpperCase(), canvas.width / 2, dayY);
            ctx.shadowColor = "transparent";
            ctx.shadowBlur = 0;
            ctx.shadowOffsetX = 0;
            ctx.shadowOffsetY = 0;
            bakeOverlaysAndSave();
        } else {
            bakeOverlaysAndSave();
        }
    }

    async function startVideoRecording() {
        if (!stream) return;
        recordedChunks = [];

        const isDark = checkIsDark();
        const shouldFlash = currentFlashMode === "on" || (currentFlashMode === "auto" && isDark);
        if (shouldFlash) {
            console.log("[Camera] Video recording starting with flash (torch).");
            await enableHardwareTorch(true);
        }
        
        // Use optimal recording options
        let options = { 
            mimeType: "video/webm;codecs=vp9,opus",
            videoBitsPerSecond: 3000000,
            audioBitsPerSecond: 128000
        };
        if (!MediaRecorder.isTypeSupported(options.mimeType)) {
            options = { 
                mimeType: "video/webm;codecs=vp8,opus",
                videoBitsPerSecond: 3000000,
                audioBitsPerSecond: 128000
            };
        }
        if (!MediaRecorder.isTypeSupported(options.mimeType)) {
            options = { 
                mimeType: "video/mp4",
                videoBitsPerSecond: 3000000,
                audioBitsPerSecond: 128000
            };
        }

        try {
            mediaRecorder = new MediaRecorder(stream, options);
        } catch (e) {
            // fallback to default supported options
            mediaRecorder = new MediaRecorder(stream);
        }

        mediaRecorder.ondataavailable = (e) => {
            if (e.data && e.data.size > 0) {
                recordedChunks.push(e.data);
            }
        };

        mediaRecorder.onstop = () => {
            capturedBlob = new Blob(recordedChunks, { type: mediaRecorder.mimeType });
            capturedFileType = capturedBlob.type;
            
            const videoPreview = document.getElementById("camera-capture-video-preview");
            const videoEl = document.getElementById("camera-capture-video");
            if (videoPreview && videoEl) {
                const objectUrl = URL.createObjectURL(capturedBlob);
                videoPreview.src = objectUrl;
                videoPreview.style.display = "block";
                if (currentCameraFacing === "user") {
                    videoPreview.classList.add("mirrored-media");
                } else {
                    videoPreview.classList.remove("mirrored-media");
                }
                videoEl.style.display = "none";
                videoPreview.play();
            }
            
            showPreviewStateControls();
            stopLiveCameraStream();
        };

        mediaRecorder.start();
        
        // Start record timer
        recordStartTime = Date.now();
        const timerEl = document.getElementById("camera-capture-timer");
        if (timerEl) {
            timerEl.textContent = "0:00";
            timerEl.style.display = "block";
        }

        const triggerInner = document.getElementById("camera-capture-trigger-inner");
        if (triggerInner) {
            triggerInner.style.transform = "scale(0.7)";
            triggerInner.style.borderRadius = "4px";
        }

        recordTimerInterval = setInterval(updateRecordingTimer, 500);
    }

    async function stopVideoRecording() {
        if (mediaRecorder && mediaRecorder.state === "recording") {
            mediaRecorder.stop();
        }
        await enableHardwareTorch(false);
        stopRecordingTimer();
    }

    function updateRecordingTimer() {
        const elapsed = Math.floor((Date.now() - recordStartTime) / 1000);
        const mins = Math.floor(elapsed / 60);
        const secs = elapsed % 60;
        const timerEl = document.getElementById("camera-capture-timer");
        if (timerEl) {
            timerEl.textContent = `${mins}:${secs.toString().padStart(2, "0")}`;
        }
        
        // Limit maximum story video length to 60 seconds
        if (elapsed >= 60) {
            stopVideoRecording();
        }
    }

    function stopRecordingTimer() {
        if (recordTimerInterval) {
            clearInterval(recordTimerInterval);
            recordTimerInterval = null;
        }
        const timerEl = document.getElementById("camera-capture-timer");
        if (timerEl) {
            timerEl.style.display = "none";
        }
        const triggerInner = document.getElementById("camera-capture-trigger-inner");
        if (triggerInner) {
            triggerInner.style.transform = "none";
            triggerInner.style.borderRadius = "50%";
        }
    }

    /* =============================================================================
       PREVIEW & SEND FLOWS
       ============================================================================= */
    function showPreviewStateControls() {
        const actionControls = document.getElementById("camera-capture-controls-section");
        const previewControls = document.getElementById("camera-preview-controls-section");
        if (actionControls) actionControls.style.display = "none";
        if (previewControls) previewControls.style.display = "flex";
    }

    function resetCameraCaptureToLive() {
        const actionControls = document.getElementById("camera-capture-controls-section");
        const previewControls = document.getElementById("camera-preview-controls-section");
        const imgPreview = document.getElementById("camera-capture-img-preview");
        const videoPreview = document.getElementById("camera-capture-video-preview");
        const videoEl = document.getElementById("camera-capture-video");

        if (actionControls) actionControls.style.display = "flex";
        if (previewControls) previewControls.style.display = "none";

        if (imgPreview) {
            imgPreview.src = "";
            imgPreview.style.display = "none";
        }
        if (videoPreview) {
            videoPreview.pause();
            videoPreview.src = "";
            videoPreview.style.display = "none";
            videoPreview.classList.remove("mirrored-media");
        }

        currentFilter = "normal";
        selectCameraFilter("normal");


        capturedBlob = null;
        capturedFileType = "";

        if (videoEl) {
            videoEl.style.display = "block";
        }

        // restart stream if modal is still active
        const overlay = document.getElementById("camera-capture-overlay");
        if (overlay && overlay.style.display !== "none") {
            startLiveCameraStream();
        }
    }

    async function sendCapturedMedia() {
        if (!capturedBlob || !State.activeChat) return;

        const sendBtn = document.getElementById("camera-preview-send-btn");
        if (sendBtn) {
            sendBtn.disabled = true;
            sendBtn.style.opacity = "0.5";
            sendBtn.textContent = "Uploading...";
        }

        const extension = capturedFileType.includes("video") ? "webm" : "jpg";
        const file = new File([capturedBlob], `captured-story-${Date.now()}.${extension}`, { type: capturedFileType });
        
        closeCameraCaptureOverlay();
        
        try {
            await uploadCapturedDisappearingMedia(file);
        } catch (err) {
            console.error("Failed to send disappearing media:", err);
            showToast("Failed to upload recorded file", "error");
        } finally {
            if (sendBtn) {
                sendBtn.disabled = false;
                sendBtn.style.opacity = "1";
                sendBtn.textContent = "Send to Chat";
            }
        }
    }

    async function uploadCapturedDisappearingMedia(file) {
        const to = State.activeChat;
        const mediaType = file.type.startsWith("image/") ? "image" : "video";
        const tempId = generateId();

        const message = {
            tempId,
            type: mediaType,
            content: URL.createObjectURL(file), // temporary URL for local UI display
            fileName: file.name,
            fileSize: file.size,
            uploadStatus: "uploading",
            caption: null,
            clientTime: Date.now(),
            replyTo: State.replyingTo,
            user: State.currentUser.id || State.currentUser._id,
            status: { sent: false, delivered: false, seen: false },
            isDisappearing: true,
            cameraFacing: currentCameraFacing,
            cameraFilter: currentFilter,
            timestamp: Date.now()
        };

        if (!State.messages[to]) State.messages[to] = [];
        State.messages[to].unshift(message);
        State.messageIndex[tempId] = to;

        document.getElementById("messages").appendChild(createMessageElement(message));
        document.getElementById("messages-container").scrollTop = 99999;

        const conv = State.conversations.find(c => c.id === to);
        if (conv) {
            conv.lastMessage = formatLastMessage(message);
            conv.timestamp = message.timestamp;
        }
        if (typeof renderChatList === "function") {
            renderChatList(document.getElementById("chat-search")?.value.trim().toLowerCase() || "");
        }

        // Start upload
        UploadManager.add(async () => {
            const controller = new AbortController();
            UploadControllers[tempId] = controller;
            UploadQueue.add(tempId, { tempId, receiver: to, file, type: mediaType });

            try {
                // Chunk upload helper from input.js
                const data = await uploadFileInChunks(file, tempId);
                const realUrl = data.original;
                const cover = data.cover_270 || null;
                const thumb = data.thumb_50 || null;
                const realType = data.type || mediaType;

                const chatId = State.messageIndex[tempId];
                const msg = chatId ? (State.messages[chatId] || []).find(m => m.tempId === tempId) : null;
                if (msg) {
                    msg.content = realUrl;
                    msg.cover = cover;
                    msg.thumb = thumb;
                    msg.type = realType;
                    msg.uploadStatus = "uploaded";
                    msg.status = { sent: true, delivered: false, seen: false };
                }

                updateMediaDOM(tempId, { content: realUrl, cover, thumb, type: realType, uploadStatus: "uploaded", fileName: file.name, fileSize: file.size });

                if (socket && socket.connected) {
                    socket.emit("private_message", {
                        message: {
                            tempId,
                            to,
                            type: realType,
                            content: realUrl,
                            caption: null,
                            replyTo: null,
                            fileName: file.name,
                            fileSize: file.size,
                            clientTime: Date.now(),
                            cover,
                            thumb,
                            isDisappearing: true,
                            cameraFacing: message.cameraFacing,
                            cameraFilter: message.cameraFilter
                        }
                    });
                }

                UploadQueue.remove(tempId);
            } catch (err) {
                updateMessageByTempId(tempId, { uploadStatus: "failed" });
                throw err;
            } finally {
                delete UploadControllers[tempId];
            }
        });
    }

    /* =============================================================================
       DISAPPEARING STORY VIEWER OVERLAY
       ============================================================================= */
    function openDisappearingStoryViewer(details) {
        const viewer = document.getElementById("disappearing-story-viewer");
        const img = document.getElementById("story-viewer-img");
        const video = document.getElementById("story-viewer-video");
        const avatar = document.getElementById("story-viewer-avatar");
        const username = document.getElementById("story-viewer-username");
        const progressBar = document.getElementById("story-progress-bar");

        if (!viewer || !img || !video || !avatar || !username) return;

        // Set Header details
        avatar.src = details.avatar || "/images/default-avatar.png";
        username.textContent = details.username || "Friend";

        // Reset display
        img.style.display = "none";
        video.style.display = "none";
        img.src = "";
        video.src = "";
        
        if (progressBar) {
            progressBar.style.width = "0%";
        }

        // Initially hide all story graphic overlays
        const storyGlasses = document.getElementById("story-overlay-glasses");
        const storyRetro8mm = document.getElementById("story-overlay-retro8mm");
        const storyTime = document.getElementById("story-overlay-time");
        const storyDay = document.getElementById("story-overlay-day");

        if (storyGlasses) storyGlasses.style.display = "none";
        if (storyRetro8mm) storyRetro8mm.style.display = "none";
        if (storyTime) storyTime.style.display = "none";
        if (storyDay) storyDay.style.display = "none";

        viewer.style.display = "flex";

        if (details.type === "video") {
            video.src = details.src;
            video.style.display = "block";
            if (details.cameraFacing === "user") {
                video.classList.add("mirrored-media");
            } else {
                video.classList.remove("mirrored-media");
            }
            
            // Apply story viewer playback filter class
            const filterClasses = FILTERS.map(f => `filter-${f.name}`);
            video.classList.remove(...filterClasses);
            if (details.cameraFilter) {
                video.classList.add(`filter-${details.cameraFilter}`);
            }

            // Show appropriate graphical overlay for video stories
            if (details.cameraFilter === "glasses" && storyGlasses) {
                storyGlasses.style.display = "block";
            } else if (details.cameraFilter === "retro8mm" && storyRetro8mm) {
                storyRetro8mm.style.display = "block";
            } else if (details.cameraFilter === "time" && storyTime) {
                const msgTime = new Date(details.timestamp || Date.now());
                let hours = msgTime.getHours();
                const ampm = hours >= 12 ? 'pm' : 'am';
                hours = hours % 12;
                hours = hours ? hours : 12;
                const minutes = msgTime.getMinutes().toString().padStart(2, '0');
                const timeStr = `${hours}:${minutes} ${ampm}`;
                const valEl = storyTime.querySelector(".story-time-val");
                if (valEl) valEl.textContent = timeStr;
                storyTime.style.display = "block";
            } else if (details.cameraFilter === "day" && storyDay) {
                const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
                const msgTime = new Date(details.timestamp || Date.now());
                const dayStr = days[msgTime.getDay()];
                const valEl = storyDay.querySelector(".story-day-val");
                if (valEl) valEl.textContent = dayStr;
                storyDay.style.display = "block";
            }
            
            // Wait for video meta to initialize timing
            video.onloadedmetadata = () => {
                const duration = video.duration || 10;
                video.play();
                startStoryProgressTracking(duration * 1000);
                
                // Track chat video data usage
                if (details.fileSize && window.DataUsageTracker && window.DataUsageTracker.trackFeature) {
                    window.DataUsageTracker.trackFeature('chatVideo', details.fileSize);
                    details.fileSize = 0; // Prevent double tracking if replay
                }
            };

            video.onended = () => {
                closeDisappearingStoryViewer();
            };

            video.onerror = () => {
                showToast("Failed to play video story", "error");
                closeDisappearingStoryViewer();
            };
        } else {
            // Photo story (overlays are already baked into the JPEG, so no floating HTML overlays needed!)
            img.src = details.src;
            img.style.display = "block";
            startStoryProgressTracking(10000); // exactly 10 seconds countdown
        }
    }

    function startStoryProgressTracking(durationMs) {
        const progressBar = document.getElementById("story-progress-bar");
        if (!progressBar) return;

        const startTime = Date.now();
        progressBar.style.width = "0%";

        storyProgressInterval = setInterval(() => {
            const elapsed = Date.now() - startTime;
            const percentage = Math.min(100, (elapsed / durationMs) * 100);
            progressBar.style.width = `${percentage}%`;
        }, 30);

        storyDurationTimer = setTimeout(() => {
            closeDisappearingStoryViewer();
        }, durationMs);
    }

    function closeDisappearingStoryViewer() {
        const viewer = document.getElementById("disappearing-story-viewer");
        const video = document.getElementById("story-viewer-video");
        const img = document.getElementById("story-viewer-img");

        if (viewer) {
            viewer.style.display = "none";
        }
        if (video) {
            // Nullify handlers first to prevent browser from firing error event when source is cleared
            video.onloadedmetadata = null;
            video.onended = null;
            video.onerror = null;

            video.pause();
            video.src = "";
            video.removeAttribute("src");
            try {
                video.load();
            } catch (e) {}
            video.style.display = "none";
            video.classList.remove("mirrored-media");
            
            // Clean up filter classes on close
            const filterClasses = FILTERS.map(f => `filter-${f.name}`);
            video.classList.remove(...filterClasses);
        }
        if (img) {
            img.src = "";
        }

        // Hide all active story graphic overlays
        const storyGlasses = document.getElementById("story-overlay-glasses");
        const storyRetro8mm = document.getElementById("story-overlay-retro8mm");
        const storyTime = document.getElementById("story-overlay-time");
        const storyDay = document.getElementById("story-overlay-day");

        if (storyGlasses) storyGlasses.style.display = "none";
        if (storyRetro8mm) storyRetro8mm.style.display = "none";
        if (storyTime) storyTime.style.display = "none";
        if (storyDay) storyDay.style.display = "none";

        // Clean up intervals
        if (storyDurationTimer) {
            clearTimeout(storyDurationTimer);
            storyDurationTimer = null;
        }
        if (storyProgressInterval) {
            clearInterval(storyProgressInterval);
            storyProgressInterval = null;
        }
    }

    // Expose openStoryViewer globally for chat.js actions
    window.openDisappearingStoryViewer = openDisappearingStoryViewer;

    /* =============================================================================
       FILTER ENGINE METHODS
       ============================================================================= */
    function initCameraFilters() {
        const bar = document.getElementById("camera-filter-bar");
        if (!bar) return;
        
        bar.innerHTML = "";
        FILTERS.forEach(f => {
            const opt = document.createElement("div");
            opt.className = `filter-option ${f.name === currentFilter ? 'active' : ''}`;
            opt.dataset.filter = f.name;
            
            const preview = document.createElement("div");
            preview.className = "filter-option-preview";
            
            // Generate distinct colorful backgrounds for filter icons
            let gradient = "";
            if (f.name === "normal") gradient = "linear-gradient(45deg, #7c3aed, #db2777)";
            else if (f.name === "clarendon") gradient = "linear-gradient(45deg, #3b82f6, #06b6d4)";
            else if (f.name === "juno") gradient = "linear-gradient(45deg, #f97316, #e11d48)";
            else if (f.name === "lark") gradient = "linear-gradient(45deg, #10b981, #60a5fa)";
            else if (f.name === "gingham") gradient = "linear-gradient(45deg, #a8a29e, #e7e5e4)";
            else if (f.name === "crema") gradient = "linear-gradient(45deg, #f5e0c3, #c49a6c)";
            else if (f.name === "slumber") gradient = "linear-gradient(45deg, #a3e635, #ca8a04)";
            else if (f.name === "valencia") gradient = "linear-gradient(45deg, #facc15, #ea580c)";
            else if (f.name === "inkwell") gradient = "linear-gradient(45deg, #374151, #f3f4f6)";
            else if (f.name === "glasses") gradient = "linear-gradient(45deg, #f59e0b, #d97706)";
            else if (f.name === "retro8mm") gradient = "linear-gradient(45deg, #78716c, #44403c)";
            else if (f.name === "time") gradient = "linear-gradient(45deg, #ec4899, #f43f5e)";
            else if (f.name === "day") gradient = "linear-gradient(45deg, #8b5cf6, #6366f1)";
            
            preview.style.background = gradient;
            preview.style.filter = f.css;
            
            const label = document.createElement("span");
            label.className = "filter-option-label";
            label.textContent = f.label;
            
            opt.appendChild(preview);
            opt.appendChild(label);
            
            opt.addEventListener("click", () => {
                selectCameraFilter(f.name);
            });
            
            bar.appendChild(opt);
        });

        // Horizontal mouse-wheel scroll support
        bar.addEventListener("wheel", (e) => {
            if (e.deltaY !== 0) {
                e.preventDefault();
                bar.scrollLeft += e.deltaY;
            }
        });

        // Horizontal mouse drag-to-scroll support
        let isDown = false;
        let startX;
        let scrollLeft;
        let dragThreshold = 5;
        let moved = false;

        bar.addEventListener("mousedown", (e) => {
            isDown = true;
            startX = e.pageX - bar.offsetLeft;
            scrollLeft = bar.scrollLeft;
            moved = false;
        });

        bar.addEventListener("mouseleave", () => {
            isDown = false;
        });

        bar.addEventListener("mouseup", () => {
            isDown = false;
        });

        bar.addEventListener("mousemove", (e) => {
            if (!isDown) return;
            const x = e.pageX - bar.offsetLeft;
            const walk = (x - startX) * 1.5;
            if (Math.abs(walk) > dragThreshold) {
                moved = true;
                e.preventDefault();
                bar.scrollLeft = scrollLeft - walk;
            }
        });

        // Intercept clicks during/after dragging
        bar.addEventListener("click", (e) => {
            if (moved) {
                e.preventDefault();
                e.stopPropagation();
            }
        }, true);
    }

    function selectCameraFilter(filterName) {
        currentFilter = filterName;
        
        // Update selection UI highlight
        const options = document.querySelectorAll(".filter-option");
        options.forEach(opt => {
            if (opt.dataset.filter === filterName) {
                opt.classList.add("active");
            } else {
                opt.classList.remove("active");
            }
        });
        
        applyFilterToCaptureVideo();
    }

    function applyFilterToCaptureVideo() {
        const videoEl = document.getElementById("camera-capture-video");
        const videoPreview = document.getElementById("camera-capture-video-preview");
        const filterClasses = FILTERS.map(f => `filter-${f.name}`);
        
        if (videoEl) {
            videoEl.classList.remove(...filterClasses);
            videoEl.classList.add(`filter-${currentFilter}`);
        }
        
        if (videoPreview) {
            videoPreview.classList.remove(...filterClasses);
            videoPreview.classList.add(`filter-${currentFilter}`);
        }

        const imgPreview = document.getElementById("camera-capture-img-preview");
        const isPhotoPreview = imgPreview && imgPreview.style.display !== "none";
        updateCameraOverlayVisibility(!isPhotoPreview);
    }

    function updateCameraOverlayVisibility(showOverlays = true) {
        const glasses = document.getElementById("overlay-glasses");
        const retro8mm = document.getElementById("overlay-retro8mm");
        const time = document.getElementById("overlay-time");
        const day = document.getElementById("overlay-day");

        if (glasses) glasses.style.display = "none";
        if (retro8mm) retro8mm.style.display = "none";
        if (time) time.style.display = "none";
        if (day) day.style.display = "none";

        if (!showOverlays) return;

        if (currentFilter === "glasses" && glasses) {
            glasses.style.display = "block";
        } else if (currentFilter === "retro8mm" && retro8mm) {
            retro8mm.style.display = "block";
        } else if (currentFilter === "time" && time) {
            const now = new Date();
            let hours = now.getHours();
            const ampm = hours >= 12 ? 'pm' : 'am';
            hours = hours % 12;
            hours = hours ? hours : 12;
            const minutes = now.getMinutes().toString().padStart(2, '0');
            const timeStr = `${hours}:${minutes} ${ampm}`;
            const valEl = time.querySelector(".dynamic-time-val");
            if (valEl) valEl.textContent = timeStr;
            time.style.display = "block";
        } else if (currentFilter === "day" && day) {
            const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
            const dayStr = days[nowDayIndex()];
            const valEl = day.querySelector(".dynamic-day-val");
            if (valEl) valEl.textContent = dayStr;
            day.style.display = "block";
        }
    }

    function nowDayIndex() {
        return new Date().getDay();
    }
})();
