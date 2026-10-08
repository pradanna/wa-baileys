const qrcode = require("qrcode");
const { activeSessions, startSession, logoutSession } = require("../core/sessionManager");
const { isValidBranch } = require("../utils/validator");
const { MAX_ACTIVE_SESSIONS } = require("../config/constants");

/**
 * GET /api/wa-status/:branch
 *
 * Mengecek status koneksi WA untuk branch tertentu.
 * Jika sesi belum ada, otomatis memulai sesi baru (dengan batas keamanan).
 */
async function getStatus(req, res) {
  const branchId = req.params.branch;

  // 1. Validasi format nama branch (mencegah path traversal)
  if (!isValidBranch(branchId)) {
    return res.status(400).json({
      success: false,
      error: "Format nama branch tidak valid. Hanya diizinkan huruf, angka, underscore, dan dash (2-32 karakter).",
    });
  }

  // 2. Jika sesi belum ada → verifikasi batas kapasitas sebelum memulai (DoS Protection)
  if (!activeSessions.has(branchId)) {
    if (activeSessions.size >= MAX_ACTIVE_SESSIONS) {
      return res.status(429).json({
        success: false,
        error: `Batas maksimum sesi WhatsApp aktif (${MAX_ACTIVE_SESSIONS}) telah tercapai. Harap logout sesi yang tidak aktif terlebih dahulu.`,
      });
    }

    activeSessions.set(branchId, { status: "starting" });
    try {
      startSession(branchId);
    } catch (err) {
      activeSessions.delete(branchId);
      return res.status(500).json({
        success: false,
        error: "Gagal memulai sesi WhatsApp: " + err.message,
      });
    }

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
    const userPhone = sessionData.sock?.user?.id?.split(":")[0] || null;
    return res.json({
      success: true,
      status: "connected",
      message: `WhatsApp branch ${branchId} aktif ✅`,
      phone: userPhone,
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

/**
 * DELETE /api/wa-status/:branch (Logout)
 */
async function logout(req, res) {
  const branchId = req.params.branch;

  if (!isValidBranch(branchId)) {
    return res.status(400).json({
      success: false,
      error: "Format nama branch tidak valid.",
    });
  }

  try {
    const result = await logoutSession(branchId);
    return res.json(result);
  } catch (err) {
    return res.status(500).json({
      success: false,
      error: "Gagal melakukan logout sesi: " + (process.env.NODE_ENV === "production" ? "Internal error" : err.message),
    });
  }
}

module.exports = { getStatus, logout };
