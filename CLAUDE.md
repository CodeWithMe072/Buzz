# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 🚀 Quick Start & Development Commands

The project uses standard Node.js conventions and requires several services to run locally:
*   **Prerequisites:** Node.js v16+, MongoDB, Redis.
*   **Setup:** `npm install` (after creating a `.env` file from `.env.example`).
*   **Start Dev Server:** Use `npm run dev` for development mode with auto-reloading.
*   **Run Tests (E2E):** Playwright is used for end-to-end testing. Run verification tests using: `npx playwright test`.

## 🏗️ High-Level Architecture and Structure

The codebase follows a modular, layered architecture centered around Express.js routing and real-time Socket.io communication. State management relies on MongoDB (Mongoose) and Redis for quick access/caching.

1.  **Entry Points & Routing:**
    *   `index.js` / `app.js`: The main application initialization points where middleware are applied, and the server starts listening.
    *   `routes/`: Defines all major API endpoints using Express routers. These map HTTP verbs/paths to specific controller logic.

2.  **Business Logic & Control:**
    *   `controllers/`: Contains the primary request handlers (the "what-to-do"). Controllers orchestrate actions by calling services and interacting with models. This is where complex validation, state checks, and flow control reside.
    *   `services/`: Acts as a dedicated layer for handling external dependencies or isolated business operations (e.g., `TelegramService`). Calls to these classes decouple core logic from third-party APIs.

3.  **Data Layer:**
    *   `models/`: Defines the MongoDB schemas using Mongoose, structuring data interactions for chat messages, users, and metadata.
    *   `middleware/`: Intercepts requests before they hit controllers. Used for critical tasks like JWT authentication, input validation (e.g., `express-validator`), and rate limiting.

4.  **Real-time & Background Processes:**
    *   `sockets/`: Handles all real-time bidirectional communication via Socket.io. This manages presence, chat updates, and live call states separate from standard HTTP requests.
    *   `jobs/`: Manages scheduled background tasks (Cron jobs) using `node-cron`. These are used for maintenance tasks like message pruning or status synchronization, operating asynchronously outside of the main request cycle.

## 🔑 Key Architectural Patterns to Note

*   **Separation of Concerns:** Strict adherence to separating routing (`routes`) from logic execution (`controllers`), and external integrations (`services`).
*   **Real-time State Management:** A dual system for state is used: MongoDB for persistence (source of truth) and Redis for high-speed, volatile online status tracking.
*   **Security Flow:** Authentication passes through dedicated middleware first, ensuring the required `JWT_SECRET` validation before reaching any controller logic.

## 🧱 Core Components Overview

*   **Media Handling:** File/media uploads are managed using Multer, often integrating with external services like Cloudinary or AWS S3 (via R2). The `lib/` directory contains shared utility clients for these services.
*   **WebRTC Calls:** Video/Voice calls rely on a dedicated mechanism within the frontend and backend to manage signalling and connections.

***
*Generated from analysis of existing project documentation.*