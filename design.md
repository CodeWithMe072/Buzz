# Buzz Design System & Specification

This document provides a complete specification of the **Buzz** application's styling, layout tokens, glassmorphic overlays, and camera components. Use this guide to replicate the aesthetics and user interface components on other screens or projects (e.g., Stitch).

---

## 🎨 1. Design System & Variables (CSS Tokens)

Buzz uses a curated modern dark-mode palette, premium gradients, typography, and responsive spacing rules. Declare these in your global root stylesheet:

```css
:root {
    /* Color Palette */
    --primary-bg: #000000;
    --secondary-bg: #0a0a0a;
    --surface-bg: #121212;
    --elevated-bg: #1a1a1a;
    --accent-blue: #0095f6;
    --accent-gradient: linear-gradient(45deg, #f58529, #dd2a7b, #8134af);
    --border-color: #262626;
    --text-primary: #fafafa;
    --text-secondary: #a8a8a8;
    --text-light: #737373;

    /* Message Bubbles */
    --message-self: #1e3b4f;
    --message-other: #262626;
    --message-text-self: #ffffff;
    --message-text-other: #fafafa;

    /* Status Indicators */
    --status-online: #44d362;
    --status-sent: #a8a8a8;
    --status-delivered: #0095f6;
    --status-seen: #0095f6;

    /* Shadows & Effects */
    --shadow-sm: 0 1px 3px rgba(0, 0, 0, 0.3);
    --shadow-md: 0 4px 12px rgba(0, 0, 0, 0.4);
    --shadow-lg: 0 8px 24px rgba(0, 0, 0, 0.5);

    /* Spacing system */
    --spacing-xs: 4px;
    --spacing-sm: 8px;
    --spacing-md: 16px;
    --spacing-lg: 24px;
    --spacing-xl: 32px;

    /* Typography */
    --font-primary: 'Outfit', 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    --font-weight-normal: 400;
    --font-weight-medium: 500;
    --font-weight-bold: 600;

    /* Border Radius */
    --radius-sm: 4px;
    --radius-md: 8px;
    --radius-lg: 12px;
    --radius-xl: 24px;
    --radius-full: 50%;

    /* Transitions */
    --transition-fast: 150ms ease;
    --transition-normal: 250ms ease;
    --transition-slow: 350ms ease;
}
```

---

## 🪟 2. Glassmorphism & Overlays

To create premium, layered visuals, use the following glassmorphic recipe for overlays, sliders, and navigation panels:

```css
.glass-overlay {
    background: rgba(18, 18, 18, 0.75);
    backdrop-filter: blur(20px) saturate(180%);
    -webkit-backdrop-filter: blur(20px) saturate(180%);
    border: 1px solid rgba(255, 255, 255, 0.08);
}
```

---

## 📸 3. Camera Capture HUD & Viewport

The camera layout features a fullscreen live stream preview with a floating HUD (Heads-Up Display) overlay for control buttons.

### HTML Structure
```html
<div id="camera-capture-overlay" class="glass-overlay" style="display: none; position: fixed; inset: 0; z-index: 2900;">
    <!-- Viewport for camera output -->
    <div class="camera-viewport">
        <video id="camera-capture-video" autoplay playsinline muted></video>
        <img id="camera-capture-img-preview" style="display: none;" />
        <video id="camera-capture-video-preview" style="display: none;" controls loop playsinline></video>
    </div>

    <!-- Floating Top Bar (Controls) -->
    <div class="camera-top-controls">
        <button id="camera-close-btn">Close</button>
        <button id="camera-switch-btn">Switch Camera</button>
    </div>

    <!-- Floating Bottom Controls (Capture/Record/Filters) -->
    <div class="camera-bottom-controls">
        <div class="filter-selector-bar">
            <!-- Filter Option List -->
        </div>
        <div class="shutter-control-section">
            <button id="camera-drafts-btn">Drafts</button>
            <div id="camera-shutter-btn"></div>
        </div>
    </div>
</div>
```

### CSS Layout
```css
.camera-viewport {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    background: #111;
    z-index: 2902;
    overflow: hidden;
}

.camera-viewport video, 
.camera-viewport img {
    width: 100%;
    height: 100%;
    object-fit: cover;
}

/* Floating HUD layout overlay */
.camera-top-controls {
    position: absolute;
    top: 25px;
    left: 20px;
    right: 20px;
    display: flex;
    justify-content: space-between;
    align-items: center;
    z-index: 2910;
}

.camera-bottom-controls {
    position: absolute;
    bottom: 30px;
    left: 20px;
    right: 20px;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 20px;
    z-index: 2910;
}
```

---

## 🎨 4. CSS Media Filters

Apply these standard CSS values to the live video stream element or preview targets to simulate real-time camera vibes:

- **Clarendon**: `contrast(1.2) saturate(1.35) brightness(1.1) hue-rotate(-5deg);`
- **Juno**: `contrast(1.15) saturate(1.3) sepia(0.08) hue-rotate(-5deg) brightness(1.05);`
- **Lark**: `brightness(1.08) contrast(0.95) saturate(1.15) hue-rotate(5deg);`
- **Gingham**: `brightness(1.05) contrast(0.9) saturate(0.85) sepia(0.18);`
- **Crema**: `contrast(0.95) saturate(0.9) brightness(1.05) sepia(0.25) hue-rotate(-10deg);`
- **Valencia**: `contrast(1.08) saturate(1.08) sepia(0.25) brightness(1.05) hue-rotate(-5deg);`
- **Inkwell (Black & White)**: `grayscale(1) contrast(1.15) brightness(1.05);`

---

## 📂 5. Camera Drafts Grid Specs

The **Drafts Gallery** displays previously captured unsent media in a 9:16 grid layout.

### HTML Structure
```html
<div id="camera-drafts-overlay" style="display: none; position: fixed; inset: 0; z-index: 2950; background: #0c0c0e; color: white; flex-direction: column; padding: 20px; box-sizing: border-box;">
    <!-- Header -->
    <div class="drafts-header" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
        <h2>Camera Drafts</h2>
        <button id="camera-drafts-close-btn">&times;</button>
    </div>
    
    <!-- Gallery Grid -->
    <div id="camera-drafts-grid"></div>
    
    <!-- Empty State -->
    <div id="camera-drafts-empty">
        <span class="empty-icon">📁</span>
        <span>No drafts saved yet</span>
    </div>
</div>
```

### CSS Layout
```css
#camera-drafts-grid {
    flex: 1;
    overflow-y: auto;
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(100px, 1fr));
    gap: 12px;
    padding-bottom: 20px;
}

/* Aspect ratio elements for 9:16 layout cards */
.draft-card {
    position: relative;
    aspect-ratio: 9/16;
    background: #18181c;
    border-radius: 8px;
    overflow: hidden;
    cursor: pointer;
    box-shadow: 0 4px 10px rgba(0, 0, 0, 0.4);
    border: 1px solid rgba(255, 255, 255, 0.05);
}

.draft-card img, 
.draft-card video {
    width: 100%;
    height: 100%;
    object-fit: cover;
}
```
