"""
Thread-safe in-memory store for facility telemetry, rolling history, incident audit log, and cooling override actions.
"""

from collections import deque
import threading
import time
from datetime import datetime, timezone
import random
from risk_engine import evaluate_risk, compute_trend

class FacilityStore:
    def __init__(self, facilities, max_history=50):
        self.facilities = {f["id"]: f for f in facilities}
        self.max_history = max_history
        self._lock = threading.Lock()
        self.history = {f_id: deque(maxlen=max_history) for f_id in self.facilities}
        self.latest_readings = {}
        self.incident_log = deque(maxlen=40)
        self.poller_status = {
            "last_run": time.time(),
            "status": "idle",
            "last_error": None
        }

        # Seed initial history
        self._seed_initial_data()

    def _generate_heatmap_tiles(self, base_temp):
        """Generates 3x3 microclimate zone tiles (e.g. 2m precision spatial breakdown)."""
        zones = [
            ["Roof Chiller Deck", "North Intake Vent", "Generator Pad"],
            ["Server Hall A Exhaust", "Central Core", "Server Hall B Exhaust"],
            ["Loading Dock B", "Substation Perimeter", "South Intake Vent"]
        ]
        tiles = []
        for r in range(3):
            for c in range(3):
                # Central and exhaust zones run 1.5 - 3.2°C warmer
                zone_bias = 2.4 if "Exhaust" in zones[r][c] or "Chiller" in zones[r][c] else -0.8
                variance = (random.random() - 0.5) * 1.4
                tile_temp = round(base_temp + zone_bias + variance, 1)
                tiles.append({
                    "row": r,
                    "col": c,
                    "zone_name": zones[r][c],
                    "temperature": tile_temp
                })
        return tiles

    def _seed_initial_data(self):
        now = time.time()
        for f_id, facility in self.facilities.items():
            base = facility.get("baseline_temp", 26.0)
            thresholds = facility.get("thresholds", {})
            for i in range(16, 0, -1):
                pt_time = now - (i * 120)
                noise = (random.random() - 0.46) * 2.2
                temp = round(base + noise, 2)
                point = {
                    "timestamp": pt_time,
                    "time_str": datetime.fromtimestamp(pt_time, tz=timezone.utc).strftime("%H:%M:%S"),
                    "temperature": temp,
                    "is_live_api": False
                }
                self.history[f_id].append(point)

            last_pt = self.history[f_id][-1]
            trend = compute_trend(list(self.history[f_id]))
            risk = evaluate_risk(last_pt["temperature"], thresholds, base, trend)
            tiles = self._generate_heatmap_tiles(last_pt["temperature"])
            
            self.latest_readings[f_id] = {
                "facility_id": f_id,
                "name": facility["name"],
                "type": facility["type"],
                "location_name": facility["location_name"],
                "temperature": last_pt["temperature"],
                "timestamp": last_pt["timestamp"],
                "time_str": last_pt["time_str"],
                "is_live_api": False,
                "risk": risk,
                "trend": trend,
                "thresholds": thresholds,
                "baseline_temp": base,
                "heatmap_tiles": tiles
            }

        self.add_log_event("SYS_INIT", "System initialized. FortyGuard 2m telemetry engine active.", "Normal")

    def record_reading(self, f_id, temp, is_live=True):
        with self._lock:
            if f_id not in self.facilities:
                return

            now = time.time()
            point = {
                "timestamp": now,
                "time_str": datetime.fromtimestamp(now, tz=timezone.utc).strftime("%H:%M:%S"),
                "temperature": round(float(temp), 2),
                "is_live_api": is_live
            }
            self.history[f_id].append(point)

            facility = self.facilities[f_id]
            old_risk_level = self.latest_readings.get(f_id, {}).get("risk", {}).get("level", "Normal")
            trend = compute_trend(list(self.history[f_id]))
            risk = evaluate_risk(point["temperature"], facility["thresholds"], facility["baseline_temp"], trend)
            tiles = self._generate_heatmap_tiles(point["temperature"])

            self.latest_readings[f_id] = {
                "facility_id": f_id,
                "name": facility["name"],
                "type": facility["type"],
                "location_name": facility["location_name"],
                "temperature": point["temperature"],
                "timestamp": point["timestamp"],
                "time_str": point["time_str"],
                "is_live_api": is_live,
                "risk": risk,
                "trend": trend,
                "thresholds": facility["thresholds"],
                "baseline_temp": facility["baseline_temp"],
                "heatmap_tiles": tiles
            }

            if risk["level"] != old_risk_level:
                self.add_log_event(
                    facility["name"],
                    f"Risk transitioned {old_risk_level} → {risk['level']} at {point['temperature']}°C (Δ {risk['delta_baseline']}°C vs baseline)",
                    risk["level"]
                )

    def add_log_event(self, source, message, severity="Normal"):
        now_str = datetime.now(timezone.utc).strftime("%H:%M:%S")
        self.incident_log.appendleft({
            "timestamp": now_str,
            "source": source,
            "message": message,
            "severity": severity
        })

    def inject_heat_spike(self, f_id, temp_delta=6.5):
        with self._lock:
            if f_id not in self.facilities:
                return
            latest = self.latest_readings.get(f_id)
            cur = latest["temperature"] if latest else self.facilities[f_id]["baseline_temp"]
            new_temp = round(cur + temp_delta, 2)
        
        self.record_reading(f_id, new_temp, is_live=True)
        self.add_log_event("SIMULATOR", f"Injected simulated thermal surge on {self.facilities[f_id]['name']} (+{temp_delta}°C)", "Critical")

    def engage_cooling_override(self, f_id):
        """Dispatches operational auxiliary cooling protocol to reduce temperature."""
        with self._lock:
            if f_id not in self.facilities:
                return
            latest = self.latest_readings.get(f_id)
            cur = latest["temperature"] if latest else self.facilities[f_id]["baseline_temp"]
            base = self.facilities[f_id]["baseline_temp"]
            # Cool down toward baseline
            new_temp = round(max(base + 0.5, cur - 4.5), 2)

        self.record_reading(f_id, new_temp, is_live=True)
        self.add_log_event("OPS_DISPATCH", f"Auxiliary Chiller Protocol engaged for {self.facilities[f_id]['name']} (Temp dropped to {new_temp}°C)", "Normal")

    def reset_baseline(self, f_id):
        with self._lock:
            if f_id not in self.facilities:
                return
            base = self.facilities[f_id]["baseline_temp"]
        self.record_reading(f_id, base, is_live=True)
        self.add_log_event("SIMULATOR", f"Reset {self.facilities[f_id]['name']} to nominal baseline ({base}°C)", "Normal")

    def get_all_facilities(self):
        with self._lock:
            return list(self.latest_readings.values())

    def get_facility_history(self, f_id):
        with self._lock:
            if f_id not in self.history:
                return None
            return {
                "facility": self.latest_readings.get(f_id),
                "history": list(self.history[f_id])
            }

    def get_logs(self):
        with self._lock:
            return list(self.incident_log)

    def update_poller_status(self, status, error=None):
        with self._lock:
            self.poller_status["last_run"] = time.time()
            self.poller_status["status"] = status
            self.poller_status["last_error"] = error
