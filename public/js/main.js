/**
 * main.js — Entry point. Runs after DOM is ready.
 */

document.addEventListener("DOMContentLoaded", async () => {
    NetworkMonitor.init();
    initMuteState();
    await initAuth();
    hideLoader();

    // Version check for auto-reload
    setInterval(async () => {
        try {
            const response = await getVersion()
            if (response.code != 200) return;
            const data = response.Data;
            if (data.data && data.data !== localStorage.getItem("app_version")) {
                localStorage.setItem("app_version", data.data);
                window.location.reload();
                await fetch("/auth/flush-redis", { method: "POST" });
            }
        } catch {
            // Ignore — server may be temporarily unreachable
        }
    }, 30000);
});
