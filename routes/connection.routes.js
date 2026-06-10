import express from "express";
import {
  sendRequest,
  respondToRequest,
  listConnections,
  pendingRequests,
  sentRequests,
  searchUsers,
  removeConnection,
  getFriendMoments,
  getAllFriendsMoments,
} from "../controllers/connection.controller.js";
import { protect } from "../middleware/auth.middleware.js";

const router = express.Router();

// All connection routes are protected
router.use(protect);

router.post("/connections/send", sendRequest);
router.post("/connections/respond", respondToRequest);
router.get("/connections", listConnections);
router.get("/connections/pending", pendingRequests);
router.get("/connections/sent", sentRequests);
router.get("/connections/search", searchUsers);
router.delete("/connections/:connectionId", removeConnection);
router.get("/connections/moments", getAllFriendsMoments);
router.get("/connections/moments/:friendId", getFriendMoments);


export default router;
