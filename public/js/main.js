/**
 * main.js — Entry point. Runs after DOM is ready.
 */

document.addEventListener("DOMContentLoaded", async () => {
    NetworkMonitor.init();
    initMuteState();
    try {
        await initAuth();
    } catch (err) {
        console.error("Authentication initialization failed:", err);
    } finally {
        hideLoader();
    }

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
