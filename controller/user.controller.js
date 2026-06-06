import bcrypt from "bcryptjs";
import { User } from "../models/user.model.js";
import mongoose from "mongoose";

export const add = async (req, res) => {
    try {
        const {
            username,
            email,
            password,
            phoneNumber = null,
            extra = null
        } = req.body;

        let { avatar } = req.body

        /* ---------- Basic validation ---------- */
        if (!username || !email || !password) {
            return res.status(400).json({
                status: false,
                message: "username, email and password are required"
            });
        }

        /* ---------- Check duplicates ---------- */
        const exists = await User.exists({
            $or: [{ username }, { email }]
        });

        if (exists) {
            return res.status(409).json({
                status: false,
                message: "User already exists"
            });
        }

        /* ---------- Check avatar null ---------- */
        if (avatar == null) {
            avatar = username.charAt(0).toUpperCase()
        }

        /* ---------- Hash password ---------- */
        const hashedPassword = await bcrypt.hash(password, 10);

        /* ---------- Create user ---------- */
        const user = await User.create({
            username,
            email,
            password: hashedPassword,
            avatar,
            phoneNumber,
            extra,
            lastSeen: new Date()
        });

        /* ---------- Response (never send password) ---------- */
        res.status(201).json({
            status: true,
            user: {
                id: user._id,
                username: user.username,
                email: user.email,
                avatar: user.avatar,
                phoneNumber: user.phoneNumber,
                extra: user.extra,
                lastSeen: user.lastSeen,
                createdAt: user.createdAt
            },
            message: "User Created Successfully"
        });

    } catch (err) {
        console.error(err);
        res.status(500).json({
            status: false,
            message: "Failed to create user"
        });
    }
};

export const get = async (req, res) => {
    try {
        const { id, extra } = req.query;

        const filter = {};

        if (id) {
            if (!mongoose.Types.ObjectId.isValid(id)) {
                return res.status(400).json({
                    status: false,
                    message: "Invalid user id"
                });
            }
            filter._id = id;
        }

        if (extra) {
            filter.extra = extra;
        }

        const users = await User.find(filter)
            .select("_id username email avatar phoneNumber extra lastSeen createdAt")
            .sort({ createdAt: -1 });

        res.json({
            status: true,
            count: users.length,
            user: users
        });

    } catch (err) {
        console.error(err);
        res.status(500).json({
            status: false,
            message: "Failed to fetch users"
        });
    }
};

export const del = async (req, res) => {
    try {
        const { id, extra } = req.query;

        if (!id && !extra) {
            return res.status(400).json({
                status: false,
                message: "id or extra is required to delete user"
            });
        }

        const filter = {};

        if (id) {
            if (!mongoose.Types.ObjectId.isValid(id)) {
                return res.status(400).json({
                    status: false,
                    message: "Invalid user id"
                });
            }
            filter._id = id;
        }

        if (extra) {
            filter.extra = extra;
        }

        const deletedUser = await User.findOneAndDelete(filter);

        if (!deletedUser) {
            return res.status(404).json({
                status: false,
                message: "User not found"
            });
        }

        res.json({
            status: true,
            message: "User deleted successfully",
            deletedUser: {
                id: deletedUser._id,
                username: deletedUser.username,
                email: deletedUser.email,
                extra: deletedUser.extra
            }
        });

    } catch (err) {
        console.error(err);
        res.status(500).json({
            status: false,
            message: "Failed to delete user"
        });
    }
};

export const login = async (req, res) => {
    try {
        const { username, email, password } = req.body;

        if ((!username && !email) || !password) {
            return res.status(400).json({
                status: false,
                message: "username or email and password are required"
            });
        }

        const user = await User.findOne({
            $or: [
                username ? { username } : null,
                email ? { email } : null
            ].filter(Boolean)
        }).select("+password");

        if (!user) {
            return res.status(401).json({
                status: false,
                message: "Invalid credentials"
            });
        }

        const isMatch = await bcrypt.compare(password, user.password);

        if (!isMatch) {
            return res.status(401).json({
                status: false,
                message: "Invalid credentials"
            });
        }

        user.lastSeen = new Date();
        await user.save();

        res.status(200).json({
            status: true,
            message: "Login successful",
            user: {
                id: user._id,
                username: user.username,
                avatar: user.avatar,
                extra: user.extra,
            },
            version: process.env.VERSION
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({
            status: false,
            message: "Login failed"
        });
    }
};

export const updateLastSeen = async (req, res) => {
    try {
        const { extra } = req.body;

        if (!extra) {
            return res.status(400).json({
                status: false,
                message: "extra is required"
            });
        }

        const filter = { extra };

        const result = await User.updateOne(
            filter,
            { $set: { lastSeen: new Date() } }
        );

        if (result.matchedCount === 0) {
            return res.status(404).json({
                status: false,
                message: "User not found"
            });
        }

        res.json({
            status: true,
            message: "lastSeen updated"
        });

    } catch (err) {
        console.error(err);
        res.status(500).json({
            status: false,
            message: "Failed to update lastSeen"
        });
    }
};

// 🔥 FIXED: Now works with 'extra' field instead of requiring authentication
export const telegramLink = async (req, res) => {
    try {
        const { telegramChatId, extra } = req.body;

        if (!telegramChatId || !extra) {
            return res.status(400).json({
                status: false,
                message: "telegramChatId and extra are required"
            });
        }

        const user = await User.findOneAndUpdate(
            { extra },
            {
                telegramChatId,
                notificationsEnabled: true
            },
            { new: true }
        );

        if (!user) {
            return res.status(404).json({
                status: false,
                message: "User not found"
            });
        }

        res.json({
            status: true,
            message: 'Telegram linked successfully'
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({
            status: false,
            message: error.message
        });
    }
}

// 🔥 FIXED: Now works with 'extra' field
export const toggleNoti = async (req, res) => {
    try {
        const { extra } = req.body;

        if (!extra) {
            return res.status(400).json({
                status: false,
                message: "extra is required"
            });
        }

        const user = await User.findOne({ extra });

        if (!user) {
            return res.status(404).json({
                status: false,
                message: "User not found"
            });
        }

        user.notificationsEnabled = !user.notificationsEnabled;
        await user.save();

        res.json({
            status: true,
            notificationsEnabled: user.notificationsEnabled
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({
            status: false,
            message: error.message
        });
    }
}