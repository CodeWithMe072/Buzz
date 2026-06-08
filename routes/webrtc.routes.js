import express from "express";
import { protect } from "../middleware/auth.middleware.js";

const router = express.Router();

/* ═══════════════════════════════════════════════════════════════
   ICE / TURN credentials endpoint
   GET /api/webrtc/ice-servers

   Returns a full ICE server list:
   - 5 Google STUN servers (fast direct path, no auth needed)
   - Metered TURN servers with UDP, TCP, and TLS/443 variants
     (TLS port 443 works through all firewalls and mobile DPI)

   Called fresh before every call — credentials have ~1hr TTL
═══════════════════════════════════════════════════════════════ */
router.get("/ice-servers", protect, async (req, res) => {
    // Always include Google STUN as fast-path fallback
    const stunServers = [
        { urls: "stun:stun.l.google.com:19302" },
        { urls: "stun:stun1.l.google.com:19302" },
        { urls: "stun:stun2.l.google.com:19302" },
        { urls: "stun:stun3.l.google.com:19302" },
        { urls: "stun:stun4.l.google.com:19302" },
    ];

    // Validate env vars exist
    if (!process.env.METERED_DOMAIN || !process.env.METERED_API_KEY) {
        console.warn("[ICE] METERED_DOMAIN or METERED_API_KEY not set in .env — returning STUN only");
        return res.json({ success: true, data: stunServers });
    }

    try {
        const url = `https://${process.env.METERED_DOMAIN}/api/v1/turn/credentials?apiKey=${process.env.METERED_API_KEY}`;
        const response = await fetch(url, { signal: AbortSignal.timeout(5000) });

        if (!response.ok) {
            throw new Error(`Metered API ${response.status}: ${await response.text()}`);
        }

        const turnServers = await response.json();

        if (!Array.isArray(turnServers) || turnServers.length === 0) {
            throw new Error("Metered returned empty server list");
        }

        const iceServers = [...stunServers];

        for (const s of turnServers) {
            // Add the server as-is
            iceServers.push(s);

            const rawUrl = typeof s.urls === "string" ? s.urls : (Array.isArray(s.urls) ? s.urls[0] : "");
            if (!rawUrl) continue;

            // Add TCP variant — works when UDP is blocked (common on mobile data)
            if (rawUrl.startsWith("turn:") && !rawUrl.includes("transport=tcp")) {
                iceServers.push({
                    urls: rawUrl + (rawUrl.includes("?") ? "&" : "?") + "transport=tcp",
                    username: s.username,
                    credential: s.credential,
                });
            }

            // Add TLS/443 variant — works through DPI, strict firewalls, Telegram WebView
            // Port 443 looks like HTTPS to ISPs so it's almost never blocked
            if (rawUrl.startsWith("turn:") && !rawUrl.includes(":443")) {
                const host = rawUrl.replace(/^turn:/, "").split(/[:?]/)[0];
                iceServers.push({
                    urls: `turns:${host}:443?transport=tcp`,
                    username: s.username,
                    credential: s.credential,
                });
            }
        }

        console.log(`[ICE] Returning ${iceServers.length} servers (${turnServers.length} from Metered + ${stunServers.length} STUN + variants)`);
        res.json({ success: true, data: iceServers });

    } catch (error) {
        console.error("[ICE] Metered fetch failed:", error.message);
        // Fall back to STUN — calls will work on same network / direct IP
        res.json({ success: true, data: stunServers });
    }
});

/* ═══════════════════════════════════════════════════════════════
   DEBUG endpoint — test your TURN setup without making a call
   GET /api/webrtc/ice-test  (no auth required for testing)

   Open in browser: https://yourapp.com/api/webrtc/ice-test
   Should show a list of servers with type=relay candidates
═══════════════════════════════════════════════════════════════ */
router.get("/ice-test", async (req, res) => {
    if (process.env.NODE_ENV === "PROD") {
        return res.status(404).json({ message: "Not available in production" });
    }

    const checks = {
        METERED_DOMAIN: process.env.METERED_DOMAIN ? "✅ set" : "❌ MISSING",
        METERED_API_KEY: process.env.METERED_API_KEY ? "✅ set" : "❌ MISSING",
        meteredResponse: null,
        serverCount: 0,
        hasRelayServers: false,
        hasTlsServer: false,
    };

    
    try {
        if (process.env.METERED_DOMAIN && process.env.METERED_API_KEY) {
            const url = `https://${process.env.METERED_DOMAIN}/api/v1/turn/credentials?apiKey=${process.env.METERED_API_KEY}`;
            const r = await fetch(url, { signal: AbortSignal.timeout(5000) });
            const data = await r.json();
            checks.meteredResponse = r.ok ? "✅ OK" : `❌ HTTP ${r.status}`;
            checks.serverCount = Array.isArray(data) ? data.length : 0;
            checks.hasRelayServers = checks.serverCount > 0;
            checks.hasTlsServer = Array.isArray(data) && data.some(s =>
                (typeof s.urls === "string" ? s.urls : "").includes("443")
            );
            checks.servers = data;
        }
    } catch (e) {
        checks.meteredResponse = `❌ ${e.message}`;
    }

    res.json(checks);
});

export default router;