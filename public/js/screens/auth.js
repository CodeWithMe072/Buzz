/**
 * public/js/screens/auth.js — Dynamic JS module for Login/Signup Screen
 */

export async function init() {
    console.log("[Screen:Auth] Loading authentication scripts...");
    
    // Load state.js and utils.js just in case they aren't loaded (they are in the core)
    await Promise.all([
        ComponentLoader.loadScript("/js/auth.js")
    ]);
    
    if (window.initAuth) {
        await window.initAuth();
    }
    
    console.log("[Screen:Auth] Authentication initialized successfully.");
}
