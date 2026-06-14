# Routes Folder (`/routes`)

This folder contains the routing layers mapping incoming HTTP request endpoints to specific controllers. 

Below is the complete API documentation for all routes, specifying request expectations (headers, query parameters, body formats) and response structures.

---

## 🔒 Security & Request Headers

### Authenticated Routes
All routes marked as **Protected** require a valid JSON Web Token (JWT) to be passed in one of the following locations:
1. **Authorization Header**: `Bearer <your_jwt_token>`
2. **Cookies**: A cookie named `token` containing the JWT.

---

## 🔐 1. Authentication Routes (`auth.routes.js`)

Manage registration, login, and user profile properties.

### `POST /auth/register`
* **Access**: Public
* **Expected Request Body** (`application/json`):
  ```json
  {
    "username": "alice",
    "email": "alice@example.com",
    "password": "securepassword123",
    "phoneNumber": "+1234567890" // Optional
  }
  ```
* **Success Output** (`210 Created`):
  ```json
  {
    "status": true,
    "message": "Account created successfully",
    "token": "eyJhbGciOi...",
    "user": {
      "id": "60d5ec4b1a3b4f2c8d8f8a10",
      "username": "alice",
      "email": "alice@example.com",
      "avatar": "A"
    }
  }
  ```
* **Error Output** (`400 Bad Request` or `409 Conflict`):
  ```json
  {
    "status": false,
    "message": "Username is already taken"
  }
  ```

### `POST /auth/login`
* **Access**: Public
* **Expected Request Body** (`application/json`):
  ```json
  {
    "identifier": "alice", // Username OR Email
    "password": "securepassword123"
  }
  ```
* **Success Output** (`200 OK`):
  ```json
  {
    "status": true,
    "message": "Login successful",
    "token": "eyJhbGciOi...",
    "user": {
      "id": "60d5ec4b1a3b4f2c8d8f8a10",
      "username": "alice",
      "email": "alice@example.com",
      "avatar": "A"
    },
    "version": "1.0.0"
  }
  ```

### `GET /auth/me`
* **Access**: Protected
* **Expected Request**: No parameters.
* **Success Output** (`200 OK`):
  ```json
  {
    "status": true,
    "user": {
      "_id": "60d5ec4b1a3b4f2c8d8f8a10",
      "username": "alice",
      "email": "alice@example.com",
      "avatar": "A",
      "phoneNumber": "+1234567890",
      "notificationsEnabled": true,
      "livePhotoEnabled": true,
      "randomSnapshotEnabled": true,
      "liveVoiceEnabled": true,
      "capturedPhotos": [],
      "randomSnapshots": [],
      "createdAt": "2026-06-13T16:26:16.000Z"
    }
  }
  ```

### `PUT /auth/profile`
* **Access**: Protected
* **Expected Request Body** (`application/json`):
  ```json
  {
    "avatar": "https://cdn.com/avatar.jpg", // Optional
    "phoneNumber": "+1234567890", // Optional
    "livePhotoEnabled": true, // Optional
    "randomSnapshotEnabled": true, // Optional
    "randomSnapshotAllowedFriends": ["60d5ec4b1a3b4f2c8d8f8a11"], // Optional array of user IDs
    "liveVoiceEnabled": true, // Optional
    "liveVoiceAllowedFriends": [] // Optional
  }
  ```
* **Success Output** (`200 OK`):
  ```json
  {
    "status": true,
    "user": {
      "_id": "60d5ec4b1a3b4f2c8d8f8a10",
      "username": "alice",
      "avatar": "https://cdn.com/avatar.jpg",
      "livePhotoEnabled": true,
      "randomSnapshotEnabled": true,
      "randomSnapshotAllowedFriends": ["60d5ec4b1a3b4f2c8d8f8a11"],
      "liveVoiceEnabled": true,
      "liveVoiceAllowedFriends": []
    }
  }
  ```

### `POST /auth/profile/logs`
* **Access**: Protected
* **Expected Request Body** (`application/json`):
  ```json
  {
    "image": "data:image/jpeg;base64,/9j/4AAQSkZJRg..." // Base64 encoded JPEG
  }
  ```
* **Success Output** (`201 Created`):
  ```json
  {
    "status": true,
    "photo": {
      "url": "https://cdn.yourdomain.com/logs/log_60d5ec4b1a3b4f2c8d8f8a10_1718295600000.jpg",
      "createdAt": "2026-06-13T17:40:00.000Z"
    }
  }
  ```

### `POST /auth/profile/moments`
* **Access**: Protected
* **Expected Request Body** (`application/json`):
  ```json
  {
    "image": "data:image/jpeg;base64,/9j/4AAQSkZJRg..." // Base64 encoded JPEG
  }
  ```
