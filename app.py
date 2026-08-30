import io
import csv
from datetime import datetime, timezone
from flask import Flask, render_template, jsonify, Response, request
import config
from store import FacilityStore
from poller import FortyGuardPoller

app = Flask(__name__)

# Initialize store and start poller
store = FacilityStore(config.FACILITIES, max_history=50)
poller = FortyGuardPoller(store, interval=config.POLL_INTERVAL)
poller.start()

@app.route("/")
def index():
    return render_template("index.html", facilities=config.FACILITIES)

@app.route("/api/health")
def health():
    return jsonify({
        "status": "healthy",
        "app": "ThermalGuard",
        "poller": store.poller_status
    })

@app.route("/api/facilities")
def get_facilities():
    return jsonify({
        "error": False,
        "count": len(config.FACILITIES),
        "facilities": store.get_all_facilities(),
        "poller_status": store.poller_status,
        "logs": store.get_logs()
    })

@app.route("/api/facilities/<facility_id>/history")
def get_facility_history(facility_id):
    data = store.get_facility_history(facility_id)
    if not data:
        return jsonify({"error": True, "message": f"Facility '{facility_id}' not found"}), 404
    return jsonify({
        "error": False,
        "facility_id": facility_id,
        "data": data
    })

@app.route("/api/logs")
def get_logs():
    return jsonify({
        "error": False,
        "logs": store.get_logs()
    })

@app.route("/api/override/cooling", methods=["POST"])
def override_cooling():
    data = request.get_json(silent=True) or {}
    facility_id = data.get("facility_id", "facility-dc-01")
    store.engage_cooling_override(facility_id)
    return jsonify({"error": False, "message": f"Auxiliary cooling protocol dispatched to {facility_id}"})

@app.route("/api/simulate/spike", methods=["POST"])
def simulate_spike():
    data = request.get_json(silent=True) or {}
    facility_id = data.get("facility_id", "facility-dc-01")
    delta = float(data.get("delta", 7.0))
    store.inject_heat_spike(facility_id, delta)
    return jsonify({"error": False, "message": f"Simulated heat spike (+{delta}°C) applied to {facility_id}"})

@app.route("/api/simulate/reset", methods=["POST"])
def simulate_reset():
    data = request.get_json(silent=True) or {}
    facility_id = data.get("facility_id", "facility-dc-01")
    store.reset_baseline(facility_id)
    return jsonify({"error": False, "message": f"Reset {facility_id} to baseline"})

@app.route("/api/export/summary")
def export_summary():
    """Generates an executive textual incident & telemetry summary report."""
    now_str = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC")
    facilities = store.get_all_facilities()
    logs = store.get_logs()

    lines = [
        "=" * 68,
        "               THERMALGUARD EXECUTIVE INCIDENT REPORT",
        f"               Generated: {now_str}",
        "               FortyGuard Hyperlocal 2m Telemetry Engine",
        "=" * 68,
        "",
        "FACILITY STATUS SNAPSHOT:",
        "-" * 68
    ]

    for f in facilities:
        r = f.get("risk", {})
        lines.append(f"• Facility: {f['name']} ({f['type']}) — {f['location_name']}")
        lines.append(f"  Current Temp: {f['temperature']}C (Baseline: {f['baseline_temp']}C | Delta: +{r.get('delta_baseline')}C)")
        lines.append(f"  Risk Level: {r.get('level', 'Normal').upper()} | Trend: {f.get('trend', {}).get('direction', 'stable').upper()}")
        lines.append(f"  Microclimate Heat Island Penalty: +{r.get('hyperlocal_delta', 0)}C vs Regional City Forecast")
        lines.append(f"  HVAC Chiller Load Penalty: +{r.get('chiller_load_penalty_pct', 0)}% (Est. +${r.get('extra_cooling_cost_hr', 0)}/hr)")
        lines.append(f"  Operational Protocol: {r.get('advice')}")
        lines.append("")

    lines.append("-" * 68)
    lines.append("RECENT INCIDENT AUDIT TRAIL:")
    lines.append("-" * 68)
    for log in list(logs)[:15]:
        lines.append(f"[{log['timestamp']}] [{log['severity'].upper()}] {log['source']}: {log['message']}")

    lines.append("")
    lines.append("=" * 68)
    lines.append("End of Report. FortyGuard Hackathon '26 (Track 03 - Industrial & Enterprise)")
    
    report_text = "\n".join(lines)
    return Response(
        report_text,
        mimetype="text/plain",
        headers={"Content-Disposition": "attachment;filename=thermalguard_incident_report.txt"}
    )

@app.route("/api/export/csv")
def export_csv():
    output = io.StringIO()
    writer = csv.writer(output)
    
    writer.writerow([
        "facility_id",
        "facility_name",
        "facility_type",
        "location",
        "timestamp_iso",
        "temperature_celsius",
        "baseline_temp",
        "delta_baseline",
        "city_ambient_estimate",
        "hyperlocal_uhi_penalty",
        "chiller_load_penalty_pct",
        "extra_cooling_cost_hr_usd",
        "risk_level",
        "data_source"
    ])

    for f in config.FACILITIES:
        f_id = f["id"]
        hist_data = store.get_facility_history(f_id)
        if not hist_data:
            continue
        
        fac_info = hist_data.get("facility", {})
        baseline = fac_info.get("baseline_temp", f["baseline_temp"])
        
        for pt in hist_data.get("history", []):
            temp = pt.get("temperature", 0.0)
            delta = round(temp - baseline, 2)
            source = "FortyGuard Live API" if pt.get("is_live_api") else "Telemetry Seeder"
            
            if temp >= f["thresholds"]["elevated_max"]:
                pt_risk = "Critical"
            elif temp >= f["thresholds"]["normal_max"]:
                pt_risk = "Elevated"
            else:
                pt_risk = "Normal"

            city_est = round(baseline + (delta * 0.45) - 1.2, 1)
            uhi_penalty = max(0.0, round(temp - city_est, 2))
            excess = max(0.0, delta)
            chiller_penalty = round(excess * 2.8, 1)
            extra_cost = round(excess * 4.25, 2)

            writer.writerow([
                f_id,
                f["name"],
                f["type"],
                f["location_name"],
                pt.get("time_str"),
                temp,
                baseline,
                delta,
                city_est,
                uhi_penalty,
                chiller_penalty,
                extra_cost,
                pt_risk,
                source
            ])

    output.seek(0)
    return Response(
        output.getvalue(),
        mimetype="text/csv",
        headers={"Content-Disposition": "attachment;filename=thermalguard_telemetry_export.csv"}
    )

@app.route("/api/poller/trigger", methods=["POST"])
def trigger_poll():
    import threading
    threading.Thread(target=poller._poll_all_facilities, daemon=True).start()
    return jsonify({"error": False, "message": "Manual polling cycle initiated"})

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=config.PORT, debug=config.DEBUG)
