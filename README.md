# M-BENDTIM Deploy

Bu proje üç servis ile canlıya alınır:

- Frontend: Vercel (`client`)
- Backend: Render (`server`)
- Veritabanı: Supabase Postgres

İstek akışı:

```text
Tarayıcı -> Vercel frontend -> Render backend API -> Supabase Postgres
```

Frontend Supabase'e doğrudan bağlanmaz. Supabase yalnızca PostgreSQL veritabanı olarak kullanılır.

## 1. Supabase

Supabase projesinde PostgreSQL bağlantı bilgisini al.

Önerilen bağlantı:

- Transaction pooler
- Port: `6543`
- `sslmode=require`
- Kullanıcı adı genelde `postgres.PROJECT_REF` formatındadır

Örnek `DATABASE_URL`:

```env
DATABASE_URL=postgresql://postgres.PROJECT_REF:ENCODED_PASSWORD@aws-0-eu-central-1.pooler.supabase.com:6543/postgres?sslmode=require
```

Bu değer Supabase project API URL'i değildir. Render backend'in PostgreSQL'e bağlanması için Supabase Dashboard'daki database connection string kullanılmalıdır.

Parolada `#`, `+`, `!`, `@`, `:` gibi özel karakterler varsa URL encode edilmelidir:

```text
# -> %23
+ -> %2B
! -> %21
@ -> %40
: -> %3A
```

Yanlış parola, yanlış proje referansı veya encode edilmemiş parola genelde şu hatayı üretir:

```text
password authentication failed for user "postgres"
```

## 2. Render Backend

Render'da backend için `server` klasörünü deploy et.

Render ayarları:

```text
Root Directory: server
Build Command: npm ci && npm run build
Start Command: npm start
```

Docker deploy kullanıyorsan `server/Dockerfile` migration'ı API başlamadan önce otomatik çalıştırır:

```text
node dist/migrate.js up && node dist/index.js
```

İlk deploy öncesi veya şema değişikliklerinden sonra migration çalıştır:

```bash
npm run build
npm run migrate:prod -- up
```

Render'da Docker dışı deploy kullanıyorsan bunu manuel shell/job olarak çalıştırabilir veya deploy sürecine ayrı bir migration adımı olarak ekleyebilirsin. API start komutu seed çalıştırmaz.

Backend environment variables:

```env
DATABASE_URL=postgresql://postgres.PROJECT_REF:ENCODED_PASSWORD@aws-0-eu-central-1.pooler.supabase.com:6543/postgres?sslmode=require
DB_SSL=true
DB_SSL_REJECT_UNAUTHORIZED=false
JWT_SECRET=change-this-to-a-long-random-secret
NODE_ENV=production
PORT=4000
CORS_ORIGIN=https://your-vercel-app.vercel.app
SEED_ADMIN_EMAIL=admin@example.com
SEED_ADMIN_PASSWORD=change-me-now
SEED_ADMIN_NAME=Yonetici
```

Health check:

```text
GET https://your-render-service.onrender.com/api/health
```

Başarılı cevap:

```json
{ "ok": true }
```

Readiness check:

```text
GET https://your-render-service.onrender.com/api/ready
```

`/api/ready`, veritabanı bağlantısını ve bekleyen migration durumunu kontrol eder. Bekleyen migration varsa `503` döner. Production ortamında backend, bekleyen migration varken başlamaz.

## 3. Vercel Frontend

Vercel'de frontend için `client` klasörünü deploy et.

Vercel ayarları:

```text
Root Directory: client
Build Command: npm run build
Output Directory: dist
```

Frontend environment variable:

```env
VITE_API_BASE_URL=https://your-render-service.onrender.com
```

`VITE_API_BASE_URL` Supabase URL'i olmamalıdır. Bu değer Render'daki backend API adresi olmalıdır.

SPA route desteği için `client/vercel.json` dosyası vardır.

## 4. Deploy Kontrol Listesi

- Supabase `DATABASE_URL` doğru ve parola URL encode edilmiş mi?
- Render backend `/api/health` endpoint'i 200 dönüyor mu?
- Render backend `/api/ready` endpoint'i 200 dönüyor mu?
- Render `CORS_ORIGIN` içinde Vercel domaini var mı?
- Vercel `VITE_API_BASE_URL` Render backend adresini gösteriyor mu?
- Login isteği `/api/auth/login` üzerinden Render backend'e gidiyor mu?
- Admin seed bilgileri production için güvenli değerlerle değiştirildi mi?
- `JWT_SECRET` uzun ve tahmin edilemez bir değer mi?

## 5. Yerel Geliştirme

Backend:

```bash
cd server
npm install
npm run dev
```

Frontend:

```bash
cd client
npm install
npm run dev
```

Yerel frontend env:

```env
VITE_API_BASE_URL=http://localhost:4000
```

Yerel backend env için `server/.env.example` dosyasını referans al.

## 6. Build Doğrulama

Frontend:

```bash
cd client
npm run build
```

Backend:

```bash
cd server
npm run build
```

## 7. Migration Komutları

Yerel ortamda:

```bash
cd server
npm run migrate -- pending
npm run migrate -- up
npm run migrate -- executed
```

Production build sonrası:

```bash
cd server
npm run build
npm run migrate:prod -- pending
npm run migrate:prod -- up
```

Migration'lar `server/src/migrations` altında tutulur. Production ortamında tablo oluşturma ve şema değişiklikleri app start sırasında değil, bu komutlarla yapılır.
