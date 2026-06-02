import cron from "node-cron";
import { Message } from "../models/message.model.js";
import { redis } from "../lib/redis.js";

/**
 * ─────────────────────────────────────────────────────────────
 *  MESSAGE STATUS SYNC JOB
 *
 *  CORRECT LOGIC (fixed):
 *
 *  DELIVERED:
 *    A message can be marked delivered ONLY if the receiver
 *    is currently ONLINE (Redis check). Nothing else.
 *    We do NOT use reply history for delivered — receiver
 *    being online = they can receive it right now.
 *
 *  SEEN:
 *    A message can be marked seen ONLY if the receiver sent
 *    a reply AFTER that specific message was created.
 *    "receiver replied at some point in the past" is NOT enough —
 *    the reply must be NEWER than the message itself.
 *
 *  AUTO DELETE:
 *    Messages seen > 30 minutes ago → mark autoDeleted,
 *    hide from both sides, notify via socket.
 * ─────────────────────────────────────────────────────────────
 */

export function startMessageStatusSyncJob(io) {

    // ─── Run every 1 minute ───
    cron.schedule("* * * * *", async () => {
        try {
            await fixDeliveredStatus(io);
            await fixSeenStatus(io);
        } catch (err) {
            console.error("[STATUS SYNC JOB ERROR]", err);
        }
    });

    // ─── Auto-delete seen messages older than 30 min ───
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
   STEP 1 — Fix DELIVERED
   Rule: receiver must be ONLINE right now (Redis)
   ══════════════════════════════════════════════════════════════ */

async function fixDeliveredStatus(io) {

    // Find all unique (from → to) pairs with undelivered messages
    const pairs = await Message.aggregate([
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
        { $limit: 200 }
    ]);

    if (!pairs.length) return;

    for (const pair of pairs) {
        const senderId = pair._id.from;
        const receiverId = pair._id.to;

        try {
            // ── ONLY mark delivered if receiver is online right now ──
            const receiverOnline = await redis.sismember("online:users", receiverId);
            if (!receiverOnline) continue;

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
                console.log(`[DELIVERED] ${senderId}→${receiverId}: ${result.modifiedCount} msgs`);

                if (io) {
                    io.to(senderId).emit("messages:bulk_delivered", { to: receiverId });
                }
            }

        } catch (err) {
            console.error(`[DELIVERED] Error ${senderId}→${receiverId}:`, err);
        }
    }
}


/* ══════════════════════════════════════════════════════════════
   STEP 2 — Fix SEEN
   Rule: receiver must have sent a reply AFTER the message createdAt
         i.e. lastReplyAt > message.createdAt
   ══════════════════════════════════════════════════════════════ */

async function fixSeenStatus(io) {

    // Find all unique (from → to) pairs with unseen messages
    const pairs = await Message.aggregate([
        {
            $match: {
                "status.seen": false,
                "status.delivered": true,   // must be delivered first
                autoDeleted: false
            }
        },
        {
            $group: {
                _id: { from: "$from", to: "$to" },
                oldestUnseen: { $min: "$createdAt" } // oldest unseen msg time
            }
        },
        { $limit: 200 }
    ]);

    if (!pairs.length) return;

    for (const pair of pairs) {
        const senderId = pair._id.from;
        const receiverId = pair._id.to;
        const oldestUnseenAt = pair.oldestUnseen;

        try {
            // ── Find the receiver's most recent reply to sender ──
            const lastReply = await Message.findOne(
                {
                    from: receiverId,
                    to: senderId
                },
                { createdAt: 1 }
            ).sort({ createdAt: -1 });

            // No reply at all → receiver never responded → skip
            if (!lastReply) continue;

            // Reply exists but it's OLDER than the unseen messages → skip
            // This is the KEY FIX: reply must be AFTER the message was sent
            if (lastReply.createdAt <= oldestUnseenAt) continue;

            // Reply is newer than some unseen messages →
            // Only mark seen the messages that were created BEFORE the last reply
            const now = new Date();

            const result = await Message.updateMany(
                {
                    from: senderId,
                    to: receiverId,
                    "status.seen": false,
                    autoDeleted: false,
                    createdAt: { $lte: lastReply.createdAt } // only msgs before the reply
                },
                [
                    {
                        $set: {
                            "status.seen": true,
                            seenAt: {
                                $cond: [
                                    { $not: ["$seenAt"] },
                                    now,
                                    "$seenAt"
                                ]
                            }
                        }
                    }
                ],
                { updatePipeline: true }
            );

            if (result.modifiedCount > 0) {
                console.log(`[SEEN] ${senderId}→${receiverId}: ${result.modifiedCount} msgs (reply at ${lastReply.createdAt})`);

                if (io) {
                    const senderSockets = await redis.smembers(`user:${senderId}:sockets`);
                    if (senderSockets.length) {
                        io.to(senderId).emit("messages:bulk_seen", { by: receiverId });
                    }
                }
            }

        } catch (err) {
            console.error(`[SEEN] Error ${senderId}→${receiverId}:`, err);
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
                    { $ifNull: ["$seenAt"] },
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
        ],
        { updatePipeline: true }  // ← required for array pipeline in Mongoose
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