const express = require("express");
const router = express.Router();
const statusController = require("../controllers/status.controller");

// GET /api/wa-status/:branch
router.get("/:branch", statusController.getStatus);

module.exports = router;
