# Models Folder (`/models`)

This folder contains Mongoose (MongoDB) schema definitions representing the application's data models.

## Files

- [`user.model.js`](file:///d:/Buzz/Buzz/models/user.model.js):
  - Defines the `User` schema containing basic login credentials (`username`, `email`, hashed `password`).
  - Stores profile customization metadata (e.g. `avatar`, `phoneNumber`).
  - Holds feature configurations: notifications enabled, live photo/voice toggles, random snapshot permissions.
  - Maintains arrays for `randomSnapshotAllowedFriends` (whitelist) and `randomSnapshots` (stored Moment uploads with URLs and timestamps).

- [`message.model.js`](file:///d:/Buzz/Buzz/models/message.model.js):
  - Defines the `Message` schema for storing individual chat messages.
  - Stores sender (`from`) and recipient (`to`).
  - Captures message payloads (`text`, optional `file` metadata with URL, type, filename, size, and duration).
  - Tracks receipt status: `status.delivered` and `status.seen` along with respective timestamps (`deliveredAt`, `seenAt`).
  - Supports advanced features like ephemeral tracking (`autoDeleted`), single-user hides (`deletedFor`), reactions (`reactions` array with emoji and user ID), and reply nesting (`replyTo` referring to another Message ID).

- [`connection.model.js`](file:///d:/Buzz/Buzz/models/connection.model.js):
  - Defines the `Connection` schema tracking relationship state between two users.
  - Links a `sender` and `receiver` (both refs to `User`).
  - Stores the request status: `"pending"`, `"accepted"`, or `"rejected"`.

- [`customGif.model.js`](file:///d:/Buzz/Buzz/models/customGif.model.js):
  - Defines the `CustomGif` schema for cataloging and searching custom GIFs uploaded or tagged by users.
