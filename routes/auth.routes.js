import express from "express";
import * as auth from "../controller/user.controller.js";

const router = express.Router();

router.post("/auth/register", auth.add);
router.post("/auth/login", auth.login);
router.get("/auth/users", auth.get);
router.post("/auth/del/user", auth.del);
router.post("/auth/user/lastseen", auth.updateLastSeen);


export default router;
