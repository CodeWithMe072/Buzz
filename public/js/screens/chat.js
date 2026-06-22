/**
 * public/js/screens/chat.js — Dynamic JS module for Chat Screen
 */

export async function init() {
    console.log("[Screen:Chat] Loading chat dependency scripts...");
    
    await Promise.all([
        ComponentLoader.loadScript("/js/auth.js"),
        ComponentLoader.loadScript("/js/emoji.panel.js"),
        ComponentLoader.loadScript("/js/audio.player.js"),
        ComponentLoader.loadScript("/js/media.viewer.js"),
        ComponentLoader.loadScript("/js/messages.dom.js"),
        ComponentLoader.loadScript("/js/socket.js"),
        ComponentLoader.loadScript("/js/chat.js"),
        ComponentLoader.loadScript("/js/input.js"),
        ComponentLoader.loadScript("/js/camera.capture.js"),
        ComponentLoader.loadScript("/js/voice.stream.js")
    ]);
    
    // Load and mount overlays first
    try {
        // 1. Emoji panel overlays (reactions, custom gif modal, confirms)
        if (!document.getElementById("emoji-modal")) {
            const emojiHtml = await ComponentLoader.load("emoji");
            const wrapper = document.createElement("div");
            wrapper.innerHTML = emojiHtml;
            while (wrapper.firstChild) {
                document.body.appendChild(wrapper.firstChild);
            }
        }

        // 2. Media viewer overlays
        if (!document.getElementById("mediaViewer")) {
            const mediaHtml = await ComponentLoader.load("media");
            const wrapper = document.createElement("div");
            wrapper.innerHTML = mediaHtml;
            document.body.appendChild(wrapper.firstElementChild);
        }
        
        // 3. Load the message-window layout EJS partial into the chat-window container
        const messageWindowHtml = await ComponentLoader.load("chat/message-window");
        const chatWindowEl = document.getElementById("chat-window");
        if (chatWindowEl) {
            chatWindowEl.innerHTML = messageWindowHtml;
        }

        // 4. Load WebRTC Call overlays and scripts dynamically
        try {
            const { init: initCall } = await import("/js/screens/call.js");
            await initCall();
        } catch (err) {
            console.error("[Screen:Chat] Failed to load call UI/scripts:", err);
        }
    } catch (err) {
        console.error("[Screen:Chat] Failed to load chat EJS partials:", err);
    }
    
    // Initialize the people panel / profile modal bindings (from auth.js)
    if (typeof initPeoplePanel === "function") {
        initPeoplePanel();
    }

    // Initialize the chat window bindings (from input.js)
    if (typeof initChatWindow === "function") {
        initChatWindow();
    }

    // Initialize show media bindings (from ui.extras.js)
    if (typeof initShowMedia === "function") {
        initShowMedia();
    }

    // Initialize camera capture bindings (from camera.capture.js)
    if (typeof initCameraCapture === "function") {
        initCameraCapture();
    }

    // Initialize mute state bindings (from ui.extras.js)
    if (typeof initMuteState === "function") {
        initMuteState();
    }

    // Initialize the emoji panel bindings (from emoji.panel.js)
    if (typeof EmojiPanel !== "undefined" && EmojiPanel.init) {
        EmojiPanel.init();
    }
    
    console.log("[Screen:Chat] Chat dependencies loaded and initialized.");
}
