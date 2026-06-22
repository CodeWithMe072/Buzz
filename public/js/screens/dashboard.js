/**
 * public/js/screens/dashboard.js — Dynamic JS module for the decoy Dashboard
 */

export async function init() {
    console.log("[Screen:Dashboard] Loading dashboard scripts...");
    
    const savedUser = localStorage.getItem("SSC_USER");
    const savedToken = typeof TokenStore !== "undefined" ? TokenStore.getToken() : null;
    const loggedIn = !!(savedUser && savedToken);

    if (loggedIn) {
        // Load password overlay in the background so it's in the DOM for emblem click or tests, but not active.
        let passwordOverlay = document.getElementById("passwordOverlay");
        if (!passwordOverlay) {
            try {
                const html = await ComponentLoader.load("password-overlay");
                const wrapper = document.createElement("div");
                wrapper.innerHTML = html;
                passwordOverlay = wrapper.firstElementChild;
                passwordOverlay.classList.remove("active");
                document.body.appendChild(passwordOverlay);
                
                const passwordInput = document.getElementById("passwordInput");
                if (passwordInput) {
                    passwordInput.addEventListener("keydown", e => {
                        if (e.key === "Enter") window.unlockScreen();
                    });
                }
            } catch (err) {
                console.error("Failed to load password overlay during dashboard init:", err);
            }
        }
    }

    await Promise.all([
        ComponentLoader.loadScript("/js/auth.js"),
        ComponentLoader.loadScript("/js/ui.extras.js")
    ]);
    
    // Initialize mute state and carousel if they exist in global scope
    if (window.initMuteState) {
        window.initMuteState();
    }
    
    console.log("[Screen:Dashboard] Decoy dashboard initialized.");
}
