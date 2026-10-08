require("dotenv").config();

module.exports = {
  PORT: process.env.PORT || 3000,
  BASE_URL: process.env.BASE_URL || "http://localhost:3000",
  API_KEY: process.env.API_KEY || null,
  SESSIONS_DIR: "./sessions",
  MEDIA_DIR: "./media",
  TRUST_PROXY: process.env.TRUST_PROXY || false,
  NODE_ENV: process.env.NODE_ENV || "development",
  MAX_ACTIVE_SESSIONS: parseInt(process.env.MAX_ACTIVE_SESSIONS, 10) || 20,
  ALLOWED_BRANCHES: process.env.ALLOWED_BRANCHES
    ? process.env.ALLOWED_BRANCHES.split(",").map((b) => b.trim().toLowerCase())
    : null,
  ALLOWED_ORIGINS: process.env.ALLOWED_ORIGINS
    ? process.env.ALLOWED_ORIGINS.split(",").map((o) => o.trim())
    : ["http://localhost:5173", "http://localhost:8000"],
  WEBHOOK_SECRET: process.env.WEBHOOK_SECRET || null,
};
