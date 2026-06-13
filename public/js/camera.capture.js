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
    
    // Story Viewer Timers
    let storyDurationTimer = null;
    let storyProgressInterval = null;

    document.addEventListener("DOMContentLoaded", () => {
        // Wire custom camera button in actions menu
        const cameraBtn = document.getElementById("camera-btn-custom");
        if (cameraBtn) {
            cameraBtn.addEventListener("click", () => {
                // Close action options menu
                const actionsPopup = document.getElementById("chat-actions-popup");
                if (actionsPopup) {
                    actionsPopup.classList.remove("active");
                }
                openCameraCaptureOverlay();
            });
        }

        // Overlay Close Button
        const closeBtn = document.getElementById("camera-capture-close-btn");
        if (closeBtn) {
            closeBtn.addEventListener("click", closeCameraCaptureOverlay);
        }

        // Camera Flip Toggle Button
        const flipBtn = document.getElementById("camera-capture-flip-btn");
        if (flipBtn) {
            flipBtn.addEventListener("click", toggleCameraFacing);
        }

        // PHOTO Mode Tab Button
        const tabPhoto = document.getElementById("camera-capture-tab-photo");
        if (tabPhoto) {
            tabPhoto.addEventListener("click", () => setCaptureMode("photo"));
        }

        // VIDEO Mode Tab Button
        const tabVideo = document.getElementById("camera-capture-tab-video");
        if (tabVideo) {
            tabVideo.addEventListener("click", () => setCaptureMode("video"));
        }

        // Trigger Button Action (Capture / Record)
        const triggerBtn = document.getElementById("camera-capture-trigger");
        if (triggerBtn) {
            triggerBtn.addEventListener("click", handleTriggerAction);
        }

        // Retake Preview Action Button
        const retakeBtn = document.getElementById("camera-preview-retake-btn");
        if (retakeBtn) {
            retakeBtn.addEventListener("click", resetCameraCaptureToLive);
        }

        // Send Captured File to Chat Action Button
        const sendBtn = document.getElementById("camera-preview-send-btn");
        if (sendBtn) {
            sendBtn.addEventListener("click", sendCapturedMedia);
        }

        // Disappearing Story Viewer Close Actions
        const storyCloseX = document.getElementById("story-viewer-close");
        if (storyCloseX) {
            storyCloseX.addEventListener("click", closeDisappearingStoryViewer);
        }
    });

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

        const constraints = {
            video: {
                facingMode: currentCameraFacing,
                width: { ideal: 1280 },
                height: { ideal: 720 }
            },
            audio: true // request audio for video records
        };

        try {
            stream = await navigator.mediaDevices.getUserMedia(constraints);
            videoEl.srcObject = stream;
            videoEl.style.display = "block";
            await videoEl.play();
        } catch (err) {
            console.error("Camera access failed:", err);
            showToast("Failed to access camera", "error");
            closeCameraCaptureOverlay();
        }
    }

    function stopLiveCameraStream() {
        const videoEl = document.getElementById("camera-capture-video");
        if (videoEl) {
            videoEl.pause();
            videoEl.srcObject = null;
        }
        if (stream) {
            stream.getTracks().forEach(track => track.stop());
            stream = null;
        }
        stopRecordingTimer();
    }

    function closeCameraCaptureOverlay() {
        stopLiveCameraStream();
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

    function takePhotoSnapshot() {
        const videoEl = document.getElementById("camera-capture-video");
        const imgPreview = document.getElementById("camera-capture-img-preview");
        if (!videoEl || !imgPreview) return;

        // Capture snapshot canvas frame
        const canvas = document.createElement("canvas");
        canvas.width = videoEl.videoWidth || 640;
        canvas.height = videoEl.videoHeight || 480;
        const ctx = canvas.getContext("2d");
        
        // Mirror snapshot if using front camera
        if (currentCameraFacing === "user") {
            ctx.translate(canvas.width, 0);
            ctx.scale(-1, 1);
        }
        ctx.drawImage(videoEl, 0, 0, canvas.width, canvas.height);

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
        }, "image/jpeg", 0.9);
    }

    function startVideoRecording() {
        if (!stream) return;
        recordedChunks = [];
        
        // Use optimal recording options
        let options = { mimeType: "video/webm;codecs=vp9,opus" };
        if (!MediaRecorder.isTypeSupported(options.mimeType)) {
            options = { mimeType: "video/webm;codecs=vp8,opus" };
        }
        if (!MediaRecorder.isTypeSupported(options.mimeType)) {
            options = { mimeType: "video/mp4" };
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

    function stopVideoRecording() {
        if (mediaRecorder && mediaRecorder.state === "recording") {
            mediaRecorder.stop();
        }
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
        }

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
            timestamp: Date.now()
        };

        if (!State.messages[to]) State.messages[to] = [];
        State.messages[to].unshift(message);
        State.messageIndex[tempId] = to;

        document.getElementById("messages").appendChild(createMessageElement(message));
        document.getElementById("messages-container").scrollTop = 99999;

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
                        isDisappearing: true
                    }
                });

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

        viewer.style.display = "flex";

        if (details.type === "video") {
            video.src = details.src;
            video.style.display = "block";
            
            // Wait for video meta to initialize timing
            video.onloadedmetadata = () => {
                const duration = video.duration || 10;
                video.play();
                startStoryProgressTracking(duration * 1000);
            };

            video.onended = () => {
                closeDisappearingStoryViewer();
            };

            video.onerror = () => {
                showToast("Failed to play video story", "error");
                closeDisappearingStoryViewer();
            };
        } else {
            // Photo story
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
            video.pause();
            video.src = "";
        }
        if (img) {
            img.src = "";
        }

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
})();
