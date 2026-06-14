# Controllers Folder (`/controllers`)

This folder contains the core backend request controllers containing business logic. They handle incoming API requests, validate parameters, interact with the MongoDB models, and send back HTTP responses.

## Files

- [`auth.controller.js`](file:///d:/Buzz/Buzz/controllers/auth.controller.js):
  - Handles user registration (`register`) and login (`login`) with bcrypt password hashing and JWT token generation.
  - Manages profile updates (`updateProfile`) including phone numbers and preferences.
  - Supports uploading live log photos (`uploadLogPhoto`) and Moment snapshots (`uploadMomentPhoto`) to Cloudflare R2.
  - Controls password changes (`changePassword`), Telegram profile linking (`linkTelegram`), and notifications toggling (`toggleNotifications`).

- [`chat.controller.js`](file:///d:/Buzz/Buzz/controllers/chat.controller.js):
  - Fetches message history (`getMessages`) between two users, supporting pagination, status updates, and hiding deleted/auto-deleted messages.
  - Deletes conversation history (`deleteChat`) by flagging messages as deleted for a specific user.
  - Retrieves shared media history (`getMedia`) including filtered lists of images, videos, audio clips, and generic files.
  - Interfaces with Tenor/Giphy APIs (`getTrendingGifs`, `searchGifs`) to support finding and sharing custom GIFs in chat.

- [`connection.controller.js`](file:///d:/Buzz/Buzz/controllers/connection.controller.js):
  - Handles friend request workflows: sending requests (`sendRequest`), accepting or rejecting requests (`respondToRequest`), and unfriending (`removeConnection`).
  - Queries active connections (`listConnections`), pending incoming requests (`pendingRequests`), and sent requests (`sentRequests`).
  - Implements global user search (`searchUsers`) for finding new friends.
  - Retrieves friend moments/snapshots (`getFriendMoments`, `getAllFriendsMoments`) for allowed users.
  - Checks if a voice/video call is allowed (`checkLiveVoiceAllowed`) based on friendship rules.
