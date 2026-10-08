const { API_KEY, NODE_ENV } = require("../config/constants");
const { timingSafeCompare } = require("../utils/validator");

/**
 * Middleware untuk memvalidasi API Key pada setiap request.
 *
 * Consumer (seperti IELC-CRM) wajib menyertakan header:
 *   x-api-key: <value dari .env API_KEY>
 *
 * Menggunakan perbandingan konstan (constant-time) untuk mencegah timing attack.
 * Mode fail-closed diaktifkan di production jika API_KEY belum disetel.
 */
function apiKeyMiddleware(req, res, next) {
  // Jika API_KEY belum disetel di .env
  if (!API_KEY) {
    if (NODE_ENV === "production") {
      console.error(
        "[🚨 SECURITY] Request ditolak: Variabel API_KEY belum disetel di environment produksi!"
      );
      return res.status(500).json({
        success: false,
        error: "Server configuration error: API_KEY is not configured.",
      });
    }

    console.warn(
      "[⚠️  SECURITY] API_KEY tidak di-set! Hanya diizinkan dalam development lokal."
    );
    return next();
  }

  const requestKey = req.headers["x-api-key"] || req.query.api_key || req.query.key;

  if (!requestKey) {
    return res.status(401).json({
      success: false,
      error: "Unauthorized: Header x-api-key wajib disertakan.",
    });
  }

  if (!timingSafeCompare(requestKey, API_KEY)) {
    return res.status(403).json({
      success: false,
      error: "Forbidden: API Key tidak valid.",
    });
  }

  next();
}

module.exports = apiKeyMiddleware;
