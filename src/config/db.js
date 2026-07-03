import mongoose from "mongoose";
import { config } from "./config.js";

export const connectDB = async () => {
    try {
        await mongoose.connect(config.mongo_url, {
            dbName: "sBish"
        })
        console.log("Connected to MongoDB");
    } catch (err) {
        console.log(err);
        process.exit(1);
    }
}