"""
Throwaway test script to verify FortyGuard Temperature API async submit -> poll -> result workflow.
Run with: py test_api_roundtrip.py
"""

import time
from datetime import datetime, timezone
import requests
import config

def test_roundtrip():
    if not config.API_KEY:
        print("[!] FORTYGUARD_API_KEY is empty in .env. Please set it before running real requests.")
        return

    headers = {
        "api-key": config.API_KEY,
        "x-api-key": config.API_KEY,
        "Content-Type": "application/json"
    }

    sample_facility = config.FACILITIES[0]
    
    # FortyGuard expects current or recent date_time
    now = datetime.now(timezone.utc)
    date_str = now.strftime("%Y-%m-%d")
    time_str = now.strftime("%H:00")

    payload = {
        "polygon_aoi": sample_facility["polygon_aoi"],
        "date_time": {
            "start_date": date_str,
            "start_time": time_str,
            "filter_type": 1
        },
        "granularity": 100
    }

    print(f"[*] Submitting heatmap request for {sample_facility['name']}...")
    print(f"[*] Endpoint: {config.BASE_URL}/heatmap")
    print(f"[*] Date/Time: {date_str} {time_str}")

    try:
        submit_url = f"{config.BASE_URL}/heatmap"
        res = requests.post(submit_url, json=payload, headers=headers, timeout=15)
        
        print(f"[>] Submit status code: {res.status_code}")
        print(f"[>] Response body: {res.text}")

        if res.status_code not in (200, 201, 202):
            print("[!] Submit failed. Checking alternative endpoints if needed...")
            return

        data = res.json()
        payload_data = data.get("data") if isinstance(data.get("data"), dict) else {}
        activity_id = payload_data.get("activity_id") or data.get("activity_id") or data.get("id")
        print(f"[+] Extracted Activity ID: {activity_id}")

        if not activity_id:
            print("[!] No activity_id returned in response object.")
            return

        # Poll status endpoint
        max_attempts = 20
        poll_interval = 3
        status_url = f"{config.BASE_URL}/status/{activity_id}"
        print(f"[*] Polling {status_url} ...")

        for attempt in range(1, max_attempts + 1):
            poll_res = requests.get(status_url, headers=headers, timeout=15)
            if poll_res.status_code != 200:
                print(f"[!] Poll response {poll_res.status_code}: {poll_res.text}")
                time.sleep(poll_interval)
                continue

            poll_data = poll_res.json()
            print(f"[>] Attempt {attempt}/{max_attempts} -> Raw Poll Response: {poll_data}")
            
            # Check for status in root or inside data
            data_field = poll_data.get("data") if isinstance(poll_data.get("data"), dict) else {}
            status = str(poll_data.get("status") or data_field.get("status") or "").lower()
            activity_status = str(data_field.get("activity_status") or "").lower()
            combined_status = status or activity_status

            if combined_status in ("completed", "ready", "success", "done"):
                print("[+] Request completed successfully!")
                print(f"[+] Result summary: {poll_data}")
                return
            elif combined_status in ("failed", "error"):
                print(f"[!] Request failed: {poll_data}")
                return

            time.sleep(poll_interval)

        print("[!] Polling timed out waiting for completed status.")

    except requests.exceptions.RequestException as err:
        print(f"[!] Network / Request exception: {err}")

if __name__ == "__main__":
    test_roundtrip()
