require("dotenv").config();

module.exports = {
  PORT: process.env.PORT || 3000,
  BASE_URL: process.env.BASE_URL || "http://localhost:3000",
  API_KEY: process.env.API_KEY || null,
  SESSIONS_DIR: "./sessions",
  MEDIA_DIR: "./media",
};
