import express from "express";
import { protect } from "../middleware/auth.middleware.js";

const router = express.Router();

const componentMap = {
  "login": "partials/auth/login",
  "signup": "partials/auth/signup",
  "dashboard": "partials/dashboard/dashboard",
  "password-overlay": "partials/dashboard/password-overlay",
  "chat": "partials/chat/layout",
  "chat/message-window": "partials/chat/message-window",
  "account": "partials/account/account",
  "emoji": "partials/emoji/emoji-panel",
  "media": "partials/media/media-viewer",
  "call": "partials/call/call-ui"
};

const protectedComponents = [
  "chat",
  "chat/message-window",
  "account",
  "emoji",
  "media",
  "call"
];

// Endpoint to fetch rendered component partials
router.get(/^\/api\/components\/(.+)$/, (req, res, next) => {
    const componentName = req.params[0];
    
    // Check if the component is protected and needs JWT validation
    if (protectedComponents.includes(componentName) || (componentName && (componentName.startsWith("chat/") || componentName.startsWith("account/") || componentName.startsWith("call/")))) {
        return protect(req, res, next);
    }
    next();
}, (req, res) => {
    const componentName = req.params[0];
    const ejsPath = componentMap[componentName] || `partials/${componentName}`;
    
    // Set headers to prevent caching of templates
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Expires", "0");

    // Render the EJS partial
    res.render(ejsPath, {
        isServerLogin: !!req.user,
        isShowDashboard: req.user ? req.user.showDashboard ?? true : true
    }, (err, html) => {
        if (err) {
            console.error(`[ComponentsRouter] Error rendering template "${ejsPath}":`, err.message);
            return res.status(404).send(`Component "${componentName}" not found`);
        }
        res.send(html);
    });
});

export default router;
