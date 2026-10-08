# Self-Optimizing Web Application Using Machine Learning

This project is a practical, full-stack demonstration of an intelligent, self-healing web application. It transitions web application management from *reactive* (waiting for a crash) to *proactive* (predicting and mitigating a crash) using Machine Learning.

## 🎯 The Problem Solved
Traditional web applications become sluggish when traffic spikes, leading to poor user experiences before developers can manually intervene. 

This system embeds an ML-based monitoring engine directly into the application backend. It continuously observes telemetry data, predicts upcoming bottlenecks, and autonomously reconfigures the application's behavior to survive the load without manual intervention.

## 🧠 Core Architecture (The Continuous Cycle)

The system operates on a continuous, autonomous 4-step loop:

1. **MONITOR (Observe):** A FastAPI middleware continuously tracks real-time metrics including:
   - Request Response Times (ms)
   - CPU Utilization (%)
   - Memory Utilization (%)
   - Active User Connections
2. **PREDICT:** A Random Forest Classifier (trained on 10,000 records of synthetic load data) analyzes the telemetry every 2 seconds to predict the system state: `NORMAL`, `WARNING`, or `CRITICAL`.
3. **OPTIMIZE:** Based on the ML prediction, the application dynamically reconfigures itself:
   - **Warning Mode:** Database pagination limits are reduced (from 50 to 20 items) and read-through caching is enabled to protect the database.
   - **Critical Mode:** Aggressive throttling (5 items per page), high-resolution images are blocked, and heavy UI components (like the AI Recommendations Engine) are completely disabled.
4. **RECOVER:** Once the traffic subsides and the ML model detects safe telemetry, all standard configurations are instantly restored.

## ✨ Advanced Features (New)

- **Manual Override Control:** DevOps engineers can manually force the system into `WARNING` or `CRITICAL` states via the dashboard UI, instantly overriding the ML predictions in case of emergencies.
- **SQLite Telemetry Persistence:** Every telemetry tick is persisted locally into a `metrics.db` SQLite database, creating a durable historical record of system performance rather than just relying on in-memory arrays.
- **CSV Data Export:** A `/export_data` endpoint (accessible via the "EXPORT CSV" button on the UI) allows engineers to instantly download the full telemetry history as a CSV file for post-incident reporting.
- **Business Impact Tracker:** A real-time widget counts exactly how many heavy database queries were prevented by the ML-triggered caching layer, translating technical auto-scaling into tangible business ROI and compute savings.

## 🏗️ Architectural Improvements (Latest Updates)

The latest updates to the codebase focus on transforming the prototype into a production-ready, resilient system:
- **Thread-Safe Data Structures:** Replaced legacy Python lists with `collections.deque` for $O(1)$ append times and thread-safe, bounded memory logs.
- **Accurate Background CPU Profiling:** Extracted `psutil` system metric collection out of the HTTP request middleware and into a dedicated, non-blocking `asyncio` background task to prevent $0.0\%$ CPU readings under high concurrency.
- **Non-Blocking Data Export:** Wrapped the heavy `/export_data` (SQLite reads and Pandas operations) in `asyncio.to_thread` to ensure the main FastAPI event loop never freezes during data downloads.
- **Memory Leak Protection:** Implemented bounded size limits for the `PRODUCT_CACHE` to prevent unbounded dictionary growth during sustained high-load events.
- **Resilient WebSockets:** Built Exponential Backoff into the React frontend's WebSocket reconnection logic (scaling from 1 to 30 seconds) to prevent "thundering herd" server crashes when recovering from outages.

## ⚙️ Process & Architecture Breakdown

The project is divided into 4 primary processes that work together to create the self-optimizing ecosystem:

### 1. The Predictive Brain (`train_model.py`)
This script is responsible for generating synthetic time-series data that simulates stable traffic, steady ramp-ups, and sudden viral spikes. It trains a **Random Forest Classifier** using a "Lagged Feature Window" (looking at the last 5 seconds of telemetry) to accurately forecast the system's state 3 steps into the future. The output is a serialized model (`optimization_model.pkl`) that the backend uses for inference.

### 2. The Core Server & Monitor (`main.py`)
This is the FastAPI backend. It serves three main purposes:
- **Telemetry Middleware:** It intercepts every HTTP request, measuring response times and polling the host machine (via `psutil`) for CPU and Memory usage.
- **The Optimization Loop:** An asynchronous background task (`optimization_loop`) that wakes up every 2 seconds, feeds the latest telemetry into the ML model, and updates the global `AppConfig` state (NORMAL, WARNING, or CRITICAL).
- **The Host API:** It serves the `/products` endpoint, which dynamically changes its response size (pagination limits) and caching behavior based on the current `AppConfig` state.

### 3. The Control Center & Host App (`React Frontend`)
The frontend is a dual-purpose dashboard:
- **The Telemetry UI:** A DevOps-style interface displaying real-time area charts, system metrics, and the current state determined by the ML model.
- **The Dummy Storefront (NexaStore):** A mock e-commerce layout that acts as the "load-bearing" application. It visually proves the auto-optimization by gracefully degrading (disabling high-res images and AI recommendation widgets) when the backend signals a CRITICAL state.

### 4. The Chaos Monkey (`load_tester.py`)
Because self-healing is impossible to see without damage, this script simulates a massive swarm of users hitting the API. It runs through 4 phases: Normal (2 users/sec), Moderate (10 users/sec), Spike (30 users/sec), and Cooldown. This forces the system through all three operational states, proving the continuous cycle works.

## 🛠️ Technology Stack
* **Frontend:** React (Vite), Tailwind CSS v4, Recharts (for live telemetry visualization), Lucide Icons.
* **Backend:** Python, FastAPI, Uvicorn, Psutil (for system metrics), SQLite3 (for telemetry persistence).
* **Machine Learning:** Scikit-Learn (Random Forest), Pandas, NumPy, Joblib.

## 🚀 How to Run the Project

### Prerequisites
- Node.js (v18+)
- Python (3.10+)

### 1. Start the Backend API & ML Engine
Open a terminal in the root directory and run the included PowerShell script:
```powershell
cd backend
.\venv\Scripts\activate
uvicorn main:app --reload
```
*(This activates the virtual environment and starts the FastAPI server with the embedded ML model on port 8000).*

### 2. Start the Frontend Command Center
Open a second terminal in the root directory and run:
```powershell
cd frontend
npm run dev
```
*(This launches the React dashboard on port 5173).*

### 3. Trigger the Chaos (Load Testing)
To actually see the self-optimization in action, you need to simulate a traffic spike.
Open a third terminal and run the load tester:
```powershell
cd backend
.\venv\Scripts\activate
python load_tester.py
```

### 👁️ What to Watch
When the load tester runs, watch the React Dashboard:
1. The **Active Users** and **CPU** charts will begin to climb.
2. The ML Engine will predict a bottleneck and shift the dashboard state to **WARNING**, and eventually **CRITICAL**.
3. You will visually see the dummy application (NexaStore) aggressively degrade its UI (disabling the AI widget, lowering image quality) to keep the system online.
4. Once the load tester script finishes, the system will self-heal and return to **NORMAL**.
