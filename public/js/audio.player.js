/**
 * audio.player.js — Audio message player UI and waveform renderer.
 */

// =============================================================================
// CREATE AUDIO PLAYER
// =============================================================================
function createAudioPlayer(audioUrl, messageId) {
    const container = document.createElement("div");
    container.className = "message-audio";
    container.dataset.audioId = messageId;

    const playBtn = document.createElement("button");
    playBtn.className = "audio-play-btn";
    playBtn.innerHTML = `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>`;

    const waveformContainer = document.createElement("div");
    waveformContainer.className = "audio-waveform";
    const canvas = document.createElement("canvas");
    waveformContainer.appendChild(canvas);

    const timeLabel = document.createElement("div");
    timeLabel.className = "audio-time";
    timeLabel.textContent = "0:00";

    container.appendChild(playBtn);
    container.appendChild(waveformContainer);
    container.appendChild(timeLabel);

    const audio = new Audio(audioUrl);
    audioPlayers.set(messageId, audio);
    audio.preload = "metadata";
    // Removed audio.crossOrigin = "anonymous" to prevent CORS blockages on cross-origin cloud media playback

    drawStaticWaveform(canvas);

    let isPlaying = false;

    playBtn.addEventListener("click", (e) => {
        e.stopPropagation();

        if (isPlaying) {
            audio.pause();
            playBtn.innerHTML = `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>`;
        } else {
            // Pause all other audio players
            audioPlayers.forEach((otherAudio, otherId) => {
                if (otherId !== messageId) {
                    otherAudio.pause();
                    const otherBtn = document.querySelector(`[data-audio-id="${otherId}"] .audio-play-btn`);
                    if (otherBtn) otherBtn.innerHTML = `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>`;
                }
            });

            if (audioContext?.state === 'suspended') audioContext.resume();

            audio.play().catch(err => {
                console.error("Audio playback failed:", err);
                showToast("Failed to play audio", "error");
            });

            playBtn.innerHTML = `<svg viewBox="0 0 24 24" fill="currentColor">
                <rect x="6" y="4" width="4" height="16"/>
                <rect x="14" y="4" width="4" height="16"/>
            </svg>`;
        }
        isPlaying = !isPlaying;
        navigator.vibrate && navigator.vibrate(10);
    });

    audio.addEventListener("timeupdate", () => {
        const current = audio.currentTime;
        const duration = audio.duration || 0;
        timeLabel.textContent = _formatAudioTime(current);
        drawStaticWaveform(canvas, duration > 0 ? current / duration : 0);
    });

    audio.addEventListener("ended", () => {
        isPlaying = false;
        playBtn.innerHTML = `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>`;
        audio.currentTime = 0;
        timeLabel.textContent = _formatAudioTime(audio.duration || 0);
        drawStaticWaveform(canvas, 0);
    });

    audio.addEventListener("loadedmetadata", () => {
        timeLabel.textContent = _formatAudioTime(audio.duration);
    });

    audio.addEventListener("error", () => {
        container.classList.add("error");
        timeLabel.textContent = "Error";
        playBtn.disabled = true;
    });

    if (audio.readyState >= 2) {
        container.classList.remove("loading");
    } else {
        container.classList.add("loading");
        const onCanPlay = () => {
            container.classList.remove("loading");
            audio.removeEventListener("canplaythrough", onCanPlay);
            audio.removeEventListener("canplay", onCanPlay);
        };
        audio.addEventListener("canplaythrough", onCanPlay);
        audio.addEventListener("canplay", onCanPlay);
    }

    return container;
}

function _formatAudioTime(seconds) {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
}

// =============================================================================
// WAVEFORM RENDERER
// =============================================================================
function drawStaticWaveform(canvas, progress = 0, retryCount = 0) {
    const ctx = canvas.getContext("2d");
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();

    if (rect.width === 0) {
        if (retryCount < 20) {
            setTimeout(() => drawStaticWaveform(canvas, progress, retryCount + 1), 50);
        }
        return;
    }

    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);

    const width = rect.width;
    const height = rect.height;
    ctx.clearRect(0, 0, width, height);

    const barCount = Math.min(40, Math.floor(width / 5));
    const barWidth = (width / barCount) * 0.6;
    const barGap = (width / barCount) * 0.4;

    for (let i = 0; i < barCount; i++) {
        const barHeight = (Math.random() * 0.5 + 0.3) * height;
        const x = i * (barWidth + barGap);
        const y = (height - barHeight) / 2;
        const isPlayed = (i / barCount) < progress;
        const gradient = ctx.createLinearGradient(0, y, 0, y + barHeight);
        if (isPlayed) {
            gradient.addColorStop(0, "#667eea");
            gradient.addColorStop(1, "#764ba2");
        } else {
            gradient.addColorStop(0, "#d0d0d0");
            gradient.addColorStop(1, "#a0a0a0");
        }
        ctx.fillStyle = gradient;
        ctx.fillRect(x, y, barWidth, barHeight);
    }
}
