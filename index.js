require("dotenv").config();
const express = require("express");
const cors = require("cors");
const path = require("path");
const fs = require("fs");
const morgan = require("morgan");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const errorHandler = require("./src/middleware/error.middleware");
const { PORT, SESSIONS_DIR, TRUST_PROXY, ALLOWED_ORIGINS } = require("./src/config/constants");
const { startSession } = require("./src/core/sessionManager");
const { isValidBranch } = require("./src/utils/validator");
const apiRoutes = require("./src/routes/index");
const mediaRoutes = require("./src/routes/media.routes");

const app = express();

if (TRUST_PROXY) {
  app.set("trust proxy", TRUST_PROXY);
}

// ── Global Security & Utility Middleware ──────────────────────────────────────
app.use(
  helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" }, // Memungkinkan frontend memuat media gambar
  })
);

app.use(morgan("dev"));

// Konfigurasi CORS terkontrol
app.use(
  cors({
    origin: (origin, callback) => {
      // Izinkan request tanpa origin (seperti curl, mobile app, cURL PHP / Laravel server-to-server)
      if (!origin) return callback(null, true);
      if (ALLOWED_ORIGINS.includes("*") || ALLOWED_ORIGINS.includes(origin)) {
        return callback(null, true);
      }
      return callback(new Error("CORS policy: Origin ini tidak diizinkan."));
    },
    credentials: true,
  })
);

app.use(express.json({ limit: "1mb" }));

// Rate Limiting: Membatasi request untuk mencegah brute-force & flooding
const limiter = rateLimit({
  windowMs: 60 * 1000, // 1 menit
  max: 100, // Batasi 100 request per menit per IP
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: "Too many requests",
    message: "Terlalu banyak permintaan dari IP ini, harap coba lagi nanti.",
  },
});
app.use("/api", limiter);

// ── Media Routes (Akses Terproteksi) ───────────────────────────────────────────
app.use("/media", mediaRoutes);

// ── API Routes ────────────────────────────────────────────────────────────────
app.use("/api", apiRoutes);

// ── Health Check (Monitoring Endpoint) ─────────────────────────────────────────
app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    timestamp: new Date().toISOString(),
    uptime: Math.floor(process.uptime()),
  });
});

// ── Global Error Handler (Paling Bawah) ────────────────────────────────────────
app.use(errorHandler);

// ── Start Server ──────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`🌐 WA-Baileys Gateway berjalan di http://localhost:${PORT}`);
  console.log(`📋 Endpoints:`);
  console.log(`   GET  /api/wa-status/:branch`);
  console.log(`   GET  /api/chat-history/:branch/:phone`);
  console.log(`   POST /api/send-message`);
  console.log(`   GET  /media/:branch/:filename`);

  // 🔥 AUTO-START SEMUA SESI YANG TERDAFTAR SECARA AMAN
  if (fs.existsSync(SESSIONS_DIR)) {
    const branches = fs.readdirSync(SESSIONS_DIR).filter((file) => {
      const fullPath = path.join(SESSIONS_DIR, file);
      return fs.statSync(fullPath).isDirectory() && isValidBranch(file);
    });

    if (branches.length > 0) {
      console.log(`\n Mendeteksi ${branches.length} sesi tersimpan. Membangunkan mesin...`);
      branches.forEach((branch) => {
        try {
          startSession(branch);
        } catch (err) {
          console.error(`[${branch}] ❌ Gagal auto-start:`, err.message);
        }
      });
    }
  }
});
