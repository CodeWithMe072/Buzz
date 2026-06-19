import jwt from "jsonwebtoken";
import { User } from "../models/user.model.js";

/* ═══════════════════════════════════════════════════════════════
   HTTP MIDDLEWARE — protects REST API routes
   
   Usage:  router.get("/protected", protect, handler)
   
   Reads token from:
     1. Authorization: Bearer <token>   (API clients, Postman)
     2. Cookie: token=<token>           (browser, set via httpOnly cookie)
═══════════════════════════════════════════════════════════════ */
export const protect = async (req, res, next) => {
  try {
    let token = null;

    // 1. Check Authorization header
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith("Bearer ")) {
      token = authHeader.split(" ")[1];
    }
    if (!token && req.cookies?.token) {
      token = req.cookies.token;
    }

    if (!token) {
      return res.status(401).json({
        status: false,
        message: "Access denied. No token provided.",
      });
    }

    // Verify token
    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET);
    } catch (err) {
      if (err.name === "TokenExpiredError") {
        return res.status(401).json({
          status: false,
          message: "Token expired. Please login again.",
          code: "TOKEN_EXPIRED",
        });
      }
      return res.status(401).json({
        status: false,
        message: "Invalid token.",
        code: "TOKEN_INVALID",
      });
    }

    // Fetch user (confirm still exists and is active)
    const user = await User.findById(decoded.id).select("_id username email avatar isActive");

    if (!user) {
      return res.status(401).json({
        status: false,
        message: "User no longer exists.",
        code: "USER_NOT_FOUND",
      });
    }

    if (!user.isActive) {
      return res.status(403).json({
        status: false,
        message: "Account has been deactivated.",
        code: "ACCOUNT_INACTIVE",
      });
    }

    // Attach user to request — available in all subsequent handlers
    req.user = user;
    next();

  } catch (err) {
    console.error("[Auth Middleware] Error:", err.message);
    res.status(500).json({ status: false, message: "Auth error" });
  }
};

export const readUserFromCookie = async (req, res, next) => {
  try {
    const token = req.cookies?.refreshToken;
    console.log(token)
    console.log(req.cookies)
    if (!token) {
      req.user = null
      return next()
    }

    const decoded = jwt.verify(
      token,
      process.env.JWT_SECRET
    );

    const user = await User.findById(decoded.id)
      .select("_id username email avatar isActive showDashboard");
    console.log("user", user)
    req.user = user || null;

    next();
  } catch (err) {
    req.user = null;
    next();
  }
};
/* ═══════════════════════════════════════════════════════════════
   SOCKET MIDDLEWARE — protects socket.io connections
   
   Usage:  io.use(socketAuth)
   
   Reads token from:
     socket.handshake.auth.token   ← primary (set by client on connect)
     socket.handshake.headers.authorization  ← fallback
   
   On success: attaches socket.user = { id, username, avatar }
   On failure: calls next(new Error("Unauthorized")) — socket is rejected
═══════════════════════════════════════════════════════════════ */
export const socketAuth = async (socket, next) => {
  try {
    let token = null;

    // 1. From handshake auth object (recommended)
    if (socket.handshake.auth?.token) {
      token = socket.handshake.auth.token;
    }

    // 2. From Authorization header (fallback)
    const authHeader = socket.handshake.headers?.authorization;
    if (!token && authHeader?.startsWith("Bearer ")) {
      token = authHeader.split(" ")[1];
    }

    if (!token) {
      return next(new Error("UNAUTHORIZED: No token provided"));
    }

    // Verify
    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET);
    } catch (err) {
      if (err.name === "TokenExpiredError") {
        return next(new Error("TOKEN_EXPIRED: Please login again"));
      }
      return next(new Error("UNAUTHORIZED: Invalid token"));
    }

    // Confirm user exists
    const user = await User.findById(decoded.id).select("_id username avatar isActive");

    if (!user || !user.isActive) {
      return next(new Error("UNAUTHORIZED: User not found or inactive"));
    }

    // Attach to socket — accessible anywhere as socket.user
    socket.user = {
      id: user._id.toString(),
      username: user.username,
      avatar: user.avatar,
    };

    next();

  } catch (err) {
    console.error("[Socket Auth] Error:", err.message);
    next(new Error("AUTH_ERROR: Internal error during authentication"));
  }
};


/* ═══════════════════════════════════════════════════════════════
   HELPER — generate a signed JWT token
═══════════════════════════════════════════════════════════════ */
export const generateToken = (userId) => {
  return jwt.sign(
    { id: userId },
    process.env.JWT_SECRET,
    { expiresIn: "15m" }
  );
};
export const generateRefreshToken = (userId) => {
  return jwt.sign(
    { id: userId },
    process.env.JWT_SECRET,
    { expiresIn: "15m" }
  );
};
