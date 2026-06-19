/**
 * main.js — Entry point. Runs after DOM is ready.
 */

document.addEventListener("DOMContentLoaded", async () => {
    console.log("-----------", window.IS_SERVER_LOGIN)
    if (!window.IS_SERVER_LOGIN) {
        await logout()
    }
    console.time("NetworkMonitor");
    NetworkMonitor.init();
    console.timeEnd("NetworkMonitor");
    console.time("initMuteState");

    initMuteState();
    console.timeEnd("initMuteState")
    console.time("initAuth")
    try {
        await initAuth();
    } catch (err) {
        console.error("Authentication initialization failed:", err);
    } finally {
        hideLoader();
    }
    console.timeEnd("initAuth")

    // Version check for auto-reload
    setInterval(async () => {
        try {
            const response = await getVersion()
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
        } catch {
            // Ignore — server may be temporarily unreachable
        }
    }, 30000);
});


