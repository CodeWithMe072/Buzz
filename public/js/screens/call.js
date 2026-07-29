/**
 * public/js/screens/call.js — Dynamic JS module for WebRTC voice & video calls
 */

export async function init() {
    

    // Load Call UI HTML if not present
    if (!document.getElementById("call-modal")) {
        try {
            ComponentLoader.load("call").then(html => {

                const wrapper = document.createElement("div");
                wrapper.innerHTML = html;
                while (wrapper.firstChild) {
                    document.body.appendChild(wrapper.firstChild);
                }
            })
        } catch (err) {
            console.error("[Screen:Call] Failed to load call UI partial:", err);
        }
    }

    await Promise.all([
        ComponentLoader.loadScript("/js/call.js")
    ]);

    // Wire up CallManager with socket if socket is active
    if (typeof CallManager !== "undefined") {
        // Use the deferred socket reference from setupSocket(), or fallback to global
        const activeSocket = window._pendingCallSocket || window.socket;
        if (activeSocket) {
            CallManager.wireSocket(activeSocket);
            console.log("[Screen:Call] CallManager wired to socket:", activeSocket.id);
        } else {
            console.warn("[Screen:Call] No active socket found for CallManager");
        }
        if (CallManager.initButtons) {
            CallManager.initButtons();
        }
    }

    
}
