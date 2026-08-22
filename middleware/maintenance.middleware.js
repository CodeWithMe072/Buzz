/**
 * maintenance.middleware.js
 * Selectively enforces maintenance mode restrictions when process.env.MAINTENANCE_MODE === "true".
 * 
 * ALLOWED: Login, Signup, Dashboard, Password Lock Overlay, Chat Window, Message Reading, Media Viewing, Security Logs.
 * BLOCKED: Sending Messages, Status Creation, Media/Avatar Uploads, WebRTC Calls, Profile Settings Modifications.
 */

export const checkMaintenanceMode = (req, res, next) => {
  const isMaintenance = process.env.MAINTENANCE_MODE === "true";

  // Always set header to notify client of current maintenance state (true or false)
  res.setHeader("X-Maintenance-Mode", isMaintenance ? "true" : "false");

  if (!isMaintenance) {
    return next();
  }

  // Allowed system status & static favicon
  if (
    req.path === "/api/maintenance/status" ||
    req.path === "/maintenance" ||
    req.path === "/favicon.ico"
  ) {
    return next();
  }

  // Define BLOCKED action/mutation routes during maintenance mode
  const isBlockedMutation =
    req.method === "POST" &&
    (req.path.startsWith("/chat/message") ||
     req.path.startsWith("/status") ||
     req.path.startsWith("/api/upload") ||
     req.path.startsWith("/api/webrtc") ||
     req.path.startsWith("/auth/profile/update") ||
     req.path.startsWith("/auth/password/change"));

  if (isBlockedMutation) {
    return res.status(503).json({
      status: false,
      maintenance: true,
      code: "MAINTENANCE_MODE",
      message: "This action is temporarily disabled due to scheduled system maintenance."
    });
  }

  // Allow ALL viewing, authentication, reading, dashboard, and lock screen endpoints
  return next();
};
