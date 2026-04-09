require("dotenv").config();
const express = require("express");
const cors = require("cors");
const path = require("path");
const fs = require("fs");
const morgan = require("morgan");
const rateLimit = require("express-rate-limit");
const errorHandler = require("./src/middleware/error.middleware");
const { PORT, SESSIONS_DIR } = require("./src/config/constants");
const { startSession } = require("./src/core/sessionManager");
const apiRoutes = require("./src/routes/index");

const app = express();

// ── Global Middleware ──────────────────────────────────────────────────────────
app.use(morgan("dev")); // Logger untuk memantau request di terminal
app.use(cors());
app.use(express.json());

// Rate Limiting: Membatasi request untuk mencegah ban & brute force
const limiter = rateLimit({
  windowMs: 60 * 1000, // 1 menit
  max: 100, // Batasi 100 request per menit per IP
  message: {
    success: false,
    error: "Too many requests",
    message: "Terlalu banyak permintaan dari IP ini, harap coba lagi nanti.",
  },
});
app.use("/api", limiter);

// Expose folder media agar bisa diakses oleh frontend
app.use("/media", express.static(path.join(__dirname, "media")));

// ── Routes ────────────────────────────────────────────────────────────────────
app.use("/api", apiRoutes);

// ── Health Check (tanpa API Key/Rate Limit) ──────────────────────────────────
app.get("/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// ── Global Error Handler (Harus diletakkan paling bawah) ──────────────────────
app.use(errorHandler);

// ── Start Server ──────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`🌐 WA-Baileys Gateway berjalan di http://localhost:${PORT}`);
  console.log(`📋 Endpoints:`);
  console.log(`   GET  /api/wa-status/:branch`);
  console.log(`   GET  /api/chat-history/:branch/:phone`);
  console.log(`   POST /api/send-message`);

  // 🔥 AUTO-START SEMUA SESI YANG TERDAFTAR
  if (fs.existsSync(SESSIONS_DIR)) {
    const branches = fs.readdirSync(SESSIONS_DIR).filter((file) => {
      return fs.statSync(path.join(SESSIONS_DIR, file)).isDirectory();
    });

    if (branches.length > 0) {
      console.log(`\n Mendeteksi ${branches.length} sesi tersimpan. Membangunkan mesin...`);
      branches.forEach((branch) => {
        startSession(branch);
      });
    }
  }
});
