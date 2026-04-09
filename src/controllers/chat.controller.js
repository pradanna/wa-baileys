const { activeSessions } = require("../core/sessionManager");
const db = require("../core/database");

/**
 * GET /api/chat-history/:branch/:phone
 */
async function getChatHistory(req, res) {
  const { branch, phone } = req.params;

  const sessionData = activeSessions.get(branch);
  if (!sessionData) {
    return res.status(400).json({
      success: false,
      error: `Sistem WA branch "${branch}" sedang tidak aktif.`,
    });
  }

  try {
    // Normalisasi nomor: ubah 08xxx → 628xxx
    const normalizedPhone = phone.toString().replace(/^0/, "62");
    const jid = `${normalizedPhone}@s.whatsapp.net`;

    // Ambil dari Database Lokal (SQLite) — selalu cepat
    const messages = await db.getMessages(branch, jid, 50);

    return res.json({
      success: true,
      total: messages.length,
      data: messages,
    });
  } catch (error) {
    console.error("[API] ❌ Error get chat history:", error);
    return res.status(500).json({
      success: false,
      error: "Terjadi kesalahan saat memuat riwayat chat.",
    });
  }
}

module.exports = { getChatHistory };
