import { Message } from "../models/message.model.js"

export const getallMessage = async (req, res) => {
    const { userId: activeUserId } = req.body;

    if (!activeUserId) {
        return res.status(400).json({ status: false, message: "userId is required" });
    }

    const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000);

    const allMessage = await Message.aggregate([

        /* ─────────────────────────────────────────────
           1️⃣  BASE FILTER
           - User must be sender OR receiver
           - Not deleted for this user
           - Not autoDeleted
        ───────────────────────────────────────────── */
        {
            $match: {
                $and: [
                    {
                        $or: [
                            { from: activeUserId },
                            { to: activeUserId }
                        ]
                    },
                    { deletedFor: { $ne: activeUserId } },
                    { autoDeleted: { $ne: true } }
                ]
            }
        },

        /* ─────────────────────────────────────────────
           2️⃣  TAG EACH MESSAGE with why it should show:

           isMySentUndelivered   → I sent it, receiver hasn't delivered yet
           isMySentUnseen        → I sent it, receiver hasn't seen yet
           isReceivedUnseen      → receiver sent it to me, I haven't seen yet
           isRecent              → createdAt within last 30 min (normal chat msgs)
        ───────────────────────────────────────────── */
        {
            $addFields: {

                // Messages I sent that are not yet delivered or not yet seen
                isMySentPending: {
                    $and: [
                        { $eq: ["$from", activeUserId] },
                        {
                            $or: [
                                { $eq: ["$status.delivered", false] },
                                { $eq: ["$status.seen", false] }
                            ]
                        }
                    ]
                },

                // Messages sent TO me that I haven't seen yet
                isReceivedUnseen: {
                    $and: [
                        { $eq: ["$to", activeUserId] },
                        { $eq: ["$status.seen", false] }
                    ]
                },

                // Recent messages (within last 30 min) — normal conversation
                isRecent: {
                    $gte: ["$createdAt", thirtyMinutesAgo]
                }
            }
        },

        /* ─────────────────────────────────────────────
           3️⃣  KEEP MESSAGE IF any tag is true
        ───────────────────────────────────────────── */
        {
            $match: {
                $or: [
                    { isMySentPending: true },
                    { isReceivedUnseen: true },
                    { isRecent: true }
                ]
            }
        },

        /* ─────────────────────────────────────────────
           4️⃣  SORT — newest first
        ───────────────────────────────────────────── */
        { $sort: { createdAt: -1 } },

        /* ─────────────────────────────────────────────
           5️⃣  GROUP BY OTHER USER
        ───────────────────────────────────────────── */
        {
            $group: {
                _id: {
                    $cond: [
                        { $eq: ["$from", activeUserId] },
                        "$to",
                        "$from"
                    ]
                },

                allMsgs: { $push: "$$ROOT" },

                // Count unread: messages sent TO me that I haven't seen
                unreadCount: {
                    $sum: {
                        $cond: [{ $eq: ["$isReceivedUnseen", true] }, 1, 0]
                    }
                }
            }
        },

        /* ─────────────────────────────────────────────
           6️⃣  SMART SLICE PER CHAT
           - My undelivered/unseen sent msgs  → show ALL (no limit)
           - Received unseen msgs             → show ALL (no limit)
           - Recent msgs (normal chat)        → show last 10 only
           
           Strategy: separate then merge and re-sort
        ───────────────────────────────────────────── */
        {
            $project: {
                _id: 1,
                unreadCount: 1,

                // All my pending sent messages (no limit)
                pendingMsgs: {
                    $filter: {
                        input: "$allMsgs",
                        as: "m",
                        cond: { $eq: ["$$m.isMySentPending", true] }
                    }
                },

                // All unseen received messages (no limit)
                unseenMsgs: {
                    $filter: {
                        input: "$allMsgs",
                        as: "m",
                        cond: {
                            $and: [
                                { $eq: ["$$m.isReceivedUnseen", true] },
                                { $eq: ["$$m.isMySentPending", false] }
                            ]
                        }
                    }
                },

                // Recent normal messages — limit to 10, exclude already covered above
                recentMsgs: {
                    $slice: [
                        {
                            $filter: {
                                input: "$allMsgs",
                                as: "m",
                                cond: {
                                    $and: [
                                        { $eq: ["$$m.isMySentPending", false] },
                                        { $eq: ["$$m.isReceivedUnseen", false] },
                                        { $eq: ["$$m.isRecent", true] }
                                    ]
                                }
                            }
                        },
                        10
                    ]
                }
            }
        },

        /* ─────────────────────────────────────────────
           7️⃣  MERGE all 3 buckets into one messages array
        ───────────────────────────────────────────── */
        {
            $addFields: {
                messages: {
                    $sortArray: {
                        input: {
                            $concatArrays: ["$pendingMsgs", "$unseenMsgs", "$recentMsgs"]
                        },
                        sortBy: { createdAt: -1 }
                    }
                }
            }
        },

        /* ─────────────────────────────────────────────
           8️⃣  FINAL SHAPE for frontend
        ───────────────────────────────────────────── */
        {
            $project: {
                _id: 1,
                unreadCount: 1,
                messages: {
                    $map: {
                        input: "$messages",
                        as: "m",
                        in: {
                            id: "$$m._id",
                            tempId: "$$m.tempId",
                            user: "$$m.from",
                            to: "$$m.to",
                            type: "$$m.type",
                            content: "$$m.content",
                            fileName: "$$m.fileName",
                            fileSize: "$$m.fileSize",
                            cover: "$$m.cover",
                            thumb: "$$m.thumb",
                            caption: "$$m.caption",
                            replyTo: "$$m.replyTo",
                            timestamp: "$$m.clientTime",
                            status: "$$m.status",
                            createdAt: "$$m.createdAt"
                        }
                    }
                }
            }
        }
    ]);

    res.json({ ChatMesaage: allMessage });
};

export const deleteChat = async (req, res) => {
    try {
        const { activeUser, to } = req.body;

        // basic validation
        if (!activeUser || !to) {
            return res.status(400).json({
                status: false,
                message: "activeUser and to are required"
            });
        }

        const result = await Message.updateMany(
            {
                $or: [
                    { from: activeUser, to },
                    { from: to, to: activeUser }
                ]
            },
            {
                $addToSet: { deletedFor: activeUser }
            }
        );

        return res.json({
            status: true,
            message: "Chat deleted for this user only",
        });

    } catch (err) {
        console.error(err);
        return res.status(500).json({
            status: false,
            message: "Failed to delete chat"
        });
    }
};

export const getmedia = async (req, res) => {
    try {
        const chat_key = req.params.chat_key;

        if (!chat_key) {
            return res.status(400).json({
                status: false,
                message: "chat_key is required"
            });
        }

        const [sender, receiver] = chat_key.split("-");

        if (!sender || !receiver) {
            return res.status(400).json({
                status: false,
                message: "Invalid chat_key format"
            });
        }

        const media = await Message.find({
            $or: [
                { from: sender, to: receiver },
                { from: receiver, to: sender }
            ],
            type: { $in: ["image", "video"] }
        })
            .select("type content cover thumb caption createdAt from to deletedFor autoDeleted")
            .sort({ createdAt: -1 });

        return res.status(200).json({
            status: true,
            message: "All media fetched successfully",
            total: media.length,
            data: media
        });

    } catch (err) {
        console.error(err);
        return res.status(500).json({
            status: false,
            message: "Failed to fetch media"
        });
    }
};