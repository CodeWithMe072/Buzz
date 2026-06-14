# Middleware Folder (`/middleware`)

This folder contains Express and Socket.io middleware functions that intercepts requests to validate, authorize, or modify them.

## Files

- [`auth.middleware.js`](file:///d:/Buzz/Buzz/middleware/auth.middleware.js):
  - **`protect` (HTTP Middleware):**
    - Extracts the JWT token from the HTTP `Authorization` header (as `Bearer <token>`) or the `token` cookie.
    - Decodes the token using the `JWT_SECRET`.
    - Fetches the associated user from the database and attaches it to `req.user`.
    - Responds with `401 Unauthorized` if validation fails.
  - **`socketAuth` (Socket.io Middleware):**
    - Runs during the WebSocket handshake connection.
    - Parses credentials from headers, query string parameters, or browser cookies.
    - Validates JWT and injects `socket.user` (with `id`, `username`, and `avatar`) directly into the WebSocket connection context.
