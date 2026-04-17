# Smart-QX: Live Adaptive Queue System 🚀

This is the high-performance core of the Smart-QX admission control system. It utilizes a Redis engine for O(1) queue management and a custom PID controller for adaptive entry throttling.

## 🛠️ Tech Stack
- **Backend**: FastAPI
- **Real-time Engine**: Redis
- **Persistence**: PostgreSQL (SQLModel/SQLAlchemy)
- **Frontend**: React + Vite + Framer Motion + React Router
- **Communications**: WebSockets

## 📁 Project Structure
```text
pd/
├── backend/
│   ├── main.py              # API & WebSocket endpoints, Background Tasks
│   ├── models.py            # PostgreSQL Data Models
│   ├── queue_manager.py     # O(1) Redis Queue operations
│   ├── pid_controller.py    # Math engine for adaptive rate limiting
│   ├── ws_manager.py        # WebSocket broadcaster
│   └── database.py
├── frontend/src/
│   ├── App.jsx              # React Router setup
│   └── pages/
│       ├── UserQueue.jsx    # Consumer app (Join, QR, Live Status)
│       ├── AdminDashboard.jsx # System metrics (Queue size, PID Throttling)
│       └── GateScanner.jsx  # Event edge node simulation
└── docker-compose.yml       # Local Infra
```

## 🚀 How to Run (Phase 2)

### 1. Start Infrastructure
```bash
docker-compose up -d
```

### 2. Setup Backend
```bash
cd backend
pip install -r requirements.txt
uvicorn main:app --reload
```
*API running at http://localhost:8000*

### 3. Setup Frontend
```bash
cd frontend
npm install
npm run dev
```
*Web app interface at http://localhost:5173*
*Admin at http://localhost:5173/admin*
*Scanner at http://localhost:5173/scanner*

## 🎯 Phase 2 Features (Active)
- [x] **Redis Engine**: Fast O(1) in-memory list operations.
- [x] **PID Controller**: Dynamically adjusts entry rate based on crowd surge vs target capacity.
- [x] **WebSockets**: Live position updates on the user app without refreshing.
- [x] **Smart Routing**: Modular React pages for User, Admin, and Scanner.
- [x] **Offline-ready Tokens**: JWT based QR generation.

## 🚢 Production Deployment

Smart-QX is fully containerized. To deploy to a production server (AWS, DigitalOcean, etc.):

1. Clone this repository on your server.
2. Copy the `.env.example` file to `.env` and configure your secure `POSTGRES_PASSWORD` and `SECRET_KEY`.
   ```bash
   cp .env.example .env
   ```
3. Build and run the entire stack using Docker Compose:
   ```bash
   docker-compose up -d --build
   ```
4. Your application will be available at `http://YOUR_SERVER_IP/`. The Nginx container serves the frontend on port 80 and securely proxies `/api` and `/ws` to the backend.
