import cron from "node-cron";
import { Message } from "../models/message.model.js";

export function startAutoDeleteSeenMessagesJob() {

    cron.schedule("* * * * *", async () => {
        try {
            const thirtyMinutesAgo = new Date(
                Date.now() - 30 * 60 * 1000
            );

            const result = await Message.updateMany(
                {
                    "status.seen": true,

                    $expr: {
                        $lte: [
                            "$seenAt",
                            thirtyMinutesAgo
                        ]
                    },

                    autoDeleted: false
                },

                // 🔑 UPDATE PIPELINE
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

                { updatePipeline: true }
            );

        } catch (err) {
            console.error("[AUTO DELETE ERROR]", err);
        }
    });
}
