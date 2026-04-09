const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.resolve('sessions/solo/database.sqlite');
const db = new sqlite3.Database(dbPath);

console.log("🔍 Mengecek Database di:", dbPath);

db.all("SELECT jid, content, datetime(timestamp, 'unixepoch', 'localtime') as time, id FROM messages ORDER BY rowid DESC LIMIT 10", (err, rows) => {
    if (err) {
        console.error("❌ Error query:", err);
    } else {
        if (rows.length === 0) {
            console.log("📭 Database kosong melompong!");
        } else {
            console.log("✅ Ditemukan", rows.length, "pesan terakhir:");
            console.table(rows);
        }
    }
    db.close();
});
