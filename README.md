# BULUKEETI PRO

Complete Full-Stack Concrete Blocks Production, Inventory & Sales Management System (Somali & English) built with React, TypeScript, Vite, Tailwind CSS, Dexie.js (IndexedDB), PWA, Node.js, Express, and MongoDB Atlas (Mongoose).

## Features

- **Bilingual (EN | SO)**: Instant runtime switching across all 14 pages, tables, invoices, validations, and PDF/Excel reports via `i18next` and `react-i18next`. Language preferences persist per user account.
- **Role-Based Access Control (RBAC)**: `ADMIN`, `MANAGER`, `WORKER`, and `SALESPERSON` roles enforced on both backend endpoints and frontend routes.
- **Production Management**: Track Curing vs. Ready for Sale batches, damaged counts, teams, workers, and batch numbers. Only `Ready for Sale` batches increase available stock.
- **Automatic Inventory Ledger**: Real-time balance tracking per block size (`Available Stock = Opening Stock + Ready Production - Sales - Damaged Blocks + Adjustments`) with movement history and low-stock alerts.
- **Sales, Invoices & Customer Debts**: Atomic stock deduction on sale, partial payment debt tracking, printable/PDF invoices, and authorized cancellation with automatic stock restoration.
- **Expenses & Analytics**: 9 expense categories, daily/weekly/monthly reports, PDF (`jspdf`) & Excel (`xlsx`) export.
- **Offline-First PWA**: Installable on Android, iOS, and Desktop. Queues offline production & sales entries in IndexedDB (`Dexie.js`) with UUID `clientTxId` duplicate prevention and automatic sync upon reconnection.

---

## Local Development & Initial Admin Setup

1. Copy `.env.example` to `.env` and configure your environment variables:
   - Leave `MONGODB_URI=""` to automatically use the embedded MongoDB instance locally, or set your MongoDB Atlas SRV string.
2. Install dependencies:
   ```bash
   npm install
   ```
3. Run the database seed script (optional — the server also runs idempotent bootstrap automatically on first boot):
   ```bash
   npm run seed
   ```
4. Start the full-stack server on port `3000`:
   ```bash
   npm run dev
   ```
5. Sign in with the initial Administrator credentials (configured via `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD` in `.env`):
   - **Email**: `admin@bulukeeti.com`
   - **Password**: `Admin@1234`
   - Change the password immediately under **User Profile** (`Astaan Shaqsi`).

---

## MongoDB Atlas Configuration Guide

1. Create a free or dedicated cluster in **MongoDB Atlas**.
2. Create a database user with `readWrite` privileges on your target database (e.g., `bulukeeti_pro`).
3. Under **Network Access**, restrict IP access to your Render backend's outbound IP addresses (or `0.0.0.0/0` only if dynamic Render IPs require it, paired with strong credentials and TLS).
4. Copy the connection string into `MONGODB_URI`:
   ```
   mongodb+srv://<username>:<password>@<cluster>.mongodb.net/bulukeeti_pro?retryWrites=true&w=majority
   ```
5. **Backups**: Enable Atlas Continuous Cloud Backup or Daily Snapshots, and export periodic `mongodump` archives:
   ```bash
   mongodump --uri="$MONGODB_URI" --out=./backups/$(date +%Y-%m-%d)
   ```

---

## Backend Deployment Guide (Render)

1. Push the repository to GitHub.
2. Create a new **Web Service** on **Render**:
   - **Build Command**: `npm install && npm run build`
   - **Start Command**: `npm run start`
   - **Health Check Path**: `/api/health`
3. Configure Environment Variables in Render:
   - `NODE_ENV=production`
   - `MONGODB_URI=<your-mongodb-atlas-uri>`
   - `JWT_SECRET=<generate-64-char-random-secret>`
   - `JWT_EXPIRES_IN=7d`
   - `CORS_ORIGIN=https://your-app.pages.dev`
   - `SEED_ADMIN_EMAIL=admin@yourcompany.com`
   - `SEED_ADMIN_PASSWORD=<strong-initial-password>`

---

## Frontend Deployment Guide (Cloudflare Pages)

1. Connect the same GitHub repository to **Cloudflare Pages**.
2. Set build configuration:
   - **Build command**: `npm run build`
   - **Build output directory**: `dist`
3. Add Environment Variable in Cloudflare Pages:
   - `VITE_API_URL=https://your-render-backend.onrender.com`
4. Add a `_redirects` rule (or SPA fallback) in Cloudflare Pages so deep links like `/sales/new` resolve to `/index.html`. Note that Cloudflare Pages automatically serves `index.html` for missing paths when no `404.html` is present.
