# ThermalGuard — Railway Deployment Guide

## 1. Prerequisites
- [Railway Account](https://railway.app)
- Git repository pushed to GitHub

## 2. Environment Variables on Railway
In your Railway project settings -> **Variables**, add the following:

| Variable | Recommended Value | Description |
| :--- | :--- | :--- |
| `FORTYGUARD_API_KEY` | `your_api_key_here` | Your FortyGuard API Key |
| `FORTYGUARD_BASE_URL` | `https://api.fortyguard.com/v1` | FortyGuard V1 API Base URL |
| `POLL_INTERVAL_SECONDS` | `30` | Polling frequency across facilities |
| `FLASK_DEBUG` | `False` | Production mode |

## 3. Deploy Steps
1. Click **+ New Project** in Railway.
2. Select **Deploy from GitHub repo** and choose this repository.
3. Railway will detect `Procfile` and `requirements.txt` automatically (using Gunicorn).
4. Under **Settings** -> **Networking**, click **Generate Domain** to get your public live URL (e.g. `https://thermalguard-production.up.railway.app`).
5. Open the live URL to verify the real-time telemetry dashboard.
