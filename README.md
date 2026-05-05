# M-BENDTIM

M-BENDTIM tek firma için kullanılan kapalı bir üretim, stok, makina, sevk, raporlama ve kullanıcı yönetim panelidir.

Hedef canlı mimari:

- Frontend: Vercel (`client`)
- Backend: Render (`server`)
- Veritabanı: Supabase PostgreSQL

```text
Tarayıcı -> Vercel frontend -> Render backend API -> Supabase PostgreSQL
```

Frontend Supabase'e doğrudan bağlanmaz. Supabase yalnızca PostgreSQL veritabanı olarak kullanılır.

## Supabase

Supabase Dashboard üzerinden PostgreSQL connection string al.

Önerilen bağlantı:

- Transaction Pooler
- Port: `6543`
- Kullanıcı adı genelde `postgres.PROJECT_REF`
- `sslmode=require`

Örnek:

```env
DATABASE_URL=postgres://postgres.PROJECT_REF:ENCODED_PASSWORD@aws-0-eu-central-1.pooler.supabase.com:6543/postgres?sslmode=require
DB_SSL=true
DB_SSL_REJECT_UNAUTHORIZED=false
```

Paroladaki özel karakterleri URL encode et:

```text
# -> %23
+ -> %2B
! -> %21
@ -> %40
: -> %3A
```

`DATABASE_URL` Supabase project API URL'i olmamalıdır. Şu yanlıştır:

```env
DATABASE_URL=https://your-project.supabase.co
```

## Render Backend

Render servis tipi: Web Service

Önerilen native Node deploy ayarları:

```text
Root Directory: server
Build Command: npm install && npm run build
Pre-deploy Command: npm run migrate:prod -- up
Start Command: npm start
```

Render environment variables:

```env
NODE_ENV=production
PORT=10000
DATABASE_URL=postgres://postgres.PROJECT_REF:ENCODED_PASSWORD@aws-0-eu-central-1.pooler.supabase.com:6543/postgres?sslmode=require
DB_SSL=true
DB_SSL_REJECT_UNAUTHORIZED=false
JWT_SECRET=change-this-to-a-real-32-plus-character-random-secret
CORS_ORIGIN=https://your-vercel-domain.vercel.app
SEED_ADMIN_EMAIL=admin@company.com
SEED_ADMIN_PASSWORD=change-this-secure-admin-password
SEED_ADMIN_NAME=Yonetici
```

Production güvenlik kontrolleri backend açılışında çalışır. Aşağıdaki durumlarda backend bilinçli olarak başlamaz:

- `DATABASE_URL` eksik veya PostgreSQL URL'i değilse
- `DATABASE_URL` Supabase project API URL'i ise
- `JWT_SECRET` eksik, placeholder veya 32 karakterden kısa ise
- `CORS_ORIGIN=*` ise
- `DB_SSL=true` değilse
- `SEED_ADMIN_PASSWORD` `admin123` veya placeholder ise

Health endpoint:

```text
GET https://your-render-backend-url/api/health
```

Beklenen cevap:

```json
{ "ok": true }
```

Readiness endpoint:

```text
GET https://your-render-backend-url/api/ready
```

`/api/ready` veritabanı bağlantısını ve bekleyen migration durumunu kontrol eder:

- Hazırsa `200`
- DB bağlantısı yoksa veya bekleyen migration varsa `503`

Production'da schema değişiklikleri sadece migration ile yapılır. `syncModels()` production ortamında çalışmaz.

## Vercel Frontend

Vercel proje ayarları:

```text
Root Directory: client
Build Command: npm run build
Output Directory: dist
```

Vercel environment variable:

```env
VITE_API_BASE_URL=https://your-render-backend-url
```

`VITE_API_BASE_URL` Render backend adresi olmalıdır. Supabase URL'i girilmemelidir.

SPA route desteği için `client/vercel.json` dosyası vardır.

## İlk Admin Kullanıcısı

Seed komutu otomatik start sırasında çalışmaz.

Gerekirse Render shell/job üzerinden:

```bash
cd server
npm run seed
```

Production'da seed env değerleri güvenli olmalıdır.

## Roller

Kullanıcılar sadece yöneticiler tarafından oluşturulur. Public signup yoktur.

- `admin`: tam erişim, kullanıcı yönetimi dahil tüm modüller.
- `operator`: mal kabul, stok, makina atama/durum, sevk ve rapor işlemleri; kullanıcı yönetimi yok.
- `viewer`: salt okunur erişim; dashboard, stok, makina, mal kabul, sevk ve raporları görebilir, veri değiştiremez.

## Yerel Geliştirme

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

## Migration Komutları

Yerel:

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

## Build Doğrulama

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

## Deploy Kontrol Listesi

- Supabase `DATABASE_URL` PostgreSQL connection string mi?
- DB parolası URL encode edildi mi?
- Render `Pre-deploy Command` migration çalıştırıyor mu?
- Render `/api/health` 200 dönüyor mu?
- Render `/api/ready` 200 dönüyor mu?
- Vercel `VITE_API_BASE_URL` Render backend URL'ini gösteriyor mu?
- Render `CORS_ORIGIN` Vercel domaini ile aynı mı?
- Production secret değerleri placeholder değil mi?
