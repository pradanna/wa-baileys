const { activeSessions } = require("../core/sessionManager");
const db = require("../core/database");
const { isValidBranch, isValidPhone, normalizePhone } = require("../utils/validator");

/**
 * GET /api/chat-history/:branch/:phone
 */
async function getChatHistory(req, res) {
  const { branch, phone } = req.params;
  const branchId = (branch || "solo").toLowerCase();

  // 1. Validasi nama branch
  if (!isValidBranch(branchId)) {
    return res.status(400).json({
      success: false,
      error: "Format nama branch tidak valid.",
    });
  }

  // 2. Validasi format nomor telepon
  if (!isValidPhone(phone)) {
    return res.status(400).json({
      success: false,
      error: "Format nomor telepon tidak valid. Gunakan 8-16 digit angka.",
    });
  }

  try {
    // Normalisasi nomor: ubah 08xxx → 628xxx
    const normalized = normalizePhone(phone);
    const jid = `${normalized}@s.whatsapp.net`;

    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 50, 1), 300);

    // Ambil dari Database Lokal (SQLite)
    // Tetap bisa membaca riwayat chat meskipun sesi WA sedang reconnecting
    const messages = await db.getMessages(branchId, jid, limit);

    return res.json({
      success: true,
      total: messages.length,
      data: messages,
    });
  } catch (error) {
    console.error("[API] ❌ Error get chat history:", error.message);
    return res.status(500).json({
      success: false,
      error: "Terjadi kesalahan saat memuat riwayat chat.",
    });
  }
}


/**
 * DELETE /api/chat-history/clear-all
 */
async function clearAllMessages(req, res) {
  try {
    const { SESSIONS_DIR } = require("../config/constants");
    const fs = require("fs");
    const path = require("path");
    const sqlite3 = require("sqlite3").verbose();

    const resolvedSessionsDir = path.resolve(SESSIONS_DIR);
    if (fs.existsSync(resolvedSessionsDir)) {
      const sessions = fs.readdirSync(resolvedSessionsDir);
      for (const sess of sessions) {
        const sessPath = path.join(resolvedSessionsDir, sess);
        if (fs.statSync(sessPath).isDirectory()) {
          const dbPath = path.join(sessPath, "database.sqlite");
          if (fs.existsSync(dbPath)) {
            await new Promise((resolve) => {
              const tempDb = new sqlite3.Database(dbPath);
              tempDb.serialize(() => {
                tempDb.run("DELETE FROM messages", () => {
                  tempDb.run("VACUUM", () => {
                    tempDb.close(() => resolve());
                  });
                });
              });
            });
          }
        }
      }
    }

    return res.json({
      success: true,
      message: "Semua pesan di database wa-baileys berhasil dihapus.",
    });
  } catch (error) {
    console.error("[API] ❌ Error clear all messages:", error.message);
    return res.status(500).json({
      success: false,
      error: "Gagal menghapus pesan: " + error.message,
    });
  }
}

module.exports = { getChatHistory, clearAllMessages };
