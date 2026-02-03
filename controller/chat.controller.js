
import { Message } from "../models/message.model.js"
export const getallMessage = async (req, res) => {
    const { userId: activeUserId } = req.body;

    const allMessage = await Message.aggregate([
        /* 1️⃣ Only messages where user involved & not deleted */
        {
            $match: {
                $and: [
                    {
                        $or: [
                            { from: activeUserId },
                            { to: activeUserId }
                        ]
                    },
                    {
                        deletedFor: { $ne: activeUserId }
                    }
                ]
            }
        },

        /* 2️⃣ Sort latest first */
        { $sort: { createdAt: -1 } },

        /* 3️⃣ Group by OTHER USER */
        {
            $group: {
                _id: {
                    $cond: [
                        { $eq: ["$from", activeUserId] },
                        "$to",
                        "$from"
                    ]
                },

                messages: { $push: "$$ROOT" },

                /* 🔥 COUNT UNREAD PER CHAT */
                unreadCount: {
                    $sum: {
                        $cond: [
                            {
                                $and: [
                                    { $eq: ["$to", activeUserId] },
                                    { $eq: ["$status.seen", false] }
                                ]
                            },
                            1,
                            0
                        ]
                    }
                }
            }
        },

        /* 4️⃣ Limit messages to last 10 */
        {
            $project: {
                _id: 1,
                unreadCount: 1,
                messages: { $slice: ["$messages", 10] }
            }
        },

        /* 5️⃣ Shape response for frontend */
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
                            user: "$$m.from",
                            to: "$$m.to",
                            type: "$$m.type",
                            content: "$$m.content",
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
