# 📑 API Documentation: WA-Baileys Gateway

Dokumentasi ini ditujukan bagi tim Frontend / Backend IELC-CRM untuk mengonsumsi layanan WhatsApp Gateway.

## 🗝️ Autentikasi
Setiap request ke `/api` **WAJIB** menyertakan API Key pada header HTTP:

| Header | Value |
| :--- | :--- |
| `x-api-key` | `<isi-api-key-anda-di-env>` |
| `Content-Type` | `application/json` |

---

## 📡 Endpoints

### 1. Cek Status & QR Code
Mengecek apakah WhatsApp cabang tertentu sudah aktif atau membutuhkan scan QR. Jika sesi belum ada, sistem akan menginisialisasi sesi baru secara otomatis.

- **Method**: `GET`
- **URL**: `/api/wa-status/:branch`
- **Contoh**: `/api/wa-status/solo`

**Response (Connected):**
```json
{
  "success": true,
  "status": "connected",
  "message": "WhatsApp branch solo aktif ✅",
  "phone": "62812345678"
}
```

**Response (Butuh Scan):**
```json
{
  "success": true,
  "status": "waiting_for_scan",
  "qr_image_url": "data:image/png;base64,..."
}
```

---

### 2. Logout / Hapus Sesi Cabang
Memutuskan koneksi WhatsApp dan membersihkan data sesi cabang secara aman.

- **Method**: `DELETE`
- **URL**: `/api/wa-status/:branch`
- **Contoh**: `/api/wa-status/solo`

**Response:**
```json
{
  "success": true,
  "message": "Logout berhasil dan data dihapus."
}
```

---

### 3. Ambil Riwayat Chat
Mengambil pesan riwayat antara cabang dengan nomor siswa dari database lokal SQLite.

- **Method**: `GET`
- **URL**: `/api/chat-history/:branch/:phone?limit=50`
- **Contoh**: `/api/chat-history/solo/62812345678`

**Response:**
```json
{
  "success": true,
  "total": 50,
  "data": [
    {
      "id": "3EB0ABC...",
      "jid": "62812345678@s.whatsapp.net",
      "fromMe": 0,
      "content": "Halo, saya mau tanya kursus.",
      "timestamp": 1712589000,
      "media_url": "http://localhost:3000/media/solo/3EB0ABC.jpg"
    }
  ]
}
```

---

### 4. Kirim Pesan Teks
Mengirim pesan teks ke nomor tujuan dengan simulasi pengetikan alami (*typing presence*) untuk melindungi nomor dari deteksi spam WhatsApp.

- **Method**: `POST`
- **URL**: `/api/send-message`
- **Body JSON**:
```json
{
  "branch": "solo",
  "phone": "62812345678",
  "message": "Halo, ini pesan resmi dari IELC."
}
```

**Response:**
```json
{
  "success": true,
  "message": "Pesan berhasil terkirim!",
  "data": { ... }
}
```

---

### 5. Akses Media Gambar / Lampiran
Mengunduh atau menampilkan gambar lampiran chat. Endpoint ini terproteksi dari path traversal dan akses tanpa izin.

- **Method**: `GET`
- **URL**: `/media/:branch/:filename`
- **Akses**:
  - Mengirim header `x-api-key: <key>`, ATAU
  - Menambahkan query parameter `?key=<key>` (misal: `/media/solo/xyz.jpg?key=secret`), ATAU
  - Dipanggil langsung dari halaman web browser CRM yang domainnya telah didaftarkan pada `ALLOWED_ORIGINS`.

---

### 6. Health Check
Pemeriksaan status server tanpa API key (untuk load balancer / uptime monitoring).

- **Method**: `GET`
- **URL**: `/health`

---

## 💻 Contoh Integrasi (PHP/Laravel)

```php
use Illuminate\Support\Facades\Http;

// Kirim pesan
$response = Http::withHeaders([
    'x-api-key' => env('WA_GATEWAY_KEY'),
])->post(env('WA_GATEWAY_URL') . '/api/send-message', [
    'branch' => 'solo',
    'phone' => '62812345678',
    'message' => 'Halo dari CRM IELC!',
]);

if ($response->successful()) {
    // Pesan berhasil terkirim
}
```

---

## ⚠️ Catatan Keamanan & Operasional
1. **Format Nama Cabang**: Gunakan huruf, angka, tanda hubung (`-`), atau underscore (`_`) antara 2 hingga 32 karakter (contoh: `solo`, `semarang_barat`).
2. **Format Nomor**: Format internasional (contoh: `62812...`) atau format lokal `08...` (akan dinormalisasi otomatis ke `628...`).
3. **Anti-Ban Protection**: Server otomatis menyimulasikan status *sedang mengetik* (*composing*) sebelum pesan dikirim untuk meniru perilaku manusia. Hindari *blasting* ratusan pesan dalam interval di bawah 3 detik.
4. **Rate Limit**: API dibatasi maksimal **100 request per menit per IP**. Jika melebihi kuota, server mengembalikan status `429 Too Many Requests`.
