
# SocialConnect 🚀

A Real-Time Social Networking Platform (MVP)

## 📌 Overview

**SocialConnect** is a web-based social networking platform built with **Django and WebSockets**, designed to support real-time interaction at scale.
It enables users to create profiles, share posts, discover and connect with others, communicate via chat and calls, and participate in public or private virtual rooms.

This project is developed as a **production-ready MVP** supporting **up to 1,000 active users**, following industry-standard backend architecture and security practices.

---

## ✨ Features

### 👤 User & Profile

* Secure user registration and authentication
* Customizable user profiles (avatar, bio, interests)
* Connection system (send, accept, reject, block)

### 📰 Public Feed

* Create posts with text, images, and videos
* Global feed visible to all authenticated users
* Pagination / infinite scrolling
* Admin moderation support

### 💬 Real-Time Communication

* One-to-one real-time chat (WebSockets)
* Image sharing in chat
* Typing indicators & read receipts
* In-app unread message indicators

### 📞 Audio & Video Calls

* One-to-one voice and video calls
* WebRTC peer-to-peer communication
* Call signaling via WebSockets
* Mute, camera toggle, busy-state handling

### 🏠 Rooms (Public & Private)

* Public rooms (visible, no password)
* Private rooms (password protected)
* Group text chat
* Group video calls (up to 6 participants)
* Host moderation (kick users)
* Auto-delete rooms when inactive

---

## 🛠️ Technology Stack

### Backend

* **Python 3.11+**
* **Django 5.x**
* **Django REST Framework**
* **Django Channels (WebSockets)**

### Frontend

* HTML5 (Semantic)
* CSS3 (Flexbox, Grid)
* Vanilla JavaScript (ES6+)

### Infrastructure

* PostgreSQL (Database)
* Redis (WebSocket & caching layer)
* WebRTC (Audio/Video Calls)
* AWS S3 / MinIO (Media Storage)
* Nginx (Reverse Proxy)
* Docker & Docker Compose (Deployment)

---

## 🏗️ Project Structure

