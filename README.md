# ThermalGuard — Hyperlocal Facility Heat-Risk Intelligence

> **FortyGuard Hackathon '26** &middot; **Track 03 — Industrial & Enterprise**  
> Turning 2-meter hyperlocal temperature intelligence into actionable cooling, safety, and equipment early-warning signals for data centers, warehouses, and industrial plants.

---

## 📌 The Problem
Standard meteorological weather forecasts provide coarse, city-level temperature averages from airports miles away. They completely miss the **Urban Heat Island (UHI)** microclimates surrounding industrial roofs, data center generator pads, and asphalt logistics hubs—which frequently run **3°C to 8°C hotter** than the regional forecast.

Without localized telemetry, facilities managers cannot detect localized thermal stress before:
- Chiller plants overload and trip off-line
- Servers throttle under high condenser temperatures
- Outdoor logistics and assembly workers face extreme heat exposure

---

## ⚡ What ThermalGuard Does
ThermalGuard connects directly to **FortyGuard's Hyperlocal Temperature API (v1)** to continuously monitor closed polygon Areas of Interest (AOI) with **2-meter spatial resolution**.

- **Hyperlocal 2m Microclimate Telemetry**: Real-time ambient readings compared against regional city forecasts to quantify localized heat island penalties.
- **Rule-Based Operational Risk Scoring**: Categorizes ambient thermal load into `Nominal`, `Elevated Heat Stress`, and `Critical Thermal Load` with tailored operational advice.
- **30-Minute Predictive Time-to-Exceed (TTE)**: Analyzes trend rate-of-change to project when a facility will breach safety thresholds before it happens.
- **HVAC Load Penalty & Cost Estimator**: Quantifies chiller COP degradation (%) and estimated additional cooling power overhead ($/hr).
- **Hand-Rolled HTML5 Canvas History Graphs**: Retina-crisp line rendering with area gradients, dotted threshold indicators, and interactive cursor tooltips—with **zero external chart libraries**.
- **Interactive 2m Spatial Hotspot Mini-Grid**: 3x3 localized sub-zone breakdown (Chiller Deck, Exhaust Vents, Intake Zones, Generator Pad).
- **Incident Audit Trail & Executive Summary Export**: Chronological log of threshold transitions with one-click export to CSV and formatted plain text executive reports.
- **Operational Action Protocol**: Facilities team can deploy auxiliary chiller protocols directly from the dashboard to mitigate heat spikes.
- **Audible & Visual Alarm System**: Native Browser Desktop Notifications + Web Audio synthesized siren with audio mute controls.

---

## 🏗️ Architecture & Tech Stack

```
[ FortyGuard API (v1) ]
       ▲             │
 (1) POST /v1/heatmap (2) GET /v1/status/:id
       │             ▼
[ Background Poller Thread (poller.py) ]
       │
       ▼ (3) Cache rolling history (last 50 readings)
[ Thread-Safe Store (store.py) ]
       │
       ▼ (4) Evaluate thresholds & TTE projections
[ Risk Scorer Engine (risk_engine.py) ]
       │
       ▼ (5) JSON REST API (/api/facilities, /api/export/csv, /api/export/summary)
[ Frontend Dashboard (Vanilla JS + Custom CSS + Canvas API) ]
```

- **Backend**: Python 3.11+, Flask, Requests, Gunicorn
- **Frontend**: Semantic HTML5, Vanilla JavaScript (ES6+), HTML5 Canvas API (No React, No Chart.js, No external CSS frameworks)
- **Design System**: Handcrafted Dark & Light control-room UI with *Plus Jakarta Sans* and *JetBrains Mono* typography
- **Deployment**: Configured for instant deployment on [Railway](https://railway.app) via `Procfile` and `gunicorn`

---

## 🚀 Getting Started

### 1. Clone & Setup Environment
```bash
# Clone the repository
git clone https://github.com/your-username/thermalguard.git
cd thermalguard

# Install dependencies
py -m pip install -r requirements.txt
```

### 2. Configure Environment Variables
Copy `.env.example` to `.env`:
```bash
cp .env.example .env
```
Inside `.env`, provide your FortyGuard API credentials:
```env
FORTYGUARD_API_KEY=your_fortyguard_api_key_here
FORTYGUARD_BASE_URL=https://api.fortyguard.com/v1
POLL_INTERVAL_SECONDS=30
FLASK_PORT=5000
FLASK_DEBUG=True
```

### 3. Run the Development Server
```bash
py app.py
```
Open **`http://127.0.0.1:5000`** in your browser.

---

## 📊 API Reference

| Endpoint | Method | Description |
| :--- | :--- | :--- |
| `GET /` | HTML | ThermalGuard telemetry dashboard |
| `GET /api/facilities` | JSON | Returns all monitored facilities, latest readings, risk states, and audit logs |
| `GET /api/facilities/<id>/history` | JSON | Returns rolling 50-point time-series history for Canvas rendering |
| `GET /api/export/csv` | CSV | Download full telemetry history in CSV format |
| `GET /api/export/summary` | TXT | Download formatted executive incident summary report |
| `POST /api/poller/trigger` | POST | Trigger an immediate manual FortyGuard API poll pass |
| `POST /api/override/cooling` | POST | Dispatch operational auxiliary chiller cooling protocol |
| `POST /api/simulate/spike` | POST | Inject simulated thermal heat surge for judge demonstrations |
| `POST /api/simulate/reset` | POST | Reset facilities to nominal design baseline |

---

## 🚢 Deploying to Railway

1. Push this repository to GitHub.
2. Link your repo in [Railway](https://railway.app).
3. Set your Railway environment variables (`FORTYGUARD_API_KEY`, `FORTYGUARD_BASE_URL`, `POLL_INTERVAL_SECONDS`).
4. Railway automatically detects [`Procfile`](Procfile) and [`runtime.txt`](runtime.txt) to start Gunicorn on the assigned `$PORT`.

---

## 📄 License
Built for FortyGuard Hackathon '26 (Track 03 — Industrial & Enterprise).
