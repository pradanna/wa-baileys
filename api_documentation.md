# 📑 API Documentation: WA-Baileys Gateway

Dokumentasi ini ditujukan bagi tim Frontend / Backend IELC-CRM untuk mengonsumsi layanan WhatsApp Gateway.

## 🗝️ Autentikasi
Setiap request (kecuali `/health`) **WAJIB** menyertakan API Key pada header HTTP:

| Header | Value |
| :--- | :--- |
| `x-api-key` | `<isi-api-key-anda-di-env>` |
| `Content-Type` | `application/json` |

---

## 📡 Endpoints

### 1. Cek Status & QR Code
Digunakan untuk mengecek apakah WhatsApp cabang tertentu sudah aktif atau butuh scan QR.

- **Method**: `GET`
- **URL**: `/api/wa-status/:branch`
- **Contoh**: `/api/wa-status/solo`

**Response (Connected):**
```json
{
  "success": true,
  "status": "connected",
  "message": "WhatsApp branch solo aktif ✅"
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

### 2. Ambil Riwayat Chat
Mengambil 50 pesan terakhir antara cabang dengan nomor siswa tertentu dari database SQLite.

- **Method**: `GET`
- **URL**: `/api/chat-history/:branch/:phone`
- **Contoh**: `/api/chat-history/solo/62812345678`

**Response:**
```json
{
  "success": true,
  "total": 50,
  "data": [
    {
      "key": { "remoteJid": "62812345678@s.whatsapp.net", "fromMe": false, "id": "..." },
      "message": { "conversation": "Halo, saya mau tanya kursus." },
      "messageTimestamp": 1712589000
    },
    ...
  ]
}
```

---

### 3. Kirim Pesan Teks
Mengirim pesan teks ke nomor tujuan.

- **Method**: `POST`
- **URL**: `/api/send-message`
- **Body JSON**:
```json
{
  "branch": "solo",
  "phone": "62812345678",
  "message": "Halo, ini pesan dari CRM IELC."
}
```

---

## 💻 Contoh Integrasi (PHP/Laravel)

```php
use Illuminate\Support\Facades\Http;

$response = Http::withHeaders([
    'x-api-key' => env('WA_GATEWAY_KEY'),
])->post('http://vps-ip:3000/api/send-message', [
    'branch' => 'solo',
    'phone' => '62812345678',
    'message' => 'Halo dari CRM!',
]);

if ($response->successful()) {
    // Pesan terkirim
}
```

---

## ⚠️ Catatan Penting
1. **Format Nomor**: Gunakan format internasional tanpa tanda `+` (contoh: `62812...`). Sistem juga mendukung format diawali `08...` (akan dikonversi otomatis ke `628...`).
2. **Rate Limit**: API dibatasi maksimal **100 request per menit per IP**. Jika melebihi, akan mengembalikan status `429 Too Many Requests`.
3. **Media**: Untuk saat ini, endpoint kirim pesan hanya mendukung teks. Gambar yang diterima dari siswa dapat diakses lewat URL yang ada di field `localImageUrl` pada history chat.
