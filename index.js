const express = require("express");
const cors = require("cors");
const qrcode = require("qrcode");
const path = require("path");
const {
  makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  Browsers,
  fetchLatestBaileysVersion,
  downloadMediaMessage, // 👈 Amunisi pengunduh gambar
} = require("@whiskeysockets/baileys");
const pino = require("pino");
const fs = require("fs");

const app = express();
app.use(cors());
app.use(express.json());

// 💡 EXPOSE FOLDER MEDIA AGAR BISA DIAKSES REACT
app.use("/media", express.static(path.join(__dirname, "media")));

// 💡 GUDANG PENYIMPANAN SESI
const activeSessions = new Map();

async function startSession(branchId) {
  const authFolder = `./sessions/${branchId}`;

  if (!fs.existsSync(authFolder)) {
    fs.mkdirSync(authFolder, { recursive: true });
  }

  // BACA CUSTOM STORE (Pengganti makeInMemoryStore)
  const customStoreFile = `${authFolder}/chat_history.json`;
  let savedMessages = [];
  if (fs.existsSync(customStoreFile)) {
    try {
      savedMessages = JSON.parse(fs.readFileSync(customStoreFile));
    } catch (e) {
      savedMessages = [];
    }
  }

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
    sock: sock,
    qr: null,
    isConnected: false,
    status: "starting",
    messages: savedMessages,
  });

  setInterval(() => {
    const currentSession = activeSessions.get(branchId);
    if (currentSession && currentSession.messages.length > 0) {
      fs.writeFileSync(
        customStoreFile,
        JSON.stringify(currentSession.messages),
      );
    }
  }, 10_000);

  sock.ev.on("creds.update", saveCreds);

  sock.ev.on("messaging-history.set", ({ messages }) => {
    console.log(
      `[${branchId}] 📦 Menerima ${messages.length} pesan history lama dari HP!`,
    );
    const currentSession = activeSessions.get(branchId);
    if (currentSession) {
      currentSession.messages.push(...messages);
    }
  });

  sock.ev.on("connection.update", (update) => {
    const { connection, lastDisconnect, qr } = update;
    const currentSession = activeSessions.get(branchId);

    if (qr && qr !== currentSession.qr) {
      currentSession.qr = qr;
      currentSession.isConnected = false;
      currentSession.status = "waiting_scan";
      console.log(
        `[${branchId}] 🔄 QR Code baru berhasil ditarik, menunggu scan...`,
      );
    }

    if (connection === "close") {
      currentSession.isConnected = false;
      const statusCode = lastDisconnect?.error?.output?.statusCode;
      const shouldReconnect =
        statusCode !== DisconnectReason.loggedOut && statusCode !== 405;

      if (shouldReconnect) {
        setTimeout(() => startSession(branchId), 2000);
      } else {
        console.log(
          `[${branchId}] ⛔ SESI LOGOUT. Menghapus data sesi lama...`,
        );
        if (fs.existsSync(authFolder)) {
          fs.rmSync(authFolder, { recursive: true, force: true });
          console.log(
            `[${branchId}] 🗑️ Folder ${authFolder} berhasil dihapus otomatis.`,
          );
        }
        activeSessions.delete(branchId);
        console.log(
          `[${branchId}] 🔄 Sistem siap menerima Scan QR baru saat ada request.`,
        );
      }
    } else if (connection === "open") {
      currentSession.isConnected = true;
      currentSession.qr = null;
      currentSession.status = "connected";
      console.log(`[${branchId}] ✅ Terhubung!`);
    }
  });

  // 💡 TANGKAP PESAN BARU (Versi Sempurna & Bersih)
  sock.ev.on("messages.upsert", async (m) => {
    const currentSession = activeSessions.get(branchId);
    if (!currentSession) return;

    // Hanya proses pesan baru beneran
    if (m.type !== "notify") return;

    for (const msg of m.messages) {
      if (!msg.message) continue;

      // 🛑 1. BLOKIR WA STORY
      if (msg.key.remoteJid === "status@broadcast") continue;

      // 🪄 2. MAGIC TRICK: Hancurkan LID, kembalikan ke nomor WA asli!
      if (msg.key.addressingMode === "lid" && msg.key.remoteJidAlt) {
        msg.key.remoteJid = msg.key.remoteJidAlt;
      }

      // 📸 3. DETEKSI & DOWNLOAD GAMBAR
      const isImage =
        msg.message?.imageMessage ||
        msg.message?.extendedTextMessage?.contextInfo?.quotedMessage
          ?.imageMessage;

      if (isImage) {
        if (!msg.key.fromMe)
          console.log(
            `[${branchId}] 📸 Menerima pesan GAMBAR! Sedang mendownload...`,
          );
        try {
          const buffer = await downloadMediaMessage(
            msg,
            "buffer",
            {},
            {
              logger: pino({ level: "silent" }),
              reuploadRequest: sock.updateMediaMessage,
            },
          );

          const mediaFolder = `./media/${branchId}`;
          if (!fs.existsSync(mediaFolder)) {
            fs.mkdirSync(mediaFolder, { recursive: true });
          }

          const fileName = `${msg.key.id}.jpg`;
          const filePath = `${mediaFolder}/${fileName}`;

          fs.writeFileSync(filePath, buffer);

          // SUNTIKKAN URL GAMBAR KE DALAM PESAN
          msg.localImageUrl = `http://localhost:3000/media/${branchId}/${fileName}`;
          if (!msg.key.fromMe)
            console.log(
              `[${branchId}] ✅ Gambar disimpan di: ${msg.localImageUrl}`,
            );
        } catch (error) {
          console.error(`[${branchId}] ❌ Gagal mendownload gambar:`, error);
        }
      } else {
        if (!msg.key.fromMe)
          console.log(
            `\n[${branchId}] 📥 PESAN TEKS MASUK DARI: ${msg.key.remoteJid}`,
          );
      }

      // 4. Simpan ke laci memori
      currentSession.messages.push(msg);

      // 5. Save permanen ke JSON detik itu juga
      try {
        fs.writeFileSync(
          customStoreFile,
          JSON.stringify(currentSession.messages),
        );
      } catch (err) {
        console.error(`[${branchId}] ❌ Gagal nyimpan ke JSON:`, err);
      }
    }
  });
}

