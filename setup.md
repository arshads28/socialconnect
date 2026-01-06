# Local Setup Guide – SocialConnect

This document explains how to set up **SocialConnect** for **local development**.

---

## 1. Prerequisites

Make sure the following are installed on your system:

### Required

* **Python** 3.11+
* **Git**
* **PostgreSQL** 14+
* **Redis** 6+

### Optional (Recommended)

* **Docker & Docker Compose**
* **Node.js** (for future frontend tooling)

---

## 2. Clone the Repository

```bash
git clone https://github.com/<arshads28>/socialconnect.git
cd socialconnect
```

---

## 3. Create & Activate Virtual Environment

### Create

```bash
python -m venv venv
```

### Activate

**Linux / macOS**

```bash
source venv/bin/activate
```

**Windows**

```bash
venv\Scripts\activate
```

Verify:

```bash
python --version
```

---

## 4. Install Python Dependencies

```bash
pip install -r requirements.txt
```

---

## 5. Environment Variables Configuration

Create a `.env` file in the **project root**:

```bash
touch .env
```

**Windows (PowerShell):**

```powershell
New-Item .env -ItemType File
```

### Sample `.env`

```env
DEBUG=True
SECRET_KEY=django-insecure-change-this-key

# Database
DB_NAME=socialconnect
DB_USER=postgres
DB_PASSWORD=postgres
DB_HOST=localhost
DB_PORT=5432

# Redis
REDIS_URL=redis://127.0.0.1:6379

# Media
USE_S3=False
```

⚠️ **Never commit `.env` to GitHub**
Ensure `.env` is listed in `.gitignore`.

---

## 6. PostgreSQL Setup

### Create Database

```bash
psql -U postgres
```

Inside `psql`:

```sql
CREATE DATABASE socialconnect;
```

Exit:

```sql
\q
```

---

## 7. Redis Setup

### Start Redis Server

**Linux / macOS**

```bash
redis-server
```

**Windows**

```bash
redis-server.exe
```

Verify Redis is running:

```bash
redis-cli ping
```

Expected output:

```
PONG
```

---

## 8. Django Project Setup

Navigate to backend directory:

```bash
cd backend
```

### Apply Migrations

```bash
python manage.py makemigrations
python manage.py migrate
```

---

## 9. Create Superuser (Admin Access)

```bash
python manage.py createsuperuser
```

Use this account to access:

```
http://127.0.0.1:8000/admin/
```

---

## 10. Run Development Server

```bash
uvicorn backend.asgi:application --reload
```

Open in browser:

```
http://127.0.0.1:8000/
```

---

## 11. WebSocket & Redis Verification

Make sure:

* Redis is running
* Django server is running
* WebSocket connections are accepted

If Redis is down, chat and calls will **not** work.

---

## 12. Common Issues & Fixes

### ❌ Redis Connection Error

```text
Channel layer error / Redis unavailable
```

✔ Fix:

* Ensure Redis is running
* Check `REDIS_URL` in `.env`

---

### ❌ Database Connection Error

✔ Fix:

* Confirm PostgreSQL is running
* Verify DB credentials in `.env`

---

### ❌ Migration Errors

✔ Fix:

```bash
python manage.py makemigrations
python manage.py migrate --run-syncdb
```

---

## 13. Optional: Docker-Based Setup (Alternative)

If using Docker:

```bash
docker-compose up --build
```

(See `deployment.md` for full Docker setup.)

---

## 14. Development Notes

* Media uploads use **local storage** in development
* In production, media must use **S3 / MinIO**
* WebRTC requires HTTPS/WSS in production
* Group video calls are limited to **6 users**

---

## 15. Setup Complete ✅

At this point, you should have:

* Django backend running
* PostgreSQL connected
* Redis working
* Admin access enabled
* Ready for feature development

---