```text

├── apps
│   ├── accounts
│   │   ├── admin.py
│   │   ├── apps.py
│   │   ├── __init__.py
│   │   ├── migrations
│   │   ├── models.py
│   │   ├── __pycache__
│   │   ├── serializers.py
│   │   ├── tests.py
│   │   ├── urls.py
│   │   └── views.py
│   ├── calls
│   │   ├── admin.py
│   │   ├── apps.py
│   │   ├── consumers.py
│   │   ├── __init__.py
│   │   ├── migrations
│   │   ├── models.py
│   │   ├── __pycache__
│   │   ├── routing.py
│   │   ├── tests.py
│   │   ├── urls.py
│   │   └── views.py
│   ├── chat
│   │   ├── admin.py
│   │   ├── apps.py
│   │   ├── consumers.py
│   │   ├── context_processors.py
│   │   ├── __init__.py
│   │   ├── migrations
│   │   ├── models.py
│   │   ├── __pycache__
│   │   ├── routing.py
│   │   ├── tests.py
│   │   ├── urls.py
│   │   └── views.py
│   ├── posts
│   │   ├── admin.py
│   │   ├── apps.py
│   │   ├── background.py
│   │   ├── __init__.py
│   │   ├── migrations
│   │   ├── models.py
│   │   ├── __pycache__
│   │   ├── tests.py
│   │   ├── threadpool.py
│   │   ├── urls.py
│   │   └── views.py
│   └── rooms
│       ├── admin.py
│       ├── apps.py
│       ├── __init__.py
│       ├── migrations
│       ├── models.py
│       ├── __pycache__
│       ├── tests.py
│       └── views.py
├── backend
│   ├── asgi.py
│   ├── __init__.py
│   ├── __pycache__
│   │   ├── asgi.cpython-312.pyc
│   │   ├── asgi.cpython-313.pyc
│   │   ├── __init__.cpython-312.pyc
│   │   ├── __init__.cpython-313.pyc
│   │   ├── settings.cpython-312.pyc
│   │   ├── settings.cpython-313.pyc
│   │   ├── urls.cpython-312.pyc
│   │   └── urls.cpython-313.pyc
│   ├── settings.py
│   ├── urls.py
│   └── wsgi.py
├── db.sqlite3
├── logs
│   └── django.log
├── manage.py
├── media
│   └── posts
│       ├── 1000065337.jpg
│       ├── 1000065709.mp4
│       ├── 1000065711.mp4
│       ├── 1000187680.jpg
│       ├── arsasdfwurtow.jpg
│       ├── arsasdfwurtow_L61BVrk.jpg
│       ├── images_5bcsZjl.jpeg
│       ├── images.jpeg
│       ├── images_MmiweKO.jpeg
│       ├── images_pHLSltP.jpeg
│       ├── images_sQhSWQH_processed.jpg
│       ├── mountainsss_processed.jpg
│       ├── mountww45er_0dL7s9i_ZC90aqq.jpg
│       ├── mountww45er.jpg
│       └── photo_xLA6aTd.jpg
├── staticfiles
│   ├── admin
│   │   ├── css
│   │   ├── img
│   │   └── js
│   ├── rest_framework
│   │   ├── css
│   │   ├── docs
│   │   ├── fonts
│   │   ├── img
│   │   └── js
│   └── staticfiles.json
└── templates
    ├── addpost.html
    ├── auth
    │   ├── login.html
    │   ├── reset_manual.html
    │   └── signup.html
    ├── base.html
    ├── call_interface.html
    ├── chat
    │   ├── chat.html
    │   └── inbox.html
    ├── components
    ├── home.html
    ├── includes
    │   └── single_post.html
    ├── profile
    │   ├── edit_profile.html
    │   └── profile.html
    └── search.html

---

## ⚙️ Setup Instructions (Local Development)

### 1️⃣ Clone Repository

```bash
git clone https://github.com/<arshads28>/socialconnect.git
cd socialconnect
```

### 2️⃣ Create Virtual Environment

```bash
python -m venv venv
source venv/bin/activate   # Linux/macOS
venv\Scripts\activate      # Windows
```

### 3️⃣ Install Dependencies

```bash
pip install -r requirements.txt
```

### 4️⃣ Configure Environment Variables

Create a `.venv` file:

```venv
DEBUG=True
SECRET_KEY=your-secret-key
DATABASE_URL=postgres://user:password@localhost:5432/socialconnect
REDIS_URL=redis://127.0.0.1:6379
```

### 5️⃣ Run Migrations

```bash
cd backend
python manage.py makemigrations
python manage.py migrate
```

### 6️⃣ Create Superuser

```bash
python manage.py createsuperuser
```

### 7️⃣ Start Development Server

```bash
uvicorn backend.asgi:application --reload --host 0.0.0.0 --port 8000
```
for production

gunicorn backend.asgi:application -w 4 -k uvicorn.workers.UvicornWorker -b 0.0.0.0:8000

for frontend use local

npx expo start --dev-client --clear
---

## 🔌 WebSocket & Real-Time Support

* WebSocket connections handled via **Django Channels**
* Redis required for channel layer
* Secure WebSockets (WSS) enforced in production
* WebRTC signaling managed through WebSocket consumers

---

## 🔒 Security Features

* Password hashing (Argon2 / PBKDF2)
* CSRF & CORS protection
* Secure WebSocket authentication
* Input sanitization to prevent XSS
* Rate limiting for login and messaging
* No local media storage in production

---

## 📈 Performance & Scalability

* Supports **1,000 concurrent users**
* WebSocket latency < 300ms
* Database indexing for performance
* Modular Django app architecture
* Redis & PostgreSQL can be scaled independently

---

## 🧪 Testing

* Unit tests for models and services
* Integration tests for chat flows
* Manual testing for WebRTC
* Load testing using tools like **Locust**

---

## 🚫 Out of Scope (MVP)

* Push notifications (Email/SMS/Mobile)
* Post likes & comments
* User mentions and hashtags
* Call recording
* AI-based recommendations

---

## 📦 Deliverables

* Source code (GitHub)
* Database schema (ER Diagram)
* `setup.md` – Local setup guide
* `deployment.md` – Production deployment guide

---

## 📄 License

This project is licensed under the **MIT License**.

---

## 👨‍💻 Author

**Arshad**
Backend Developer | Django | WebSockets | WebRTC

---


