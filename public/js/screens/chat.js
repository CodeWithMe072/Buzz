/**
 * public/js/screens/chat.js — Dynamic JS module for Chat Screen
 */

export async function init() {
    console.log("[Screen:Chat] Loading critical chat dependency scripts...");

    // 1. Load critical scripts first
    await Promise.all([
        ComponentLoader.loadScript("/js/auth.js"),
        ComponentLoader.loadScript("/js/messages.dom.js"),
        ComponentLoader.loadScript("/js/socket.js"),
        ComponentLoader.loadScript("/js/chat.js"),
        ComponentLoader.loadScript("/js/input.js")
    ]);

    try {
        // 2. Load the message-window layout EJS partial into the chat-window container
        const messageWindowHtml = await ComponentLoader.load("chat/message-window");
        const chatWindowEl = document.getElementById("chat-window");
        if (chatWindowEl) {
            chatWindowEl.innerHTML = messageWindowHtml;
        }
    } catch (err) {
        console.error("[Screen:Chat] Failed to load chat/message-window EJS partial:", err);
    }

    // 3. Initialize critical bindings
    if (typeof initPeoplePanel === "function") {
        initPeoplePanel();
    }
    if (typeof initChatWindow === "function") {
        initChatWindow();
    }
    if (typeof initShowMedia === "function") {
        initShowMedia();
    }
    if (typeof initMuteState === "function") {
        initMuteState();
    }

    console.log("[Screen:Chat] Critical dependencies loaded.");
}

// 4. Define background loading of other components and scripts (to be called after connections load)
window.startBackgroundLoading = function() {
    if (window.chatBackgroundLoadStarted) return;
    window.chatBackgroundLoadStarted = true;

    console.log("[Screen:Chat] Starting background loading: emoji, call, and secondary scripts...");
    
    window.chatBackgroundLoadPromise = (async () => {
        try {
            await Promise.all([
                // Load emoji template and script
                (async () => {
                    if (!document.getElementById("emoji-modal")) {
                        const emojiHtml = await ComponentLoader.load("emoji");
                        const wrapper = document.createElement("div");
                        wrapper.innerHTML = emojiHtml;
                        while (wrapper.firstChild) {
                            document.body.appendChild(wrapper.firstChild);
                        }
                    }
                    await ComponentLoader.loadScript("/js/emoji.panel.js");
                    if (typeof EmojiPanel !== "undefined" && EmojiPanel.init) {
                        EmojiPanel.init();
                    }
                })(),

                // Load WebRTC call overlay and script
                (async () => {
                    try {
                        const { init: initCall } = await import("/js/screens/call.js");
                        await initCall();
                    } catch (err) {
                        console.error("[Screen:Chat] Failed to load call UI/scripts in background:", err);
                    }
                })(),

                // Load audio player script
                ComponentLoader.loadScript("/js/audio.player.js"),
                
                // Load media viewer template and script
                (async () => {
                    if (!document.getElementById("mediaViewer")) {
                        const mediaHtml = await ComponentLoader.load("media");
                        const wrapper = document.createElement("div");
                        wrapper.innerHTML = mediaHtml;
                        document.body.appendChild(wrapper.firstElementChild);
                    }
                    await ComponentLoader.loadScript("/js/media.viewer.js");
                })(),

                // Load camera capture script and bind actions
                (async () => {
                    await ComponentLoader.loadScript("/js/camera.capture.js");
                    if (typeof initCameraCapture === "function") {
                        initCameraCapture();
                    }
                })(),

                // Load voice stream script
                ComponentLoader.loadScript("/js/voice.stream.js")
            ]);

            console.log("[Screen:Chat] Background dependencies fully loaded.");
        } catch (err) {
            console.error("[Screen:Chat] Error during background load:", err);
        }
    })();
};

