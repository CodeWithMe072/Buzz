/**
 * voice.stream.js
 * Handles real-time one-way live voice streaming and playback.
 */

(function () {
  // Sender / Streaming states (when we are sharing our mic)
  let localStream = null;
  let captureContext = null;
  let captureSource = null;
  let captureProcessor = null;
  let activeRequesterId = null;

  // Receiver / Listening states (when we are listening to someone else)
  let playbackContext = null;
  let nextPlayTime = 0;
  
  // Public state exposed to window
  window.liveVoiceState = {
    isListening: false,
    targetId: null,
    isStreaming: false,
    streamingToName: null
  };

  // Inject voice button listening animation styles
  if (!document.getElementById("voice-banner-styles")) {
    const styles = document.createElement("style");
    styles.id = "voice-banner-styles";
    styles.textContent = `
      .voice-btn-listening {
        color: #ef4444 !important;
        animation: voiceBtnPulse 1.5s infinite;
        background: rgba(239, 68, 68, 0.1) !important;
        border-radius: 50%;
      }
      @keyframes voiceBtnPulse {
        0% { box-shadow: 0 0 0 0 rgba(239, 68, 68, 0.4); }
        70% { box-shadow: 0 0 0 10px rgba(239, 68, 68, 0); }
        100% { box-shadow: 0 0 0 0 rgba(239, 68, 68, 0); }
      }
    `;
    document.head.appendChild(styles);
  }


  // ===========================================================================
  // SENDER (MICROPHONE CAPTURE)
  // ===========================================================================

  async function startStreamingVoice(requesterId, requesterName) {
    console.log(`[Voice] Received voice start request from ${requesterName} (${requesterId})`);
    
    if (window.liveVoiceState.isStreaming) {
      if (activeRequesterId !== requesterId) {
        console.log(`[Voice] Already streaming to a different user, stopping current stream first`);
        stopStreamingVoice();
      } else {
        console.log(`[Voice] Already streaming to this user`);
        return;
      }
    }

    try {
      localStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      console.log(`[Voice] Microphone access granted`);

      captureContext = new (window.AudioContext || window.webkitAudioContext)();
      if (captureContext.state === "suspended") {
        console.log(`[Voice] Capture AudioContext is suspended. Resuming...`);
        await captureContext.resume();
      }
      
      captureSource = captureContext.createMediaStreamSource(localStream);
      // Create ScriptProcessorNode with buffer size 2048, 1 input channel, 1 output channel
      captureProcessor = captureContext.createScriptProcessor(2048, 1, 1);

      captureProcessor.onaudioprocess = function (e) {
        if (!window.liveVoiceState.isStreaming) return;

        const inputData = e.inputBuffer.getChannelData(0);
        // Convert Float32Array to Int16Array PCM
        const pcmData = new Int16Array(inputData.length);
        for (let i = 0; i < inputData.length; i++) {
          const s = Math.max(-1, Math.min(1, inputData[i]));
          pcmData[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
        }

        // Emit raw ArrayBuffer chunk over socket
        socket.emit("voice:chunk", {
          to: requesterId,
          samples: pcmData.buffer,
          sampleRate: captureContext.sampleRate
        });
      };

      captureSource.connect(captureProcessor);
      captureProcessor.connect(captureContext.destination);

      window.liveVoiceState.isStreaming = true;
      window.liveVoiceState.streamingToName = requesterName;
      activeRequesterId = requesterId;

      console.log(`[Voice] Active microphone stream connected at sampleRate: ${captureContext.sampleRate}Hz`);
    } catch (err) {
      console.error("[Voice] Failed to access microphone for live streaming:", err);
      showToast("Could not access microphone for live voice request.", "error");
      socket.emit("voice:stop", { to: requesterId });
    }
  }

  function stopStreamingVoice() {
    if (!window.liveVoiceState.isStreaming) return;

    console.log(`[Voice] Stopping microphone stream...`);

    try {
      if (captureProcessor) {
        captureProcessor.disconnect();
        captureProcessor.onaudioprocess = null;
        captureProcessor = null;
      }
      if (captureSource) {
        captureSource.disconnect();
        captureSource = null;
      }
      if (captureContext) {
        captureContext.close();
        captureContext = null;
      }
      if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
        localStream = null;
      }
    } catch (e) {
      console.error("[Voice] Error clearing streaming nodes:", e);
    }

    window.liveVoiceState.isStreaming = false;
    window.liveVoiceState.streamingToName = null;
    activeRequesterId = null;

    console.log("[Voice] Microphone streaming stopped successfully");
  }

  // ===========================================================================
  // RECEIVER (PLAYBACK ENGINE)
  // ===========================================================================

  window.startListeningToVoice = async function (friendId) {
    console.log(`[Voice] Initiating voice listening session for ${friendId}`);
    
    if (window.liveVoiceState.isListening) {
      if (window.liveVoiceState.targetId === friendId) return;
      window.stopListeningToVoice();
    }

    try {
      playbackContext = new (window.AudioContext || window.webkitAudioContext)();
      if (playbackContext.state === "suspended") {
        console.log(`[Voice] Playback AudioContext is suspended. Resuming...`);
        await playbackContext.resume();
      }
      nextPlayTime = playbackContext.currentTime;

      window.liveVoiceState.isListening = true;
      window.liveVoiceState.targetId = friendId;

      socket.emit("voice:request", { to: friendId });

      updateVoiceButtonUI(true);
      console.log(`[Voice] Live listening context started. Sent voice:request to server.`);
    } catch (err) {
      console.error("[Voice] Failed to start audio playback context:", err);
      showToast("Failed to initialize live voice playback.", "error");
      window.stopListeningToVoice();
    }
  };

  window.stopListeningToVoice = function () {
    if (!window.liveVoiceState.isListening) return;

    const targetId = window.liveVoiceState.targetId;
    console.log(`[Voice] Stopping voice listening for target: ${targetId}`);

    if (targetId) {
      socket.emit("voice:stop", { to: targetId });
    }

    window.liveVoiceState.isListening = false;
    window.liveVoiceState.targetId = null;

    try {
      if (playbackContext) {
        playbackContext.close();
        playbackContext = null;
      }
    } catch (e) {
      console.error("[Voice] Error closing playback context:", e);
    }

    updateVoiceButtonUI(false);
    console.log("[Voice] Stopped live voice listening session");
  };

  function handleVoiceChunk(from, samplesBuffer, sampleRate) {
    if (!window.liveVoiceState.isListening || window.liveVoiceState.targetId !== from) {
      return;
    }

    if (!playbackContext) return;

    try {
      // Normalize buffer type
      let arrayBuffer;
      if (samplesBuffer instanceof ArrayBuffer) {
        arrayBuffer = samplesBuffer;
      } else if (ArrayBuffer.isView(samplesBuffer)) {
        arrayBuffer = samplesBuffer.buffer;
      } else if (samplesBuffer && samplesBuffer.type === "Buffer" && Array.isArray(samplesBuffer.data)) {
        const uint8 = new Uint8Array(samplesBuffer.data);
        arrayBuffer = uint8.buffer;
      } else {
        console.warn("[Voice] Received unknown samples format:", samplesBuffer);
        return;
      }

      // Convert Int16 PCM array to float32
      const int16Samples = new Int16Array(arrayBuffer);
      if (int16Samples.length === 0) return;

      const float32Samples = new Float32Array(int16Samples.length);
      for (let i = 0; i < int16Samples.length; i++) {
        float32Samples[i] = int16Samples[i] / (int16Samples[i] < 0 ? 0x8000 : 0x7FFF);
      }

      // Create an AudioBuffer
      const audioBuffer = playbackContext.createBuffer(1, float32Samples.length, sampleRate);
      audioBuffer.getChannelData(0).set(float32Samples);

      // Create BufferSourceNode
      const source = playbackContext.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(playbackContext.destination);

      // Schedule buffer to play gaplessly
      const currentTime = playbackContext.currentTime;
      const currentLatency = nextPlayTime - currentTime;

      // If playback latency accumulates beyond 120ms or falls behind, snap to real-time (20ms buffer)
      if (currentLatency > 0.12 || nextPlayTime < currentTime) {
        nextPlayTime = currentTime + 0.02;
      }
      source.start(nextPlayTime);
      nextPlayTime += audioBuffer.duration;
    } catch (err) {
      console.error("[Voice] Playback decoding/scheduling error:", err);
    }
  }

  // ===========================================================================
  // UI HELPERS (BANNER & BUTTON PULSING)
  // ===========================================================================

  function updateVoiceButtonUI(isListening) {
    const btn = document.getElementById("chat-live-voice-btn");
    const optionBtn = document.getElementById("chatOption-LiveVoice");
    const optionText = document.getElementById("chatOption-LiveVoice-text");

    if (isListening) {
      if (btn) {
        btn.classList.add("voice-btn-listening");
        btn.title = "Stop Listening to Live Voice";
      }
      if (optionBtn) {
        optionBtn.classList.add("voice-btn-listening");
        optionBtn.title = "Stop Listening to Live Voice";
      }
      if (optionText) {
        optionText.textContent = "Stop Listening";
      }
    } else {
      const friendName = document.getElementById("chat-username")?.textContent || "User";
      if (btn) {
        btn.classList.remove("voice-btn-listening");
        btn.title = `Listen to ${friendName}'s Live Voice`;
      }
      if (optionBtn) {
        optionBtn.classList.remove("voice-btn-listening");
        optionBtn.title = `Listen to ${friendName}'s Live Voice`;
      }
      if (optionText) {
        optionText.textContent = "Live Voice";
      }
    }
  }

  window.syncVoiceButtonState = function (activeChatId) {
    const btn = document.getElementById("chat-live-voice-btn");
    const optionBtn = document.getElementById("chatOption-LiveVoice");
    if (!btn && !optionBtn) return;

    if (window.liveVoiceState.isListening && window.liveVoiceState.targetId === activeChatId) {
      updateVoiceButtonUI(true);
    } else {
      updateVoiceButtonUI(false);
    }
  };

  // ===========================================================================
  // SOCKET LISTENERS SETUP
  // ===========================================================================

  window.initVoiceSockets = function () {
    const s = window.socket || (typeof socket !== "undefined" ? socket : null);
    if (!s) {
      console.warn("[Voice] Socket object not found. Postponing event binding.");
      return;
    }
    
    console.log("[Voice] Binding live voice socket events...");

    s.on("client:voice_start", ({ requesterId, requesterName }) => {
      startStreamingVoice(requesterId, requesterName);
    });

    s.on("client:voice_stop", () => {
      stopStreamingVoice();
    });

    s.on("client:voice_chunk", ({ from, samples, sampleRate }) => {
      handleVoiceChunk(from, samples, sampleRate);
    });

    s.on("voice:error", ({ message }) => {
      showToast(message, "error");
      window.stopListeningToVoice();
    });
  };

})();
