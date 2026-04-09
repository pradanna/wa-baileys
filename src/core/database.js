const sqlite3 = require("sqlite3").verbose();
const fs = require("fs");
const path = require("path");
const { SESSIONS_DIR } = require("../config/constants");

// Cache koneksi database agar tidak buka-tutup terus
const dbConnections = new Map();

/**
 * Inisialisasi Database untuk branch tertentu.
 * Membuat tabel 'messages' jika belum ada.
 */
function initDatabase(branchId) {
  if (dbConnections.has(branchId)) return dbConnections.get(branchId);

  const dbPath = path.join(SESSIONS_DIR, branchId, "database.sqlite");
  
  // Pastikan folder sesi ada
  const sessionDir = path.join(SESSIONS_DIR, branchId);
  if (!fs.existsSync(sessionDir)) {
    fs.mkdirSync(sessionDir, { recursive: true });
  }

  const db = new sqlite3.Database(dbPath);

  db.serialize(() => {
    db.run(`
      CREATE TABLE IF NOT EXISTS messages (
        id TEXT PRIMARY KEY,
        jid TEXT,
        fromMe INTEGER,
        content TEXT,
        timestamp INTEGER,
        media_url TEXT,
        raw_msg TEXT
      )
    `);
    
    // Migrasi: Tambahkan kolom media_url jika belum ada (untuk DB lama)
    db.run(`ALTER TABLE messages ADD COLUMN media_url TEXT`, () => {});
    
    // Indexing untuk mempercepat pencarian berdasarkan JID
    db.run(`CREATE INDEX IF NOT EXISTS idx_jid ON messages(jid)`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_timestamp ON messages(timestamp)`);
  });

  dbConnections.set(branchId, db);
  return db;
}

/**
 * Simpan pesan ke database (Promise based).
 * @param {string} branchId - ID Branch
 * @param {object} msg - Objek pesan Baileys
 * @param {string} forcedJid - (Opsional) JID paksaan untuk sinkronisasi history
 */
function saveMessage(branchId, msg, forcedJid = null) {
  return new Promise((resolve, reject) => {
    const db = initDatabase(branchId);
    
    const id = msg.key.id;
    
    // 🔥 STRATEGI PAKSA JID: Jika ada forcedJid, gunakan itu.
    // Jika tidak, baru gunakan remoteJid dari pesan.
    let jid = forcedJid || msg.key.remoteJid;
    
    if (!forcedJid && msg.key.addressingMode === "lid" && msg.key.remoteJidAlt) {
      jid = msg.key.remoteJidAlt;
    }
    
    const fromMe = msg.key.fromMe ? 1 : 0;
    
    // Ambil konten teks atau caption gambar
    const content = msg.message?.conversation || 
                    msg.message?.extendedTextMessage?.text || 
                    msg.message?.imageMessage?.caption ||
                    (msg.message?.imageMessage ? "" : null) ||
                    "[Pesan Lain]";

    // Ambil media URL jika ada (disuntikkan oleh sessionManager setelah download)
    const mediaUrl = msg.localImageUrl || null;
                    
    // 🔥 Perbaikan Timestamp: Handle jika tipe-nya Long object
    let timestamp = msg.messageTimestamp;
    if (timestamp && typeof timestamp === 'object' && timestamp.low) {
      timestamp = timestamp.low;
    } else {
      timestamp = Number(timestamp);
    }
    
    if (isNaN(timestamp) || !timestamp) {
      timestamp = Math.floor(Date.now() / 1000);
    }
    
    const rawMsg = JSON.stringify(msg);

    const sql = `INSERT OR REPLACE INTO messages (id, jid, fromMe, content, timestamp, media_url, raw_msg) VALUES (?, ?, ?, ?, ?, ?, ?)`;
    
    db.run(sql, [id, jid, fromMe, content, timestamp, mediaUrl, rawMsg], (err) => {
      if (err) {
        console.error(`[DB] ❌ Gagal simpan pesan ${id}:`, err.message);
        reject(err);
      } else {
        resolve();
      }
    });
  });
}

/**
 * Ambil riwayat pesan berdasarkan JID.
 */
function getMessages(branchId, jid, limit = 50) {
  const db = initDatabase(branchId);
  
  return new Promise((resolve, reject) => {
    // Stable Sort: timestamp DESC, rowid DESC untuk pesan di detik yang sama
    const sql = `SELECT id, jid, fromMe, content, timestamp, media_url FROM messages WHERE jid = ? ORDER BY timestamp DESC, rowid DESC LIMIT ?`;
    
    db.all(sql, [jid, limit], (err, rows) => {
      if (err) return reject(err);
      
      // Balik urutannya agar [Terlama -> Terbaru] untuk tampilan chat UI
      resolve(rows.reverse());
    });
  });
}

module.exports = { initDatabase, saveMessage, getMessages };
