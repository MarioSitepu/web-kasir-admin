# ?? Web Admin Kasir - Sapo Sapo (Next.js & Firebase)

Dashboard web admin modern & responsif untuk manajemen operasional kasir, inventaris produk, pencatatan mutasi stok, rekap transaksi penjualan real-time, dan pemeliharaan database cloud.

Dibuat khusus untuk mendukung integrasi real-time dengan **Aplikasi Kasir POS Android (Kassen BTP299 Bluetooth/USB OTG)**.

---

## ? Fitur Utama Web Admin

### 1. ?? Dashboard & Monitoring Real-Time
- **Statistik Penjualan**: Pantau total omzet hari ini, estimasi laba bersih, jumlah transaksi, dan menu terlaris (*best seller*).
- **Grafik Tren Penjualan**: Visualisasi grafik interaktif omzet dan transaksi harian/mingguan.
- **Sinkronisasi Otomatis**: Terhubung langsung ke **Firebase Realtime Database & Cloud Firestore**. Setiap transaksi di kasir Android langsung tercatat di web admin seketika tanpa perlu refresh browser.

### 2. ?? Manajemen Produk & Menu
- Tambah, ubah, dan hapus menu dengan cepat (Nama, Kategori, Harga, Stok, Deskripsi, dan Foto URL).
- Filter berdasarkan kategori (*Makanan, Minuman, Snack, Paket*) dan pencarian instan.

### 3. ?? Inventaris & Riwayat Mutasi Stok
- Monitoring peringatan stok menipis (*Low Stock Alert*).
- Pemilihan barang cepat untuk **Tambah / Atur Stok** dengan simulasi stok real-time.
- Riwayat log mutasi stok lengkap dengan timestamp dan tipe perubahan.

### 4. ?? Laporan Transaksi & Keuangan
- Rekap transaksi harian & riwayat pesanan (Metode pembayaran Tunai / QRIS Dinamis).
- Cetak struk ulang 58mm langsung dari browser menggunakan driver cetak thermal web.

### 5. ?? Pemeliharaan & Audit Database
- Fitur **Hapus & Reset Data Terpilih** dengan konfirmasi keamanan berlapis untuk pengujian atau pergantian periode pembukuan toko.
- Log audit otomatis mencatat riwayat pembersihan data.

---

## ?? Akun Login Administrator

Sistem web admin dilindungi gerbang autentikasi tunggal khusus Administrator / Pemilik Toko:

| Role / Akun | Username | Password Default | Hak Akses |
| :--- | :--- | :--- | :--- |
| **Administrator (Owner)** | `admin` *(atau `mario`)* | `sapo123` | Akses penuh dashboard omzet, edit menu & harga, mutasi stok, laporan transaksi & reset database |

> ?? *Untuk mengubah kata sandi admin, Anda dapat mengatur variabel `NEXT_PUBLIC_ADMIN_PASSWORD` di file `.env.local` atau di pengaturan Environment Variables Vercel.*

---

## ??? Teknologi & Stack

- **Framework**: [Next.js 16 (App Router)](https://nextjs.org/)
- **UI & Styling**: [Tailwind CSS v4](https://tailwindcss.com/) & [Lucide Icons](https://lucide.dev/)
- **Database**: [Firebase Realtime Database & Cloud Firestore](https://firebase.google.com/)
- **Deployment**: [Vercel](https://vercel.com/) (Zero-Config Deployment)

---

## ?? Panduan Menjalankan di Komputer Lokal

### 1. Clone & Masuk ke Direktori
```bash
git clone https://github.com/MarioSitepu/web-kasir-admin.git
cd web-kasir-admin
```

### 2. Install Dependencies
```bash
npm install
```

### 3. Jalankan Development Server
```bash
npm run dev
```
Buka browser di [http://localhost:3000](http://localhost:3000).

---

## ?? Cara Deploy ke Vercel (1-Click Deployment)

1. Buka [vercel.com](https://vercel.com) dan login menggunakan akun GitHub Anda.
2. Klik **`Add New...`** $\rightarrow$ **`Project`**.
3. Pilih repository **`MarioSitepu/web-kasir-admin`**.
4. Framework Preset akan otomatis terdeteksi sebagai **Next.js**.
5. Klik **`Deploy`**! Website admin Anda langsung online dengan domain gratis `.vercel.app` & HTTPS otomatis.

---

## ?? Lisensi
Hak Cipta � 2026 Sapo Sapo POS Project.
