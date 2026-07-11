/**
 * public/js/screens/auth.js — Dynamic JS module for Login/Signup Screen
 */

export async function init() {
    
    
    // Load state.js and utils.js just in case they aren't loaded (they are in the core)
    await Promise.all([
        ComponentLoader.loadScript("/js/auth.js")
    ]);
    
    if (window.initAuth) {
        await window.initAuth();
    }
    
    
}
