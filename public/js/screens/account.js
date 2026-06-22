/**
 * public/js/screens/account.js — Dynamic JS module for Account Hub (profile modal)
 */

export async function init() {
    console.log("[Screen:Account] Loading account profile modal...");
    
    // Ensure auth.js is loaded (if not already loaded during auth/login phase)
    await Promise.all([
        ComponentLoader.loadScript("/js/auth.js")
    ]);
    
    // Initialize profile modal/panel if there are specific hooks
    if (window.initPeoplePanel) {
        window.initPeoplePanel();
    }
    
    console.log("[Screen:Account] Account profile modal initialized.");
}
