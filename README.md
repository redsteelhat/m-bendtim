# M-BENDTIM Deploy (Vercel + Supabase)

Bu proje iki parçadan oluşur:

- `client`: Vite + React panel
- `server`: Express + Sequelize API

Canlı mimari önerisi:

- Frontend: Vercel
- Veritabanı: Supabase Postgres
- Backend: Render / Railway / VPS (Node.js)

## 1) Supabase veritabanını hazırla

Supabase projesi oluşturup connection string bilgisini al.

Tavsiye edilen bağlantı:

- Transaction pooler (`:6543`)
- `sslmode=require`

Örnek:

```env
DATABASE_URL=postgresql://postgres.xxxxx:[PASSWORD]@aws-0-eu-central-1.pooler.supabase.com:6543/postgres?sslmode=require
DB_SSL=true
```

Notlar:

- Backend, Supabase bağlantısını SSL ile otomatik algılar.
- Gerekirse `DB_SSL=true` ile SSL'i zorlayabilirsin.

## 2) Backend ortam değişkenleri

`server/.env.example` dosyasına göre production env tanımla:

```env
DATABASE_URL=postgresql://postgres.xxxxx:[PASSWORD]@aws-0-eu-central-1.pooler.supabase.com:6543/postgres?sslmode=require
DB_SSL=true
JWT_SECRET=very-long-random-secret
PORT=4000
CORS_ORIGIN=https://your-app.vercel.app,https://your-custom-domain.com
SEED_ADMIN_EMAIL=admin@example.com
SEED_ADMIN_PASSWORD=change-me-now
SEED_ADMIN_NAME=Yonetici
```

## 3) Backend'i canlıya al

Backend'i herhangi bir Node.js hostuna deploy edebilirsin (Render, Railway, VPS).

Başlatma adımları:

```bash
npm install
npm run build
npm start
```

Uygulama açılışında:

- veritabanı bağlantısı test edilir
- modeller senkronize edilir
- eski şema uyumluluk düzeltmeleri uygulanır

Health endpoint:

```bash
GET /api/health
```

## 4) Frontend'i Vercel'e deploy et

Vercel proje ayarları:

- Root Directory: `client`
- Build Command: `npm run build`
- Output Directory: `dist`

Vercel environment variable:

```env
VITE_API_BASE_URL=https://api.your-domain.com
```

SPA route desteği için `client/vercel.json` eklendi.

## 5) Son kontrol listesi

- `https://api.your-domain.com/api/health` 200 dönüyor mu
- Vercel'de `VITE_API_BASE_URL` doğru mu
- Backend `CORS_ORIGIN` içinde Vercel domaini var mı (ornek: `https://m-bendtim-uugc.vercel.app`)
- Login ve veri çekme istekleri başarılı mı

## Yerel build doğrulama

```bash
cd client
npm run build
```

```bash
cd ../server
npm run build
```
