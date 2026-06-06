
/**
 * main.js — Entry point. Runs after DOM is ready.
 * All modules must be loaded before this file.
 */

document.addEventListener('DOMContentLoaded', async () => {
    NetworkMonitor.init();
    initMuteState();
    await initAuth();
    hideLoader();


    setInterval(async () => {
        const response = await fetch("/api/version");
        const data = await response.json();
        if (data.version !== localStorage.getItem("version")) {
            localStorage.setItem("version", data.version);
            window.location.reload();
            await fetch("/auth/flush-redis");

        }
    }, 30000);
});
