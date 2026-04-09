const express = require("express");
const router = express.Router();
const chatController = require("../controllers/chat.controller");

// GET /api/chat-history/:branch/:phone
router.get("/:branch/:phone", chatController.getChatHistory);

module.exports = router;
