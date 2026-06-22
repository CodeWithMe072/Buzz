/**
 * public/js/screens/call.js — Dynamic JS module for WebRTC voice & video calls
 */

export async function init() {
    console.log("[Screen:Call] Loading call manager UI and scripts...");
    
    // Load Call UI HTML if not present
    if (!document.getElementById("call-modal")) {
        try {
            const html = await ComponentLoader.load("call");
            const wrapper = document.createElement("div");
            wrapper.innerHTML = html;
            while (wrapper.firstChild) {
                document.body.appendChild(wrapper.firstChild);
            }
        } catch (err) {
            console.error("[Screen:Call] Failed to load call UI partial:", err);
        }
    }

    await Promise.all([
        ComponentLoader.loadScript("/js/call.js")
    ]);
    
    // Wire up CallManager with socket if socket is active
    if (typeof CallManager !== "undefined") {
        if (window.socket) {
            CallManager.wireSocket(window.socket);
        }
        if (CallManager.initButtons) {
            CallManager.initButtons();
        }
    }
    
    console.log("[Screen:Call] WebRTC call manager loaded.");
}
