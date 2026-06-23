/**
 * main.js — Dynamic app entry point.
 */

document.addEventListener("DOMContentLoaded", async () => {
    // 1. Initialize Core Network Monitor
    console.time("NetworkMonitor");
    if (window.NetworkMonitor) {
        NetworkMonitor.init();
    }
    console.timeEnd("NetworkMonitor");

    // 3. Load component based on server and client configuration
    const config = window.APP_CONFIG || { isServerLogin: false, isShowDashboard: true };
    const rootEl = document.getElementById("app-root");

    const isServerLogin = window.IS_SERVER_LOGIN === true;
    const savedUser = localStorage.getItem("SSC_USER");
    const savedToken = typeof TokenStore !== "undefined" ? TokenStore.getToken() : null;
    const hasLocalSession = !!(savedUser && savedToken);

    let isShowDashboard = config.isShowDashboard;
    if (savedUser) {
        try {
            const u = JSON.parse(savedUser);
            isShowDashboard = u.showDashboard ?? true;
            if (typeof State !== "undefined") {
                State.currentUser = u;
            }
        } catch (e) {}
    }

    console.log("[Main Debug] IS_SERVER_LOGIN:", isServerLogin, "hasLocalSession:", hasLocalSession, "savedUser:", savedUser, "isShowDashboard:", isShowDashboard);

    if (isServerLogin && hasLocalSession) {
        // Logged in on server and local data is present
        if (isShowDashboard) {
            console.log("[Main] Logged in. Showing decoy dashboard...");
            try {
                const html = await ComponentLoader.load("dashboard");
                if (rootEl) {
                    rootEl.innerHTML = html;
                }
                const { init } = await import("/js/screens/dashboard.js");
                await init();
            } catch (err) {
                console.error("[Main] Failed to load decoy dashboard:", err);
            } finally {
                if (window.hideLoader) window.hideLoader();
            }
        } else {
            console.log("[Main] Logged in and dashboard bypassed. Showing password overlay immediately...");
            try {
                const html = await ComponentLoader.load("dashboard");
                if (rootEl) {
                    rootEl.innerHTML = html;
                }
                const { init } = await import("/js/screens/dashboard.js");
                await init();
                
                const passwordOverlay = document.getElementById("passwordOverlay");
                if (passwordOverlay) {
                    passwordOverlay.classList.add("active");
                }
                const passwordInput = document.getElementById("passwordInput");
                if (passwordInput) {
                    passwordInput.focus();
                }
            } catch (err) {
                console.error("[Main] Failed to load decoy dashboard and password overlay:", err);
            } finally {
                if (window.hideLoader) window.hideLoader();
            }
        }
    } else {
        // Server login is false, or local session data is missing
        let refreshSuccess = false;

        if (savedToken || savedUser) {
            console.log("[Main] Server login missing but local data exists. Attempting to refresh token...");
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
                        if (typeof State !== "undefined") {
                            State.currentUser = user;
                        }
                        window.IS_SERVER_LOGIN = true;
                        refreshSuccess = true;
                        isShowDashboard = user.showDashboard ?? true;

                        console.log("[Main] Token refresh succeeded. Loading dashboard...");
                        
                        const html = await ComponentLoader.load("dashboard");
                        if (rootEl) {
                            rootEl.innerHTML = html;
                        }
                        const { init } = await import("/js/screens/dashboard.js");
                        await init();

                        if (!isShowDashboard) {
                            const passwordOverlay = document.getElementById("passwordOverlay");
                            if (passwordOverlay) {
                                passwordOverlay.classList.add("active");
                            }
                            const passwordInput = document.getElementById("passwordInput");
                            if (passwordInput) {
                                passwordInput.focus();
                            }
                        }
                    }
                }
            } catch (err) {
                console.error("[Main] Failed to refresh token:", err);
            }
        }

        if (!refreshSuccess) {
            // Not logged in and cannot refresh, or no local session -> show login / decoy dashboard
            if (!savedToken && !savedUser) {
                console.log("[Main] First-time visitor. Showing decoy dashboard camouflage...");
                try {
                    const html = await ComponentLoader.load("dashboard");
                    if (rootEl) {
                        rootEl.innerHTML = html;
                    }
                    const { init } = await import("/js/screens/dashboard.js");
                    await init();
                } catch (err) {
                    console.error("[Main] Failed to load decoy dashboard:", err);
                } finally {
                    if (window.hideLoader) window.hideLoader();
                }
            } else {
                // Returning user but refresh failed -> show login screen directly
                console.log("[Main] Session expired/invalid. Showing login screen directly...");
                if (typeof TokenStore !== "undefined") {
                    TokenStore.clear();
                }
                localStorage.removeItem("SSC_USER");

                try {
                    const html = await ComponentLoader.load("login");
                    if (rootEl) {
                        rootEl.innerHTML = html;
                    }
                    const { init } = await import("/js/screens/auth.js");
                    await init();
                } catch (err) {
                    console.error("[Main] Failed to load login screen:", err);
                } finally {
                    if (window.hideLoader) window.hideLoader();
                }
            }
        }
    }

    // 4. Version checking for auto-reload
    setInterval(async () => {
        try {
            if (window.getVersion) {
                const response = await getVersion();
                if (response.code != 200) return;
                const data = response.Data;
                const oldVersion = localStorage.getItem("app_version");
                if (data.data && data.data !== oldVersion) {
                    localStorage.setItem("app_version", data.data);
                    window.location.reload();
                    if (oldVersion !== null) {
                        await fetch("/auth/flush-redis", { method: "POST" });
                    }
                }
            }
        } catch {
            // Ignore
        }
    }, 30000);
});

// Global video player coordination: ensure only one video plays at a time
document.addEventListener("play", function (event) {
    if (event.target && event.target.tagName === "VIDEO") {
        const playingVideo = event.target;
        document.querySelectorAll("video").forEach((video) => {
            if (video !== playingVideo) {
                video.pause();
            }
        });
    }
}, true); // Capture phase is required because 'play' event does not bubble
