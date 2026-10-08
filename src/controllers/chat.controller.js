const { activeSessions } = require("../core/sessionManager");
const db = require("../core/database");
const { isValidBranch, isValidPhone, normalizePhone } = require("../utils/validator");

/**
 * GET /api/chat-history/:branch/:phone
 */
async function getChatHistory(req, res) {
  const { branch, phone } = req.params;

  // 1. Validasi nama branch
  if (!isValidBranch(branch)) {
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

  // 3. Cek apakah sesi aktif
  const sessionData = activeSessions.get(branch);
  if (!sessionData) {
    return res.status(400).json({
      success: false,
      error: `Sistem WA branch "${branch}" sedang tidak aktif.`,
    });
  }

  try {
    // Normalisasi nomor: ubah 08xxx → 628xxx
    const normalized = normalizePhone(phone);
    const jid = `${normalized}@s.whatsapp.net`;

    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 50, 1), 100);

    // Ambil dari Database Lokal (SQLite)
    const messages = await db.getMessages(branch, jid, limit);

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

module.exports = { getChatHistory };
