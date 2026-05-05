# Deployment Guide

Bu dosya M-BENDTIM'i Vercel + Render + Supabase PostgreSQL mimarisinde canlıya almak için kısa operasyon rehberidir.

## 1. Supabase

1. Supabase projesi oluştur.
2. PostgreSQL Transaction Pooler connection string al.
3. Parolayı URL encode et.
4. Backend `DATABASE_URL` değerinde PostgreSQL URL'i kullan.

Örnek:

```env
DATABASE_URL=postgres://postgres.PROJECT_REF:ENCODED_PASSWORD@aws-0-eu-central-1.pooler.supabase.com:6543/postgres?sslmode=require
DB_SSL=true
DB_SSL_REJECT_UNAUTHORIZED=false
```

## 2. Render Backend

Render Web Service ayarları:

```text
Root Directory: server
Build Command: npm install && npm run build
Pre-deploy Command: npm run migrate:prod -- up
Start Command: npm start
```

Environment variables:

```env
NODE_ENV=production
PORT=10000
DATABASE_URL=postgres://postgres.PROJECT_REF:ENCODED_PASSWORD@aws-0-eu-central-1.pooler.supabase.com:6543/postgres?sslmode=require
DB_SSL=true
DB_SSL_REJECT_UNAUTHORIZED=false
JWT_SECRET=change-this-to-a-real-32-plus-character-random-secret
CORS_ORIGIN=https://your-vercel-domain.vercel.app
```

Health checks:

```text
/api/health
/api/ready
```

Render readiness için `/api/ready` kullanılabilir. Bekleyen migration veya DB bağlantı sorunu varsa `503` döner.

## 3. Vercel Frontend

Vercel ayarları:

```text
Root Directory: client
Build Command: npm run build
Output Directory: dist
```

Environment variable:

```env
VITE_API_BASE_URL=https://your-render-backend-url
```

## 4. Manual Operations

İlk admin kullanıcısını oluşturmak için gerekirse Render shell/job:

```env
SEED_ADMIN_EMAIL=admin@company.com
SEED_ADMIN_PASSWORD=change-this-secure-admin-password
SEED_ADMIN_NAME=Yonetici
```

```bash
npm run seed
```

Migration durumunu kontrol etmek için:

```bash
npm run migrate:prod -- pending
npm run migrate:prod -- executed
```

## 5. Safety Rules

- Production schema değişiklikleri sadece migration ile yapılır.
- Backend production'da `syncModels()` çalıştırmaz.
- Seed otomatik start sırasında çalışmaz.
- Secret değerleri loglanmamalıdır.
- Frontend Supabase'e doğrudan bağlanmaz.
- Public signup yoktur; kullanıcılar admin tarafından oluşturulur.
- Roller: `admin`, `operator`, `viewer`.
