/**
 * main.js — Dynamic app entry point.
 */

document.addEventListener("DOMContentLoaded", async () => {
    // Wait for virtual storage to load from IndexedDB
    if (window.localStorageIndexedDBSyncPromise) {
        await window.localStorageIndexedDBSyncPromise;
    }

    // Register Service Worker for media caching
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('/sw.js')
            .then(reg => { /* registered successfully */ })
            .catch(err => console.error('[ServiceWorker] Registration failed:', err));
    }

    // 1. Initialize Core Network Monitor & IndexedDB Queue Service
    console.time("NetworkMonitor");
    if (window.NetworkMonitor) {
        NetworkMonitor.init();
    }
    if (window.IndexedDBQueueService) {
        try {
            await IndexedDBQueueService.init();
        } catch (e) {
            console.error("IndexedDB Queue Service initialization failed:", e);
        }
    }
    console.timeEnd("NetworkMonitor");

    // 3. Load component based on server and client configuration
    const config = window.APP_CONFIG || { isServerLogin: false, isShowDashboard: true, isPasswordLockEnabled: true };
    const rootEl = document.getElementById("app-root");

    const isServerLogin = window.IS_SERVER_LOGIN === true;
    const savedUser = localStorage.getItem("SSC_USER");
    const savedToken = typeof TokenStore !== "undefined" ? TokenStore.getToken() : null;
    const hasLocalSession = !!(savedUser && savedToken);
    let isShowDashboard = config.isShowDashboard;
    let isPasswordLockEnabled = config.isPasswordLockEnabled ?? true;
    if (savedUser) {
        try {
            const u = JSON.parse(savedUser);
            isShowDashboard = u.showDashboard ?? true;
            isPasswordLockEnabled = u.passwordLockEnabled ?? true;
            if (typeof State !== "undefined") {
                State.currentUser = u;
            }
        } catch (e) {}
    }

    if (isServerLogin && hasLocalSession) {
        // Logged in on server and local data is present
        if (!isPasswordLockEnabled) {
            try {
                await ComponentLoader.loadScript("/js/auth.js");
                await bootstrapAfterLogin();
            } catch (err) {
                console.error("[Main] Failed to load chat directly:", err);
            } finally {
                if (window.hideLoader) window.hideLoader();
            }
        } else if (isShowDashboard) {
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
                        isPasswordLockEnabled = user.passwordLockEnabled ?? true;

                        if (!isPasswordLockEnabled) {
                            await ComponentLoader.loadScript("/js/auth.js");
                            await bootstrapAfterLogin();
                        } else {
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
                }
            } catch (err) {
                console.error("[Main] Failed to refresh token:", err);
            }
        }

        if (!refreshSuccess) {
            // Not logged in and cannot refresh, or no local session -> show login / decoy dashboard
            if (!savedToken && !savedUser) {
                
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