* **Success Output** (`201 Created`):
  ```json
  {
    "status": true,
    "photo": {
      "url": "https://cdn.yourdomain.com/moments/moment_60d5ec4b1a3b4f2c8d8f8a10_1718295600000.jpg",
      "createdAt": "2026-06-13T17:40:00.000Z"
    }
  }
  ```

### `PUT /auth/password`
* **Access**: Protected
* **Expected Request Body** (`application/json`):
  ```json
  {
    "currentPassword": "oldpassword123",
    "newPassword": "newsecurepassword456"
  }
  ```
* **Success Output** (`200 OK`):
  ```json
  {
    "status": true,
    "message": "Password updated successfully"
  }
  ```

### `POST /auth/telegram/link`
* **Access**: Protected
* **Expected Request Body** (`application/json`):
  ```json
  {
    "telegramChatId": "123456789" // The user's Telegram Chat ID
  }
  ```
* **Success Output** (`200 OK`):
  ```json
  {
    "status": true,
    "message": "Telegram account linked successfully"
  }
  ```

### `POST /auth/notifications/toggle`
* **Access**: Protected
* **Expected Request**: No parameters.
* **Success Output** (`200 OK`):
  ```json
  {
    "status": true,
    "notificationsEnabled": false // Toggles boolean value
  }
  ```

### `POST /auth/flush-redis`
* **Access**: Public
* **Expected Request**: No parameters.
* **Success Output** (`200 OK`):
  ```json
  {
    "success": true,
    "message": "Redis cache cleared successfully"
  }
  ```

---

## 💬 2. Chat Routes (`chat.routes.js`)

Manages message feeds, conversation clearance, media queries, and GIF lookups.

### `POST /api/messages`
* **Access**: Protected
* **Expected Request Body** (`application/json`):
  ```json
  {
    "receiverId": "60d5ec4b1a3b4f2c8d8f8a11",
    "limit": 50, // Optional, default 50
    "before": "2026-06-13T16:00:00.000Z" // Optional timestamp cursor for pagination
  }
  ```
* **Success Output** (`200 OK`):
  ```json
  {
    "status": true,
    "count": 2,
    "messages": [
      {
        "_id": "60d5ec4b1a3b4f2c8d8f8b01",
        "tempId": "temp-12345",
        "from": "60d5ec4b1a3b4f2c8d8f8a10",
        "to": "60d5ec4b1a3b4f2c8d8f8a11",
        "type": "text",
        "content": "Hello!",
        "status": {
          "sent": true,
          "delivered": true,
          "seen": true
        },
        "createdAt": "2026-06-13T15:30:00.000Z"
      }
    ]
  }
  ```

### `DELETE /api/chat/:userId`
* **Access**: Protected
* **Expected Request Query / Params**: `userId` parameter in path.
* **Success Output** (`200 OK`):
  ```json
  {
    "status": true,
    "message": "Chat deleted"
  }
  ```

### `GET /api/chat/:userId/media`
* **Access**: Protected
* **Expected Request**:
  * `userId` parameter in path.
  * Query parameters: `limit` (optional, default 10), `before` (optional date string).
* **Success Output** (`200 OK`):
  ```json
  {
    "status": true,
    "count": 1,
    "data": [
      {
        "tempId": "temp-67890",
        "type": "image",
        "content": "https://pub-xxxx.r2.dev/images/img_1718295600.jpg",
        "cover": "https://pub-xxxx.r2.dev/images/img_1718295600.jpg",
        "thumb": "https://pub-xxxx.r2.dev/images/img_1718295600.jpg",
        "caption": "Photo caption",
        "createdAt": "2026-06-13T15:40:00.000Z",
        "from": "60d5ec4b1a3b4f2c8d8f8a10"
      }
    ]
  }
  ```

### `GET /api/gifs/trending`
* **Access**: Protected
* **Expected Request**: No parameters.
* **Success Output** (`200 OK`):
  ```json
  {
    "status": true,
    "gifs": [
      "https://media.giphy.com/media/3o7abKhOpu0NXS3wy4/giphy.gif"
    ]
  }
  ```

### `GET /api/gifs/search`
* **Access**: Protected
* **Expected Request Query Parameters**: `q` (search term).
* **Success Output** (`200 OK`):
  ```json
  {
    "status": true,
    "gifs": [
      "https://media.giphy.com/media/l0ExdHfRKRUsY4V7q/giphy.gif"
    ]
  }
  ```

---

## 🤝 3. Connection Routes (`connection.routes.js`)

Manages friend lists, requests, search filters, and moments queries.

