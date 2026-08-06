# Buzz Socket Disconnect Flow — Review Answers & Scalability Analysis

This document provides answers to the architectural reviews and scalability risks identified in the socket connection/disconnection lifecycle.

---

## Answers to Open Questions for Sanjay

### 1. Is this flow already deployed in production, or still spec-stage?
*   **Current State**: The flow is **fully implemented** in the active codebase (`sockets/chat.sockets.js`). It is currently running in the development and initial staging environments.
*   **Recommendation**: Since scaling is part of the future path, the issues highlighted (specifically #1 and #2) should be refactored **prior to horizontal deployment** to avoid unstable user state tracking.

### 2. Is the stale-socket pruning check instance-local or already cluster-aware?
*   **Current State**: The pruning check is **instance-local**.
*   **Code Reference**:
    ```javascript
    const existingSockets = await redis.smembers(`user:${userId}:sockets`);
    for (const sid of existingSockets) {
      if (!socket.nsp.sockets.has(sid)) { // <-- Instance-local Map check
        await redis.srem(`user:${userId}:sockets`, sid);
      }
    }
    ```
*   **The Issue**: `socket.nsp.sockets.has(sid)` only queries the in-memory Map of the Node.js process hosting the current connection. In a clustered configuration using a Redis adapter, a valid connection hosted on `Server-B` will not exist in the local memory of `Server-A`, causing `Server-A` to wrongly prune the connection from the Redis set.
*   **Mitigation Strategy**: Remove this synchronous pruning loop from the connection handler. Instead:
    *   Rely on standard Socket.io heartbeat/ping mechanisms.
    *   Let the `disconnect` handler clean up socket IDs.
    *   Implement a cluster-aware query (e.g. using Socket.io's `serverSideEmit` or Redis keyspace tracking) if stale socket audit is required.

### 3. Does any feature depend on disconnect being detected faster than ~30s?
*   **Current State**: **No.** The presence indicators in the UI (e.g., "Active now", "Last seen X minutes ago") are designed to show status at a relaxed resolution.
*   **Analysis**: The 30-second delay is standard for real-time applications (resembling WhatsApp and Telegram Web) to prevent status "flickering" on page refreshes, mobile tab swaps, or brief cellular drops.

### 4. Any existing reconciliation/retry mechanism for partial failures in the disconnect broadcast chain?
*   **Current State**: **No.** The disconnection execution pipeline is a straight procedural flow:
    ```javascript
    await redis.srem("online:users", userId);
    socket.nsp.emit("user:offline", { userId });
    await User.findByIdAndUpdate(userId, { lastSeen: new Date() });
    ```
    If any of these asynchronous steps fail (e.g., database timeout or network partition), the exception is caught and logged (`console.error`), but there is no retry, reconciliation, or rollback mechanism.
*   **Recommendation**:
    *   Wrap status updates in atomic Redis/Mongo operations.
    *   For mission-critical reconciliation, implement a scheduled heartbeat/status reconciliation worker (cron job) that audits online users in Redis against actual active connections at fixed intervals.

---

## Scalability Risks & Recommended Fixes

### Risk 1: `disconnectTimers` in-memory map breaks with horizontal scaling
*   **Problem**: In-memory `setTimeout` timers are bound to the process scope. If a user disconnects from `Server-A`, the timer is queued on `Server-A`. If the user reconnects within 30 seconds and is routed by the load balancer to `Server-B`, `Server-B` will register the connection, but `Server-A`'s timer will keep running. When `Server-A`'s timer fires, it will mark the user offline incorrectly.
*   **Fix**: Move the grace period state to Redis:
    1. When a user disconnects: Set a temporary key in Redis (e.g., `offline:grace:user:${userId}`) with a **TTL of 30 seconds**.
    2. When a user reconnects: Delete the grace key from Redis.
    3. Listen for **Redis Keyspace Notifications** (specifically the `EXPIRED` event) in your Node.js instances. When the key `offline:grace:user:${userId}` expires, the instance that receives the notification executes the offline database update and peer broadcast.

### Risk 3: Race Condition: Check-then-Act on Redis socket set
*   **Problem**: Reading socket counts and then performing writes creates a classic race condition where another socket connection can be established between the read and write operations.
*   **Fix**: Wrap the disconnect check in a **Lua script** executed on Redis, which handles the check-and-remove operation atomically:
    ```lua
    -- Lua script for atomic user check-and-remove
    redis.call('SREM', KEYS[1], ARGV[1])
    local remaining = redis.call('SCARD', KEYS[1])
    if remaining == 0 then
        redis.call('SREM', 'online:users', ARGV[2])
        return 1 -- User is fully offline
    end
    return 0 -- User still has active sockets
    ```