// ==========================================
// 🚀 ENDPOINT API WA-STATUS
// ==========================================
app.get("/api/wa-status/:branch", async (req, res) => {
  const branchId = req.params.branch;

  if (!activeSessions.has(branchId)) {
    activeSessions.set(branchId, { status: "starting" });
    startSession(branchId);
    return res.json({
      status: "initializing",
      message: `Memulai mesin WA untuk ${branchId}...`,
    });
  }

  const sessionData = activeSessions.get(branchId);

  if (sessionData.status === "starting") {
    return res.json({
      status: "initializing",
      message: `Mesin sedang dipanaskan...`,
    });
  }

  if (sessionData.isConnected) {
    return res.json({
      status: "connected",
      message: `WhatsApp ${branchId} Aktif ✅`,
    });
  }

  if (sessionData.qr) {
    try {
      const qrImageBase64 = await qrcode.toDataURL(sessionData.qr);
      return res.json({
        status: "waiting_for_scan",
        qr_image_url: qrImageBase64,
      });
    } catch (err) {
      return res.status(500).json({ error: "Gagal generate QR" });
    }
  }

  return res.json({
    status: "initializing",
    message: `Memuat sistem ${branchId}...`,
  });
});

// ==========================================
// 🚀 ENDPOINT AMBIL HISTORY CHAT SISWA (Dengan Deduplikasi & Sorting)
// ==========================================
app.get("/api/chat-history/:branch/:phone", (req, res) => {
  const { branch, phone } = req.params;

  const sessionData = activeSessions.get(branch);
  if (!sessionData) {
    return res
      .status(400)
      .json({ error: `Sistem WA ${branch} sedang tidak aktif.` });
  }

  try {
    const jid = `${phone}@s.whatsapp.net`;

    console.log(`\n[API] 🔍 Meminta history untuk: ${jid}`);
    console.log(
      `[API] 📦 Total semua pesan di gudang: ${sessionData.messages.length}`,
    );

    let history = sessionData.messages.filter(
      (m) => m.key.remoteJid === jid || m.key.participant === jid,
    );
    console.log(
      `[API] ✅ Ketemu ${history.length} pesan yang cocok untuk nomor ini!`,
    );

    const uniqueMessages = [];
    const messageIds = new Set();

    for (const msg of history) {
      if (!messageIds.has(msg.key.id)) {
        messageIds.add(msg.key.id);
        uniqueMessages.push(msg);
      }
    }

    uniqueMessages.sort(
      (a, b) => Number(a.messageTimestamp) - Number(b.messageTimestamp),
    );

    const last50Messages = uniqueMessages.slice(-50);

    return res.json({ success: true, data: last50Messages });
  } catch (error) {
    console.error("Error get history:", error);
    return res.status(500).json({ error: "Gagal memuat history chat" });
  }
});

// ==========================================
// 🚀 ENDPOINT KIRIM PESAN TEKS
// ==========================================
app.post("/api/send-message", async (req, res) => {
  // Tangkap data yang dikirim dari React
  const { branch, phone, message } = req.body;

  // 1. Validasi Input Dasar
  if (!branch || !phone || !message) {
    return res
      .status(400)
      .json({ error: "Branch, phone, dan message wajib diisi!" });
  }

  // 2. Cek Status Mesin WA Cabang
  const sessionData = activeSessions.get(branch);
  if (!sessionData || !sessionData.isConnected) {
    return res
      .status(400)
      .json({ error: `Sistem WA ${branch} sedang offline/belum scan.` });
  }

  try {
    // 3. Format Nomor Tujuan (Ubah 08 jadi 628 jika admin salah ketik)
    let formattedPhone = phone.toString().replace(/^0/, "62");
    const jid = `${formattedPhone}@s.whatsapp.net`;

    // 4. 🔥 EKSEKUSI KIRIM PESAN LEWAT SOCKET BAILEYS
    const sentMsg = await sessionData.sock.sendMessage(jid, { text: message });

    console.log(`[${branch}] 📤 Berhasil mengirim pesan ke ${jid}`);

    // 5. Simpan Pesan Keluar ke Laci Memori (Agar langsung muncul di history)
    sessionData.messages.push(sentMsg);
    const customStoreFile = `./sessions/${branch}/chat_history.json`;
    fs.writeFileSync(customStoreFile, JSON.stringify(sessionData.messages));

    // Beri jawaban sukses ke React
    return res.json({
      success: true,
      message: "Pesan berhasil terkirim!",
      data: sentMsg,
    });
  } catch (error) {
    console.error(`[${branch}] ❌ Gagal kirim pesan:`, error);
    return res
      .status(500)
      .json({ error: "Terjadi kesalahan saat mengirim pesan." });
  }
});

app.listen(3000, () => {
  console.log(`🌐 Server Multi-Session berjalan di port 3000`);
});
