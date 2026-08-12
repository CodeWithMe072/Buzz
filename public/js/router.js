/**
 * public/js/router.js — Client-Side SPA Router for Buzz
 *
 * Route Map:
 *   /                          → SSC Decoy Dashboard
 *   /login                     → Login Screen
 *   /signup                    → Signup / Create Password
 *   /verify/passcode           → Password Overlay
 *   /inbox                     → Chat List (Inbox)
 *   /inbox/:conversationId     → Active Conversation
 *   /status                    → Status Screen
 *   /status/:username          → Status Viewer for user
 *   /@username                 → Profile Hub
 *   /@username/:profile_option → Profile Sub-Page (account, contacts, logs, etc.)
 */

(function () {
    const Router = {
        pendingRoute: null,
        isNavigatingFromRouter: false,

        /**
         * Check if the chat screen is unlocked and mounted in the DOM
         */
        isUnlocked: function () {
            const chatScreen = document.getElementById("chat-screen");
            const dashboard = document.getElementById("ssc-dashboard");
            const isDashboardActive = dashboard && dashboard.style.display !== "none" && !dashboard.classList.contains("hidden");
            return !!chatScreen && !isDashboardActive;
        },

        /**
         * Returns true if the path leads to a sensitive (non-decoy) screen
         */
        isSensitivePath: function (path) {
            return path.startsWith("/inbox") ||
                   path.startsWith("/status") ||
                   path.startsWith("/@") ||
                   path.startsWith("/verify");
        },

        /**
         * Initialize the router, event listeners, and initial route parsing
         */
        init: function () {
            window.addEventListener("popstate", (e) => {
                if (window.__ignorePopstatesCount && window.__ignorePopstatesCount > 0) {
                    window.__ignorePopstatesCount--;
                    return;
                }

                if (window.__ignoreNextPopstate) {
                    window.__ignoreNextPopstate = false;
                    return;
                }

                if (window.__mediaViewerActive && window.activeMediaViewer) {
                    e.preventDefault();
                    e.stopImmediatePropagation();
                    window.activeMediaViewer.close(true);
                    return;
                }

                if (window.__emojiPanelActive) {
                    e.preventDefault();
                    e.stopImmediatePropagation();
                    if (typeof window.setEmojiPanelActive === "function") {
                        window.setEmojiPanelActive(false, true);
                    }
                    return;
                }

                if (window.__momentsLightboxActive && typeof window.closeMomentsLightbox === "function") {
                    e.preventDefault();
                    e.stopImmediatePropagation();
                    window.closeMomentsLightbox(true);
                    return;
                }

                if (window.__logLightboxActive && typeof window.closeLogLightbox === "function") {
                    e.preventDefault();
                    e.stopImmediatePropagation();
                    window.closeLogLightbox(true);
                    return;
                }

                if (window.__cameraTrimmerActive) {
                    e.preventDefault();
                    e.stopImmediatePropagation();
                    window.showCameraTrimmerDiscardConfirmation(true);
                    return;
                }

                if (window.__songPickerActive) {
                    e.preventDefault();
                    e.stopImmediatePropagation();
                    window.__songPickerActive = false;
                    const pickerOverlay = document.getElementById("camera-song-picker-overlay");
                    if (pickerOverlay) pickerOverlay.style.display = "none";
                    const videoPreview = document.getElementById("camera-capture-video-preview");
                    if (videoPreview && videoPreview.style.display !== "none" && videoPreview.src) {
                        videoPreview.play().catch(() => { });
                    }
                    return;
                }

                if (window.__mediaModalOpen) {
                    e.preventDefault();
                    e.stopImmediatePropagation();
                    window.showMediaDiscardConfirmation();
                    return;
                }

                if (window.__cameraPreviewActive) {
                    e.preventDefault();
                    e.stopImmediatePropagation();
                    window.showCameraPreviewDiscardConfirmation();
                    return;
                }

                if (window.__mediaGalleryActive && typeof window.closeMediaGalleryPanel === "function") {
                    e.preventDefault();
                    e.stopImmediatePropagation();
                    window.closeMediaGalleryPanel(true);
                    return;
                }

                if (window.__contactInfoSidebarActive && typeof window.closeContactInfoSidebar === "function") {
                    e.preventDefault();
                    e.stopImmediatePropagation();
                    window.closeContactInfoSidebar(true);
                    return;
                }

                const path = window.location.pathname;
                this.handleRouteChange(path, { fromPopstate: true });
            });

            // Delegate link clicks for internal SPA links
            document.addEventListener("click", (e) => {
                const target = e.target.closest("a[data-link], a[href^='/inbox'], a[href^='/status'], a[href^='/@']");
                if (target) {
                    const href = target.getAttribute("href");
                    if (href && href.startsWith("/")) {
                        e.preventDefault();
                        this.navigate(href);
                    }
                }
            });

            // If initial URL is a sensitive path, record pendingRoute and sanitize URL bar to /
            if (this.isSensitivePath(window.location.pathname)) {
                this.pendingRoute = window.location.pathname;
                window.history.replaceState({ path: "/" }, "", "/");
            }

            console.log("[Router] Initialized");
        },

        /**
         * Navigate to a new route
         * @param {string} path - Target URL path
         * @param {object} options - { replace: boolean, silent: boolean }
         */
        navigate: function (path, options = {}) {
            const { replace = false, silent = false } = options;

            // Normalize path
            if (!path) path = "/";
            if (path.length > 1 && path.endsWith("/")) path = path.slice(0, -1);

            // If app is currently locked / decoy active, sanitize URL to '/' and record pendingRoute
            if (!this.isUnlocked() && this.isSensitivePath(path)) {
                console.log("[Router] App locked. Storing pending route:", path);
                this.pendingRoute = path;
                if (window.location.pathname !== "/") {
                    window.history.replaceState({ path: "/" }, "", "/");
                }
                return;
            }

            const currentPath = window.location.pathname;
            if (currentPath !== path) {
                if (replace) {
                    window.history.replaceState({ path }, "", path);
                } else {
                    window.history.pushState({ path }, "", path);
                }
            }

            if (!silent) {
                this.handleRouteChange(path);
            }
        },

        /**
         * Route handler logic — dispatches to the correct screen handler
         */
        handleRouteChange: async function (path, options = {}) {
            if (!path) path = window.location.pathname;
            if (path.length > 1 && path.endsWith("/")) path = path.slice(0, -1);

            console.log("[Router] Route change:", path);

            // 1. Gating check if locked
            if (!this.isUnlocked()) {
                if (this.isSensitivePath(path)) {
                    this.pendingRoute = path;
                    if (window.location.pathname !== "/") {
                        window.history.replaceState({ path: "/" }, "", "/");
                    }
                }
                return;
            }

            this.isNavigatingFromRouter = true;

            if (window.location.pathname !== path) {
                window.history.replaceState({ path }, "", path);
            }

            try {
                // Route: /inbox/:conversationId/:mediaId
                const inboxMediaMatch = path.match(/^\/inbox\/([a-zA-Z0-9_-]+)\/([a-zA-Z0-9_-]+)$/);
                if (inboxMediaMatch) {
                    const convId = inboxMediaMatch[1];
                    const mediaId = inboxMediaMatch[2];
                    await this.routeToInboxMedia(convId, mediaId);
                    return;
                }

                // Route: /inbox/:conversationId
                const inboxConvMatch = path.match(/^\/inbox\/([a-zA-Z0-9_-]+)$/);
                if (inboxConvMatch) {
                    const convId = inboxConvMatch[1];
                    await this.routeToConversation(convId);
                    return;
                }

                // Route: /inbox
                if (path === "/inbox") {
                    await this.routeToInbox();
                    return;
                }

                // Route: /status/:username
                const statusUserMatch = path.match(/^\/status\/([a-zA-Z0-9_.-]+)$/);
                if (statusUserMatch) {
                    const username = statusUserMatch[1];
                    await this.routeToStatusViewer(username);
                    return;
                }

                // Route: /status
                if (path === "/status") {
                    await this.routeToStatus();
                    return;
                }

                // Route: /@username/moment/:momentId
                const momentMatch = path.match(/^\/@([a-zA-Z0-9_.-]+)\/moment\/([a-zA-Z0-9_-]+)$/);
                if (momentMatch) {
                    const username = momentMatch[1];
                    const momentId = momentMatch[2];
                    await this.routeToMoment(username, momentId);
                    return;
                }

                // Route: /@username/log/:logId
                const logMatch = path.match(/^\/@([a-zA-Z0-9_.-]+)\/log\/([a-zA-Z0-9_-]+)$/);
                if (logMatch) {
                    const username = logMatch[1];
                    const logId = logMatch[2];
                    await this.routeToLog(username, logId);
                    return;
                }

                // Route: /@username/:profile_option
                const profileOptionMatch = path.match(/^\/@([a-zA-Z0-9_.-]+)\/([a-zA-Z0-9_-]+)$/);
                if (profileOptionMatch) {
                    const username = profileOptionMatch[1];
                    const option = profileOptionMatch[2];
                    await this.routeToProfileOption(username, option);
                    return;
                }

                // Route: /@username
                const profileMatch = path.match(/^\/@([a-zA-Z0-9_.-]+)$/);
                if (profileMatch) {
                    const username = profileMatch[1];
                    await this.routeToProfile(username);
                    return;
                }

                // Route: /verify/passcode
                if (path === "/verify/passcode") {
                    // Show password overlay if it exists
                    const passwordOverlay = document.getElementById("passwordOverlay");
                    if (passwordOverlay) {
                        passwordOverlay.classList.add("active");
                    }
                    return;
                }

                // Route: /login
                if (path === "/login") {
                    return;
                }

                // Route: /signup
                if (path === "/signup") {
                    return;
                }

                // Route: / or unknown routes when unlocked -> default to /inbox
                if (path === "/") {
                    this.navigate("/inbox", { replace: true });
                }
            } finally {
                this.isNavigatingFromRouter = false;
            }
        },

        /**
         * Route to specific conversation view
         */
        routeToConversation: async function (convId) {
            // Ensure chat UI is mounted
            if (!document.getElementById("chat-screen")) {
                if (window.bootstrapAfterLogin) {
                    await window.bootstrapAfterLogin();
                }
            }

            // Ensure chat sidebar is visible (switch away from status/profile if needed)
            await this._ensureChatView();

            // Check if conversation exists in State
            if (window.State && window.State.conversations) {
                const conv = window.State.conversations.find(c => c.id === convId || c.username === convId);
                if (conv) {
                    if (typeof window.openChat === "function") {
                        window.openChat(conv.id, { updateUrl: false });
                    }
                } else {
                    console.warn("[Router] Conversation not found in contacts:", convId);
                    // If conversations are loaded but ID/username is not found, fallback to inbox
                    if (window.State.apiMessagesLoaded || window.State.conversations.length > 0) {
                        if (typeof window.showToast === "function") {
                            window.showToast("Conversation not found", "error");
                        }
                        this.navigate("/inbox", { replace: true });
                    }
                }
            }
        },

        /**
         * Route to specific media in a conversation
         */
        routeToInboxMedia: async function (convId, mediaId) {
            // First ensure we're in the conversation
            await this.routeToConversation(convId);

            // Wait until messages are loaded in State
            const checkAndOpen = () => {
                const conv = window.State && window.State.conversations && window.State.conversations.find(c => c.id === convId || c.username === convId);
                if (conv && conv.messagesLoaded) {
                    if (typeof window.openChatMediaViewer === "function") {
                        window.openChatMediaViewer(mediaId);
                    }
                } else {
                    setTimeout(checkAndOpen, 100);
                }
            };
            checkAndOpen();
        },

        /**
         * Route to inbox view (no active conversation open)
         */
        routeToInbox: async function () {
            // Ensure chat UI is mounted
            if (!document.getElementById("chat-screen")) {
                if (window.bootstrapAfterLogin) {
                    await window.bootstrapAfterLogin();
                }
            }

            // Ensure chat sidebar is visible
            await this._ensureChatView();

            if (window.State) {
                window.State.activeChat = null;
            }

            const emptyState = document.getElementById("chat-empty-state");
            const activeChat = document.getElementById("active-chat");
            if (emptyState) emptyState.style.display = "flex";
            if (activeChat) activeChat.style.display = "none";

            // Mobile view handling: show sidebar, hide chat window
            const chatListSidebar = document.getElementById("chat-list-sidebar");
            const chatWindow = document.getElementById("chat-window");
            if (chatListSidebar) chatListSidebar.classList.remove("hidden");
            if (chatWindow) chatWindow.classList.remove("active");

            // Show navbar on mobile
            const navbar = document.querySelector(".app-navbar");
            if (navbar) navbar.style.display = "flex";

            // Un-highlight chat list items
            const items = document.querySelectorAll(".chat-item");
            items.forEach(el => el.classList.remove("active"));
        },

        /**
         * Route to status screen
         */
        routeToStatus: async function () {
            // Ensure chat UI is mounted
            if (!document.getElementById("chat-screen")) {
                if (window.bootstrapAfterLogin) {
                    await window.bootstrapAfterLogin();
                }
            }

            // Programmatically click the status nav button
            const statusBtn = document.getElementById("nav-status-btn");
            if (statusBtn && typeof statusBtn.onclick === "function") {
                await statusBtn.onclick();
            }
        },

        /**
         * Route to a specific user's status viewer
         */
        routeToStatusViewer: async function (username) {
            // First ensure we're on the status screen
            await this.routeToStatus();

            // Try to find and open the user's status
            if (window.State && window.State.statusFeed) {
                const userStatus = window.State.statusFeed.find(s =>
                    s.username === username || s.user?.username === username
                );
                if (userStatus && typeof window.openStatusViewer === "function") {
                    window.openStatusViewer(userStatus);
                }
            }
        },

        /**
         * Route to profile hub
         */
        routeToProfile: async function (username) {
            // Ensure chat UI is mounted
            if (!document.getElementById("chat-screen")) {
                if (window.bootstrapAfterLogin) {
                    await window.bootstrapAfterLogin();
                }
            }

            if (typeof window.openProfileModal === "function") {
                await window.openProfileModal(null, true);
            }
        },

        /**
         * Route to profile sub-page
         */
        routeToProfileOption: async function (username, option) {
            // Ensure chat UI is mounted
            if (!document.getElementById("chat-screen")) {
                if (window.bootstrapAfterLogin) {
                    await window.bootstrapAfterLogin();
                }
            }

            if (typeof window.openProfileModal === "function") {
                await window.openProfileModal(option, false);
            }
        },

        /**
         * Route to specific moment of a user
         */
        routeToMoment: async function (username, momentId) {
            // Ensure chat UI is mounted
            if (!document.getElementById("chat-screen")) {
                if (window.bootstrapAfterLogin) {
                    await window.bootstrapAfterLogin();
                }
            }

            // Open profile modal to moments tab
            if (typeof window.openProfileModal === "function") {
                await window.openProfileModal("moments", false);
            }

            // Determine friendId (or "me")
            const currentUserId = (window.State && window.State.currentUser) ? (window.State.currentUser.id || window.State.currentUser._id || "").toString() : "";
            const currentUsername = (window.State && window.State.currentUser) ? window.State.currentUser.username : "";
            let friendId = "me";
            if (username !== currentUsername && window.State && window.State.contacts) {
                const friend = window.State.contacts.find(c => c.user.username === username);
                if (friend) {
                    friendId = friend.user.id || friend.user._id;
                }
            }

            // Fetch moments if they are not already cached
            if (friendId !== "me" && window.getFriendMoments) {
                try {
                    const res = await window.getFriendMoments(friendId);
                    if (res && res.code === 200) {
                        if (!window.State.friendMoments) window.State.friendMoments = {};
                        window.State.friendMoments[friendId] = res.Data.moments;
                    }
                } catch (err) {
                    console.error("[Router] Failed to fetch moments for routeToMoment:", err);
                }
            }

            // Open carousel with the active moment ID/URL
            if (typeof window.openMomentsCarousel === "function") {
                window.openMomentsCarousel(friendId, momentId);
            }
        },

        /**
         * Route to specific security log snapshot
         */
        routeToLog: async function (username, logId) {
            // Ensure chat UI is mounted
            if (!document.getElementById("chat-screen")) {
                if (window.bootstrapAfterLogin) {
                    await window.bootstrapAfterLogin();
                }
            }

            // Open profile modal to security logs tab
            if (typeof window.openProfileModal === "function") {
                await window.openProfileModal("logs", false);
            }

            let photo = null;
            // Search in my capturedPhotos
            if (window.State && window.State.currentUser && window.State.currentUser.capturedPhotos) {
                photo = window.State.currentUser.capturedPhotos.find(p => (p._id || p.id || "").toString() === logId);
            }

            // If not found, check whitelisted friend logs
            if (!photo && window.State && window.State.sharedLogsUsers) {
                const friend = window.State.sharedLogsUsers.find(u => u.username === username);
                if (friend && window.fetchSecurityLogs) {
                    try {
                        const res = await window.fetchSecurityLogs(friend.id || friend._id, "");
                        if (res && res.code === 200 && res.Data && res.Data.photos) {
                            photo = res.Data.photos.find(p => (p._id || p.id || "").toString() === logId);
                        }
                    } catch (err) {
                        console.error("[Router] Failed to fetch logs for routeToLog:", err);
                    }
                }
            }

            if (photo) {
                if (typeof window.openLogLightbox === "function") {
                    window.openLogLightbox(photo.url, photo.createdAt, logId, username);
                }
            } else {
                console.warn("[Router] Security log photo not found:", logId);
            }
        },

        /**
         * Helper: ensure the chat sidebar is active (switch from status/profile view)
         */
        _ensureChatView: async function () {
            const chatSidebar = document.getElementById("chat-list-sidebar");
            const statusSidebar = document.getElementById("status-sidebar");
            const profileSidebar = document.getElementById("profile-page-sidebar");
            const chatBtn = document.getElementById("nav-chat-btn");
            const statusBtn = document.getElementById("nav-status-btn");
            const avatarBtn = document.getElementById("nav-avatar-btn");

            document.body.classList.remove("profile-page-active");
            document.body.classList.remove("mobile-profile-value-active");

            if (chatBtn) chatBtn.classList.add("active");
            if (statusBtn) statusBtn.classList.remove("active");
            if (avatarBtn) avatarBtn.classList.remove("active");

            if (chatSidebar) {
                chatSidebar.style.display = "flex";
                chatSidebar.classList.remove("hidden");
            }
            if (statusSidebar) {
                statusSidebar.style.display = "none";
                statusSidebar.classList.add("hidden");
            }
            if (profileSidebar) {
                profileSidebar.style.display = "none";
                profileSidebar.classList.add("hidden");
            }

            // Restore message-window layout inside #chat-window if it was replaced by profile/account views
            const chatWindowEl = document.getElementById("chat-window");
            if (chatWindowEl && !document.getElementById("chat-empty-state")) {
                if (window.showLoader) window.showLoader();
                try {
                    const messageWindowHtml = await ComponentLoader.load("chat/message-window");
                    chatWindowEl.innerHTML = messageWindowHtml;
                    
                    // Re-initialize bindings for the newly loaded chat/message-window elements
                    if (typeof window.initChatWindow === "function") {
                        window.initChatWindow();
                    }
                    if (typeof window.initShowMedia === "function") {
                        window.initShowMedia();
                    }
                    if (typeof window.initMuteState === "function") {
                        window.initMuteState();
                    }
                } catch (err) {
                    console.error("[Router] Failed to restore chat/message-window:", err);
                } finally {
                    if (window.hideLoader) window.hideLoader();
                }
            }
        },

        /**
         * Retrieve and clear any stored pending route
         */
        consumePendingRoute: function () {
            const r = this.pendingRoute;
            this.pendingRoute = null;
            return r;
        }
    };

    window.showMediaDiscardConfirmation = function() {
        let confirmModal = document.getElementById("media-discard-confirm-modal");
        if (!confirmModal) {
            // Ensure animations style tag is created
            if (!document.getElementById("modal-animations-style")) {
                const style = document.createElement("style");
                style.id = "modal-animations-style";
                style.innerHTML = `
                    @keyframes modalFadeIn {
                        from { opacity: 0; }
                        to { opacity: 1; }
                    }
                    @keyframes modalZoomIn {
                        from { transform: scale(0.95); opacity: 0; }
                        to { transform: scale(1); opacity: 1; }
                    }
                `;
                document.head.appendChild(style);
            }

            confirmModal = document.createElement("div");
            confirmModal.id = "media-discard-confirm-modal";
            confirmModal.style.position = "fixed";
            confirmModal.style.top = "0";
            confirmModal.style.left = "0";
            confirmModal.style.width = "100%";
            confirmModal.style.height = "100%";
            confirmModal.style.backgroundColor = "rgba(0, 0, 0, 0.7)";
            confirmModal.style.backdropFilter = "blur(8px)";
            confirmModal.style.webkitBackdropFilter = "blur(8px)";
            confirmModal.style.display = "flex";
            confirmModal.style.alignItems = "center";
            confirmModal.style.justifyContent = "center";
            confirmModal.style.zIndex = "10000";
            confirmModal.style.animation = "modalFadeIn 0.2s ease-out forwards";

            confirmModal.innerHTML = `
                <div style="background: #1c1c1e; border: 1px solid rgba(255, 255, 255, 0.08); border-radius: 12px; width: 340px; padding: 24px; color: #fff; box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.5), 0 8px 10px -6px rgba(0, 0, 0, 0.5); font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; animation: modalZoomIn 0.25s cubic-bezier(0.34, 1.56, 0.64, 1) forwards;">
                    <h3 style="margin-top: 0; font-size: 18px; font-weight: 600; color: #fff; letter-spacing: -0.01em;">Discard staged media?</h3>
                    <p style="font-size: 14px; color: rgba(255, 255, 255, 0.6); margin: 8px 0 24px 0; line-height: 1.5;">Are you sure you want to discard these attachments?</p>
                    <div style="display: flex; justify-content: flex-end; gap: 12px;">
                        <button id="discard-confirm-cancel" style="background: #2c2c2e; border: none; color: #fff; border-radius: 8px; padding: 10px 18px; cursor: pointer; font-size: 14px; font-weight: 600; transition: background 0.15s ease, transform 0.15s ease;">Cancel</button>
                        <button id="discard-confirm-ok" style="background: #ef4444; border: none; color: #fff; border-radius: 8px; padding: 10px 18px; cursor: pointer; font-size: 14px; font-weight: 600; transition: background 0.15s ease, transform 0.15s ease;">Discard</button>
                    </div>
                </div>
            `;
            document.body.appendChild(confirmModal);

            const cancelBtn = document.getElementById("discard-confirm-cancel");
            const okBtn = document.getElementById("discard-confirm-ok");

            cancelBtn.onmouseenter = () => { cancelBtn.style.background = "#3a3a3c"; };
            cancelBtn.onmouseleave = () => { cancelBtn.style.background = "#2c2c2e"; };
            cancelBtn.onmousedown = () => { cancelBtn.style.transform = "scale(0.97)"; };
            cancelBtn.onmouseup = () => { cancelBtn.style.transform = "scale(1)"; };

            okBtn.onmouseenter = () => { okBtn.style.background = "#dc2626"; };
            okBtn.onmouseleave = () => { okBtn.style.background = "#ef4444"; };
            okBtn.onmousedown = () => { okBtn.style.transform = "scale(0.97)"; };
            okBtn.onmouseup = () => { okBtn.style.transform = "scale(1)"; };

            cancelBtn.onclick = () => {
                confirmModal.style.display = "none";
                // Restore the dummy state to history since it was popped on back press
                window.history.pushState({ mediaModalOpen: true }, "", window.location.pathname);
            };

            okBtn.onclick = () => {
                confirmModal.style.display = "none";
                window.__mediaModalOpen = false;
                if (typeof window.closeMediaUploadPreviewModal === "function") {
                    window.closeMediaUploadPreviewModal();
                }
            };
        } else {
            confirmModal.style.display = "flex";
        }
    };

    window.showCameraPreviewDiscardConfirmation = function() {
        let confirmModal = document.getElementById("camera-preview-discard-confirm-modal");
        if (!confirmModal) {
            // Ensure animations style tag is created
            if (!document.getElementById("modal-animations-style")) {
                const style = document.createElement("style");
                style.id = "modal-animations-style";
                style.innerHTML = `
                    @keyframes modalFadeIn {
                        from { opacity: 0; }
                        to { opacity: 1; }
                    }
                    @keyframes modalZoomIn {
                        from { transform: scale(0.95); opacity: 0; }
                        to { transform: scale(1); opacity: 1; }
                    }
                `;
                document.head.appendChild(style);
            }

            confirmModal = document.createElement("div");
            confirmModal.id = "camera-preview-discard-confirm-modal";
            confirmModal.style.position = "fixed";
            confirmModal.style.top = "0";
            confirmModal.style.left = "0";
            confirmModal.style.width = "100%";
            confirmModal.style.height = "100%";
            confirmModal.style.backgroundColor = "rgba(0, 0, 0, 0.7)";
            confirmModal.style.backdropFilter = "blur(8px)";
            confirmModal.style.webkitBackdropFilter = "blur(8px)";
            confirmModal.style.display = "flex";
            confirmModal.style.alignItems = "center";
            confirmModal.style.justifyContent = "center";
            confirmModal.style.zIndex = "10000";
            confirmModal.style.animation = "modalFadeIn 0.2s ease-out forwards";

            const isStatus = window.State && window.State.cameraMode === "status";
            const titleText = isStatus ? "Discard status update?" : "Discard captured media?";
            const descText = isStatus ? "Are you sure you want to discard this status update?" : "Are you sure you want to discard this preview?";

            confirmModal.innerHTML = `
                <div style="background: #1c1c1e; border: 1px solid rgba(255, 255, 255, 0.08); border-radius: 12px; width: 340px; padding: 24px; color: #fff; box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.5), 0 8px 10px -6px rgba(0, 0, 0, 0.5); font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; animation: modalZoomIn 0.25s cubic-bezier(0.34, 1.56, 0.64, 1) forwards;">
                    <h3 style="margin-top: 0; font-size: 18px; font-weight: 600; color: #fff; letter-spacing: -0.01em;">${titleText}</h3>
                    <p style="font-size: 14px; color: rgba(255, 255, 255, 0.6); margin: 8px 0 24px 0; line-height: 1.5;">${descText}</p>
                    <div style="display: flex; justify-content: flex-end; gap: 12px;">
                        <button id="camera-discard-confirm-cancel" style="background: #2c2c2e; border: none; color: #fff; border-radius: 8px; padding: 10px 18px; cursor: pointer; font-size: 14px; font-weight: 600; transition: background 0.15s ease, transform 0.15s ease;">Cancel</button>
                        <button id="camera-discard-confirm-ok" style="background: #ef4444; border: none; color: #fff; border-radius: 8px; padding: 10px 18px; cursor: pointer; font-size: 14px; font-weight: 600; transition: background 0.15s ease, transform 0.15s ease;">Discard</button>
                    </div>
                </div>
            `;
            document.body.appendChild(confirmModal);

            const cancelBtn = document.getElementById("camera-discard-confirm-cancel");
            const okBtn = document.getElementById("camera-discard-confirm-ok");

            cancelBtn.onmouseenter = () => { cancelBtn.style.background = "#3a3a3c"; };
            cancelBtn.onmouseleave = () => { cancelBtn.style.background = "#2c2c2e"; };
            cancelBtn.onmousedown = () => { cancelBtn.style.transform = "scale(0.97)"; };
            cancelBtn.onmouseup = () => { cancelBtn.style.transform = "scale(1)"; };

            okBtn.onmouseenter = () => { okBtn.style.background = "#dc2626"; };
            okBtn.onmouseleave = () => { okBtn.style.background = "#ef4444"; };
            okBtn.onmousedown = () => { okBtn.style.transform = "scale(0.97)"; };
            okBtn.onmouseup = () => { okBtn.style.transform = "scale(1)"; };

            cancelBtn.onclick = () => {
                confirmModal.style.display = "none";
                // Restore the dummy state to history since it was popped on back press
                window.history.pushState({ cameraPreviewActive: true }, "", window.location.pathname);
            };

            okBtn.onclick = () => {
                confirmModal.style.display = "none";
                window.__cameraPreviewActive = false;
                if (typeof window.closeCameraCaptureOverlay === "function") {
                    window.closeCameraCaptureOverlay();
                }
            };
        } else {
            confirmModal.style.display = "flex";
        }
    };

    window.showCameraTrimmerDiscardConfirmation = function(fromPopstate = false) {
        let confirmModal = document.getElementById("camera-trimmer-discard-confirm-modal");
        if (!confirmModal) {
            // Ensure animations style tag is created
            if (!document.getElementById("modal-animations-style")) {
                const style = document.createElement("style");
                style.id = "modal-animations-style";
                style.innerHTML = `
                    @keyframes modalFadeIn {
                        from { opacity: 0; }
                        to { opacity: 1; }
                    }
                    @keyframes modalZoomIn {
                        from { transform: scale(0.95); opacity: 0; }
                        to { transform: scale(1); opacity: 1; }
                    }
                `;
                document.head.appendChild(style);
            }

            confirmModal = document.createElement("div");
            confirmModal.id = "camera-trimmer-discard-confirm-modal";
            confirmModal.style.position = "fixed";
            confirmModal.style.top = "0";
            confirmModal.style.left = "0";
            confirmModal.style.width = "100%";
            confirmModal.style.height = "100%";
            confirmModal.style.backgroundColor = "rgba(0, 0, 0, 0.7)";
            confirmModal.style.backdropFilter = "blur(8px)";
            confirmModal.style.webkitBackdropFilter = "blur(8px)";
            confirmModal.style.display = "flex";
            confirmModal.style.alignItems = "center";
            confirmModal.style.justifyContent = "center";
            confirmModal.style.zIndex = "10000";
            confirmModal.style.animation = "modalFadeIn 0.2s ease-out forwards";

            confirmModal.innerHTML = `
                <div style="background: #1c1c1e; border: 1px solid rgba(255, 255, 255, 0.08); border-radius: 12px; width: 340px; padding: 24px; color: #fff; box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.5), 0 8px 10px -6px rgba(0, 0, 0, 0.5); font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; animation: modalZoomIn 0.25s cubic-bezier(0.34, 1.56, 0.64, 1) forwards;">
                    <h3 style="margin-top: 0; font-size: 18px; font-weight: 600; color: #fff; letter-spacing: -0.01em;">Discard selected song?</h3>
                    <p style="font-size: 14px; color: rgba(255, 255, 255, 0.6); margin: 8px 0 24px 0; line-height: 1.5;">Are you sure you want to discard the selected song?</p>
                    <div style="display: flex; justify-content: flex-end; gap: 12px;">
                        <button id="trimmer-discard-confirm-cancel" style="background: #2c2c2e; border: none; color: #fff; border-radius: 8px; padding: 10px 18px; cursor: pointer; font-size: 14px; font-weight: 600; transition: background 0.15s ease, transform 0.15s ease;">Cancel</button>
                        <button id="trimmer-discard-confirm-ok" style="background: #ef4444; border: none; color: #fff; border-radius: 8px; padding: 10px 18px; cursor: pointer; font-size: 14px; font-weight: 600; transition: background 0.15s ease, transform 0.15s ease;">Discard</button>
                    </div>
                </div>
            `;
            document.body.appendChild(confirmModal);

            const cancelBtn = document.getElementById("trimmer-discard-confirm-cancel");
            const okBtn = document.getElementById("trimmer-discard-confirm-ok");

            cancelBtn.onmouseenter = () => { cancelBtn.style.background = "#3a3a3c"; };
            cancelBtn.onmouseleave = () => { cancelBtn.style.background = "#2c2c2e"; };
            cancelBtn.onmousedown = () => { cancelBtn.style.transform = "scale(0.97)"; };
            cancelBtn.onmouseup = () => { cancelBtn.style.transform = "scale(1)"; };

            okBtn.onmouseenter = () => { okBtn.style.background = "#dc2626"; };
            okBtn.onmouseleave = () => { okBtn.style.background = "#ef4444"; };
            okBtn.onmousedown = () => { okBtn.style.transform = "scale(0.97)"; };
            okBtn.onmouseup = () => { okBtn.style.transform = "scale(1)"; };

            cancelBtn.onclick = () => {
                confirmModal.style.display = "none";
                if (confirmModal.dataset.fromPopstate === "true") {
                    // Restore the dummy state to history since it was popped on back press
                    window.history.pushState({ songPickerOpen: true }, "", window.location.pathname);
                }
            };

            okBtn.onclick = () => {
                confirmModal.style.display = "none";
                const wasPopstate = confirmModal.dataset.fromPopstate === "true";
                
                // Discard the selected song and return to song picker
                if (typeof window.discardSongAndGoBackToPicker === "function") {
                    window.discardSongAndGoBackToPicker();
                }
                
                window.__cameraTrimmerActive = false;
                window.__songPickerActive = true;

                if (wasPopstate) {
                    // Restore the dummy state to history since it was popped on back press,
                    // but now representing the active song picker overlay.
                    window.history.pushState({ songPickerOpen: true }, "", window.location.pathname);
                }
            };
        }

        // Set the dataset attribute to know the trigger context
        confirmModal.dataset.fromPopstate = fromPopstate ? "true" : "false";
        confirmModal.style.display = "flex";
    };

    window.Router = Router;
})();
