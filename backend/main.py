import time
import psutil
import asyncio
import pandas as pd
import numpy as np
import joblib
import os
import sqlite3
import aiosqlite
from collections import deque
from contextlib import asynccontextmanager
from datetime import datetime
from fastapi import FastAPI, Request, WebSocket, WebSocketDisconnect
from fastapi.responses import FileResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

# Configuration for "Auto-Optimize" strategies
class AppConfig:
    is_optimizing = False
    system_state = "NORMAL" # NORMAL, WARNING, CRITICAL
    cache_enabled = False
    pagination_limit = 50
    manual_override = None # None, "NORMAL", "WARNING", "CRITICAL"
    queries_prevented = 0

config = AppConfig()

# In-memory storage for metrics
metrics_log = deque(maxlen=100)
ACTIVE_USERS = 0
CURRENT_CPU = 0.0
CURRENT_MEM = 0.0
ml_model = None
active_websockets = set()
PRODUCT_CACHE = {}

async def system_monitor_loop():
    """Background task to accurately measure CPU and Memory usage without blocking."""
    global CURRENT_CPU, CURRENT_MEM
    while True:
        # psutil blocks, so to_thread is better. interval=1 averages over 1 second for accuracy.
        CURRENT_CPU = await asyncio.to_thread(psutil.cpu_percent, 1.0)
        CURRENT_MEM = psutil.virtual_memory().percent

async def websocket_broadcaster():
    """Broadcasts metrics every second to all connected websockets."""
    while True:
        await asyncio.sleep(1)
        if not active_websockets:
            continue
            
        data = {
            "cpu": psutil.cpu_percent(),
            "memory": psutil.virtual_memory().percent,
            "active_users": ACTIVE_USERS,
            "optimizing": config.is_optimizing,
            "system_state": config.system_state,
            "manual_override": config.manual_override,
            "queries_prevented": config.queries_prevented,
            "recent_logs": list(metrics_log)[-10:]
        }
        
        dead_sockets = set()
        for ws in active_websockets:
            try:
                await ws.send_json(data)
            except Exception:
                dead_sockets.add(ws)
                
        active_websockets.difference_update(dead_sockets)

@asynccontextmanager
async def lifespan(app: FastAPI):
    global ml_model
    # Initialize SQLite Database (sync is fine for one-time startup)
    conn = sqlite3.connect("metrics.db")
    c = conn.cursor()
    c.execute('''CREATE TABLE IF NOT EXISTS telemetry
                 (id INTEGER PRIMARY KEY AUTOINCREMENT, 
                  timestamp TEXT, path TEXT, response_time_ms REAL, 
                  cpu_utilization REAL, memory_utilization REAL, active_users INTEGER, system_state TEXT)''')
    conn.commit()
    conn.close()
    
    # Load ML Model on startup
    if os.path.exists("optimization_model.pkl"):
        ml_model = joblib.load("optimization_model.pkl")
        print("ML Model loaded successfully.")
    else:
        print("WARNING: ML Model not found. Auto-optimization will be disabled.")
    
    # Start the continuous monitoring and prediction loop
    opt_task = asyncio.create_task(optimization_loop())
    ws_task = asyncio.create_task(websocket_broadcaster())
    sys_mon_task = asyncio.create_task(system_monitor_loop())
    
    yield
    
    opt_task.cancel()
    ws_task.cancel()
    sys_mon_task.cancel()

app = FastAPI(lifespan=lifespan)

# Allow CORS for the frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Dummy database data
PRODUCTS = [{"id": i, "name": f"Product {i}", "price": i * 10.5} for i in range(1, 101)]

async def optimization_loop():
    """
    Background task that continuously observes metrics, 
    predicts system state using ML, and applies optimizations.
    """
    global metrics_log, config
    WINDOW_SIZE = 5 # Must match the training script window size
    
    while True:
        await asyncio.sleep(2) # Check every 2 seconds
        
        if not ml_model or len(metrics_log) < WINDOW_SIZE:
            continue
            
        # Get the rolling window of the last 5 metric logs
        window = metrics_log[-WINDOW_SIZE:]
        
        # Flatten the features to match the time-series model input shape
        features_list = []
        for log in list(window):
            features_list.extend([
                log['cpu_utilization'],
                log['memory_utilization'],
                log['active_users'],
                log['response_time_ms']
            ])
            
        # Create a single-row DataFrame with the flattened lagged features
        features = pd.DataFrame([features_list])
        
        # Predict the FUTURE state or use Manual Override
        if config.manual_override:
            state_map = {"NORMAL": 0, "WARNING": 1, "CRITICAL": 2}
            prediction = state_map.get(config.manual_override, 0)
        else:
            # Use to_thread to prevent scikit-learn from blocking the event loop
            prediction_result = await asyncio.to_thread(ml_model.predict, features)
            prediction = prediction_result[0]
        
        # Apply Auto-Optimization Strategy based on prediction
        if prediction == 0:
            if config.is_optimizing:
                print("ML Predicts NORMAL. Recovering standard configuration.")
                PRODUCT_CACHE.clear() # Clear cache on recovery
            config.system_state = "NORMAL"
            config.is_optimizing = False
            config.pagination_limit = 50
            config.cache_enabled = False
            
        elif prediction == 1:
            if not config.is_optimizing:
                print("ML Predicts WARNING. Preparing optimizations.")
            config.system_state = "WARNING"
            config.is_optimizing = True
            config.pagination_limit = 20
            config.cache_enabled = True
            
        elif prediction == 2:
            if config.system_state != "CRITICAL":
                print("ML Predicts CRITICAL. Applying aggressive optimizations.")
            config.system_state = "CRITICAL"
            config.is_optimizing = True
            config.pagination_limit = 5 # Aggressive throttling
            config.cache_enabled = True

