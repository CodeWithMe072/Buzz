/**
 * maintenance.middleware.js
 * Strictly enforces maintenance mode when process.env.MAINTENANCE_MODE === "true".
 * Blocks all API routes, database data, user info, HTML templates, and socket connections.
 * Serves ONLY the standalone maintenance page and maintenance status endpoint.
 */

export const checkMaintenanceMode = (req, res, next) => {
  const isMaintenance = process.env.MAINTENANCE_MODE === "true";

  if (!isMaintenance) {
    return next();
  }

  // Allowed endpoints during maintenance mode
  if (
    req.path === "/api/maintenance/status" ||
    req.path === "/maintenance" ||
    req.path === "/favicon.ico"
  ) {
    return next();
  }

  // If request is an API call, AJAX request, or JSON request: respond with 503 JSON (zero data leak)
  if (
    req.path.startsWith("/api") ||
    req.path.startsWith("/auth") ||
    req.path.startsWith("/connections") ||
    req.path.startsWith("/chat") ||
    req.path.startsWith("/upload") ||
    req.headers.accept?.includes("application/json") ||
    req.headers["x-requested-with"] === "XMLHttpRequest"
  ) {
    return res.status(503).json({
      status: false,
      maintenance: true,
      message: "System is currently under maintenance. Please try again later."
    });
  }

  // For all page/browser requests: render ONLY the standalone maintenance page
  return res.status(503).render("maintenance", {
    appName: process.env.APP_NAME || "Buzz",
    message: process.env.MAINTENANCE_MESSAGE || "We're currently performing scheduled system maintenance. We'll be back online shortly!"
  });
};
