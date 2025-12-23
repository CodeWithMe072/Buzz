
import { Message } from "../models/message.model.js"
export const getallMessage = async (req, res) => {


    const { userId: activeUserId } = req.body
    let allMessage = await
        Message.aggregate([
            /* 1️⃣ Only messages where user involved */
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

            /* 3️⃣ Group by OTHER USER ONLY */
            {
                $group: {
                    _id: {
                        $cond: [
                            { $eq: ["$from", activeUserId] },
                            "$to",      // if I sent → group by receiver
                            "$from"     // if I received → group by sender
                        ]
                    },
                    messages: { $push: "$$ROOT" }
                }
            },

            /* 4️⃣ Take last 10 messages */
            {
                $project: {
                    _id: 1,
                    messages: { $slice: ["$messages", 10] }
                }
            },

            /* 5️⃣ RENAME KEYS ONLY (unchanged logic) */
            {
                $project: {
                    _id: 1,              // 👈 this is now SECOND USER ID
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

    res.json({ ChatMesaage: allMessage })
}

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
