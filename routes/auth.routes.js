import express from "express";
import * as auth from "../controller/user.controller.js";
import { redis } from "../lib/redis.js";

const router = express.Router();

router.post("/auth/register", auth.add);
router.post("/auth/login", auth.login);
router.get("/auth/users", auth.get);
router.post("/auth/del/user", auth.del);
router.post("/auth/user/lastseen", auth.updateLastSeen);

// routes/auth.routes.js
router.post('/auth/link-telegram', auth.telegramLink);

router.post('/auth/toggle-notifications', auth.toggleNoti);

router.post("/auth/flush-redis", async (req, res) => {
    try {
        await redis.flushAll(); // Clear all Redis databases

        return res.status(200).json({
            success: true,
            message: "Redis cache cleared successfully"
        });
    } catch (error) {
        console.error("Redis flush error:", error);

        return res.status(500).json({
            success: false,
            message: "Failed to clear Redis cache",
            error: error.message
        });
    }
});


export default router;
