const express = require("express");
const router = express.Router();
const statusController = require("../controllers/status.controller");

// GET /api/wa-status/:branch
router.get("/:branch", statusController.getStatus);

// DELETE /api/wa-status/:branch (Logout)
router.delete("/:branch", statusController.logout);

module.exports = router;
