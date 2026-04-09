const qrcode = require("qrcode");
const { activeSessions, startSession } = require("../core/sessionManager");

/**
 * GET /api/wa-status/:branch
 *
 * Mengecek status koneksi WA untuk branch tertentu.
 * Jika sesi belum ada, otomatis memulai sesi baru.
 *
 * Response status:
 * - "initializing"    → Sesi sedang dalam proses start
 * - "waiting_for_scan"→ QR Code siap, menunggu scan dari HP
 * - "connected"       → WA sudah terhubung dan siap kirim/terima pesan
 */
async function getStatus(req, res) {
  const branchId = req.params.branch;

  // Jika sesi belum ada → mulai sesi baru
  if (!activeSessions.has(branchId)) {
    activeSessions.set(branchId, { status: "starting" });
    startSession(branchId);
    return res.json({
      success: true,
      status: "initializing",
      message: `Memulai mesin WA untuk branch: ${branchId}...`,
    });
  }

  const sessionData = activeSessions.get(branchId);

  // Sesi sedang booting
  if (sessionData.status === "starting") {
    return res.json({
      success: true,
      status: "initializing",
      message: "Mesin sedang dipanaskan, harap tunggu...",
    });
  }

  // Sesi sudah aktif & terhubung
  if (sessionData.isConnected) {
    return res.json({
      success: true,
      status: "connected",
      message: `WhatsApp branch ${branchId} aktif ✅`,
    });
  }

  // Sesi menunggu scan QR
  if (sessionData.qr) {
    try {
      const qrImageBase64 = await qrcode.toDataURL(sessionData.qr);
      return res.json({
        success: true,
        status: "waiting_for_scan",
        qr_image_url: qrImageBase64,
      });
    } catch (err) {
      return res.status(500).json({
        success: false,
        error: "Gagal generate QR Code.",
      });
    }
  }

  return res.json({
    success: true,
    status: "initializing",
    message: `Memuat sistem untuk branch ${branchId}...`,
  });
}

module.exports = { getStatus };
