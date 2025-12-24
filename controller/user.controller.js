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
            lastSeen: new Date()        // 👈 current timestamp
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

        // find by _id
        if (id) {
            if (!mongoose.Types.ObjectId.isValid(id)) {
                return res.status(400).json({
                    status: false,
                    message: "Invalid user id"
                });
            }
            filter._id = id;
        }

        // find by extra
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

        // delete by _id
        if (id) {
            if (!mongoose.Types.ObjectId.isValid(id)) {
                return res.status(400).json({
                    status: false,
                    message: "Invalid user id"
                });
            }
            filter._id = id;
        }

        // delete by extra
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

        // validation
        if ((!username && !email) || !password) {
            return res.status(400).json({
                status: false,
                message: "username or email and password are required"
            });
        }

        // find user by username OR email
        const user = await User.findOne({
            $or: [
                username ? { username } : null,
                email ? { email } : null
            ].filter(Boolean)
        }).select("+password"); // explicitly include password

        if (!user) {
            return res.status(401).json({
                status: false,
                message: "Invalid credentials"
            });
        }

        // compare password
        const isMatch = await bcrypt.compare(password, user.password);

        if (!isMatch) {
            return res.status(401).json({
                status: false,
                message: "Invalid credentials"
            });
        }

        // update lastSeen on successful login
        user.lastSeen = new Date();
        await user.save();

        // response (no password)
        res.status(200).json({
            status: true,
            message: "Login successful",
            user: {
                avatar: user.avatar,
                extra: user.extra,
            }
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
        const {  extra } = req.body;

        if (!extra) {
            return res.status(400).json({
                status: false,
                message: "extra is required"
            });
        }

        const filter = {};

        

        // update by extra
        if (extra) {
            filter.extra = extra;
        }

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
