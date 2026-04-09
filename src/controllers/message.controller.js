const { activeSessions } = require("../core/sessionManager");
const db = require("../core/database");

/**
 * POST /api/send-message
 */
async function sendMessage(req, res) {
  const { branch, phone, message } = req.body;

  // 1. Validasi input
  if (!branch || !phone || !message) {
    return res.status(400).json({
      success: false,
      error: "Field branch, phone, dan message wajib diisi.",
    });
  }

  // 2. Cek apakah sesi WA aktif & terhubung
  const sessionData = activeSessions.get(branch);
  if (!sessionData || !sessionData.isConnected) {
    return res.status(400).json({
      success: false,
      error: `Sistem WA branch "${branch}" sedang offline atau belum scan QR.`,
    });
  }

  try {
    // 3. Normalisasi nomor tujuan: 08xxx → 628xxx
    const formattedPhone = phone.toString().replace(/^0/, "62");
    const jid = `${formattedPhone}@s.whatsapp.net`;

    // 4. Kirim pesan via Baileys socket
    const sentMsg = await sessionData.sock.sendMessage(jid, { text: message });

    console.log(`[${branch}] 📤 Pesan berhasil dikirim ke ${jid}`);

    // 5. 🔥 Simpan pesan keluar ke SQLite
    db.saveMessage(branch, sentMsg);

    return res.json({
      success: true,
      message: "Pesan berhasil terkirim!",
      data: sentMsg,
    });
  } catch (error) {
    console.error(`[${branch}] ❌ Gagal kirim pesan:`, error);
    return res.status(500).json({
      success: false,
      error: "Terjadi kesalahan saat mengirim pesan.",
    });
  }
}

module.exports = { sendMessage };
