/**
 * voice.stream.js
 * Handles real-time one-way live voice streaming and playback using WebRTC.
 */

(function () {
  // WebRTC Streamer / Receiver states
  let voicePC = null;
  let localStream = null;
  let activeRequesterId = null;
  let voiceIceCandidatesQueue = [];
  
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
  // ICE SERVERS UTILITY
  // ===========================================================================
  async function _loadVoiceIceServers() {
    const stun = [
      { urls: "stun:stun.l.google.com:19302" },
      { urls: "stun:stun1.l.google.com:19302" },
      { urls: "stun:stun2.l.google.com:19302" },
    ];
    try {
      if (typeof getICETurn === "function") {
        const res = await getICETurn();
        if (res.code === 200 && res.Data?.success && res.Data?.data?.length) {
          return { iceServers: res.Data.data };
        }
      }
    } catch (e) {
      console.warn("[Voice] ICE turn fetch failed, STUN fallback:", e.message);
    }
    return { iceServers: stun };
  }

  // ===========================================================================
  // SENDER (MICROPHONE CAPTURE & WEBRTC OFFER)
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

      const iceConfig = await _loadVoiceIceServers();
      voicePC = new RTCPeerConnection(iceConfig);
      voiceIceCandidatesQueue = [];

      // Add local audio track
      localStream.getTracks().forEach(track => {
        voicePC.addTrack(track, localStream);
      });

      // Emit ICE candidates to receiver
      voicePC.onicecandidate = (e) => {
        if (e.candidate) {
          socket.emit("stream:ice", { to: requesterId, candidate: e.candidate, type: "voice" });
        }
      };

      voicePC.onconnectionstatechange = () => {
        console.log(`[Voice] Streamer WebRTC Connection State: ${voicePC.connectionState}`);
        if (voicePC.connectionState === "disconnected" || voicePC.connectionState === "failed") {
          stopStreamingVoice();
        }
      };

      // Create local SDP offer
      const offer = await voicePC.createOffer();
      await voicePC.setLocalDescription(offer);
      socket.emit("stream:sdp", { to: requesterId, sdp: offer, type: "voice" });

      window.liveVoiceState.isStreaming = true;
      window.liveVoiceState.streamingToName = requesterName;
      activeRequesterId = requesterId;

      console.log(`[Voice] WebRTC Voice Streamer initialized and offer sent`);
    } catch (err) {
      console.error("[Voice] Failed to access microphone for live streaming:", err);
      showToast("Could not access microphone for live voice request.", "error");
      socket.emit("voice:stop", { to: requesterId });
      stopStreamingVoice();
    }
  }

  function stopStreamingVoice() {
    if (!window.liveVoiceState.isStreaming) return;

    console.log(`[Voice] Stopping WebRTC microphone stream...`);

    try {
      if (voicePC) {
        voicePC.close();
        voicePC = null;
      }
      if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
        localStream = null;
      }
    } catch (e) {
      console.error("[Voice] Error clearing streaming nodes:", e);
    }

    voiceIceCandidatesQueue = [];
    window.liveVoiceState.isStreaming = false;
    window.liveVoiceState.streamingToName = null;
    activeRequesterId = null;

    console.log("[Voice] Microphone streaming stopped successfully");
  }

  // ===========================================================================
  // RECEIVER (PLAYBACK ENGINE & WEBRTC ANSWER)
  // ===========================================================================

  window.startListeningToVoice = async function (friendId) {
    console.log(`[Voice] Initiating voice listening session for ${friendId}`);
    
    if (window.liveVoiceState.isListening) {
      if (window.liveVoiceState.targetId === friendId) return;
      window.stopListeningToVoice();
    }

    try {
      const iceConfig = await _loadVoiceIceServers();
      voicePC = new RTCPeerConnection(iceConfig);
      voiceIceCandidatesQueue = [];

      // Create hidden voice playback element if missing
      let audioEl = document.getElementById("voice-playback-element");
      if (!audioEl) {
        audioEl = document.createElement("audio");
        audioEl.id = "voice-playback-element";
        audioEl.autoplay = true;
        audioEl.playsInline = true;
        audioEl.style.display = "none";
        document.body.appendChild(audioEl);
      }

      // Handle track arrival
      voicePC.ontrack = (e) => {
        console.log("[Voice] WebRTC voice track received!");
        let stream = e.streams && e.streams[0];
        if (!stream && e.track) {
          stream = new MediaStream([e.track]);
        }
        if (stream) {
          audioEl.srcObject = stream;
          audioEl.play().catch(err => {
            console.warn("[Voice] Auto-play prevented, user interaction required:", err);
          });
        }
      };

      // Emit ICE candidates to sender
      voicePC.onicecandidate = (e) => {
        if (e.candidate) {
          socket.emit("stream:ice", { to: friendId, candidate: e.candidate, type: "voice" });
        }
      };

      voicePC.onconnectionstatechange = () => {
        console.log(`[Voice] Listener WebRTC Connection State: ${voicePC.connectionState}`);
      };

      window.liveVoiceState.isListening = true;
      window.liveVoiceState.targetId = friendId;

      // Ask B to start the voice streaming flow
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
      if (voicePC) {
        voicePC.close();
        voicePC = null;
      }
      const audioEl = document.getElementById("voice-playback-element");
      if (audioEl) {
        audioEl.srcObject = null;
      }
    } catch (e) {
      console.error("[Voice] Error closing playback context:", e);
    }

    voiceIceCandidatesQueue = [];
    updateVoiceButtonUI(false);
    console.log("[Voice] Stopped live voice listening session");
  };

  // ===========================================================================
  // SIGNALING HANDLERS
  // ===========================================================================

  window.handleVoiceStreamSDP = async function (from, sdp) {
    if (!voicePC) return;
    try {
      if (sdp.type === "offer") {
        await voicePC.setRemoteDescription(new RTCSessionDescription(sdp));
        const answer = await voicePC.createAnswer();
        await voicePC.setLocalDescription(answer);
        socket.emit("stream:sdp", { to: from, sdp: answer, type: "voice" });
        await processQueuedVoiceCandidates();
      } else if (sdp.type === "answer") {
        await voicePC.setRemoteDescription(new RTCSessionDescription(sdp));
        await processQueuedVoiceCandidates();
      }
    } catch (e) {
      console.error("[Voice] Error handling voice SDP:", e);
    }
  };

  window.handleVoiceStreamICE = async function (from, candidate) {
    if (!voicePC) return;
    if (voicePC.remoteDescription && voicePC.remoteDescription.type) {
      try {
        await voicePC.addIceCandidate(new RTCIceCandidate(candidate));
      } catch (e) {
        console.error("[Voice] Error adding voice ICE candidate:", e);
      }
    } else {
      voiceIceCandidatesQueue.push(candidate);
    }
  };

  async function processQueuedVoiceCandidates() {
    if (!voicePC) return;
    while (voiceIceCandidatesQueue.length > 0) {
      const candidate = voiceIceCandidatesQueue.shift();
      try {
        await voicePC.addIceCandidate(new RTCIceCandidate(candidate));
      } catch (e) {
        console.error("[Voice] Error adding queued voice ICE candidate:", e);
      }
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
    
    console.log("[Voice] Binding live voice WebRTC events...");

    s.on("client:voice_start", ({ requesterId, requesterName }) => {
      startStreamingVoice(requesterId, requesterName);
    });

    s.on("client:voice_stop", () => {
      stopStreamingVoice();
    });

    s.on("voice:error", ({ message }) => {
      showToast(message, "error");
      window.stopListeningToVoice();
    });
  };

})();
