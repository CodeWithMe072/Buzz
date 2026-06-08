/**
 * call.js — Stable WebRTC calls
 *
 * KEY FIXES vs previous version:
 * 1. _callState = "connected" only set in ontrack, NOT in accept()
 * 2. ICE candidates buffered properly on BOTH sides until remoteDesc set
 * 3. Call message sent to chat instantly when call starts (both sides)
 * 4. Rejoin flow: click call message → fresh offer → connect
 * 5. mDNS .local candidates filtered (break mobile)
 * 6. STUN always included + TURN TCP/TLS for max network compatibility
 */

const CallManager = (() => {

  // ─── State ────────────────────────────────────────────────
  let _mode          = null;    // "audio" | "video"
  let _callState     = "idle";  // idle | outgoing | waiting | incoming | answering | connected
  let _activePeer    = null;    // { id, username, avatar }
  let _localStream   = null;
  let _pc            = null;
  let _pendingIce    = [];
  let _remoteDescSet = false;
  let _roomId        = null;
  let _callStartTime = null;
  let _iceServersPromise = null;

  // timers
  let _timerHandle     = null;
  let _seconds         = 0;
  let _autoRejectTimer = null;
  let _iceRestartTimer = null;
  let _waitingTimer    = null;

  // mute/cam/speaker
  let _muted     = false;
  let _camOff    = false;
  let _speakerOn = true;

  // tones
  let _ringCtx = null, _dialCtx = null;
  let _dialLoop = null, _ringLoop = null;

  const $ = id => document.getElementById(id);

  // ─── ROOM ID ─────────────────────────────────────────────
  function _newRoomId() {
    return `call_${Date.now()}_${Math.random().toString(36).slice(2,9)}`;
  }

  // ─── ICE SERVERS — load once, cache per call ─────────────
  // Always fetch fresh — Metered TURN credentials expire (~1hr TTL)
  // Backend builds all variants (TCP, TLS port 443, etc)
  async function _loadIceServers() {
    const stun = [
      { urls: "stun:stun.l.google.com:19302" },
      { urls: "stun:stun1.l.google.com:19302" },
      { urls: "stun:stun2.l.google.com:19302" },
    ];
    try {
      const res = await getICETurn();
      if (res.code === 200 && res.Data?.success && res.Data?.data?.length) {
        const servers = res.Data.data;
        // Log breakdown so you can verify in DevTools console
        const stunCount  = servers.filter(s => (typeof s.urls === "string" ? s.urls : "").startsWith("stun")).length;
        const turnCount  = servers.filter(s => (typeof s.urls === "string" ? s.urls : "").startsWith("turn")).length;
        const turnsCount = servers.filter(s => (typeof s.urls === "string" ? s.urls : "").startsWith("turns")).length;
        console.log(`[WebRTC] ICE servers: ${servers.length} total — ${stunCount} STUN, ${turnCount} TURN, ${turnsCount} TURNS(TLS)`);
        const hasTls = turnsCount > 0;
        if (!hasTls) console.warn("[WebRTC] ⚠ No TURNS/TLS server — calls may fail on mobile data");
        return { iceServers: servers };
      }
      console.warn("[WebRTC] ICE fetch returned no servers, code:", res.code);
    } catch (e) {
      console.warn("[WebRTC] ICE fetch failed, STUN only:", e.message);
    }
    console.warn("[WebRTC] Using STUN-only fallback — will fail across different networks");
    return { iceServers: stun };
  }

  // ─── TONES ───────────────────────────────────────────────
  function _startDialtone() {
    _stopTones();
    _dialCtx = new (window.AudioContext || window.webkitAudioContext)();
    const beep = () => {
      if (_callState !== "outgoing" && _callState !== "waiting") return;
      [0, 0.5].forEach(t => {
        const o = _dialCtx.createOscillator(), g = _dialCtx.createGain();
        o.connect(g); g.connect(_dialCtx.destination);
        o.frequency.value = 440;
        g.gain.setValueAtTime(0.15, _dialCtx.currentTime + t);
        g.gain.exponentialRampToValueAtTime(0.001, _dialCtx.currentTime + t + 0.35);
        o.start(_dialCtx.currentTime + t); o.stop(_dialCtx.currentTime + t + 0.35);
      });
      _dialLoop = setTimeout(beep, 3000);
    };
    if (_dialCtx.state === "suspended") _dialCtx.resume();
    beep();
  }

  function _startRingtone() {
    _stopTones();
    _ringCtx = new (window.AudioContext || window.webkitAudioContext)();
    const ring = () => {
      if (_callState !== "incoming") return;
      [0, 0.3, 0.6].forEach(t => {
        const o = _ringCtx.createOscillator(), g = _ringCtx.createGain();
        o.connect(g); g.connect(_ringCtx.destination);
        o.frequency.setValueAtTime(880, _ringCtx.currentTime + t);
        o.frequency.setValueAtTime(660, _ringCtx.currentTime + t + 0.15);
        g.gain.setValueAtTime(0.35, _ringCtx.currentTime + t);
        g.gain.exponentialRampToValueAtTime(0.001, _ringCtx.currentTime + t + 0.28);
        o.start(_ringCtx.currentTime + t); o.stop(_ringCtx.currentTime + t + 0.28);
      });
      _ringLoop = setTimeout(ring, 2500);
    };
    if (_ringCtx.state === "suspended") _ringCtx.resume();
    ring();
  }

  function _stopTones() {
    clearTimeout(_dialLoop); clearTimeout(_ringLoop);
    _dialLoop = null; _ringLoop = null;
    try { _dialCtx?.close(); } catch {}
    try { _ringCtx?.close(); } catch {}
    _dialCtx = null; _ringCtx = null;
  }

  // ─── CALL TIMER ──────────────────────────────────────────
  function _startTimer() {
    _seconds = 0; _callStartTime = Date.now();
    clearInterval(_timerHandle);
    _timerHandle = setInterval(() => {
      _seconds++;
      const label = `${String(Math.floor(_seconds/60)).padStart(2,"0")}:${String(_seconds%60).padStart(2,"0")}`;
      const vs = $("video-call-status"), as = $("audio-call-status");
      if (vs) vs.textContent = label;
      if (as) as.textContent = label;
    }, 1000);
  }
  function _stopTimer() { clearInterval(_timerHandle); _timerHandle = null; }

  // ─── LOCAL STREAM ─────────────────────────────────────────
  async function _getLocalStream(video) {
    try {
      _localStream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
        video: video
          ? { width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { ideal: 24, max: 30 } }
          : false,
      });
      if (video) {
        const lv = $("local-video");
        if (lv) { lv.srcObject = _localStream; lv.style.opacity = "1"; lv.play().catch(() => {}); }
      }
      return true;
    } catch (err) {
      console.error("[WebRTC] getUserMedia failed:", err);
      showToast("Camera/mic permission denied", "error");
      return false;
    }
  }

  function _stopLocalStream() {
    _localStream?.getTracks().forEach(t => t.stop());
    _localStream = null;
    const lv = $("local-video");
    if (lv) { lv.srcObject = null; lv.style.opacity = "0"; }
  }

  // ─── PEER CONNECTION ──────────────────────────────────────
  async function _createPeerConnection(peerId) {
    _closePeerConnection(true); // always clean start, but keep pending ICE candidates

    const iceConfig = await _loadIceServers();

    _pc = new RTCPeerConnection({
      ...iceConfig,
      iceCandidatePoolSize: 10,
      bundlePolicy:   "max-bundle",
      rtcpMuxPolicy:  "require",
      iceTransportPolicy: "all",
    });

    // Add our tracks
    if (_localStream) {
      _localStream.getTracks().forEach(t => _pc.addTrack(t, _localStream));
    }

    // Send ICE to remote — filter mDNS .local (mobile can't resolve them)
    _pc.onicecandidate = ({ candidate }) => {
      if (!candidate || !socket || !_activePeer) return;
      const c = candidate.candidate || "";
      if (c.includes(".local")) return; // skip mDNS — mobile can't resolve
      // Log type so we can see what's being gathered
      const type = c.includes("typ relay") ? "RELAY" : c.includes("typ srflx") ? "SRFLX" : c.includes("typ host") ? "HOST" : "?";
      console.log("[WebRTC] Sending ICE candidate:", type, candidate.sdpMid);
      socket.emit("call:ice", { to: _activePeer.id, candidate });
    };

    _pc.onicegatheringstatechange = () =>
      console.log("[WebRTC] Gather:", _pc.iceGatheringState);

    // Log TURN errors — code 701 = TURN auth failed, 702 = network error
    _pc.onicecandidateerror = (e) => {
      if (e.errorCode === 701) console.error("[WebRTC] TURN AUTH FAILED:", e.url, e.errorText);
      else if (e.errorCode !== 0) console.warn("[WebRTC] ICE candidate error:", e.errorCode, e.url, e.errorText);
    };

    _pc.onconnectionstatechange = () =>
      console.log("[WebRTC] Connection:", _pc.connectionState);

    // ── ICE state machine ──────────────────────────────────
    _pc.oniceconnectionstatechange = async () => {
      const s = _pc.iceConnectionState;
      console.log("[WebRTC] ICE:", s);

      if (s === "connected" || s === "completed") {
        clearTimeout(_iceRestartTimer);
      }

      if (s === "disconnected") {
        clearTimeout(_iceRestartTimer);
        // 5s grace — transient disconnects (network switch, mobile sleep) self-heal
        _iceRestartTimer = setTimeout(async () => {
          if (_pc?.iceConnectionState === "disconnected") {
            console.warn("[WebRTC] ICE disconnected — restarting");
            await _doIceRestart();
          }
        }, 5000);
      }

      if (s === "failed") {
        clearTimeout(_iceRestartTimer);
        console.warn("[WebRTC] ICE failed — restarting now");
        // Small delay so both sides detect failure before we send restart offer
        setTimeout(() => _doIceRestart(), 500);
      }
    };

    // ── Remote tracks ──────────────────────────────────────
    // IMPORTANT: ontrack fires separately for audio and video tracks.
    // We collect them into one MediaStream and ensure we call play()
    // every time a track arrives so the media elements update rendering.
    let _remoteStream = null;

    _pc.ontrack = ({ track, streams }) => {
      console.log("[WebRTC] ontrack:", track.kind, "readyState:", track.readyState);

      const stream = streams?.[0] || _remoteStream || new MediaStream();
      _remoteStream = stream;
      if (stream.getTracks().indexOf(track) === -1) {
        stream.addTrack(track);
      }

      if (_mode === "video") {
        const rv = $("remote-video");
        if (rv) {
          if (rv.srcObject !== stream) {
            rv.srcObject = stream;
          }
          // Always call play to force browser to render the newly added track (e.g. video after audio)
          rv.play().catch(e => console.warn("[WebRTC] remote-video play failed:", e.message));
        }
      } else {
        let ra = $("remote-audio");
        if (!ra) {
          ra = document.createElement("audio");
          ra.id = "remote-audio"; ra.autoplay = true; ra.playsInline = true;
          document.body.appendChild(ra);
        }
        if (ra.srcObject !== stream) {
          ra.srcObject = stream;
        }
        ra.play().catch(e => console.warn("[WebRTC] remote-audio play failed:", e.message));
      }

      // ── Mark connected — ONLY here, not in accept() ──────
      // This fires when actual media arrives, guaranteeing real connectivity
      if (_callState !== "connected") {
        _callState = "connected";
        _stopTones();
        clearTimeout(_autoRejectTimer);
        $("video-call-status").textContent = "00:00";
        $("audio-call-status").textContent = "00:00";
        _startTimer();
        if (_mode === "audio") $("audio-waves")?.classList.add("active");
      }
    };

    return _pc;
  }

  // ── Flush buffered ICE candidates ─────────────────────────
  async function _flushPendingIce() {
    const toFlush = [..._pendingIce];
    _pendingIce = [];
    for (const c of toFlush) {
      try { await _pc.addIceCandidate(new RTCIceCandidate(c)); }
      catch (e) { console.warn("[WebRTC] addIceCandidate failed:", e.message); }
    }
  }

  // ── ICE restart with fresh TURN credentials ────────────────
  async function _doIceRestart() {
    // Only restart if connected — if "answering" the initial connection is still in progress
    if (!_pc || !_activePeer) return;
    if (_callState !== "connected" && _callState !== "answering") return;
    try {
      // NOTE: setConfiguration() throws InvalidModificationError if iceServers changed.
      // Just use the existing PC with iceRestart:true — the PC already has the TURN servers.
      const offer = await _pc.createOffer({ iceRestart: true });
      await _pc.setLocalDescription(offer);
      console.log("[WebRTC] ICE restart offer sent");
      socket.emit("call:offer", {
        to: _activePeer.id, type: _mode, sdp: offer, roomId: _roomId,
        from: { id: State.currentUser.id, username: State.currentUser.username, avatar: State.currentUser.avatar }
      });
    } catch (err) {
      console.error("[WebRTC] ICE restart failed:", err);
      // If restart fails, tear down and notify user
      showToast("Call connection lost", "error");
      close(false);
    }
  }

  function _closePeerConnection(keepPendingIce = false) {
    clearTimeout(_iceRestartTimer);
    _destroyDraggable($("call-modal"));
    if (_pc) { try { _pc.close(); } catch {} _pc = null; }
    _remoteDescSet = false;
    if (!keepPendingIce) {
      _pendingIce = [];
    }
    const rv = $("remote-video"); if (rv) { rv.srcObject = null; rv.onloadedmetadata = null; }
    const ra = $("remote-audio"); if (ra) { ra.srcObject = null; ra.onloadedmetadata = null; }
  }

  // ─── CALL MESSAGE IN CHAT ─────────────────────────────────
  // Sends a call message to the current chat conversation immediately
  // when a call starts — visible to both parties.
  function _injectCallMessage(peerId, isOutgoing) {
    if (!_roomId || !_mode) return;
    const myId = State.currentUser.id;
    const chatId = isOutgoing ? peerId : myId;
    const fromId = isOutgoing ? myId : peerId;

    const msg = {
      id:            _roomId,
      tempId:        _roomId,
      type:          "call",
      callType:      _mode,
      callStatus:    "active",
      callRoomId:    _roomId,
      callExpiresAt: new Date(Date.now() + 3 * 60 * 1000).toISOString(),
      callPeerId:    peerId,
      sender:        isOutgoing ? "me" : "other",
      user:          fromId,
      from:          fromId,
      timestamp:     Date.now(),
      status:        { sent: true, delivered: true, seen: false },
    };

    // The chat is keyed by the OTHER person's ID
    const convId = isOutgoing ? peerId : (fromId === myId ? peerId : fromId);
    if (!State.messages[convId]) State.messages[convId] = [];
    // Avoid duplicate
    if (!State.messages[convId].some(m => m.id === _roomId || m.tempId === _roomId)) {
      State.messages[convId].unshift(msg);
      State.messageIndex[_roomId] = convId;
    }

    // Update conversation last message
    const conv = State.conversations.find(c => c.id === convId);
    if (conv) {
      conv.lastMessage = _mode === "video" ? "📹 Video call" : "📞 Voice call";
      conv.timestamp   = Date.now();
      if (!isOutgoing) conv.unread = (conv.unread || 0) + 1;
    }

    renderChatList();

    // Render in active chat if open
    if (State.activeChat === convId) {
      const mc = document.getElementById("messages");
      if (mc) {
        // Remove any existing call message element for this roomId
        const existing = mc.querySelector(`[data-message-id="${_roomId}"]`);
        if (existing) existing.remove();
        mc.appendChild(createMessageElement(msg));
        document.getElementById("messages-container").scrollTop = 99999;
      }
    }
  }

  // Update call message status in DOM and state
  function _updateCallMessage(status, duration = 0) {
    if (!_roomId) return;
    const chatId = State.messageIndex[_roomId];
    if (!chatId) return;
    const msgs = State.messages[chatId] || [];
    const msg = msgs.find(m => m.id === _roomId || m.tempId === _roomId);
    if (msg) {
      msg.callStatus   = status;
      msg.callDuration = duration;
    }
    // Update DOM element
    const el = document.querySelector(`[data-message-id="${_roomId}"]`);
    if (el) {
      const statusEl = el.querySelector(".call-msg-status");
      const joinBtn  = el.querySelector(".call-msg-join-btn");
      if (statusEl) {
        if (status === "ended" && duration > 0) {
          const m = String(Math.floor(duration/60)).padStart(2,"0");
          const s = String(duration%60).padStart(2,"0");
          statusEl.textContent = `${m}:${s}`;
          statusEl.className = "call-msg-status";
        } else if (status === "missed") {
          statusEl.textContent = "Missed call";
          statusEl.className = "call-msg-status missed";
        } else if (status === "declined") {
          statusEl.textContent = "Declined";
          statusEl.className = "call-msg-status missed";
        } else if (status === "ended") {
          statusEl.textContent = "Call ended";
          statusEl.className = "call-msg-status";
        }
      }
      if (joinBtn) joinBtn.remove();
    }
  }

  // ─── UI HELPERS ──────────────────────────────────────────
  function _setPeerUI(peer) {
    _activePeer = peer;
    const av = (peer.avatar?.length > 2) ? peer.avatar : peer.username?.charAt(0).toUpperCase() || "?";
    $("video-peer-name").textContent   = peer.username || "Unknown";
    $("audio-peer-name").textContent   = peer.username || "Unknown";
    $("audio-peer-avatar").textContent = av;
    $("video-call-status").textContent = "Calling…";
    $("audio-call-status").textContent = "Calling…";
  }

  // ─── OPEN OUTGOING CALL ──────────────────────────────────
  async function open(mode) {
    if (_callState !== "idle") { showToast("Already in a call", "error"); return; }
    const conv = State.conversations.find(c => c.id === State.activeChat);
    if (!conv) { showToast("Open a chat first", "error"); return; }

    _mode = mode; _callState = "outgoing"; _muted = false; _camOff = false;
    _roomId = _newRoomId();
    _iceServersPromise = null; // fresh creds each call
    _pendingIce = []; // Clear for new outgoing call

    _setPeerUI({ id: conv.id, username: conv.username, avatar: conv.avatar });

    // Show call modal
    $("video-call-screen").style.display = mode === "video" ? "flex" : "none";
    $("audio-call-screen").style.display = mode === "audio" ? "flex" : "none";
    $("call-modal").classList.remove("video-mode", "audio-mode");
    $("call-modal").classList.add(`${mode}-mode`);
    $("call-modal").classList.add("active");
    document.body.style.overflow = "hidden";
    [$("vc-mute-btn"), $("ac-mute-btn"), $("vc-cam-btn"), $("ac-speaker-btn")]
      .forEach(b => b?.classList.remove("ctrl-active"));

    // Inject call message into our chat immediately
    _injectCallMessage(conv.id, true);

    _startDialtone();

    // Get media first
    const ok = await _getLocalStream(mode === "video");
    if (!ok) { close(false); return; }

    // Create peer connection and offer
    await _createPeerConnection(conv.id);
    try {
      const offer = await _pc.createOffer({
        offerToReceiveAudio: true,
        offerToReceiveVideo: mode === "video",
      });
      await _pc.setLocalDescription(offer);

      socket.emit("call:offer", {
        to:   conv.id,
        type: mode,
        sdp:  offer,
        roomId: _roomId,
        from: { id: State.currentUser.id, username: State.currentUser.username, avatar: State.currentUser.avatar },
      });
    } catch (err) {
      console.error("[WebRTC] createOffer failed:", err);
      showToast("Failed to start call", "error");
      close(false);
    }
  }

  // ─── WAITING STATE (receiver offline) ────────────────────
  function _showWaitingState() {
    _callState = "waiting";
    let remaining = 180;
    clearInterval(_waitingTimer);
    _waitingTimer = setInterval(() => {
      remaining--;
      const label = `Waiting ${String(Math.floor(remaining/60)).padStart(2,"0")}:${String(remaining%60).padStart(2,"0")}`;
      $("video-call-status").textContent = label;
      $("audio-call-status").textContent = label;
      if (remaining <= 0) {
        clearInterval(_waitingTimer);
        if (_callState === "waiting") { showToast("No answer", "info"); close(false); }
      }
    }, 1000);
    showToast("User offline — waiting up to 3 min", "info");
  }

  // ─── REJOIN FROM CALL MESSAGE ─────────────────────────────
  function rejoin(roomId, peerId, mode) {
    if (_callState !== "idle") { showToast("Already in a call", "error"); return; }
    // Store context and open call screen immediately
    _roomId = roomId; _mode = mode || "audio"; _callState = "answering";
    _activePeer = { id: peerId };
    _pendingIce = []; // Clear for rejoin call

    $("video-call-screen").style.display = _mode === "video" ? "flex" : "none";
    $("audio-call-screen").style.display = _mode === "audio" ? "flex" : "none";
    $("call-modal").classList.remove("video-mode", "audio-mode");
    $("call-modal").classList.add(`${_mode}-mode`);
    $("call-modal").classList.add("active");
    document.body.style.overflow = "hidden";
    $("video-call-status").textContent = "Connecting…";
    $("audio-call-status").textContent = "Connecting…";

    socket.emit("call:rejoin", { roomId, to: peerId });
    showToast("Joining call…", "info");

    // Auto-close if no response within 15 seconds
    clearTimeout(_autoRejectTimer);
    _autoRejectTimer = setTimeout(() => {
      if (_callState === "answering" && _roomId === roomId) {
        showToast("Call unavailable", "error");
        close(false);
      }
    }, 15000);

    _getLocalStream(_mode === "video").then(async (ok) => {
      if (!ok) { close(false); return; }
      await _createPeerConnection(peerId);
    });
  }

  // ─── INCOMING CALL POPUP ─────────────────────────────────
  function showIncoming(from, type, offerSdp, roomId, isRejoin) {
    // If we're already connected (ICE restart offer) — handle as renegotiation
    if (_callState === "connected" && _pc && _roomId === roomId) {
      _handleRenegotiation(from, offerSdp);
      return;
    }

    // Auto-accept if we initiated a rejoin for this room
    if (isRejoin && _callState === "answering" && _roomId === roomId && _pc) {
      _activePeer = from;
      _mode = type;
      _stopTones();
      clearTimeout(_autoRejectTimer);
      _pc.setRemoteDescription(new RTCSessionDescription(offerSdp))
        .then(() => {
          _remoteDescSet = true;
          return _flushPendingIce();
        })
        .then(() => _pc.createAnswer())
        .then((answer) => _pc.setLocalDescription(answer).then(() => answer))
        .then((answer) => {
          socket.emit("call:accept", { to: from.id, type, sdp: answer, roomId });
        })
        .catch((err) => {
          console.error("[WebRTC] Auto-accept rejoin failed:", err);
          close(true);
        });
      return;
    }

    // Busy → auto-reject
    if (_callState !== "idle") {
      socket.emit("call:reject", { to: from.id });
      return;
    }

    _callState = "incoming"; _activePeer = from; _mode = type; _roomId = roomId;
    _pendingIce = []; // Clear for new incoming call

    // Inject call message into receiver's chat immediately
    _injectCallMessage(from.id, false);

    const popup = $("incoming-call-popup");
    $("incoming-caller-name").textContent   = from.username;
    $("incoming-caller-avatar").textContent = (from.avatar?.length > 2)
      ? from.avatar : from.username?.charAt(0).toUpperCase() || "?";
    $("incoming-call-type").textContent = isRejoin
      ? (type === "video" ? "📹" : "📞") + " Rejoining call…"
      : type === "video" ? "📹 Incoming video call" : "📞 Incoming voice call";
    popup.classList.add("active");
    popup.dataset.callType  = type;
    popup.dataset.callerId  = from.id;
    popup.dataset.offerSdp  = offerSdp ? JSON.stringify(offerSdp) : "";

    _startRingtone();

    // Auto-reject after 60s — not 40s, gives more time on slow mobile
    clearTimeout(_autoRejectTimer);
    _autoRejectTimer = setTimeout(() => {
      if (_callState === "incoming") {
        _updateCallMessage("missed");
        socket.emit("call:declined", { to: from.id, roomId });
        $("incoming-call-popup").classList.remove("active");
        _stopTones(); _callState = "idle"; _activePeer = null;
      }
    }, 60000);
  }

  // Handle ICE restart offer when already connected
  async function _handleRenegotiation(from, offerSdp) {
    if (!offerSdp || !_pc) return;
    try {
      _remoteDescSet = false;
      await _pc.setRemoteDescription(new RTCSessionDescription(offerSdp));
      _remoteDescSet = true;
      await _flushPendingIce();
      const answer = await _pc.createAnswer();
      await _pc.setLocalDescription(answer);
      socket.emit("call:accept", { to: from.id || _activePeer.id, type: _mode, sdp: answer });
    } catch (err) { console.error("[WebRTC] Renegotiation failed:", err); }
  }

  // ─── ACCEPT ──────────────────────────────────────────────
  async function accept() {
    clearTimeout(_autoRejectTimer);
    const popup    = $("incoming-call-popup");
    const type     = popup.dataset.callType  || "audio";
    const callerId = popup.dataset.callerId;
    const offerSdp = popup.dataset.offerSdp ? JSON.parse(popup.dataset.offerSdp) : null;

    popup.classList.remove("active");
    _stopTones();
    _iceServersPromise = null;

    // NOTE: _callState stays "answering" — only set to "connected" in ontrack
    _mode = type; _callState = "answering"; _muted = false; _camOff = false;

    $("video-call-screen").style.display = type === "video" ? "flex" : "none";
    $("audio-call-screen").style.display = type === "audio" ? "flex" : "none";
    $("call-modal").classList.remove("video-mode", "audio-mode");
    $("call-modal").classList.add(`${type}-mode`);
    $("call-modal").classList.add("active");
    document.body.style.overflow = "hidden";
    $("video-call-status").textContent = "Connecting…";
    $("audio-call-status").textContent = "Connecting…";

    const ok = await _getLocalStream(type === "video");
    if (!ok) { reject(callerId); return; }

    await _createPeerConnection(callerId);

    try {
      if (offerSdp) {
        // Set remote description (the caller's offer)
        await _pc.setRemoteDescription(new RTCSessionDescription(offerSdp));
        _remoteDescSet = true;
        // Flush any ICE candidates that arrived before remoteDesc was set
        await _flushPendingIce();
      }

      // Create and send answer
      const answer = await _pc.createAnswer();
      await _pc.setLocalDescription(answer);
      socket.emit("call:accept", { to: callerId, type, sdp: answer, roomId: _roomId });

    } catch (err) {
      console.error("[WebRTC] accept failed:", err);
      showToast("Failed to connect call", "error");
      close(false);
    }
  }

  // ─── REJECT ──────────────────────────────────────────────
  function reject(callerId) {
    clearTimeout(_autoRejectTimer);
    $("incoming-call-popup")?.classList.remove("active");
    _stopTones();
    _updateCallMessage("declined");
    const id = callerId || $("incoming-call-popup")?.dataset.callerId;
    if (id) socket.emit("call:reject", { to: id, roomId: _roomId });
    _callState = "idle"; _activePeer = null;
  }

  // ─── CLOSE / END CALL ────────────────────────────────────
  function close(notify = true) {
    const duration = _callStartTime ? Math.floor((Date.now() - _callStartTime) / 1000) : 0;

    clearTimeout(_autoRejectTimer);
    clearTimeout(_iceRestartTimer);
    clearInterval(_waitingTimer);

    if (notify && _activePeer?.id && socket && _callState !== "idle") {
      socket.emit("call:end", { to: _activePeer.id, duration, roomId: _roomId });
    }

    const wasConnected = _callState === "connected";
    _updateCallMessage(wasConnected ? "ended" : "missed", duration);

    _stopTimer(); _stopTones(); _stopLocalStream(); _closePeerConnection();
    $("call-modal").classList.remove("active");
    $("call-modal").classList.remove("minimized");
    $("call-modal").classList.remove("video-mode", "audio-mode");
    $("audio-waves")?.classList.remove("active");
    document.body.style.overflow = "";

    _callState = "idle"; _activePeer = null; _mode = null;
    _roomId = null; _callStartTime = null;
  }

  // ─── MUTE / CAM / SPEAKER ────────────────────────────────
  function toggleMute(screen) {
    _muted = !_muted;
    _localStream?.getAudioTracks().forEach(t => { t.enabled = !_muted; });
    const btn = $(screen === "video" ? "vc-mute-btn" : "ac-mute-btn");
    btn?.classList.toggle("ctrl-active", _muted);
    if (btn) btn.innerHTML = _muted
      ? `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="1" y1="1" x2="23" y2="23"/><path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6"/><path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2a7 7 0 0 1-.11 1.23"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>`
      : `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>`;
    showToast(_muted ? "Mic muted" : "Mic on", "info");
  }

  function toggleCamera() {
    _camOff = !_camOff;
    _localStream?.getVideoTracks().forEach(t => { t.enabled = !_camOff; });
    const btn = $("vc-cam-btn");
    btn?.classList.toggle("ctrl-active", _camOff);
    if (btn) btn.innerHTML = _camOff
      ? `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="1" y1="1" x2="23" y2="23"/><path d="M21 21H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h3m3-3h6l2 3h4a2 2 0 0 1 2 2v9.34"/><circle cx="12" cy="13" r="3"/></svg>`
      : `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/></svg>`;
    const lv = $("local-video");
    if (lv) lv.style.opacity = _camOff ? "0" : "1";
    showToast(_camOff ? "Camera off" : "Camera on", "info");
  }

  function toggleSpeaker() {
    _speakerOn = !_speakerOn;
    $("ac-speaker-btn")?.classList.toggle("ctrl-active", !_speakerOn);
    showToast(_speakerOn ? "Speaker on" : "Earpiece mode", "info");
  }

  // ─── SWITCH VIDEO ↔ AUDIO ────────────────────────────────
  async function switchMode() {
    if (!_pc || !_activePeer) return;
    const newMode = _mode === "video" ? "audio" : "video";
    _mode = newMode;
    $("video-call-screen").style.display = newMode === "video" ? "flex" : "none";
    $("audio-call-screen").style.display = newMode === "audio" ? "flex" : "none";
    $("call-modal").classList.remove("video-mode", "audio-mode");
    $("call-modal").classList.add(`${newMode}-mode`);

    if (newMode === "audio") {
      _localStream?.getVideoTracks().forEach(t => { t.stop(); _localStream.removeTrack(t); });
      const lv = $("local-video"); if (lv) lv.srcObject = null;
    } else {
      try {
        const vs = await navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { ideal: 24, max: 30 } }
        });
        const vt = vs.getVideoTracks()[0];
        _localStream?.addTrack(vt);
        const lv = $("local-video");
        if (lv) { lv.srcObject = _localStream; lv.style.opacity = "1"; lv.play().catch(() => {}); }
      } catch (err) {
        showToast("Could not open camera", "error");
        _mode = "audio";
        $("video-call-screen").style.display = "none";
        $("audio-call-screen").style.display = "flex";
        $("call-modal").classList.remove("video-mode", "audio-mode");
        $("call-modal").classList.add("audio-mode");
        return;
      }
    }

    const senders = _pc.getSenders();
    _localStream?.getTracks().forEach(t => {
      const s = senders.find(x => x.track?.kind === t.kind);
      if (s) s.replaceTrack(t); else _pc.addTrack(t, _localStream);
    });

    showToast(newMode === "audio" ? "Switched to voice call" : "Switched to video call", "success");
  }

  // ─── SOCKET EVENTS ───────────────────────────────────────
  function wireSocket(sock) {

    // Incoming call offer
    sock.on("call:offer", ({ from, type, sdp, roomId, isRejoin }) => {
      showIncoming(from, type, sdp, roomId, isRejoin);
    });

    // Receiver was offline — show waiting state to caller
    sock.on("call:receiver_offline", () => {
      if (_callState === "outgoing") _showWaitingState();
    });

    // Caller: offline receiver came back and wants to rejoin
    sock.on("call:rejoin_request", async ({ from: fromId, roomId }) => {
      if (_callState !== "waiting" && _callState !== "connected") return;
      try {
        _iceServersPromise = null;
        _pendingIce = []; // Clear for rejoin response
        await _createPeerConnection(fromId);
        const offer = await _pc.createOffer({
          offerToReceiveAudio: true,
          offerToReceiveVideo: _mode === "video",
        });
        await _pc.setLocalDescription(offer);
        socket.emit("call:rejoin_offer", { to: fromId, sdp: offer, roomId, type: _mode });
        if (_callState === "waiting") {
          _callState = "outgoing";
          clearInterval(_waitingTimer);
          _startDialtone();
        }
      } catch (err) { console.error("[WebRTC] rejoin offer failed:", err); }
    });

    // Caller gets back the answer SDP from receiver
    sock.on("call:accept", async ({ sdp }) => {
      console.log("[WebRTC] call:accept received, _pc exists:", !!_pc, "sdp type:", sdp?.type);
      _stopTones();
      clearInterval(_waitingTimer);
      if (!_pc) {
        console.error("[WebRTC] call:accept: _pc is null — peer connection was closed");
        return;
      }
      if (!sdp) {
        console.error("[WebRTC] call:accept: no SDP in payload");
        return;
      }
      // Validate we're in the right state for setRemoteDescription
      const sigState = _pc.signalingState;
      console.log("[WebRTC] signalingState before setRemoteDescription:", sigState);
      if (sigState !== "have-local-offer") {
        console.error("[WebRTC] Wrong signalingState for answer:", sigState, "— ignoring");
        return;
      }
      try {
        await _pc.setRemoteDescription(new RTCSessionDescription(sdp));
        _remoteDescSet = true;
        console.log("[WebRTC] setRemoteDescription(answer) OK — flushing", _pendingIce.length, "ICE candidates");
        await _flushPendingIce();
      } catch (err) {
        console.error("[WebRTC] setRemoteDescription(answer) FAILED:", err);
      }
    });

    // ICE candidates — buffer until remoteDesc is ready
    sock.on("call:ice", async ({ candidate }) => {
      if (!candidate) return;
      if (_pc && _remoteDescSet) {
        try { await _pc.addIceCandidate(new RTCIceCandidate(candidate)); }
        catch (e) { console.warn("[WebRTC] addIceCandidate:", e.message); }
      } else {
        // Buffer — will be flushed after setRemoteDescription completes
        _pendingIce.push(candidate);
        console.log("[WebRTC] ICE buffered (remoteDesc not set yet), total buffered:", _pendingIce.length);
      }
    });

    sock.on("call:reject", () => {
      _stopTones();
      clearInterval(_waitingTimer);
      _updateCallMessage("declined");
      showToast("Call was declined", "info");
      close(false);
    });

    sock.on("call:end", ({ duration }) => {
      const d = duration || 0;
      const dur = d > 0
        ? ` (${String(Math.floor(d/60)).padStart(2,"0")}:${String(d%60).padStart(2,"0")})`
        : "";
      showToast(`Call ended${dur}`, "info");
      close(false);
    });

    // Missed call message when we were offline (backend sends this on reconnect)
    sock.on("call:missed_message", ({ message }) => {
      const convId = message.from?.toString();
      if (!convId) return;
      if (!State.messages[convId]) State.messages[convId] = [];
      if (!State.messages[convId].some(m => m.id === message.id || m.tempId === message.tempId)) {
        State.messages[convId].unshift({
          ...message, sender: "other", user: convId,
        });
        State.messageIndex[message.id || message.tempId] = convId;
      }
      const conv = State.conversations.find(c => c.id === convId);
      if (conv) {
        conv.lastMessage = message.callType === "video" ? "📹 Video call" : "📞 Voice call";
        conv.timestamp   = Date.now();
        conv.unread      = (conv.unread || 0) + 1;
      }
      renderChatList();
      if (State.activeChat === convId) {
        const mc = document.getElementById("messages");
        if (mc) {
          mc.appendChild(createMessageElement({ ...message, sender: "other", user: convId }));
          document.getElementById("messages-container").scrollTop = 99999;
        }
      }
      showToast("📞 Missed call", "info");
    });
  }

  // ─── DRAG & PIP / MINIMIZE ────────────────────────────────
  let _dragCleanup = null;

  function getCallState() {
    return _callState;
  }

  function minimize() {
    if (_callState === "idle") return;
    $("call-modal").classList.add("minimized");
    document.body.style.overflow = ""; // restore scroll for chat
    _makeDraggable($("call-modal"));
    showToast("Call minimized", "info");
  }

  function restore() {
    if (!$("call-modal").classList.contains("minimized")) return;
    $("call-modal").classList.remove("minimized");
    document.body.style.overflow = "hidden"; // disable scroll
    // Clear drag offset styles
    $("call-modal").style.top = "";
    $("call-modal").style.left = "";
    $("call-modal").style.bottom = "";
    $("call-modal").style.right = "";
    _destroyDraggable($("call-modal"));
  }

  function _makeDraggable(el) {
    if (_dragCleanup) _dragCleanup();

    let pos1 = 0, pos2 = 0, pos3 = 0, pos4 = 0;
    let isDragging = false;
    let startTime = 0;
    let startX = 0, startY = 0;

    const dragMouseDown = (e) => {
      e = e || window.event;
      if (!el.classList.contains("minimized")) return;
      
      // Ignore click on active buttons or controls inside
      if (e.target.tagName === "BUTTON" || e.target.closest("button") || e.target.closest("svg")) return;

      startTime = Date.now();
      isDragging = false;

      const clientX = e.clientX || (e.touches && e.touches[0].clientX);
      const clientY = e.clientY || (e.touches && e.touches[0].clientY);
      pos3 = clientX;
      pos4 = clientY;
      startX = clientX;
      startY = clientY;

      if (e.type === "touchstart") {
        document.addEventListener("touchmove", elementDrag, { passive: false });
        document.addEventListener("touchend", closeDragElement, { passive: true });
      } else {
        e.preventDefault();
        document.onmouseup = closeDragElement;
        document.onmousemove = elementDrag;
      }
    };

    const elementDrag = (e) => {
      e = e || window.event;
      if (!el.classList.contains("minimized")) return;
      e.preventDefault();
      isDragging = true;

      const clientX = e.clientX || (e.touches && e.touches[0].clientX);
      const clientY = e.clientY || (e.touches && e.touches[0].clientY);

      pos1 = pos3 - clientX;
      pos2 = pos4 - clientY;
      pos3 = clientX;
      pos4 = clientY;

      const newTop = el.offsetTop - pos2;
      const newLeft = el.offsetLeft - pos1;

      // Bound within viewport limits (10px margin)
      const maxLeft = window.innerWidth - el.offsetWidth - 10;
      const maxTop = window.innerHeight - el.offsetHeight - 10;

      el.style.top = `${Math.max(10, Math.min(newTop, maxTop))}px`;
      el.style.left = `${Math.max(10, Math.min(newLeft, maxLeft))}px`;
      el.style.bottom = "auto";
      el.style.right = "auto";
    };

    const closeDragElement = (e) => {
      document.onmouseup = null;
      document.onmousemove = null;
      document.removeEventListener("touchmove", elementDrag);
      document.removeEventListener("touchend", closeDragElement);

      const dragDuration = Date.now() - startTime;
      const endX = e.clientX || (e.changedTouches && e.changedTouches[0].clientX) || pos3;
      const endY = e.clientY || (e.changedTouches && e.changedTouches[0].clientY) || pos4;
      const distance = Math.sqrt(Math.pow(endX - startX, 2) + Math.pow(endY - startY, 2));

      // Restore if it's a simple tap/click
      if (!isDragging || distance < 6 || dragDuration < 220) {
        restore();
      }
    };

    el.addEventListener("mousedown", dragMouseDown);
    el.addEventListener("touchstart", dragMouseDown, { passive: false });

    _dragCleanup = () => {
      el.removeEventListener("mousedown", dragMouseDown);
      el.removeEventListener("touchstart", dragMouseDown);
      document.onmouseup = null;
      document.onmousemove = null;
      document.removeEventListener("touchmove", elementDrag);
      document.removeEventListener("touchend", closeDragElement);
      _dragCleanup = null;
    };
  }

  function _destroyDraggable(el) {
    if (_dragCleanup) _dragCleanup();
  }

  // ─── INIT BUTTONS ────────────────────────────────────────
  function initButtons() {
    $("video-call-btn")?.addEventListener("click", () => open("video"));
    $("audio-call-btn")?.addEventListener("click", () => open("audio"));
    $("chatOption-VideoCall")?.addEventListener("click", () => {
      document.getElementById("chatOption")?.classList.remove("active");
      open("video");
    });
    $("chatOption-AudioCall")?.addEventListener("click", () => {
      document.getElementById("chatOption")?.classList.remove("active");
      open("audio");
    });
    $("vc-mute-btn")?.addEventListener("click",   () => toggleMute("video"));
    $("vc-cam-btn")?.addEventListener("click",    () => toggleCamera());
    $("vc-switch-btn")?.addEventListener("click", () => switchMode());
    $("vc-end-btn")?.addEventListener("click",    () => close());
    $("ac-mute-btn")?.addEventListener("click",   () => toggleMute("audio"));
    $("ac-speaker-btn")?.addEventListener("click",() => toggleSpeaker());
    $("ac-switch-btn")?.addEventListener("click", () => switchMode());
    $("ac-end-btn")?.addEventListener("click",    () => close());
    $("call-accept-btn")?.addEventListener("click",() => accept());
    $("call-reject-btn")?.addEventListener("click",() => reject());
    $("call-minimize-btn")?.addEventListener("click", (e) => {
      e.stopPropagation();
      minimize();
    });
    $("call-modal")?.addEventListener("click", e => {
      if ($("call-modal").classList.contains("minimized")) return;
      if (e.target.id === "call-modal" && _callState !== "connected") close();
    });
  }

  return { open, close, accept, reject, rejoin, wireSocket, initButtons, minimize, restore, getCallState };

})();

document.addEventListener("DOMContentLoaded", () => CallManager.initButtons());