# Sockets Folder (`/sockets`)

This folder manages the real-time event-driven layer of the application via WebSockets (Socket.io). 

The primary coordinator is **[`chat.sockets.js`](file:///d:/Buzz/Buzz/sockets/chat.sockets.js)**, which authenticates incoming connections using JWT and handles bidirectional communication.

Below is a detailed specification of all WebSocket events, the data payload structures exchanged, and how they call the client.

---

## 🔒 Authentication & Lifecycle

Every socket connection is authenticated during the handshake via `socketAuth` middleware. Once connected:
* The user's ID is stored in the WebSocket session (`socket.user.id`).
* The user's socket ID is registered in Redis under `user:<userId>:sockets`.
* If it is the user's first active device connecting, they are marked online and `user:online` is broadcasted.

---

## 📡 Events Specification

### 1. Messaging & Delivery Receipts

| Event Name (From Client) | Client Payload Data | Server Action & Emits to Clients |
|:---|:---|:---|
| **`private_message`** | `{ message: { tempId, to, type, content, caption, replyTo, clientTime, fileName, fileSize, cover, thumb, isDisappearing } }` | 1. Relays to receiver via `private_message` (appended with `status: { delivered: false }`).<br>2. Syncs to sender's other devices via `private_message_sync`.<br>3. Responds with `message_ack` (`{ tempId, status: "sent" }`) to active sender socket.<br>4. Saves to MongoDB. On success, emits `message_saved` (`{ tempId }`); on error, `message_save_failed`. <br>5. Sends Telegram alert if receiver is offline. |
| **`message:received`** | `{ tempId }` | 1. Updates DB `status.delivered` = `true` and records `deliveredAt`. <br>2. Emits `message:delivered` (`{ tempId }`) to original sender. |
| **`sync:delivered`** | *None* | 1. Queries DB for undelivered messages (`status.delivered = false`). <br>2. Emits individual `private_message` events back to the requesting client for each found message. |
| **`chat:seen`** | `{ from }` | 1. Emits `message:seen` (`{ by: userId }`) to all active sockets of the sender (`from`).<br>2. Emits `chat:seen_sync` (`{ from }`) to the reading user's other devices.<br>3. Updates DB setting `status.seen` = `true` and `seenAt` for all messages from that user. |
| **`react`** | `{ messageId, to, emoji }` | 1. Emits `reaction` (`{ messageId, userId, emoji }`) to recipient.<br>2. Emits `reaction` to caller's other active sockets and back to the current socket.<br>3. Saves reaction to database (`reactions.<userId>` = `emoji`). |

---

### 2. Typing Indicators

| Event Name (From Client) | Client Payload Data | Server Action & Emits to Clients |
|:---|:---|:---|
| **`typing:start`** | `{ to }` | Relays `typing:start` (`{ user: userId }`) to the recipient (`to`). |
| **`typing:stop`** | `{ to }` | Relays `typing:stop` (`{ user: userId }`) to the recipient (`to`). |

---

### 3. Media Upload Completion

| Event Name (From Client) | Client Payload Data | Server Action & Emits to Clients |
|:---|:---|:---|
| **`media:uploaded`** | `{ tempId, to, url, mediaType, cover, thumb }` | 1. Emits `media:uploaded` (`{ tempId, url, mediaType, cover, thumb, mediaReady: true }`) to both sender and receiver sockets.<br>2. Updates DB message content link, type, and sets `status.mediaReady` = `true`. |

---

### 4. Friend Connections

| Event Name (From Client) | Client Payload Data | Server Action & Emits to Clients |
|:---|:---|:---|
| **`connection:request`** | `{ to }` | Relays `connection:new_request` (`{ from: { id, username, avatar } }`) to target user. |
| **`connection:accepted`** | `{ to }` | Relays `connection:accepted` (`{ by: { id, username, avatar } }`) to original requester. |

---

### 5. WebRTC Calls (Voice & Video)

| Event Name (From Client) | Client Payload Data | Server Action & Emits to Clients |
|:---|:---|:---|
| **`call:offer`** | `{ to, type, from, sdp, roomId }` | 1. Creates call log in DB (expires in 3 min).<br>2. **If Online:** Emits `call:offer` and `private_message` (call details) to receiver.<br>3. **If Offline:** Emits `call:missed_message` to receiver, `call:receiver_offline` back to caller, and pushes Telegram notification.<br>4. Emits `private_message` back to caller to sync statuses. |
| **`call:rejoin`** | `{ roomId, to }` | Relays `call:rejoin_request` (`{ from: userId, roomId }`) to caller. |
| **`call:rejoin_offer`** | `{ to, sdp, roomId, type }` | Relays `call:offer` (`{ from: { id, username, avatar }, type, sdp, roomId, isRejoin: true }`) to rejoining client. |
| **`call:accept`** | `{ to, type, sdp, roomId }` | 1. Relays `call:accept` (`{ by: userId, type, sdp, roomId }`) to caller.<br>2. Marks active DB call status as `"ended"`. |
| **`call:reject`** | `{ to, roomId }` | 1. Relays `call:reject` (`{ by: userId }`) to caller.<br>2. Marks DB call status as `"declined"`. |
| **`call:end`** | `{ to, duration, roomId }` | 1. Relays `call:end` (`{ by: userId, duration }`) to recipient.<br>2. Updates DB call status to `"ended"` and sets duration. |
| **`call:declined`** | `{ to, roomId }` | 1. Relays `call:declined_ack` (`{ by: userId }`) to recipient.<br>2. Updates DB call status to `"declined"`. |
| **`call:sdp`** | `{ to, sdp }` | Relays WebRTC SDP answer `call:sdp` (`{ from: userId, sdp }`) to recipient. |
| **`call:ice`** | `{ to, candidate }` | Relays WebRTC network traversal parameters `call:ice` (`{ from: userId, candidate }`) to recipient. |

---

### 6. Live Voice Streaming

| Event Name (From Client) | Client Payload Data | Server Action & Emits to Clients |
|:---|:---|:---|
| **`voice:request`** | `{ to }` | 1. Validates user relationship and whitelists.<br>2. If online, relays `client:voice_start` (`{ requesterId: userId, requesterName }`) to target room.<br>3. On error, emits `voice:error` (`{ to, message }`) back to requester. |
| **`voice:chunk`** | `{ to, samples, sampleRate }` | Relays raw PCM audio streams via `client:voice_chunk` (`{ from: userId, samples, sampleRate }`) to listener. |
| **`voice:stop`** | `{ to }` | Relays `client:voice_stop` (`{ stoppedBy: userId }`) to listener. |

---

### 7. Moment Snapshots (Spontaneous Capture)

| Event Name (From Client) | Client Payload Data | Server Action & Emits to Clients |
|:---|:---|:---|
| **`moment:request`** | `{ to, camera, type }` | Relays `client:capture_moment` (`{ camera, type, from: userId }`) to friend's sockets. |
| **`moment:stream_frame`** | `{ to, frame }` | Relays streaming frames via `moment:stream_frame` (`{ from: userId, frame }`) to friend. |
| **`moment:stream_stop`** | `{ to }` | Relays `moment:stream_stop` (`{ from: userId }`) to friend. |

---

### 8. Socket Disconnection

* **Event**: Fired automatically by Socket.io as `disconnect`.
* **Flow**:
  1. Removes the disconnected socket ID from the Redis register.
  2. If other devices remain connected for this user, execution halts (user stays online).
  3. If no devices remain:
     - **Hard Disconnect** (client explicit namespace disconnect or logout): Calls `markUserOffline()` immediately. This removes the user ID from the global online users list in Redis, broadcasts `user:offline` (`{ userId }`) to all users, and updates `lastSeen` in MongoDB.
     - **Soft Disconnect** (network drops/swaps): Initiates a **30-second grace-period timer**. If a new socket doesn't reconnect for this user ID within 30 seconds, `markUserOffline()` is called.
