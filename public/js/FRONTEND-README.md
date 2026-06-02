# InstaChat — JS Module Structure

## Load Order (add to your EJS template in this exact order)

```html
<!-- 3rd party libs (already in your template) -->
<script src="/socket.io/socket.io.js"></script>
<script src="https://cdn.jsdelivr.net/npm/browser-image-compression@2.0.2/dist/browser-image-compression.js"></script>

<!-- Auth API layer -->
<script src="/js/auth.controller.js"></script>

<!-- Core modules (no DOM deps, load first) -->
<script src="/js/state.js"></script>
<script src="/js/utils.js"></script>

<!-- Feature modules (depend on state + utils) -->
<script src="/js/audio.player.js"></script>
<script src="/js/media.viewer.js"></script>
<script src="/js/messages.dom.js"></script>
<script src="/js/socket.js"></script>
<script src="/js/chat.js"></script>
<script src="/js/input.js"></script>
<script src="/js/auth.js"></script>
<script src="/js/ui.extras.js"></script>

<!-- Entry point (always last) -->
<script src="/js/main.js"></script>
```

## Module Responsibilities

| File | What it does |
|------|-------------|
| `state.js` | Global state, queues (Outbox/Upload/UploadManager), NetworkMonitor, constants |
| `utils.js` | Pure helpers: formatTime, sanitizeInput, makeLinksClickable, showToast, etc. |
| `audio.player.js` | `createAudioPlayer()` + `drawStaticWaveform()` |
| `media.viewer.js` | `MediaViewer` class, video thumbnail/duration helpers |
| `messages.dom.js` | `updateMessageByTempId`, `updateMediaDOM`, `updateAudioDOM`, `updateReceivedMediaDOM` |
| `socket.js` | `initSocket()`, all socket event handlers, connection banner, flush helpers |
| `chat.js` | Chat list, `openChat`, `renderMessages`, `createMessageElement`, send, reactions, reply, mobile nav |
| `input.js` | `initChatWindow`, media file handling, chunked upload, voice recording |
| `auth.js` | Login/signup forms, `bootstrapAfterLogin`, `logout`, `initAuth` |
| `ui.extras.js` | Password overlay, show-media gallery, secret mode, carousel, font size |
| `auth.controller.js` | `loginuser`, `createUser`, `alluser`, Telegram link (unchanged) |
| `main.js` | Single `DOMContentLoaded` entry point |

## What changed vs. the original `app.js`

- **Zero logic changes** — every function body is identical to the original.
- Duplicated `message_ack` handler was consolidated (it appeared twice in the original).
- `bootstrapAfterLogin()` was extracted to eliminate the ~60 lines of duplicated post-login code shared between the saved-session path and the login-form path.
- `_formatAudioTime()` private helper extracted inside `audio.player.js` to avoid repeating the minutes/seconds math 4 times.
- `initMuteState()` extracted from the `DOMContentLoaded` block into `ui.extras.js` to keep `main.js` as a thin entry point.
