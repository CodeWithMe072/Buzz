# Jobs Folder (`/jobs`)

This folder manages background routines and scheduled workers using `node-cron` to maintain database hygiene and synchronize client statuses.

## Files

- [`messageStatusSync.js`](file:///d:/Buzz/Buzz/jobs/messageStatusSync.js):
  - **Seen Status Checker:** Periodically syncs message status. If a recipient has replied to a conversation *after* a message was sent, that message is retroactively marked as `seen` even if no socket ACK was recorded.
  - **Auto-Delete Cleaner:** Selects seen messages older than 30 minutes and triggers automatic deletions for both parties.
  - **Spontaneous Moments Snapshot Trigger:** Contains logic (manually triggered/disabled by default) to spontaneously request random camera snapshots from users who have moments enabled.

- [`autoDeleteSeenMessages.js`](file:///d:/Buzz/Buzz/jobs/autoDeleteSeenMessages.js):
  - Dedicated cron task that runs every minute to query the database for messages flagged as `seen` with a `seenAt` timestamp older than 30 minutes.
  - Executes batch updates (`updateMany`) setting `autoDeleted: true` and updating the `deletedFor` list to include both sender and recipient IDs so they are completely hidden from the front-end layout.