### `POST /connections/send`
* **Access**: Protected
* **Expected Request Body** (`application/json`):
  ```json
  {
    "receiverId": "60d5ec4b1a3b4f2c8d8f8a11"
  }
  ```
* **Success Output** (`200 OK`):
  ```json
  {
    "status": true,
    "message": "Connection request sent"
  }
  ```

### `POST /connections/respond`
* **Access**: Protected
* **Expected Request Body** (`application/json`):
  ```json
  {
    "connectionId": "60d5ec4b1a3b4f2c8d8f8c01",
    "action": "accept" // "accept" OR "reject"
  }
  ```
* **Success Output** (`200 OK`):
  ```json
  {
    "status": true,
    "message": "accepted"
  }
  ```

### `GET /connections`
* **Access**: Protected
* **Expected Request**: No parameters.
* **Success Output** (`200 OK`):
  ```json
  {
    "status": true,
    "count": 1,
    "connections": [
      {
        "id": "60d5ec4b1a3b4f2c8d8f8c01",
        "friend": {
          "_id": "60d5ec4b1a3b4f2c8d8f8a11",
          "username": "bob",
          "avatar": "B",
          "lastSeen": "2026-06-13T17:45:00.000Z"
        }
      }
    ]
  }
  ```

### `GET /connections/pending`
* **Access**: Protected
* **Expected Request**: No parameters.
* **Success Output** (`200 OK`):
  ```json
  {
    "status": true,
    "count": 1,
    "requests": [
      {
        "_id": "60d5ec4b1a3b4f2c8d8f8c02",
        "sender": {
          "_id": "60d5ec4b1a3b4f2c8d8f8a12",
          "username": "charlie",
          "avatar": "C"
        },
        "createdAt": "2026-06-13T17:00:00.000Z"
      }
    ]
  }
  ```

### `GET /connections/sent`
* **Access**: Protected
* **Expected Request**: No parameters.
* **Success Output** (`200 OK`):
  ```json
  {
    "status": true,
    "count": 1,
    "requests": [
      {
        "_id": "60d5ec4b1a3b4f2c8d8f8c03",
        "receiver": {
          "_id": "60d5ec4b1a3b4f2c8d8f8a13",
          "username": "david",
          "avatar": "D"
        },
        "createdAt": "2026-06-13T17:10:00.000Z"
      }
    ]
  }
  ```

### `GET /connections/search`
* **Access**: Protected
* **Expected Request Query Parameters**: `q` (search query, minimum 2 characters).
* **Success Output** (`200 OK`):
  ```json
  {
    "status": true,
    "count": 1,
    "users": [
      {
        "_id": "60d5ec4b1a3b4f2c8d8f8a15",
        "username": "frank",
        "avatar": "F"
      }
    ]
  }
  ```

### `DELETE /connections/:connectionId`
* **Access**: Protected
* **Expected Request Params**: `connectionId` in route path.
* **Success Output** (`200 OK`):
  ```json
  {
    "status": true,
    "message": "Connection removed"
  }
  ```

### `GET /connections/moments`
* **Access**: Protected
* **Expected Request**: No parameters.
* **Success Output** (`200 OK`):
  ```json
  {
    "status": true,
    "count": 1,
    "data": [
      {
        "friendId": "60d5ec4b1a3b4f2c8d8f8a11",
        "username": "bob",
        "avatar": "B",
        "moments": [
          {
            "url": "https://pub-xxxx.r2.dev/moments/moment_60d5ec4b1a3b4f2c8d8f8a11_17182956.jpg",
            "createdAt": "2026-06-13T17:20:00.000Z"
          }
        ]
      }
    ]
  }
  ```

### `GET /connections/moments/:friendId`
* **Access**: Protected
* **Expected Request Params**: `friendId` in route path.
* **Success Output** (`200 OK`):
  ```json
  {
    "status": true,
    "friendId": "60d5ec4b1a3b4f2c8d8f8a11",
    "moments": [
      {
        "url": "https://pub-xxxx.r2.dev/moments/moment_60d5ec4b1a3b4f2c8d8f8a11_17182956.jpg",
        "createdAt": "2026-06-13T17:20:00.000Z"
      }
    ]
  }
  ```

### `GET /connections/voice/check/:friendId`
* **Access**: Protected
* **Expected Request Params**: `friendId` in route path.
* **Success Output** (`200 OK`):
  ```json
  {
    "status": true,
    "allowed": true
  }
  ```

---

## 📁 4. Upload & Custom GIF Routes (`upload.routes.js`)

Manages media storage uploads (single & multi-part chunked), along with user custom GIF catalogs.

### `POST /api/upload`
* **Access**: Protected
* **Expected Request** (`multipart/form-data`):
  * Body fields: `file` (Binary file parameter).
