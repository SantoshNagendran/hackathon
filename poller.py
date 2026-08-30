"""
Background poller service for FortyGuard Temperature API.
Handles async submit -> poll cycle across configured facilities.
"""

import threading
import time
from datetime import datetime, timezone
import random
import requests
import config

class FortyGuardPoller:
    def __init__(self, store, interval=config.POLL_INTERVAL):
        self.store = store
        self.interval = max(interval, 20) # FortyGuard async queue needs a few seconds
        self.running = False
        self._thread = None

    def start(self):
        if self.running:
            return
        self.running = True
        self._thread = threading.Thread(target=self._run_loop, daemon=True)
        self._thread.start()
        print(f"[*] FortyGuard background poller started (interval: {self.interval}s)")

    def stop(self):
        self.running = False

    def _run_loop(self):
        # Allow Flask to start up cleanly before first round
        time.sleep(2)
        while self.running:
            try:
                self._poll_all_facilities()
                self.store.update_poller_status("idle")
            except Exception as e:
                print(f"[!] Poller loop error: {e}")
                self.store.update_poller_status("error", str(e))

            # Sleep in 1-second chunks to allow clean stop
            for _ in range(self.interval):
                if not self.running:
                    break
                time.sleep(1)

    def _poll_all_facilities(self):
        self.store.update_poller_status("polling")
        
        for facility in config.FACILITIES:
            f_id = facility["id"]
            name = facility["name"]
            
            if not config.API_KEY:
                # Fallback mode if no key configured
                self._fallback_step(facility)
                continue

            try:
                temp = self._fetch_facility_temperature(facility)
                if temp is not None:
                    print(f"[+] Live FortyGuard API temp for {name}: {temp}°C")
                    self.store.record_reading(f_id, temp, is_live=True)
                else:
                    print(f"[-] Could not resolve live temp for {name}, applying drift fallback.")
                    self._fallback_step(facility)

            except requests.exceptions.RequestException as err:
                print(f"[!] Network error polling {name}: {err}")
                self._fallback_step(facility)
            
            # Short stagger between facilities
            time.sleep(2)

    def _fetch_facility_temperature(self, facility):
        now = datetime.now(timezone.utc)
        date_str = now.strftime("%Y-%m-%d")
        time_str = now.strftime("%H:00")

        headers = {
            "api-key": config.API_KEY,
            "x-api-key": config.API_KEY,
            "Content-Type": "application/json"
        }

        payload = {
            "polygon_aoi": facility["polygon_aoi"],
            "date_time": {
                "start_date": date_str,
                "start_time": time_str,
                "filter_type": 1
            },
            "granularity": 100
        }

        submit_url = f"{config.BASE_URL}/heatmap"
        res = requests.post(submit_url, json=payload, headers=headers, timeout=15)
        
        if res.status_code not in (200, 201, 202):
            print(f"[!] Submit returned status {res.status_code}: {res.text[:120]}")
            return None

        data = res.json()
        payload_data = data.get("data") if isinstance(data.get("data"), dict) else {}
        activity_id = payload_data.get("activity_id") or data.get("activity_id")

        if not activity_id:
            return None

        # Poll status
        status_url = f"{config.BASE_URL}/status/{activity_id}"
        max_attempts = 15
        for _ in range(max_attempts):
            time.sleep(2.5)
            poll_res = requests.get(status_url, headers=headers, timeout=12)
            if poll_res.status_code != 200:
                continue

            p_data = poll_res.json()
            d_field = p_data.get("data") if isinstance(p_data.get("data"), dict) else {}
            status = str(p_data.get("status") or d_field.get("status") or "").lower()

            if status in ("completed", "ready", "success", "done"):
                result = d_field.get("result") or p_data.get("result") or {}
                stats = result.get("stats_data", {}).get("temperature_stats", {})
                mean_temp = stats.get("mean")
                
                # If mean is null, try features
                if mean_temp is None:
                    features = result.get("map_data", {}).get("features", [])
                    if features:
                        props = features[0].get("properties", {})
                        mean_temp = props.get("average_temperature") or props.get("min_temperature")
                
                if mean_temp is not None:
                    return float(mean_temp)
                return None

            elif status in ("failed", "error"):
                return None

        return None

    def _fallback_step(self, facility):
        f_id = facility["id"]
        latest = self.store.latest_readings.get(f_id)
        current_temp = latest["temperature"] if latest else facility["baseline_temp"]
        # realistic ambient wander (+/- 0.35 C)
        drift = (random.random() - 0.48) * 0.7
        new_temp = round(current_temp + drift, 2)
        self.store.record_reading(f_id, new_temp, is_live=False)
