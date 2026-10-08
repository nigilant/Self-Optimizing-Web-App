import { useState, useEffect } from 'react'
import axios from 'axios'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Area, AreaChart } from 'recharts'
import { Activity, Server, Users, Cpu, ShieldCheck, ShieldAlert, AlertTriangle, Image as ImageIcon, ZapOff, ShoppingBag, ArrowRight, Download, Database } from 'lucide-react'

const API_URL = 'http://127.0.0.1:8000'
const WS_URL = 'ws://127.0.0.1:8000/ws/metrics'

function App() {
  const [metrics, setMetrics] = useState({ cpu: 0, memory: 0, active_users: 0, queries_prevented: 0, optimizing: false, system_state: "NORMAL", recent_logs: [] })
  const [history, setHistory] = useState([])
  const [products, setProducts] = useState([])
  const [page, setPage] = useState(1)
  const [loadingProducts, setLoadingProducts] = useState(false)
  const [currentLimit, setCurrentLimit] = useState(50)

  // Connect to WebSocket for real-time metrics
  useEffect(() => {
    let ws = null
    let reconnectTimeout = null

    const connectWebSocket = () => {
      ws = new WebSocket(WS_URL)

      ws.onopen = () => {
        reconnectAttempts = 0 // Reset on successful connection
      }

      ws.onmessage = (event) => {
        const data = JSON.parse(event.data)
        setMetrics(data)

        setHistory(prev => {
          const newHist = [...prev, {
            time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
            cpu: data.cpu,
            memory: data.memory,
            users: data.active_users
          }]
          if (newHist.length > 25) return newHist.slice(newHist.length - 25)
          return newHist
        })
      }

      ws.onclose = () => {
        // Attempt to reconnect with exponential backoff (max 30s)
        const delay = Math.min(1000 * Math.pow(2, reconnectAttempts), 30000)
        reconnectAttempts++
        reconnectTimeout = setTimeout(connectWebSocket, delay)
      }
    }

    connectWebSocket()

    return () => {
      clearTimeout(reconnectTimeout)
      if (ws) ws.close()
    }
  }, [])

  // Fetch products with AbortController
  useEffect(() => {
    const controller = new AbortController()

    const fetchProducts = async () => {
      setLoadingProducts(true)
      try {
        const res = await axios.get(`${API_URL}/products?page=${page}`, {
          signal: controller.signal
        })
        setProducts(res.data.data)
        setCurrentLimit(res.data.limit)

        // Adjust page if backend corrected it due to boundary shift (e.g. limit dropped)
        if (res.data.page !== page) {
          setPage(res.data.page)
        }
      } catch (e) {
        if (!axios.isCancel(e)) {
          console.error(e)
        }
      }
      setLoadingProducts(false)
    }

    fetchProducts()

    return () => {
      controller.abort()
    }
  }, [page])

  const setOverride = async (state) => {
    try {
      await axios.post(`${API_URL}/override`, { state })
    } catch (e) {
      console.error(e)
    }
  }

  // State styling helper
  const getStateConfig = (state) => {
    if (state === "CRITICAL") return {
      bg: "bg-red-500/10", border: "border-red-500/50", text: "text-red-400",
      icon: <ShieldAlert size={20} className="text-red-500 animate-pulse" />,
      label: "CRITICAL LOAD: OPTIMIZING", glow: "shadow-[0_0_30px_rgba(239,68,68,0.3)]"
    }
    if (state === "WARNING") return {
      bg: "bg-amber-500/10", border: "border-amber-500/50", text: "text-amber-400",
      icon: <AlertTriangle size={20} className="text-amber-500 animate-pulse" />,
      label: "WARNING: DEGRADED MODE", glow: "shadow-[0_0_30px_rgba(245,158,11,0.2)]"
    }
    return {
      bg: "bg-emerald-500/10", border: "border-emerald-500/50", text: "text-emerald-400",
      icon: <ShieldCheck size={20} className="text-emerald-500" />,
      label: "SYSTEM NORMAL", glow: "shadow-[0_0_30px_rgba(16,185,129,0.1)]"
    }
  }

  const sConf = getStateConfig(metrics.system_state)
  const isCritical = metrics.system_state === "CRITICAL"

  return (
    <div className="flex h-screen w-full text-zinc-100 p-6 font-sans gap-8 overflow-hidden">

      {/* LEFT SIDE: The Dummy Web App (User View) */}
      <div className="w-[400px] flex flex-col relative z-10 shrink-0">
        {/* Phone frame illusion */}
        <div className={`flex flex-col h-full rounded-[2.5rem] border-[8px] border-zinc-900 bg-zinc-950 overflow-hidden shadow-2xl transition-shadow duration-1000 ${sConf.glow}`}>

          {/* App Header */}
          <div className="p-6 pb-4 border-b border-white/5 bg-zinc-900/50 backdrop-blur-md sticky top-0 z-20">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold flex items-center gap-2 tracking-tight">
                <ShoppingBag size={24} className="text-indigo-500" /> NexaStore
              </h2>
              <div className="w-8 h-8 rounded-full bg-zinc-800 border border-white/10 flex items-center justify-center text-xs">US</div>
            </div>

            {/* Dynamic Status Pill within the App */}
            <div className={`text-xs px-3 py-1.5 rounded-full flex items-center gap-2 border w-max transition-colors duration-500 ${sConf.bg} ${sConf.border} ${sConf.text}`}>
              <div className={`w-2 h-2 rounded-full ${isCritical ? 'bg-red-500 animate-ping' : metrics.system_state === 'WARNING' ? 'bg-amber-500' : 'bg-emerald-500'}`}></div>
              {isCritical ? "Low Bandwidth Mode Active" : "Store Online"}
            </div>
          </div>

          <div className="p-4 flex-1 overflow-y-auto pb-24">

            {/* Heavy Feature: Recommendations (Disabled during CRITICAL load) */}
            {!isCritical ? (
              <div className="mb-8 animate-slide-up">
                <h3 className="text-sm font-semibold text-zinc-400 mb-3 flex items-center justify-between">
                  AI Recommendations <span className="text-[10px] bg-indigo-500/20 text-indigo-400 px-2 py-0.5 rounded">GPU</span>
                </h3>
                <div className="flex gap-3 overflow-hidden">
                  <div className="h-28 flex-1 rounded-2xl bg-gradient-to-br from-indigo-500/20 to-purple-500/20 border border-indigo-500/30 flex flex-col items-center justify-center relative overflow-hidden group">
                    <div className="absolute inset-0 bg-indigo-500/10 group-hover:bg-indigo-500/20 transition-colors"></div>
                    <Activity size={24} className="text-indigo-400 mb-2" />
                    <span className="text-xs font-medium">Smart Match</span>
                  </div>
                  <div className="h-28 flex-1 rounded-2xl bg-gradient-to-br from-fuchsia-500/20 to-pink-500/20 border border-fuchsia-500/30 flex flex-col items-center justify-center">
                    <ZapOff size={24} className="text-fuchsia-400 mb-2" />
                    <span className="text-xs font-medium">Flash Deals</span>
                  </div>
                </div>
              </div>
            ) : (
              <div className="mb-6 p-4 rounded-2xl bg-red-500/10 border border-red-500/20 flex items-start gap-3 text-red-400/80 text-sm animate-slide-up">
                <ZapOff size={18} className="shrink-0 mt-0.5" />
                <p className="leading-tight">AI Recommendations temporarily paused to conserve server resources.</p>
              </div>
            )}

            {/* Product List */}
            <div className="space-y-3">
              <div className="text-sm font-semibold text-zinc-400 mb-1">Trending Now (Limit: {products.length})</div>
              {loadingProducts ? <div className="h-20 rounded-2xl bg-zinc-900 animate-pulse border border-white/5"></div> :
                products.map((p, i) => (
                  <div key={p.id} className="p-3 bg-zinc-900/80 rounded-2xl flex gap-4 items-center border border-white/5 hover:bg-zinc-800/80 transition-colors" style={{ animationDelay: `${i * 50}ms` }} >
                    {/* Simulated Image Degradation */}
                    <div className={`w-14 h-14 rounded-xl flex items-center justify-center shrink-0 ${isCritical ? 'bg-zinc-800 border border-dashed border-zinc-700' : 'bg-gradient-to-tr from-indigo-600 to-cyan-500 shadow-lg shadow-indigo-500/20'}`}>
                      {isCritical ? <ImageIcon size={20} className="text-zinc-600" /> : <span className="font-bold text-white tracking-tighter">NX</span>}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold text-zinc-200 truncate">{p.name}</div>
                      <div className="text-xs text-zinc-500 mt-0.5">Fast Shipping</div>
                    </div>
                    <div className="font-bold text-emerald-400 bg-emerald-500/10 px-2.5 py-1 rounded-lg border border-emerald-500/20">
                      ${p.price}
                    </div>
                  </div>
                ))
              }
            </div>
          </div>

          {/* App Bottom Bar */}
          <div className="p-4 border-t border-white/5 bg-zinc-950/80 backdrop-blur-xl absolute bottom-0 w-full flex justify-between gap-3">
            <button
              disabled={page === 1}
              onClick={() => setPage(p => p - 1)}
              className="flex-1 py-3 bg-zinc-900 hover:bg-zinc-800 rounded-xl disabled:opacity-50 transition-colors text-sm font-medium border border-white/10"
            >
              Back
            </button>
            <button
              disabled={products.length < currentLimit}
              onClick={() => setPage(p => p + 1)}
              className="flex-1 py-3 bg-zinc-100 hover:bg-white text-zinc-950 rounded-xl disabled:opacity-50 transition-colors text-sm font-bold shadow-lg flex items-center justify-center gap-2"
            >
              Next <ArrowRight size={16} />
            </button>
          </div>
        </div>
      </div>

      {/* RIGHT SIDE: DevOps Dashboard */}
      <div className="flex-1 flex flex-col gap-6 relative z-10">

        {/* Header */}
        <div className="flex justify-between items-end">
          <div>
            <h1 className="text-4xl font-extrabold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-zinc-100 to-zinc-500">Autonomous Telemetry</h1>
            <p className="text-zinc-400 mt-2 font-medium flex items-center gap-4">
              Self-optimizing ML performance engine monitoring in real-time.
              {/* MANUAL OVERRIDE CONTROLS */}
              <span className="flex items-center gap-2 bg-zinc-900/50 p-1 rounded-xl border border-white/10 ml-4">
                <span className="text-[10px] uppercase font-bold text-zinc-500 px-2">Override:</span>
                <button onClick={() => setOverride("")} className={`text-[10px] px-2 py-1 rounded-lg font-bold transition-colors ${!metrics.manual_override ? 'bg-indigo-500 text-white' : 'hover:bg-zinc-800 text-zinc-400'}`}>ML AUTO</button>
                <button onClick={() => setOverride("WARNING")} className={`text-[10px] px-2 py-1 rounded-lg font-bold transition-colors ${metrics.manual_override === 'WARNING' ? 'bg-amber-500 text-white' : 'hover:bg-zinc-800 text-zinc-400'}`}>WARN</button>
                <button onClick={() => setOverride("CRITICAL")} className={`text-[10px] px-2 py-1 rounded-lg font-bold transition-colors ${metrics.manual_override === 'CRITICAL' ? 'bg-red-500 text-white' : 'hover:bg-zinc-800 text-zinc-400'}`}>CRIT</button>
              </span>
              <a href={`${API_URL}/export_data`} download className="flex items-center gap-1.5 text-[10px] font-bold text-zinc-300 bg-zinc-800 hover:bg-zinc-700 px-3 py-1.5 rounded-lg transition-colors border border-white/5 ml-2">
                <Download size={12} /> EXPORT CSV
              </a>
            </p>
          </div>

          <div className={`px-6 py-3 rounded-2xl font-bold flex items-center gap-3 ${sConf.bg} ${sConf.text} border border-white/10 shadow-2xl backdrop-blur-md transition-all duration-700`}>
            {sConf.icon}
            <span className="tracking-wide uppercase text-sm">{metrics.manual_override ? `MANUAL: ${sConf.label}` : sConf.label}</span>
          </div>
        </div>

        {/* Metric Cards */}
        <div className="grid grid-cols-4 gap-6">

          <div className="bg-zinc-900/40 backdrop-blur-md p-6 rounded-3xl border border-emerald-500/20 flex flex-col relative overflow-hidden group hover:bg-zinc-900/60 transition-colors shadow-[0_0_20px_rgba(16,185,129,0.05)]">
            <div className="flex justify-between items-start mb-4">
              <div className="p-3 bg-emerald-500/20 rounded-2xl text-emerald-400 ring-1 ring-emerald-500/30"><Database size={24} /></div>
              <span className="text-xs font-bold text-emerald-500">SAVED</span>
            </div>
            <p className="text-emerald-400/80 text-sm font-semibold uppercase tracking-wider mb-1">Queries Prevented</p>
            <h3 className="text-5xl font-extrabold tracking-tighter text-zinc-100">{metrics.queries_prevented || 0}</h3>
            <div className="absolute -bottom-10 -right-10 text-emerald-500/5 group-hover:text-emerald-500/10 transition-colors"><Database size={150} /></div>
          </div>

          <div className="bg-zinc-900/40 backdrop-blur-md p-6 rounded-3xl border border-white/10 flex flex-col relative overflow-hidden group hover:bg-zinc-900/60 transition-colors">
            <div className="flex justify-between items-start mb-4">
              <div className="p-3 bg-indigo-500/20 rounded-2xl text-indigo-400 ring-1 ring-indigo-500/30"><Cpu size={24} /></div>
              <span className="text-xs font-bold text-zinc-500">TARGET: 100%</span>
            </div>
            <p className="text-zinc-400 text-sm font-semibold uppercase tracking-wider mb-1">CPU Utilization</p>
            <div className="flex items-baseline gap-2">
              <h3 className="text-5xl font-extrabold tracking-tighter text-zinc-100">{metrics.cpu.toFixed(1)}</h3>
              <span className="text-xl text-zinc-500">%</span>
            </div>
            <div className="absolute -bottom-10 -right-10 text-indigo-500/5 group-hover:text-indigo-500/10 transition-colors"><Cpu size={150} /></div>
          </div>

          <div className="bg-zinc-900/40 backdrop-blur-md p-6 rounded-3xl border border-white/10 flex flex-col relative overflow-hidden group hover:bg-zinc-900/60 transition-colors">
            <div className="flex justify-between items-start mb-4">
              <div className="p-3 bg-fuchsia-500/20 rounded-2xl text-fuchsia-400 ring-1 ring-fuchsia-500/30"><Server size={24} /></div>
              <span className="text-xs font-bold text-zinc-500">RAM</span>
            </div>
            <p className="text-zinc-400 text-sm font-semibold uppercase tracking-wider mb-1">Memory Usage</p>
            <div className="flex items-baseline gap-2">
              <h3 className="text-5xl font-extrabold tracking-tighter text-zinc-100">{metrics.memory.toFixed(1)}</h3>
              <span className="text-xl text-zinc-500">%</span>
            </div>
            <div className="absolute -bottom-10 -right-10 text-fuchsia-500/5 group-hover:text-fuchsia-500/10 transition-colors"><Server size={150} /></div>
          </div>

          <div className="bg-zinc-900/40 backdrop-blur-md p-6 rounded-3xl border border-white/10 flex flex-col relative overflow-hidden group hover:bg-zinc-900/60 transition-colors">
            <div className="flex justify-between items-start mb-4">
              <div className="p-3 bg-emerald-500/20 rounded-2xl text-emerald-400 ring-1 ring-emerald-500/30"><Users size={24} /></div>
              <span className="text-xs font-bold text-emerald-500/50 animate-pulse">LIVE</span>
            </div>
            <p className="text-zinc-400 text-sm font-semibold uppercase tracking-wider mb-1">Active Connections</p>
            <h3 className="text-5xl font-extrabold tracking-tighter text-zinc-100">{metrics.active_users}</h3>
            <div className="absolute -bottom-10 -right-10 text-emerald-500/5 group-hover:text-emerald-500/10 transition-colors"><Users size={150} /></div>
          </div>
        </div>

        {/* Live Chart */}
        <div className="bg-zinc-900/40 backdrop-blur-md p-8 rounded-3xl border border-white/10 flex-1 flex flex-col">
          <div className="flex justify-between items-center mb-8">
            <h3 className="text-lg font-bold text-zinc-200 tracking-wide">Predictive Load Trajectory</h3>
            <div className="flex gap-4 text-xs font-semibold px-4 py-2 bg-zinc-950/50 rounded-full border border-white/5">
              <span className="flex items-center gap-2"><div className="w-2.5 h-2.5 bg-indigo-500 rounded-full shadow-[0_0_10px_rgba(99,102,241,0.8)]"></div> CPU</span>
              <span className="flex items-center gap-2"><div className="w-2.5 h-2.5 bg-fuchsia-500 rounded-full shadow-[0_0_10px_rgba(217,70,239,0.8)]"></div> RAM</span>
              <span className="flex items-center gap-2"><div className="w-2.5 h-2.5 bg-emerald-500 rounded-full shadow-[0_0_10px_rgba(16,185,129,0.8)]"></div> USERS</span>
            </div>
          </div>
          <div className="flex-1 min-h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={history} margin={{ top: 10, right: 0, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorCpu" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="colorMem" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#d946ef" stopOpacity={0.2} />
                    <stop offset="95%" stopColor="#d946ef" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                <XAxis dataKey="time" stroke="rgba(255,255,255,0.3)" fontSize={11} tickLine={false} axisLine={false} dy={10} />
                <YAxis yAxisId="left" stroke="rgba(255,255,255,0.3)" fontSize={11} domain={[0, 100]} tickLine={false} axisLine={false} dx={-10} />
                <YAxis yAxisId="right" orientation="right" stroke="rgba(255,255,255,0)" domain={[0, 'dataMax + 20']} />

                <Tooltip
                  contentStyle={{
                    backgroundColor: 'rgba(9, 9, 11, 0.9)',
                    backdropFilter: 'blur(10px)',
                    borderColor: 'rgba(255,255,255,0.1)',
                    borderRadius: '16px',
                    boxShadow: '0 20px 40px -10px rgba(0,0,0,0.5)',
                    padding: '12px 16px'
                  }}
                  itemStyle={{ fontWeight: '600', fontSize: '13px', padding: '2px 0' }}
                  labelStyle={{ color: 'rgba(255,255,255,0.5)', fontSize: '11px', marginBottom: '8px', fontWeight: 'bold' }}
                />
                <Area yAxisId="left" type="monotone" dataKey="cpu" stroke="#6366f1" strokeWidth={3} fillOpacity={1} fill="url(#colorCpu)" name="CPU (%)" isAnimationActive={false} />
                <Area yAxisId="left" type="monotone" dataKey="memory" stroke="#d946ef" strokeWidth={3} fillOpacity={1} fill="url(#colorMem)" name="Memory (%)" isAnimationActive={false} />
                <Line yAxisId="right" type="monotone" dataKey="users" stroke="#10b981" strokeWidth={3} dot={{ r: 4, fill: '#09090b', strokeWidth: 2 }} activeDot={{ r: 6 }} name="Active Users" isAnimationActive={false} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  )
}

export default App
