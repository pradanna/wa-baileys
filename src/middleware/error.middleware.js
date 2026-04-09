/**
 * Global Error Handler Middleware.
 * Menangkap semua error yang tak terduga agar server tidak crash.
 */
function errorHandler(err, req, res, next) {
  console.error("\n[🔥 GLOBAL ERROR DETECTED]");
  console.error("Time   :", new Date().toISOString());
  console.error("Method :", req.method);
  console.error("Path   :", req.path);
  console.error("Error  :", err.message);
  console.error("Stack  :", err.stack);
  console.error("---------------------------\n");

  res.status(err.status || 500).json({
    success: false,
    error: "Internal Server Error",
    message: process.env.NODE_ENV === "production" 
      ? "Terjadi kesalahan internal pada server." 
      : err.message,
  });
}

module.exports = errorHandler;
