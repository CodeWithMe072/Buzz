
import { Message } from "../models/message.model.js"
export const getallMessage = async (req, res) => {


    const { userId: activeUserId } = req.body
    let allMessage = await
        Message.aggregate([
            /* 1️⃣ Only messages where user involved */
            {
                $match: {
                    $or: [
                        { from: activeUserId },
                        { to: activeUserId }
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