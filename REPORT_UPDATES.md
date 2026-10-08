## Latest Architectural & Performance Improvements

In order to elevate the prototype to a production-ready standard, the following architectural optimizations were recently implemented:

1. **Thread-Safe Telemetry Structures**: 
   - Replaced legacy Python arrays with `collections.deque` for the `metrics_log`. This provides memory-safe, $O(1)$ constant time append operations and is intrinsically thread-safe, avoiding potential race conditions under concurrent access.

2. **Asynchronous System Profiling**:
   - Polling the host CPU and Memory via `psutil` within the HTTP request middleware previously led to inaccurate metrics under heavy concurrency (returning 0% CPU utilization). This was resolved by decoupling the profiler into a dedicated `asyncio` background task that accurately samples the system every 1 second without blocking the main event loop.

3. **Non-Blocking I/O for Data Exports**:
   - The `/export_data` API endpoint utilized synchronous Pandas and SQLite read operations, causing the main FastAPI event loop to freeze during execution. This heavy operation was wrapped in `asyncio.to_thread()`, pushing the workload to a background thread pool and maintaining high API availability for other users.

4. **Memory Leak Protection in Application Cache**:
   - Added a size-limiter to the dynamic `PRODUCT_CACHE`. While caching prevents database overloading during `WARNING` and `CRITICAL` states, unbounded caching previously risked Out of Memory (OOM) errors. 

5. **Frontend Resiliency via Exponential Backoff**:
   - Refactored the React frontend's WebSocket reconnection algorithm. Instead of polling every 2 seconds during an outage, the system now implements Exponential Backoff (scaling the delay from 1 second up to 30 seconds). This eliminates the "thundering herd" problem that often crashes servers immediately after they recover from downtime.