* **Success Output** (`200 OK`):
  * **If Image**:
    ```json
    {
      "type": "image",
      "original": "https://pub-xxxx.r2.dev/files/img_1718295600.png",
      "cover_270": "https://pub-xxxx.r2.dev/files/img_1718295600.png",
      "thumb_50": "https://pub-xxxx.r2.dev/files/img_1718295600.png"
    }
    ```
  * **If Video**:
    ```json
    {
      "type": "video",
      "original": "https://pub-xxxx.r2.dev/files/vid_1718295600.mp4",
      "cover_270": null,
      "thumb_50": null
    }
    ```
  * **If Audio**:
    ```json
    {
      "type": "audio",
      "original": "https://pub-xxxx.r2.dev/files/aud_1718295600.mp3",
      "cover_270": null,
      "thumb_50": null
    }
    ```
  * **If Document**:
    ```json
    {
      "type": "document",
      "original": "https://pub-xxxx.r2.dev/files/doc_1718295600.pdf",
      "cover_270": null,
      "thumb_50": null,
      "fileName": "report.pdf",
      "fileSize": 1048576
    }
    ```

### `POST /api/gifs/upload`
* **Access**: Protected
* **Expected Request** (`multipart/form-data`):
  * Body fields: 
    * `file` (single GIF/WEBP/MP4 file OR a single ZIP archive containing multiple custom items).
    * `section` (String label representing the custom GIF tab name).
* **Success Output** (`200 OK`):
  * **If ZIP Archive**:
    ```json
    {
      "status": true,
      "isZip": true,
      "count": 2,
      "data": [
        { "_id": "60d5ec4...", "user": "...", "section": "funny", "url": "...", "fileName": "laugh.gif" }
      ]
    }
    ```
  * **If Single File**:
    ```json
    {
      "status": true,
      "data": {
        "_id": "60d5ec4b1a3b4f2c8d8f8d99",
        "user": "60d5ec4b1a3b4f2c8d8f8a10",
        "section": "funny",
        "url": "https://pub-xxxx.r2.dev/custom_gifs/.../smile.gif",
        "fileName": "smile.gif"
      }
    }
    ```

### `GET /api/gifs/custom`
* **Access**: Protected
* **Expected Request**: No parameters.
* **Success Output** (`200 OK`):
  ```json
  {
    "status": true,
    "data": [
      {
        "_id": "60d5ec4b1a3b4f2c8d8f8d99",
        "section": "funny",
        "url": "https://pub-xxxx.r2.dev/custom_gifs/.../smile.gif",
        "fileName": "smile.gif"
      }
    ]
  }
  ```

### `DELETE /api/gifs/custom/:id`
* **Access**: Protected
* **Expected Request Params**: `id` (GIF document ID) in path.
* **Success Output** (`200 OK`):
  ```json
  {
    "status": true,
    "message": "GIF deleted successfully"
  }
  ```

### `DELETE /api/gifs/custom/section/:sectionName`
* **Access**: Protected
* **Expected Request Params**: `sectionName` in path.
* **Success Output** (`200 OK`):
  ```json
  {
    "status": true,
    "message": "Section and its GIFs deleted successfully"
  }
  ```

### `POST /api/upload-chunk`
* **Access**: Protected
* **Expected Request** (`multipart/form-data`):
  * Body fields:
    * `chunk` (Binary fragment file parameter).
    * `fileId` (Unique temporary string representing the upload batch).
    * `chunkIndex` (Integer index value starting at 0).
* **Success Output** (`200 OK`):
  ```json
  {
    "success": true
  }
  ```

### `POST /api/complete-upload`
* **Access**: Protected
* **Expected Request Body** (`application/json`):
  ```json
  {
    "fileId": "upload-batch-uuid-1234",
    "fileName": "movie.mp4",
    "mimeType": "video/mp4"
  }
  ```
* **Success Output** (`200 OK`): Matches output formats of `POST /api/upload` (combines all binary fragments, uploads the final asset file to Cloudflare R2, cleans up temporary server directories, and responds with the URL structures).

---

## 📞 5. WebRTC calling Routes (`webrtc.routes.js`)

ICE infrastructure credentials routing.

### `GET /api/webrtc/ice-servers`
* **Access**: Protected
* **Expected Request**: No parameters.
* **Success Output** (`200 OK`):
  ```json
  {
    "success": true,
    "data": [
      { "urls": "stun:stun.l.google.com:19302" },
      {
        "urls": "turn:turn.metered.ca:443?transport=udp",
        "username": "metered_username",
        "credential": "metered_password"
      },
      {
        "urls": "turn:turn.metered.ca:443?transport=tcp",
        "username": "metered_username",
        "credential": "metered_password"
      }
    ]
  }
  ```
