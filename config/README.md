# Config Folder (`/config`)

This folder contains database configuration and initialization files.

## Files
- [`mongo.js`](file:///d:/Buzz/Buzz/config/mongo.js): Connects to the MongoDB database using Mongoose.

## Details
- `mongo.js` exports `connectMongo()`, which reads `process.env.MONGO_URI` and connects using `mongoose.connect()`.
- Logs `[MongoDB] Connected` on success, or prints the error and terminates the process (`process.exit(1)`) on failure.
