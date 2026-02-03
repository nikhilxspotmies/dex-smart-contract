
import express from "express";
import { Server } from "socket.io";
import http from "http";
import dotenv from "dotenv";
import mongoose from "mongoose";
import cors from "cors";

// We need to import the model. 
// Since backend and ws are siblings, we can't easily import from ../backend/src... in TS without strict config.
// For simplicity in this microservice setup, we will duplicate the Model definition or use a shared lib.
// Given the constraints, I will redefine the schema here to ensure it connects to the same collection.

dotenv.config();

const app = express();
app.use(cors({
    origin: "*"
}));

const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: "*", // Allow all for dev
        methods: ["GET", "POST"]
    }
});

// CONNECT TO SAME MONGO DB as Backend
const MONGO_URI = process.env.MONGO_URI || "mongodb://localhost:27017/p2p-escrow";

mongoose.connect(MONGO_URI)
    .then(() => console.log("WS Service Connected to MongoDB"))
    .catch(err => console.error("MongoDB Connection Error:", err));

// Define ChatMessage Schema Locally (Must match Backend)
const ChatMessageSchema = new mongoose.Schema({
    purchaseId: { type: Number, required: true, index: true },
    sender: { type: String, required: true },
    message: { type: String, required: true },
    timestamp: { type: Date, default: Date.now }
});

const ChatMessage = mongoose.model('ChatMessage', ChatMessageSchema);

// SOCKET LOGIC
io.on("connection", (socket) => {
    console.log("New Client Connected:", socket.id);

    // Join Room Event (Client sends purchaseId and their address)
    socket.on("join_room", async (data) => {
        console.log("Received join_room:", data);
        const { purchaseId, address } = data;

        if (purchaseId === undefined || purchaseId === null || !address) {
            console.log("Invalid join_room request - Missing fields");
            return;
        }

        const room = `trade-${purchaseId}`;
        socket.join(room);
        console.log(`User ${address} joined room: ${room}`);

        // Send Chat History
        try {
            const history = await ChatMessage.find({ purchaseId }).sort({ timestamp: 1 }).limit(100);
            socket.emit("chat_history", history);
        } catch (e) {
            console.error("Error fetching history:", e);
        }
    });

    // Send Message Event
    socket.on("send_message", async (data) => {
        console.log("Received send_message:", data);
        const { purchaseId, sender, message } = data;

        if ((purchaseId === undefined || purchaseId === null) || !sender || !message) {
            console.log("Invalid send_message request");
            return;
        }

        const room = `trade-${purchaseId}`;

        // Save to DB
        try {
            const savedMsg = await ChatMessage.create({
                purchaseId,
                sender,
                message,
                timestamp: new Date()
            });

            // Broadcast to Room
            console.log(`Broadcasting to ${room}:`, savedMsg);
            io.to(room).emit("receive_message", savedMsg);
            console.log(`Message broadcasted`);

        } catch (e) {
            console.error("Error saving message:", e);
        }
    });

    socket.on("disconnect", () => {
        console.log("Client Disconnected", socket.id);
    });
});

const PORT = process.env.PORT || 3003;
server.listen(PORT, () => {
    console.log(`WebSocket Server running on port ${PORT}`);
});
