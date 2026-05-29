import cron from "node-cron";
import { Message } from "../models/message.model.js";
import { redis } from "../lib/redis.js";

/**
 * ─────────────────────────────────────────────────────────────
 *  MESSAGE STATUS SYNC JOB
 *
 *  Runs every minute and does 3 things:
 *
 *  1. DELIVERED FIX
 *     For every message where receiver has EVER sent back a message
 *     to the sender, that proves the receiver was online and received
 *     old messages too → mark those old messages delivered.
 *
 *  2. SEEN FIX
 *     Same logic — if receiver replied, they clearly saw the msgs.
 *     Mark all undelivered/unseen messages as delivered + seen.
 *     Also fills in seenAt if missing.
 *
 *  3. AUTO DELETE
 *     Messages where seenAt is older than 30 minutes → mark autoDeleted
 *     and push both users into deletedFor[] so it hides from both sides.
 * ─────────────────────────────────────────────────────────────
 */

export function startMessageStatusSyncJob(io) {

    // ─── Run every 1 minute ───
    cron.schedule("* * * * *", async () => {
        try {
            await fixDeliveredAndSeenByReplyDetection(io);
        } catch (err) {
            console.error("[STATUS SYNC JOB ERROR]", err);
        }
    });

    // ─── Auto-delete seen messages older than 30 min (every minute) ───
    cron.schedule("* * * * *", async () => {
        try {
            await autoDeleteOldSeenMessages(io);
        } catch (err) {
            console.error("[AUTO DELETE JOB ERROR]", err);
        }
    });

    console.log("[JOBS] messageStatusSync + autoDelete jobs started ✅");
}


/* ══════════════════════════════════════════════════════════════
   STEP 1 & 2 — Fix delivered + seen by detecting reply activity
   ══════════════════════════════════════════════════════════════ */

async function fixDeliveredAndSeenByReplyDetection(io) {

    /**
     * LOGIC:
     * Find all messages that are NOT delivered yet.
     * For each (sender → receiver) pair, check:
     *   → Has the receiver EVER sent a message back to the sender?
     *   → If YES: receiver was active. Mark all those stuck messages
     *             as delivered=true, seen=true, seenAt=now (if missing).
     *   → If NO:  check if receiver is currently online via Redis.
     *             If online: mark delivered=true only.
     */

    // Get all unique (from, to) pairs that have undelivered messages
    const undeliveredPairs = await Message.aggregate([
        {
            $match: {
                "status.delivered": false,
                autoDeleted: false
            }
        },
        {
            $group: {
                _id: { from: "$from", to: "$to" }
            }
        },
        { $limit: 200 } // safety cap per run
    ]);

    if (!undeliveredPairs.length) return;

    for (const pair of undeliveredPairs) {
        const senderId = pair._id.from;
        const receiverId = pair._id.to;

        try {

            // ── Check if receiver ever replied to sender ──
            const receiverReplied = await Message.exists({
                from: receiverId,
                to: senderId
            });

            if (receiverReplied) {
                // Receiver was active and clearly saw+received old messages.
                // Mark all their undelivered messages as delivered + seen.

                const now = new Date();

                const result = await Message.updateMany(
                    {
                        from: senderId,
                        to: receiverId,
                        autoDeleted: false,
                        $or: [
                            { "status.delivered": false },
                            { "status.seen": false }
                        ]
                    },
                    [
                        {
                            $set: {
                                "status.delivered": true,
                                "status.seen": true,
                                deliveredAt: {
                                    $cond: [
                                        { $not: ["$deliveredAt"] },
                                        now,
                                        "$deliveredAt"
                                    ]
                                },
                                seenAt: {
                                    $cond: [
                                        { $not: ["$seenAt"] },
                                        now,
                                        "$seenAt"
                                    ]
                                }
                            }
                        }
                    ]
                );

                if (result.modifiedCount > 0) {
                    console.log(
                        `[STATUS SYNC] ${senderId}→${receiverId}: ` +
                        `${result.modifiedCount} msgs marked delivered+seen ` +
                        `(reply detected)`
                    );

                    // ── Notify sender via socket if they're online ──
                    if (io) {
                        const senderSockets = await redis.smembers(`user:${senderId}:sockets`);
                        if (senderSockets.length) {
                            io.to(senderId).emit("messages:bulk_seen", {
                                by: receiverId
                            });
                        }
                    }
                }

            } else {
                // Receiver never replied — check if they're online right now
                const receiverOnline = await redis.sismember("online:users", receiverId);

                if (receiverOnline) {
                    // Online but hasn't replied yet → mark delivered only
                    const result = await Message.updateMany(
                        {
                            from: senderId,
                            to: receiverId,
                            "status.delivered": false,
                            autoDeleted: false
                        },
                        {
                            $set: {
                                "status.delivered": true,
                                deliveredAt: new Date()
                            }
                        }
                    );

                    if (result.modifiedCount > 0) {
                        console.log(
                            `[STATUS SYNC] ${senderId}→${receiverId}: ` +
                            `${result.modifiedCount} msgs marked delivered ` +
                            `(receiver is online)`
                        );

                        if (io) {
                            io.to(senderId).emit("messages:bulk_delivered", {
                                to: receiverId
                            });
                        }
                    }
                }
                // else: receiver offline and never replied → do nothing yet
            }

        } catch (pairErr) {
            console.error(`[STATUS SYNC] Error for pair ${senderId}→${receiverId}:`, pairErr);
        }
    }
}


/* ══════════════════════════════════════════════════════════════
   STEP 3 — Auto-delete messages seen > 30 minutes ago
   ══════════════════════════════════════════════════════════════ */

async function autoDeleteOldSeenMessages(io) {

    const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000);

    // Find messages to delete BEFORE updating (so we can notify via socket)
    const toDelete = await Message.find(
        {
            "status.seen": true,
            $expr: {
                $lte: [
                    { $ifNull: ["$seenAt", "$createdAt"] },
                    thirtyMinutesAgo
                ]
            },
            autoDeleted: false
        },
        { _id: 1, from: 1, to: 1, tempId: 1 }
    ).limit(500); // batch cap

    if (!toDelete.length) return;

    const ids = toDelete.map(m => m._id);

    // Mark autoDeleted + push both users into deletedFor
    const result = await Message.updateMany(
        { _id: { $in: ids } },
        [
            {
                $set: {
                    autoDeleted: true,
                    deletedFor: {
                        $setUnion: [
                            "$deletedFor",
                            ["$from", "$to"]
                        ]
                    }
                }
            }
        ]
    );

    if (result.modifiedCount > 0) {
        console.log(`[AUTO DELETE] Deleted ${result.modifiedCount} old seen messages`);

        // ── Notify both users via socket ──
        if (io) {
            // Group deleted message IDs by affected users
            const userMsgMap = {}; // { userId: [tempId, ...] }

            for (const msg of toDelete) {
                const tempId = msg.tempId || msg._id.toString();

                if (!userMsgMap[msg.from]) userMsgMap[msg.from] = [];
                if (!userMsgMap[msg.to]) userMsgMap[msg.to] = [];

                userMsgMap[msg.from].push(tempId);
                userMsgMap[msg.to].push(tempId);
            }

            for (const [userId, tempIds] of Object.entries(userMsgMap)) {
                const userOnline = await redis.sismember("online:users", userId);
                if (userOnline) {
                    io.to(userId).emit("messages:auto_deleted", { tempIds });
                }
            }
        }
    }
}