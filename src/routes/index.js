const express = require("express");
const router = express.Router();
const apiKeyMiddleware = require("../middleware/apiKey.middleware");

const statusRoutes = require("./status.routes");
const chatRoutes = require("./chat.routes");
const messageRoutes = require("./message.routes");

// Terapkan API Key middleware ke SEMUA route di bawah ini
router.use(apiKeyMiddleware);

// Mount setiap grup route
router.use("/wa-status", statusRoutes);
router.use("/chat-history", chatRoutes);
router.use("/send-message", messageRoutes);

module.exports = router;
