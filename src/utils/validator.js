const crypto = require("crypto");
const path = require("path");
const { ALLOWED_BRANCHES } = require("../config/constants");

/**
 * Validasi nama branch:
 * - Hanya karakter alfanumerik, underscore, dan tanda hubung
 * - Panjang 2 sampai 32 karakter
 * - Tidak boleh mengandung dot (.) atau slash untuk mencegah path traversal
 */
function isValidBranch(branch) {
  if (typeof branch !== "string") return false;
  const trimmed = branch.trim();
  const pattern = /^[a-zA-Z0-9_-]{2,32}$/;
  if (!pattern.test(trimmed)) return false;

  // Jika ALLOWED_BRANCHES didefinisikan di .env, periksa apakah ada dalam daftar
  if (Array.isArray(ALLOWED_BRANCHES) && ALLOWED_BRANCHES.length > 0) {
    return ALLOWED_BRANCHES.includes(trimmed.toLowerCase());
  }

  return true;
}

/**
 * Validasi nomor telepon:
 * - Bersihkan karakter umum seperti spasi, tanda tambah, strip
 * - Panjang 8 hingga 16 digit angka murni
 */
function isValidPhone(phone) {
  if (typeof phone !== "string" && typeof phone !== "number") return false;
  const cleaned = phone.toString().replace(/[\s\-+]/g, "");
  return /^[0-9]{8,16}$/.test(cleaned);
}

/**
 * Normalisasi format nomor telepon ke format internasional WhatsApp (628xxx)
 */
function normalizePhone(phone) {
  const cleaned = phone.toString().replace(/[\s\-+]/g, "");
  // Ubah 08xxx menjadi 628xxx
  if (cleaned.startsWith("0")) {
    return "62" + cleaned.slice(1);
  }
  return cleaned;
}

/**
 * Memastikan path yang dituju berada di dalam direktori dasar (Mencegah Path Traversal)
 */
function isSafePath(baseDir, targetSubPath) {
  const resolvedBase = path.resolve(baseDir);
  const resolvedTarget = path.resolve(resolvedBase, targetSubPath);
  return resolvedTarget.startsWith(resolvedBase);
}

/**
 * Pembandingan string tahan timing attack (Constant Time Comparison)
 */
function timingSafeCompare(a, b) {
  if (typeof a !== "string" || typeof b !== "string") return false;
  const hashA = crypto.createHash("sha256").update(a).digest();
  const hashB = crypto.createHash("sha256").update(b).digest();
  return crypto.timingSafeEqual(hashA, hashB);
}

module.exports = {
  isValidBranch,
  isValidPhone,
  normalizePhone,
  isSafePath,
  timingSafeCompare,
};
