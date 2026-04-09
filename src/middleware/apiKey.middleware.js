const { API_KEY } = require("../config/constants");

/**
 * Middleware untuk memvalidasi API Key pada setiap request.
 *
 * Consumer (seperti IELC-CRM) wajib menyertakan header:
 *   x-api-key: <value dari .env API_KEY>
 *
 * Jika API_KEY tidak di-set di .env, middleware ini akan di-skip
 * (berguna saat development lokal).
 */
function apiKeyMiddleware(req, res, next) {
  // Skip jika API_KEY belum di-set (mode development)
  if (!API_KEY) {
    console.warn(
      "[⚠️  SECURITY] API_KEY tidak di-set! Endpoint terbuka untuk umum."
    );
    return next();
  }

  const requestKey = req.headers["x-api-key"];

  if (!requestKey) {
    return res.status(401).json({
      success: false,
      error: "Unauthorized: Header x-api-key wajib disertakan.",
    });
  }

  if (requestKey !== API_KEY) {
    return res.status(403).json({
      success: false,
      error: "Forbidden: API Key tidak valid.",
    });
  }

  next();
}

module.exports = apiKeyMiddleware;
