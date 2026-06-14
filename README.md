# InstaChat (Buzz) — Real-Time Secure Chat Application

InstaChat (codenamed **Buzz**) is a secure, real-time single-page chat application with built-in voice/video calls, file sharing, media viewer, and auto-deleting chats. It features a custom secret activation system masquerading as a government exam portal.

---

## 🤫 Secret Access (How to Open the Chat)

By default, loading the application displays a static mockup of the **Staff Selection Commission (SSC) India Exam Portal**. This serves as a cover screen.

To open the secret chat interface:
1. Navigate to the application root in your browser (e.g., `http://localhost:5500`).
2. Locate the **Indian Flag Emblem** at the top-left of the page header (inside the SSC logo section).
3. **Click the emblem 5 times in quick succession** (within 1 second).
4. The SSC portal will transition out, revealing the InstaChat registration/login screen!

---

## 🛠️ Developer Setup & Installation

Follow these steps to run the project locally on your machine.

### Prerequisites
Make sure you have the following installed:
- [Node.js](https://nodejs.org/) (v16+ recommended)
- [MongoDB](https://www.mongodb.com/) (Running locally or via Atlas)
- [Redis](https://redis.io/) (Used for real-time online state tracking)

### 1. Clone the Repository & Install Dependencies
```bash
git clone <repository-url>
cd Buzz
npm install
```

### 2. Configure Environment Variables
Create a `.env` file in the root directory. You can copy the template from `.env.example`:
```bash
cp .env.example .env
```
Fill in the following variables:
```env
# Server
PORT=5500
NODE_ENV=DEV
APP_VERSION=1.0.0

# Database
MONGO_URI=mongodb://localhost:27017/chatapp

# Redis Cache
REDIS_URL=redis://localhost:6379

# JWT Authentication
JWT_SECRET=your_super_secret_jwt_key_change_this_in_production
JWT_EXPIRES_IN=7d

# Cloudflare R2 Cloud Storage (For Media and File Uploads)
R2_ENDPOINT=https://<account_id>.r2.cloudflarestorage.com
R2_ACCESS_KEY_ID=your_access_key_id
R2_SECRET_ACCESS_KEY=your_secret_access_key
R2_BUCKET=buzz-chat
R2_PUBLIC_URL=https://pub-xxxxxx.r2.dev

# Cloudinary (Optional fallback for images)
CLOUDINARY_CLOUD_NAME=your_cloud_name
CLOUDINARY_API_KEY=your_api_key
CLOUDINARY_API_SECRET=your_api_secret

# Telegram Bot (Optional, for push notification alerts)
TELEGRAM_BOT_TOKEN=your_bot_token

# WebRTC calling TURN Servers (Optional, e.g., via Metered.ca)
METERED_DOMAIN=your_metered_domain
METERED_API_KEY=your_metered_api_key
```

### 3. Start the Server
For development (with auto-reload using Nodemon):
```bash
npm run dev
```
For production:
```bash
npm start
```
Open your browser and navigate to `http://localhost:5500`. Remember to **click the emblem 5 times** to access the login page!

### 4. Running End-to-End Tests
Playwright is used for end-to-end testing. Run the verification tests:
```bash
npx playwright test
```

---

## 📁 Repository Structure

Below is an overview of the key directories in this project. Each directory contains its own `README.md` detailing its role:

* [`/config`](file:///d:/Buzz/Buzz/config/README.md) — Database configuration connections.
* [`/controllers`](file:///d:/Buzz/Buzz/controllers/README.md) — Backend route controllers (business logic).
* [`/models`](file:///d:/Buzz/Buzz/models/README.md) — MongoDB schemas (Mongoose).
* [`/routes`](file:///d:/Buzz/Buzz/routes/README.md) — Express API route definitions.
* [`/middleware`](file:///d:/Buzz/Buzz/middleware/README.md) — Security and request validation middleware.
* [`/sockets`](file:///d:/Buzz/Buzz/sockets/README.md) — Socket.io handlers for real-time events.
* [`/services`](file:///d:/Buzz/Buzz/services/README.md) — Third-party service layers (e.g. Telegram).
* [`/jobs`](file:///d:/Buzz/Buzz/jobs/README.md) — Cron jobs for status synchronization and message pruning.
* [`/lib`](file:///d:/Buzz/Buzz/lib/README.md) — Shared library utilities (e.g. Redis client connection).
* [`/public`](file:///d:/Buzz/Buzz/public/README.md) — Client-side static assets (HTML/CSS/JS/media).
* [`/views`](file:///d:/Buzz/Buzz/views/README.md) — EJS page templates.
* [`/tests`](file:///d:/Buzz/Buzz/tests/README.md) — Playwright E2E browser tests.