@app.middleware("http")
async def monitor_requests(request: Request, call_next):
    global ACTIVE_USERS
    ACTIVE_USERS += 1
    
    start_time = time.time()
    response = await call_next(request)
    process_time = time.time() - start_time
    
    ACTIVE_USERS -= 1
    
    # Don't log metrics for the metrics or websocket endpoints to avoid noise
    if request.url.path not in ["/metrics", "/favicon.ico", "/ws/metrics"]:
        log_entry = {
            "timestamp": datetime.now().isoformat(),
            "path": request.url.path,
            "response_time_ms": round(process_time * 1000, 2),
            "cpu_utilization": CURRENT_CPU,
            "memory_utilization": CURRENT_MEM,
            "active_users": ACTIVE_USERS,
        }
        metrics_log.append(log_entry)
        
        # Persist to SQLite asynchronously using aiosqlite
        try:
            async with aiosqlite.connect("metrics.db") as db:
                await db.execute("INSERT INTO telemetry (timestamp, path, response_time_ms, cpu_utilization, memory_utilization, active_users, system_state) VALUES (?, ?, ?, ?, ?, ?, ?)",
                          (log_entry["timestamp"], log_entry["path"], log_entry["response_time_ms"], 
                           log_entry["cpu_utilization"], log_entry["memory_utilization"], log_entry["active_users"], config.system_state))
                await db.commit()
        except Exception as e:
            print("DB Error:", e)
            
    return response

@app.get("/")
def read_root():
    return {"status": "Self-Optimizing API is Running"}

@app.get("/products")
async def get_products(page: int = 1):
    """
    Simulated e-commerce product list with caching and boundary checks.
    """
    base_delay = 0.05
    load_factor = ACTIVE_USERS * 0.02
    limit = config.pagination_limit
    
    cache_key = f"page_{page}_limit_{limit}"
    
    # Check Real Cache
    if config.cache_enabled:
        actual_delay = 0.01 # Redis speed
        if cache_key in PRODUCT_CACHE:
            config.queries_prevented += 1
            await asyncio.sleep(actual_delay)
            # Return cached data but inject current state
            res = PRODUCT_CACHE[cache_key].copy()
            res["optimizing"] = config.is_optimizing
            res["state"] = config.system_state
            return res
    else:
        actual_delay = base_delay + load_factor
        
    await asyncio.sleep(actual_delay) 
    
    start_idx = (page - 1) * limit
    
    # Boundary correction if page exceeds available data (e.g., when limit dynamically drops)
    if start_idx >= len(PRODUCTS):
        start_idx = max(0, len(PRODUCTS) - limit)
        page = (start_idx // limit) + 1
        
    end_idx = start_idx + limit
    data = PRODUCTS[start_idx:end_idx]
    
    response_data = {
        "page": page,
        "limit": limit,
        "optimizing": config.is_optimizing,
        "state": config.system_state,
        "data": data,
        "total": len(PRODUCTS)
    }
    
    # Store in Real Cache
    if config.cache_enabled:
        # Prevent unbounded memory growth by limiting cache keys
        if len(PRODUCT_CACHE) > 100:
            PRODUCT_CACHE.clear()
        PRODUCT_CACHE[cache_key] = response_data
        
    return response_data

@app.get("/metrics")
def get_metrics():
    # Keep HTTP endpoint for fallback, but WebSockets is preferred
    return {
        "cpu": psutil.cpu_percent(),
        "memory": psutil.virtual_memory().percent,
        "active_users": ACTIVE_USERS,
        "optimizing": config.is_optimizing,
        "system_state": config.system_state,
        "manual_override": config.manual_override,
        "queries_prevented": config.queries_prevented,
        "recent_logs": list(metrics_log)[-10:]
    }

@app.websocket("/ws/metrics")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    active_websockets.add(websocket)
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        active_websockets.remove(websocket)

class OverrideRequest(BaseModel):
    state: str

@app.post("/override")
async def set_override(req: OverrideRequest):
    if req.state in ["NORMAL", "WARNING", "CRITICAL"]:
        config.manual_override = req.state
    else:
        config.manual_override = None
    return {"message": f"Override set to {config.manual_override}"}

@app.get("/export_data")
async def export_data():
    def export():
        conn = sqlite3.connect("metrics.db")
        df = pd.read_sql_query("SELECT * FROM telemetry", conn)
        conn.close()
        
        file_path = "telemetry_report.csv"
        df.to_csv(file_path, index=False)
        return file_path
        
    # Run synchronous IO and pandas operations in a separate thread to avoid blocking the event loop
    file_path = await asyncio.to_thread(export)
    
    return FileResponse(path=file_path, filename="telemetry_report.csv", media_type="text/csv")
