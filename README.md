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

Bu repo Dockerfile ile deploy ediliyorsa container başlangıcında migration otomatik çalışır:

```text
Docker start: npm run migrate:prod -- up && npm start
```

Native Node deploy kullanıyorsan ayarlar:

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
```

Production güvenlik kontrolleri backend açılışında çalışır. Aşağıdaki durumlarda backend bilinçli olarak başlamaz:

- `DATABASE_URL` eksik veya PostgreSQL URL'i değilse
- `DATABASE_URL` Supabase project API URL'i ise
- `JWT_SECRET` eksik, placeholder veya 32 karakterden kısa ise
- `CORS_ORIGIN=*` ise
- `DB_SSL=true` değilse

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

Seed env değişkenleri sadece ilk admin kullanıcısını terminal/job üzerinden oluşturacağın zaman gerekir. Render API servisinin normal deploy env listesinde zorunlu değildir.

Gerekirse Render shell/job env değerleri:

```env
SEED_ADMIN_EMAIL=admin@company.com
SEED_ADMIN_PASSWORD=change-this-secure-admin-password
SEED_ADMIN_NAME=Yonetici
```

Ardından:

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

## Stok Güvenilirliği

Stok satırları tek firma içi üretim takibi için satır bazlı tutulur. Aynı malzeme kodu (`sku`) aynı makinaya birden fazla kez atanabilir; `sku + machineId` benzersiz değildir.

Veritabanı migration'ları şu kontrolleri uygular:

- Stok miktarı negatif olamaz.
- Sevk edilmiş stokta `shippedAt` dolu olmalıdır.
- İşlem durumu `tamamlandi` olmayan stok sevk edilmiş olarak kalamaz.

Stok hareketleri `stock_movements` tablosunda tutulur. Stok detay ekranındaki `Hareket Geçmişi` bölümünde mal kabul, manuel güncelleme, toplu güncelleme, makina ataması, durum değişikliği, sevk ve sevk geri alma kayıtları izlenebilir.

Operatörler sevk edilmiş stokları normal stok ekranından serbestçe düzenleyemez veya silemez. Sevk geri alma/hedef güncelleme işlemleri sevk ekranı akışından yapılır; admin gerektiğinde override yapabilir.

## Mal Kabul İptali

Mal kabul kayıtları kullanıcı akışında hard delete edilmez. Hatalı girişler `İptal Et` işlemiyle iptal edilir ve iptal nedeni zorunludur.

İptal sadece ilgili stok satırlarının tamamı şu durumdaysa yapılır:

- Makina atanmamış.
- İşlem durumu `bekliyor`.
- Sevk edilmemiş.

İlgili stoklardan biri makinaya atanmışsa, `isleniyor` veya `tamamlandi` durumundaysa ya da sevk edilmişse iptal bloklanır. Başarılı iptal transaction içinde mal kabul satırını `isCancelled=true` yapar, iptal nedeni ve kullanıcı bilgisini saklar, ilgili bekleyen stok satırlarını kaldırır, `mal_kabul_iptal` stok hareketi ve `mal_kabul.cancel` audit kaydı oluşturur.

Raporlar varsayılan olarak iptal edilmiş mal kabul kayıtlarını saymaz. Gerekirse API tarafında `GET /api/reports/range?includeCancelled=true` ile dahil edilebilir.

## PDF'den Mal Kabul Aktarımı

Mal kabul ekranında `PDF’den Aktar` ile text tabanlı e-irsaliye PDF'i yüklenebilir. Akış bilinçli olarak iki aşamalıdır:

```text
PDF yükle -> Parse et -> Önizle/düzelt -> Stok girişini onayla
```

Parse endpoint'i veritabanına kayıt oluşturmaz:

- `POST /api/mal-kabul/import/pdf/parse`
- Multipart field adı: `file`
- Sadece `application/pdf`
- Maksimum dosya boyutu: 10MB

Onay endpoint'i önizleme verisini tekrar doğrular, irsaliye numarası daha önce işlendiyse `409` döner ve transaction içinde mal kabul satırları, stok satırları, stok hareketleri ve audit kaydını oluşturur:

- `POST /api/mal-kabul/import/pdf/confirm`

V1'de OCR, harici servis veya AI parsing kullanılmaz; PDF metni deterministik regex/parser ile okunur. PDF dosyası kalıcı olarak saklanmaz.

## Sevk Belgeleri

Sevk akışı belge bazlıdır. Operatörler tamamlanmış ve henüz sevk edilmemiş stok satırlarını seçerek sevk belgesi oluşturur. Belge numarası backend tarafından `SVK-YYYY-000001` formatında üretilir.

Sevk kuralları:

- Yalnızca `processStatus=tamamlandi` olan stoklar sevk edilebilir.
- Daha önce sevk edilmiş stok başka bir sevk belgesine eklenemez.
- Sevk oluşturulduğunda `shipment_items` kayıtları oluşturulur ve ilgili stok satırları `isShipped=true`, `shippedAt`, `shipDestination` ile güncellenir.
- Her sevk için `ship` stok hareketi ve `shipment.create` audit kaydı yazılır.
- Sevk belgeleri silinmez; sadece admin tarafından neden girilerek iptal edilir.
- İptal güvenliyse bağlı stoklar tekrar sevk edilmemiş duruma alınır, `unship` stok hareketi ve `shipment.cancel` audit kaydı yazılır.

Eski `StockItem` sevk alanları geriye uyumluluk için korunur; yeni kullanıcı akışı sevk belgeleri üzerinden ilerler.

## Raporlar

Raporlar tek firma içi operasyon takibi için filtrelenebilir endpoint'lere ayrılmıştır:

- `GET /api/reports/overview`
- `GET /api/reports/mal-kabul`
- `GET /api/reports/shipments`
- `GET /api/reports/stock`
- `GET /api/reports/machines`
- `GET /api/reports/stock-movements`
- `GET /api/reports/audit`

Ortak filtreler:

- `from`, `to`
- `sku`
- `name`
- `machineId`
- `processStatus`
- `isShipped`
- `shipmentStatus`
- `userId`
- `includeCancelled=true`
- `page`, `limit`

İptal edilmiş mal kabul ve sevk kayıtları varsayılan olarak raporlara dahil edilmez. Gerekli raporlarda `includeCancelled=true` ile dahil edilebilir.

Frontend `Raporlar` sayfasında aktif filtrelerle sonuçlar listelenir ve `CSV İndir` butonu mevcut filtre sonucunu CSV olarak indirir.

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

## Backend Testleri

API integration testleri production Supabase veritabanını kullanmaz. Testler için ayrı bir PostgreSQL veritabanı gerekir:

```env
TEST_DATABASE_URL=postgres://postgres:postgres@localhost:5432/mbendtim_test
```

Test komutu çalışırken bu URL `DATABASE_URL` olarak kullanılır ve test başlangıcında tablolar sıfırlanır. Bu nedenle `TEST_DATABASE_URL` kesinlikle production veritabanını göstermemelidir.

```bash
cd server
npm test
```

`TEST_DATABASE_URL` tanımlı değilse integration test paketi güvenli şekilde atlanır. CI ortamında ayrı bir PostgreSQL servis/container açıp bu env değerini vermek yeterlidir.

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
