/**
 * public/js/screens/account.js — Dynamic JS module for Account Hub (profile modal)
 */

export async function init() {
    
    
    // Ensure auth.js is loaded (if not already loaded during auth/login phase)
    await Promise.all([
        ComponentLoader.loadScript("/js/auth.js")
    ]);
    
    // Initialize profile modal/panel if there are specific hooks
    if (window.initPeoplePanel) {
        window.initPeoplePanel();
    }
    
    
}
