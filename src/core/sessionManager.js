const {
  makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  Browsers,
  fetchLatestBaileysVersion,
  downloadMediaMessage,
} = require("@whiskeysockets/baileys");
const pino = require("pino");
const fs = require("fs");
const { SESSIONS_DIR, MEDIA_DIR, BASE_URL } = require("../config/constants");
const db = require("./database");

// Ambil config webhook dari .env
const WEBHOOK_URL = process.env.WEBHOOK_URL || null;
const API_KEY = process.env.API_KEY || null;

/**
 * 💡 Pusat penyimpanan semua sesi WA yang sedang aktif.
 */
const activeSessions = new Map();

/**
 * Memulai atau me-restart sesi WA untuk branch tertentu.
 */
async function startSession(branchId) {
  const authFolder = `${SESSIONS_DIR}/${branchId}`;

  // Inisialisasi Database SQLite untuk branch ini
  db.initDatabase(branchId);

  const { version } = await fetchLatestBaileysVersion();
  const { state, saveCreds } = await useMultiFileAuthState(authFolder);

  const sock = makeWASocket({
    version,
    auth: state,
    logger: pino({ level: "silent" }),
    browser: Browsers.macOS("Desktop"),
    syncFullHistory: true,
  });

  activeSessions.set(branchId, {
    sock,
    qr: null,
    isConnected: false,
    status: "starting",
    messages: [], // Kita tidak perlu load semua pesan ke RAM lagi!
  });

  // ── Event: Simpan credentials saat update ──
  sock.ev.on("creds.update", saveCreds);

  // ── Event: Terima history pesan lama dari HP (Global & On-Demand) ──
  sock.ev.on("messaging-history.set", async ({ messages, isLatest }) => {
    console.log(`\n[${branchId}] 📦 Menerima ${messages.length} pesan history (isLatest: ${isLatest})`);
    
    let savedCount = 0;
    try {
      for (const msg of messages) {
        if (msg.key && msg.key.id) {
          await db.saveMessage(branchId, msg);
          savedCount++;
        }
      }
      console.log(`[${branchId}] ✅ Berhasil menyimpan ${savedCount}/${messages.length} pesan history ke SQLite.\n`);
    } catch (err) {
      console.error(`[${branchId}] ❌ Gagal menyimpan history:`, err.message);
    }
  });

  // ── Event: Monitor status koneksi ──
  sock.ev.on("connection.update", (update) => {
    const { connection, lastDisconnect, qr } = update;
    const currentSession = activeSessions.get(branchId);

    if (qr && qr !== currentSession.qr) {
      currentSession.qr = qr;
      currentSession.isConnected = false;
      currentSession.status = "waiting_scan";
      console.log(`[${branchId}] 🔄 QR Code baru siap, menunggu scan...`);
    }

    if (connection === "close") {
      currentSession.isConnected = false;
      const statusCode = lastDisconnect?.error?.output?.statusCode;
      const shouldReconnect =
        statusCode !== DisconnectReason.loggedOut && statusCode !== 405;

      if (shouldReconnect) {
        console.log(`[${branchId}] 🔁 Koneksi terputus, mencoba reconnect...`);
        setTimeout(() => startSession(branchId), 2000);
      } else {
        console.log(`[${branchId}] ⛔ SESI LOGOUT. Menghapus data sesi...`);
        
        // 1. Hapus Folder Auth (Sesi)
        if (fs.existsSync(authFolder)) {
          fs.rmSync(authFolder, { recursive: true, force: true });
          console.log(`[${branchId}] 🗑️ Folder sesi ${authFolder} berhasil dihapus.`);
        }

        // 2. Hapus Folder Media (Gambar)
        const mediaFolder = `${MEDIA_DIR}/${branchId}`;
        if (fs.existsSync(mediaFolder)) {
          fs.rmSync(mediaFolder, { recursive: true, force: true });
          console.log(`[${branchId}] 🗑️ Folder media ${mediaFolder} berhasil dihapus.`);
        }

        activeSessions.delete(branchId);
        console.log(`[${branchId}] 🔄 Siap menerima Scan QR baru.`);
      }
    } else if (connection === "open") {
      currentSession.isConnected = true;
      currentSession.qr = null;
      currentSession.status = "connected";
      console.log(`[${branchId}] ✅ Terhubung ke WhatsApp!`);
    }
  });

  // ── Event: Tangkap & simpan pesan baru ──
  sock.ev.on("messages.upsert", async (m) => {
    // Hanya proses pesan baru (bukan history sync)
    if (m.type !== "notify") return;

    for (const msg of m.messages) {
      if (!msg.message) continue;

      // Blokir WA Story
      if (msg.key.remoteJid === "status@broadcast") continue;

      // Tangani LID addressing (WA baru) → kembalikan ke nomor asli
      if (msg.key.addressingMode === "lid" && msg.key.remoteJidAlt) {
        msg.key.remoteJid = msg.key.remoteJidAlt;
      }

      // Deteksi & download gambar
      const isImage =
        msg.message?.imageMessage ||
        msg.message?.extendedTextMessage?.contextInfo?.quotedMessage
          ?.imageMessage;

      if (isImage) {
        if (!msg.key.fromMe)
          console.log(`[${branchId}] 📸 Menerima gambar, mendownload...`);
        try {
          const buffer = await downloadMediaMessage(
            msg,
            "buffer",
            {},
            {
              logger: pino({ level: "silent" }),
              reuploadRequest: sock.updateMediaMessage,
            }
          );

          const mediaFolder = `${MEDIA_DIR}/${branchId}`;
          if (!fs.existsSync(mediaFolder)) {
            fs.mkdirSync(mediaFolder, { recursive: true });
          }

          const fileName = `${msg.key.id}.jpg`;
          const filePath = `${mediaFolder}/${fileName}`;
          fs.writeFileSync(filePath, buffer);

          msg.localImageUrl = `${BASE_URL}/media/${branchId}/${fileName}`;
          if (!msg.key.fromMe)
            console.log(`[${branchId}] ✅ Gambar disimpan: ${msg.localImageUrl}`);
        } catch (error) {
          console.error(`[${branchId}] ❌ Gagal download gambar:`, error);
        }
      } else {
        if (!msg.key.fromMe)
          console.log(
            `\n[${branchId}] 📥 PESAN TEKS MASUK DARI: ${msg.key.remoteJid}`
          );
      }

      // 🔥 SIMPAN KE SQLITE
      console.log(`[${branchId}] 📥 PESAN MASUK DARI WA: ${msg.key.id} (${msg.key.remoteJid})`);
      db.saveMessage(branchId, msg);

      // 🌐 KIRIM WEBHOOK KE LARAVEL
      if (WEBHOOK_URL && !msg.key.fromMe) {
        const payload = {
          phone: msg.key.remoteJid.split('@')[0],
          message: msg.message?.conversation || 
                   msg.message?.extendedTextMessage?.text || 
                   (isImage ? '📸 [Gambar]' : 'Media/Lainnya'),
          branch: branchId
        };

        fetch(WEBHOOK_URL, {
          method: 'POST',
          headers: { 
            'Content-Type': 'application/json',
            'X-API-KEY': API_KEY 
          },
          body: JSON.stringify(payload)
        })
        .then(() => console.log(`[${branchId}] 🚀 Webhook berhasil dikirim ke Laravel.`))
        .catch(err => console.error(`[${branchId}] ❌ Gagal kirim webhook:`, err.message));
      }
    }
  });
}

async function logoutSession(branchId) {
  const currentSession = activeSessions.get(branchId);
  const authFolder = `${SESSIONS_DIR}/${branchId}`;
  const mediaFolder = `${MEDIA_DIR}/${branchId}`;

  console.log(`[${branchId}] 🚪 Melakukan logout manual...`);

  if (currentSession && currentSession.sock) {
    try {
      await currentSession.sock.logout();
    } catch (err) {
      console.error(`[${branchId}] ❌ Gagal logout via Baileys (mungkin sudah diskonek):`, err.message);
    }
  }

  // Tetap hapus folder meskipun logout via Baileys gagal
  if (fs.existsSync(authFolder)) {
    fs.rmSync(authFolder, { recursive: true, force: true });
    console.log(`[${branchId}] 🗑️ Folder sesi ${authFolder} dihapus.`);
  }

  if (fs.existsSync(mediaFolder)) {
    fs.rmSync(mediaFolder, { recursive: true, force: true });
    console.log(`[${branchId}] 🗑️ Folder media ${mediaFolder} dihapus.`);
  }

  activeSessions.delete(branchId);
  return { success: true, message: "Logout berhasil dan data dihapus." };
}

module.exports = { activeSessions, startSession, logoutSession };
