const express = require("express");
const path = require("path");
const fs = require("fs");
const router = express.Router();
const { MEDIA_DIR, API_KEY, ALLOWED_ORIGINS, NODE_ENV } = require("../config/constants");
const { isValidBranch, timingSafeCompare } = require("../utils/validator");

/**
 * GET /media/:branch/:filename
 * Melayani file media dengan proteksi:
 * 1. Path traversal prevention
 * 2. Whitelist ekstensi file
 * 3. Autentikasi via header x-api-key, query parameter ?key=..., atau validasi Origin/Referer CRM
 */
router.get("/:branch/:filename", (req, res) => {
  const { branch, filename } = req.params;

  // 1. Validasi format branch
  if (!isValidBranch(branch)) {
    return res.status(400).json({
      success: false,
      error: "Format nama branch tidak valid.",
    });
  }

  // 2. Validasi format filename (hanya alfanumerik, dash, underscore, dan ekstensi yang diizinkan)
  const allowedExtensions = /\.(jpg|jpeg|png|webp|gif|mp4|ogg|pdf|doc|docx)$/i;
  if (!/^[a-zA-Z0-9_.-]+$/.test(filename) || !allowedExtensions.test(filename) || filename.includes("..")) {
    return res.status(400).json({
      success: false,
      error: "Nama atau format file media tidak valid.",
    });
  }

  // 3. Verifikasi Autentikasi / Otorisasi Akses
  let isAuthorized = false;

  // Cek apakah mode development tanpa API Key
  if (!API_KEY && NODE_ENV !== "production") {
    isAuthorized = true;
  }

  // Cek header x-api-key
  const requestKey = req.headers["x-api-key"] || req.query.key || req.query.api_key;
  if (API_KEY && requestKey && timingSafeCompare(requestKey, API_KEY)) {
    isAuthorized = true;
  }

  // Cek Referer atau Origin dari CRM Frontend yang diizinkan (agar tag <img src="..."> di browser CRM bisa render)
  const referer = req.headers.referer;
  const origin = req.headers.origin;
  if (!isAuthorized && ALLOWED_ORIGINS) {
    const isAllowedOrigin = ALLOWED_ORIGINS.some((allowed) => {
      if (allowed === "*") return true;
      if (origin && origin.startsWith(allowed)) return true;
      if (referer && referer.startsWith(allowed)) return true;
      return false;
    });
    if (isAllowedOrigin) {
      isAuthorized = true;
    }
  }

  if (!isAuthorized) {
    return res.status(403).json({
      success: false,
      error: "Forbidden: Akses media memerlukan API Key atau request dari origin CRM yang sah.",
    });
  }

  // 4. Verifikasi Keamanan Path (Anti-Traversal)
  const resolvedMediaBase = path.resolve(MEDIA_DIR);
  const targetFile = path.resolve(resolvedMediaBase, branch, filename);

  if (!targetFile.startsWith(resolvedMediaBase)) {
    return res.status(403).json({
      success: false,
      error: "Akses direktori di luar batas media dilarang.",
    });
  }

  if (!fs.existsSync(targetFile)) {
    return res.status(404).json({
      success: false,
      error: "File media tidak ditemukan.",
    });
  }

  return res.sendFile(targetFile);
});

module.exports = router;
