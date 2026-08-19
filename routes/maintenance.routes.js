import express from "express";

const router = express.Router();

/**
 * GET /api/maintenance/status
 * Public endpoint to query real-time maintenance status.
 */
router.get("/api/maintenance/status", (req, res) => {
  const isMaintenance = process.env.MAINTENANCE_MODE === "true";
  res.json({
    status: true,
    maintenance: isMaintenance,
    timestamp: new Date()
  });
});

/**
 * GET /maintenance
 * Standalone maintenance page endpoint.
 */
router.get("/maintenance", (req, res) => {
  res.render("maintenance", {
    appName: process.env.APP_NAME || "Buzz",
    message: process.env.MAINTENANCE_MESSAGE || "We're currently performing scheduled system maintenance. We'll be back online shortly!"
  });
});

export default router;
