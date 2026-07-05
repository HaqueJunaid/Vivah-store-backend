import mongoose from "mongoose";
import { config } from "./config.js";

export const connectDB = async () => {
    if (!config.mongo_url) {
        console.error("CRITICAL ERROR: MONGO_URL is not defined in the environment variables!");
        process.exit(1);
    }
    try {
        await mongoose.connect(config.mongo_url, {
            dbName: "sBish"
        })
        console.log("Connected to MongoDB");
    } catch (err) {
        console.error("Failed to connect to MongoDB:", err.message);
        process.exit(1);
    }
}