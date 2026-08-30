"""
Risk evaluation engine for ThermalGuard.
Translates raw temperature readings, baseline deltas, and trend changes into operational risk signals.
Includes HVAC chiller efficiency penalty, microclimate heat island delta, and Time-to-Exceed (TTE) forecasting.
"""

def evaluate_risk(temp, thresholds, baseline_temp, trend_info=None):
    """
    Classifies risk into Normal, Elevated, or Critical based on facility-configured thresholds.
    Also estimates HVAC efficiency loss, cooling cost overhead, and Time-to-Exceed (TTE).
    """
    normal_max = thresholds.get("normal_max", 28.0)
    elevated_max = thresholds.get("elevated_max", 34.0)

    if temp >= elevated_max:
        level = "Critical"
        label = "Critical Thermal Load"
        color = "var(--risk-critical-border)"
        advice = "CRITICAL: Activate emergency auxiliary chillers. Initiate thermal load shedding across non-vital compute/machinery."
    elif temp >= normal_max:
        level = "Elevated"
        label = "Elevated Heat Stress"
        color = "var(--risk-elevated-border)"
        advice = "ELEVATED: Stage secondary water chillers and monitor roof-level intake vents for heat recirculation."
    else:
        level = "Normal"
        label = "Nominal Envelope"
        color = "var(--risk-normal-border)"
        advice = "NOMINAL: Ambient thermal conditions within manufacturer operating envelope. Normal chiller staging active."

    delta_baseline = round(temp - baseline_temp, 2)
    
    # Coarse city weather simulation (typically 2.5-4.5°C cooler than industrial microclimates)
    city_ambient = round(baseline_temp + (delta_baseline * 0.45) - 1.2, 1)
    hyperlocal_delta = round(temp - city_ambient, 2)

    # Chiller COP efficiency loss: ~2.8% extra energy per 1°C ambient rise above baseline
    excess_deg = max(0.0, temp - baseline_temp)
    chiller_load_penalty_pct = round(excess_deg * 2.8, 1)
    extra_cooling_cost_hr = round(excess_deg * 4.25, 2)

    # Time-to-Exceed (TTE) prediction
    tte_minutes = None
    tte_text = "Stable"
    if trend_info and trend_info.get("direction") == "rising" and temp < elevated_max:
        rate = trend_info.get("rate_per_period", 0.0) # degrees per ~2-5 min
        if rate > 0.15:
            remaining_deg = elevated_max - temp
            # 1 period ~= 2.5 minutes
            periods_to_breach = remaining_deg / rate
            est_minutes = max(2, round(periods_to_breach * 2.5))
            tte_minutes = est_minutes
            tte_text = f"~{est_minutes} min to Critical"

    return {
        "level": level,
        "label": label,
        "color": color,
        "advice": advice,
        "delta_baseline": delta_baseline,
        "city_ambient": city_ambient,
        "hyperlocal_delta": max(0.0, hyperlocal_delta),
        "chiller_load_penalty_pct": chiller_load_penalty_pct,
        "extra_cooling_cost_hr": extra_cooling_cost_hr,
        "tte_minutes": tte_minutes,
        "tte_text": tte_text
    }


def compute_trend(history):
    """
    Calculates short-term rate of change from the last few readings.
    """
    if not history or len(history) < 2:
        return {"direction": "stable", "rate_per_period": 0.0, "icon": "→"}

    recent = [item["temperature"] for item in history[-5:]]
    first = recent[0]
    latest = recent[-1]
    diff = round(latest - first, 2)

    if diff >= 0.3:
        return {"direction": "rising", "rate_per_period": diff, "icon": "↑"}
    elif diff <= -0.3:
        return {"direction": "falling", "rate_per_period": diff, "icon": "↓"}
    else:
        return {"direction": "stable", "rate_per_period": diff, "icon": "→"}
