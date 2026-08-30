import os
from dotenv import load_dotenv

load_dotenv()

API_KEY = os.getenv("FORTYGUARD_API_KEY", "")
BASE_URL = os.getenv("FORTYGUARD_BASE_URL", "https://api.fortyguard.com/v1").rstrip("/")
POLL_INTERVAL = int(os.getenv("POLL_INTERVAL_SECONDS", "30"))
PORT = int(os.getenv("FLASK_PORT", "5000"))
DEBUG = os.getenv("FLASK_DEBUG", "True").lower() in ("true", "1", "yes")

# Hardcoded facilities for the demo
FACILITIES = [
    {
        "id": "facility-dc-01",
        "name": "North Gate Data Center",
        "type": "Data Center Campus",
        "location_name": "Ashburn, VA",
        "polygon_aoi": {
            "type": "Polygon",
            "coordinates": [
                [
                    [-77.4875, 39.0438],
                    [-77.4865, 39.0438],
                    [-77.4865, 39.0446],
                    [-77.4875, 39.0446],
                    [-77.4875, 39.0438]
                ]
            ]
        },
        "thresholds": {
            "normal_max": 28.0,
            "elevated_max": 34.0
        },
        "baseline_temp": 24.5
    },
    {
        "id": "facility-wh-02",
        "name": "Apex Logistics Hub",
        "type": "Warehouse & Logistics",
        "location_name": "Phoenix, AZ",
        "polygon_aoi": {
            "type": "Polygon",
            "coordinates": [
                [
                    [-112.0740, 33.4484],
                    [-112.0728, 33.4484],
                    [-112.0728, 33.4495],
                    [-112.0740, 33.4495],
                    [-112.0740, 33.4484]
                ]
            ]
        },
        "thresholds": {
            "normal_max": 33.0,
            "elevated_max": 40.0
        },
        "baseline_temp": 30.0
    },
    {
        "id": "facility-ind-03",
        "name": "Ironworks Smelting & Assembly",
        "type": "Heavy Industrial Plant",
        "location_name": "Gary, IN",
        "polygon_aoi": {
            "type": "Polygon",
            "coordinates": [
                [
                    [-87.3465, 41.5934],
                    [-87.3450, 41.5934],
                    [-87.3450, 41.5948],
                    [-87.3465, 41.5948],
                    [-87.3465, 41.5934]
                ]
            ]
        },
        "thresholds": {
            "normal_max": 30.0,
            "elevated_max": 37.0
        },
        "baseline_temp": 26.0
    }
]
