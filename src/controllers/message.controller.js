const { activeSessions } = require("../core/sessionManager");
const db = require("../core/database");
const { isValidBranch, isValidPhone, normalizePhone } = require("../utils/validator");

/**
 * POST /api/send-message
 */
async function sendMessage(req, res) {
  const { branch, phone, message } = req.body;

  // 1. Validasi input kelengkapan
  if (!branch || !phone || !message) {
    return res.status(400).json({
      success: false,
      error: "Field branch, phone, dan message wajib diisi.",
    });
  }

  // 2. Validasi format branch
  if (!isValidBranch(branch)) {
    return res.status(400).json({
      success: false,
      error: "Format nama branch tidak valid.",
    });
  }

  // 3. Validasi format nomor telepon
  if (!isValidPhone(phone)) {
    return res.status(400).json({
      success: false,
      error: "Format nomor telepon tidak valid. Gunakan 8-16 digit angka.",
    });
  }

  // 4. Validasi isi pesan
  if (typeof message !== "string" || message.trim().length === 0) {
    return res.status(400).json({
      success: false,
      error: "Pesan tidak boleh kosong.",
    });
  }

  if (message.length > 4096) {
    return res.status(400).json({
      success: false,
      error: "Pesan melebihi batas maksimum 4096 karakter.",
    });
  }

  // 5. Cek apakah sesi WA aktif & terhubung
  const sessionData = activeSessions.get(branch);
  if (!sessionData || !sessionData.isConnected) {
    return res.status(400).json({
      success: false,
      error: `Sistem WA branch "${branch}" sedang offline atau belum scan QR.`,
    });
  }

  try {
    // 6. Normalisasi nomor tujuan: 08xxx → 628xxx
    const formattedPhone = normalizePhone(phone);
    const jid = `${formattedPhone}@s.whatsapp.net`;

    // 7. 🛡️ Anti-Ban Simulation (Simulasi Mengetik & Jitter Alami)
    try {
      await sessionData.sock.sendPresenceUpdate("composing", jid);
      // Jeda alami antara 500ms - 1200ms meniru pengetikan manusia
      const delay = Math.floor(Math.random() * 700) + 500;
      await new Promise((resolve) => setTimeout(resolve, delay));
      await sessionData.sock.sendPresenceUpdate("paused", jid);
    } catch (presenceErr) {
      // Abaikan jika update presence gagal agar pesan tetap terkirim
    }

    // 8. Kirim pesan via Baileys socket
    const sentMsg = await sessionData.sock.sendMessage(jid, { text: message.trim() });

    console.log(`[${branch}] 📤 Pesan berhasil dikirim ke ${jid}`);

    // 9. Simpan pesan keluar ke SQLite
    db.saveMessage(branch, sentMsg);

    return res.json({
      success: true,
      message: "Pesan berhasil terkirim!",
      data: sentMsg,
    });
  } catch (error) {
    console.error(`[${branch}] ❌ Gagal kirim pesan:`, error.message);
    return res.status(500).json({
      success: false,
      error: "Terjadi kesalahan saat mengirim pesan: " + (process.env.NODE_ENV === "production" ? "Gagal memproses pengiriman" : error.message),
    });
  }
}

module.exports = { sendMessage };
