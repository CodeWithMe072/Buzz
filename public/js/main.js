/**
 * main.js — Entry point. Runs after DOM is ready.
 * All modules must be loaded before this file.
 */

document.addEventListener('DOMContentLoaded', async () => {
    NetworkMonitor.init();
    initMuteState();
    await initAuth();
    hideLoader();
});
