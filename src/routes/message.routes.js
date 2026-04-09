const express = require("express");
const router = express.Router();
const messageController = require("../controllers/message.controller");

// POST /api/send-message
router.post("/", messageController.sendMessage);

module.exports = router;
