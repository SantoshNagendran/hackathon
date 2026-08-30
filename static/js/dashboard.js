/**
 * ThermalGuard — Real-Time Facility Heat-Risk Dashboard Client
 * Vanilla JS & Hand-rolled HTML5 Canvas Rendering
 * Auto-refresh, Judge Simulator Tools, Audio Alarms, Spatial 2m Tiles, TTE Forecasting
 */

(function () {
  'use strict';

  // State
  let facilitiesData = [];
  let facilityHistories = {};
  let activeTooltips = {};
  let lastCriticalState = {};
  let countdownSeconds = 3;
  let countdownTimerId = null;
  let activeFilter = 'all';
  let searchQuery = '';
  let audioAlarmEnabled = true;
  let audioCtx = null;

  // DOM Elements
  const container = document.getElementById('facility-cards-container');
  const statTotalFacilities = document.getElementById('stat-total-facilities');
  const statCriticalCount = document.getElementById('stat-critical-count');
  const statPeakTemp = document.getElementById('stat-peak-temp');
  const statMaxUHI = document.getElementById('stat-max-uhi');
  const pollerDot = document.getElementById('poller-dot');
  const pollerStatusText = document.getElementById('poller-status-text');
  const refreshCountdown = document.getElementById('refresh-countdown');
  const themeToggleBtn = document.getElementById('theme-toggle');
  const themeIcon = document.getElementById('theme-icon');
  const themeLabel = document.getElementById('theme-label');
  const audioAlarmBtn = document.getElementById('audio-alarm-btn');
  const audioIcon = document.getElementById('audio-icon');
  const audioLabel = document.getElementById('audio-label');
  const notifyPermBtn = document.getElementById('notify-perm-btn');
  const notifyBtnText = document.getElementById('notify-btn-text');
  const pollTriggerBtn = document.getElementById('poll-trigger-btn');
  const pollSpinner = document.getElementById('poll-spinner');
  const alertBanner = document.getElementById('alert-banner');
  const alertBannerText = document.getElementById('alert-banner-text');
  const alertDismissBtn = document.getElementById('alert-dismiss-btn');
  const bannerOverrideBtn = document.getElementById('banner-override-btn');
  const auditLogList = document.getElementById('audit-log-list');
  const filterBtns = document.querySelectorAll('.filter-btn');
  const searchInput = document.getElementById('facility-search-input');

  // Simulator Buttons
  const simSpikeDc = document.getElementById('sim-spike-dc');
  const simSpikeWh = document.getElementById('sim-spike-wh');
  const simResetAll = document.getElementById('sim-reset-all');

  // ==========================================
  // 1. Theme Management (Dark / Light)
  // ==========================================
  function initTheme() {
    const saved = localStorage.getItem('tg_theme') || 'dark';
    applyTheme(saved);
  }

  function applyTheme(theme) {
    document.body.setAttribute('data-theme', theme);
    localStorage.setItem('tg_theme', theme);
    if (themeIcon && themeLabel) {
      if (theme === 'dark') {
        themeIcon.textContent = '☀️';
        themeLabel.textContent = 'Light';
      } else {
        themeIcon.textContent = '🌙';
        themeLabel.textContent = 'Dark';
      }
    }
    renderAllCanvases();
  }

  if (themeToggleBtn) {
    themeToggleBtn.addEventListener('click', () => {
      const cur = document.body.getAttribute('data-theme') || 'dark';
      applyTheme(cur === 'dark' ? 'light' : 'dark');
    });
  }

  // ==========================================
  // 2. Synthesized Web Audio Siren for Critical Alarms
  // ==========================================
  function playCriticalAlarmSound() {
    if (!audioAlarmEnabled) return;
    try {
      if (!audioCtx) {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      }
      if (audioCtx.state === 'suspended') {
        audioCtx.resume();
      }
      
      const now = audioCtx.currentTime;
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();

      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(880, now);
      osc.frequency.exponentialRampToValueAtTime(440, now + 0.25);
      osc.frequency.exponentialRampToValueAtTime(880, now + 0.5);

      gain.gain.setValueAtTime(0.12, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.5);

      osc.connect(gain);
      gain.connect(audioCtx.destination);

      osc.start(now);
      osc.stop(now + 0.5);
    } catch (e) {
      console.warn('Audio alarm synthesis error:', e);
    }
  }

  if (audioAlarmBtn) {
    audioAlarmBtn.addEventListener('click', () => {
      audioAlarmEnabled = !audioAlarmEnabled;
      if (audioIcon && audioLabel) {
        audioIcon.textContent = audioAlarmEnabled ? '🔊' : '🔇';
        audioLabel.textContent = audioAlarmEnabled ? 'Alarm: On' : 'Alarm: Muted';
      }
    });
  }

  // ==========================================
  // 3. Desktop Notifications & Banner
  // ==========================================
  function checkNotificationPermission() {
    if (!('Notification' in window)) {
      if (notifyPermBtn) notifyPermBtn.style.display = 'none';
      return;
    }

    if (Notification.permission === 'granted') {
      if (notifyBtnText) notifyBtnText.textContent = 'Alerts Active';
      if (notifyPermBtn) notifyPermBtn.classList.add('active');
    } else if (Notification.permission === 'denied') {
      if (notifyBtnText) notifyBtnText.textContent = 'Alerts Blocked';
    } else {
      if (notifyBtnText) notifyBtnText.textContent = 'Desktop Alerts';
    }
  }

  if (notifyPermBtn) {
    notifyPermBtn.addEventListener('click', () => {
      if (!('Notification' in window)) {
        alert('Browser notifications are not supported on this browser.');
        return;
      }
      Notification.requestPermission().then(permission => {
        checkNotificationPermission();
        if (permission === 'granted') {
          new Notification('ThermalGuard Alerts Active', {
            body: 'Operational heat-risk notifications enabled.',
            icon: '/static/favicon.ico'
          });
        }
      });
    });
  }

  function triggerCriticalNotification(facility) {
    const title = `🚨 Critical Thermal Alert: ${facility.name}`;
    const body = `Ambient temperature reached ${facility.temperature.toFixed(1)}°C (Nominal: ${facility.baseline_temp}°C). ${facility.risk.advice}`;
    
    // Play synthetic siren
    playCriticalAlarmSound();

    if (alertBanner && alertBannerText) {
      alertBannerText.textContent = `${facility.name} reached CRITICAL risk (${facility.temperature.toFixed(1)}°C). Immediate chiller dispatch required.`;
      alertBanner.style.display = 'flex';
      if (bannerOverrideBtn) {
        bannerOverrideBtn.onclick = () => triggerCoolingOverride(facility.facility_id);
      }
    }

    if ('Notification' in window && Notification.permission === 'granted') {
      try {
        new Notification(title, {
          body: body,
          requireInteraction: true
        });
      } catch (err) {
        console.warn('Notification error:', err);
      }
    }
  }

  if (alertDismissBtn && alertBanner) {
    alertDismissBtn.addEventListener('click', () => {
      alertBanner.style.display = 'none';
    });
  }

  // ==========================================
  // 4. Operational Cooling Override Dispatch
  // ==========================================
  async function triggerCoolingOverride(facilityId) {
    try {
      await fetch('/api/override/cooling', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ facility_id: facilityId })
      });
      if (alertBanner) alertBanner.style.display = 'none';
      fetchTelemetry();
    } catch (e) {
      console.error('Cooling override failed:', e);
    }
  }

  // ==========================================
  // 5. Simulator Tools (Judge Demo)
  // ==========================================
  async function triggerSimulationSpike(facilityId, delta) {
    try {
      await fetch('/api/simulate/spike', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ facility_id: facilityId, delta: delta })
      });
      fetchTelemetry();
    } catch (e) {
      console.error('Simulation spike failed:', e);
    }
  }

  async function triggerSimulationReset() {
    try {
      for (const fac of facilitiesData) {
        await fetch('/api/simulate/reset', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ facility_id: fac.facility_id })
        });
      }
      if (alertBanner) alertBanner.style.display = 'none';
      fetchTelemetry();
    } catch (e) {
      console.error('Simulation reset failed:', e);
    }
  }

  if (simSpikeDc) {
    simSpikeDc.addEventListener('click', () => triggerSimulationSpike('facility-dc-01', 7.2));
  }
  if (simSpikeWh) {
    simSpikeWh.addEventListener('click', () => triggerSimulationSpike('facility-wh-02', 6.0));
  }
  if (simResetAll) {
    simResetAll.addEventListener('click', triggerSimulationReset);
  }

  // ==========================================
  // 6. Filter and Search Handlers
  // ==========================================
  if (filterBtns) {
    filterBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        filterBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        activeFilter = btn.dataset.filter || 'all';
        applyFiltering();
      });
    });
  }

  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      searchQuery = e.target.value.toLowerCase().trim();
      applyFiltering();
    });
  }

  function applyFiltering() {
    facilitiesData.forEach(fac => {
      const card = document.getElementById(`card-${fac.facility_id}`);
      if (!card) return;

      const riskLevel = fac.risk ? fac.risk.level.toLowerCase() : 'normal';
      const matchesFilter = activeFilter === 'all' || riskLevel === activeFilter;
      const matchesSearch = !searchQuery || 
        fac.name.toLowerCase().includes(searchQuery) || 
        fac.location_name.toLowerCase().includes(searchQuery) ||
        fac.type.toLowerCase().includes(searchQuery);

      if (matchesFilter && matchesSearch) {
        card.style.display = 'flex';
      } else {
        card.style.display = 'none';
      }
    });
  }

  // ==========================================
  // 7. Data Polling & Auto-Refresh Loop
  // ==========================================
  function startAutoRefreshLoop() {
    if (countdownTimerId) clearInterval(countdownTimerId);
    
    countdownSeconds = 3;
    if (refreshCountdown) refreshCountdown.textContent = `${countdownSeconds}s`;

    countdownTimerId = setInterval(() => {
      countdownSeconds -= 1;
      if (refreshCountdown) {
        refreshCountdown.textContent = `${countdownSeconds}s`;
      }

      if (countdownSeconds <= 0) {
        countdownSeconds = 3;
        fetchTelemetry();
      }
    }, 1000);
  }

  async function fetchTelemetry() {
    try {
      const res = await fetch('/api/facilities');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      
      facilitiesData = json.facilities || [];
      updateTelemetryBar(json.facilities, json.poller_status);
      renderFacilityCards(facilitiesData);
      updateAuditLogs(json.logs || []);
      applyFiltering();
      
      for (const fac of facilitiesData) {
        fetchFacilityHistory(fac.facility_id);
      }

      checkCriticalRisks(facilitiesData);

    } catch (err) {
      console.warn('Telemetry fetch error:', err);
      if (pollerDot) pollerDot.className = 'status-indicator-dot error';
      if (pollerStatusText) pollerStatusText.textContent = 'Disconnected';
    }
  }

  async function fetchFacilityHistory(facilityId) {
    try {
      const res = await fetch(`/api/facilities/${facilityId}/history`);
      if (!res.ok) return;
      const json = await res.json();
      if (json.data && json.data.history) {
        facilityHistories[facilityId] = json.data.history;
        drawCanvasChart(facilityId);
      }
    } catch (e) {
      console.error(`Failed to fetch history for ${facilityId}:`, e);
    }
  }

  function updateTelemetryBar(facilities, pollerStatus) {
    if (statTotalFacilities) {
      statTotalFacilities.textContent = `${facilities.length} Sites`;
    }

    let criticals = 0;
    let peak = -Infinity;
    let maxUHI = 0;

    facilities.forEach(f => {
      if (f.risk && f.risk.level === 'Critical') criticals++;
      if (f.temperature > peak) peak = f.temperature;
      if (f.risk && f.risk.hyperlocal_delta > maxUHI) maxUHI = f.risk.hyperlocal_delta;
    });

    if (statCriticalCount) {
      statCriticalCount.textContent = criticals;
      statCriticalCount.className = criticals > 0 ? 'stat-value stat-alert' : 'stat-value';
    }

    if (statPeakTemp) {
      statPeakTemp.textContent = peak > -Infinity ? `${peak.toFixed(1)} °C` : '--.- °C';
    }

    if (statMaxUHI) {
      statMaxUHI.textContent = `+${maxUHI.toFixed(1)} °C`;
    }

    if (pollerDot && pollerStatusText) {
      const st = pollerStatus ? pollerStatus.status : 'idle';
      if (st === 'polling') {
        pollerDot.className = 'status-indicator-dot polling';
        pollerStatusText.textContent = 'Fetching 2m Grid';
      } else if (st === 'error') {
        pollerDot.className = 'status-indicator-dot error';
        pollerStatusText.textContent = 'Degraded (Fallback)';
      } else {
        pollerDot.className = 'status-indicator-dot';
        pollerStatusText.textContent = 'Connected (FortyGuard)';
      }
    }
  }

  function updateAuditLogs(logs) {
    if (!auditLogList) return;
    if (logs.length === 0) {
      auditLogList.innerHTML = '<li class="audit-log-empty">No logged operational incidents yet.</li>';
      return;
    }

    auditLogList.innerHTML = logs.map(l => `
      <li class="audit-log-item">
        <span class="log-time">${l.timestamp}</span>
        <span class="log-source">${l.source}</span>
        <span class="log-msg">${l.message}</span>
        <span class="log-severity-tag ${l.severity}">${l.severity}</span>
      </li>
    `).join('');
  }

  function checkCriticalRisks(facilities) {
    facilities.forEach(f => {
      const isCritical = f.risk && f.risk.level === 'Critical';
      const wasCritical = !!lastCriticalState[f.facility_id];

      if (isCritical && !wasCritical) {
        triggerCriticalNotification(f);
      }
      lastCriticalState[f.facility_id] = isCritical;
    });
  }

  // ==========================================
  // 8. Facility Card Rendering
  // ==========================================
  function renderFacilityCards(facilities) {
    if (!container) return;

    facilities.forEach(fac => {
      let card = document.getElementById(`card-${fac.facility_id}`);
      if (!card) {
        card = createFacilityCardElement(fac);
        container.appendChild(card);
        setupCanvasEvents(fac.facility_id);
      }
      updateFacilityCardContent(card, fac);
    });

    const skeleton = container.querySelector('.card-skeleton');
    if (skeleton) skeleton.remove();
  }

  function createFacilityCardElement(fac) {
    const card = document.createElement('article');
    card.id = `card-${fac.facility_id}`;
    card.className = 'facility-card';

    card.innerHTML = `
      <div class="card-header-row">
        <div>
          <h3 class="facility-name">${fac.name}</h3>
          <div class="facility-type-loc">
            <span class="facility-type-badge">${fac.type}</span>
            <span>&middot;</span>
            <span>${fac.location_name}</span>
          </div>
        </div>
        <div class="risk-badge" id="risk-badge-${fac.facility_id}">
          <span class="risk-badge-text">Normal</span>
        </div>
      </div>

      <div class="metrics-row">
        <div class="temp-hero">
          <span class="temp-number" id="temp-val-${fac.facility_id}">--.-</span>
          <span class="temp-unit">&deg;C</span>
        </div>
        <div class="metric-pill-group">
          <div class="trend-badge" id="trend-badge-${fac.facility_id}">
            <span id="trend-arrow-${fac.facility_id}">&rarr;</span>
            <span id="trend-text-${fac.facility_id}">Stable</span>
          </div>
          <span class="tte-pill" id="tte-pill-${fac.facility_id}" style="display: none;"></span>
          <span class="baseline-diff" id="baseline-diff-${fac.facility_id}">+0.0&deg;C vs nominal</span>
        </div>
      </div>

      <!-- Hyperlocal 2m vs Regional Weather & HVAC Load Insight -->
      <div class="hyperlocal-insight-row">
        <div class="insight-chip">
          <span class="insight-chip-title">City Weather vs 2m Microclimate</span>
          <span class="insight-chip-val highlight-uhi" id="uhi-val-${fac.facility_id}">+0.0&deg;C Heat Island</span>
        </div>
        <div class="insight-chip">
          <span class="insight-chip-title">Chiller Load Penalty / Cost</span>
          <span class="insight-chip-val" id="hvac-val-${fac.facility_id}">+0.0% (+$0.00/hr)</span>
        </div>
      </div>

      <!-- 2m Spatial Microclimate Mini-Grid (Judge feature) -->
      <div class="micro-spatial-grid-wrap">
        <div class="micro-grid-label">
          <span>Hyperlocal 2m Spatial Hotspots</span>
          <span>40m AOI</span>
        </div>
        <div class="micro-grid-cells" id="micro-grid-${fac.facility_id}">
          <!-- Populated by update -->
        </div>
      </div>

      <div class="threshold-bar">
        <div class="threshold-item">Nominal: <span id="thresh-base-${fac.facility_id}">${fac.baseline_temp}&deg;C</span></div>
        <div class="threshold-item">Elevated: <span id="thresh-elev-${fac.facility_id}">${fac.thresholds.normal_max}&deg;C</span></div>
        <div class="threshold-item">Critical: <span id="thresh-crit-${fac.facility_id}">${fac.thresholds.elevated_max}&deg;C</span></div>
      </div>

      <div class="advisory-box" id="advisory-${fac.facility_id}">
        ${fac.risk ? fac.risk.advice : 'Loading thermal metrics...'}
      </div>

      <div class="chart-container" id="chart-wrap-${fac.facility_id}">
        <canvas class="chart-canvas" id="canvas-${fac.facility_id}"></canvas>
        <div class="chart-tooltip" id="tooltip-${fac.facility_id}"></div>
      </div>

      <div class="card-actions-row">
        <button class="btn-cooling-dispatch" id="cooling-btn-${fac.facility_id}">
          ⚡ Deploy Auxiliary Chiller Protocol
        </button>
        <div class="api-source-badge">
          <span class="source-dot ${fac.is_live_api ? '' : 'cached'}"></span>
          <span id="source-label-${fac.facility_id}">${fac.is_live_api ? 'FortyGuard Live API' : 'Cached Baseline'}</span>
        </div>
      </div>
    `;

    return card;
  }

  function updateFacilityCardContent(card, fac) {
    const riskLevel = fac.risk ? fac.risk.level.toLowerCase() : 'normal';
    
    card.classList.remove('is-critical', 'is-elevated');
    if (riskLevel === 'critical') card.classList.add('is-critical');
    if (riskLevel === 'elevated') card.classList.add('is-elevated');

    const badge = document.getElementById(`risk-badge-${fac.facility_id}`);
    if (badge) {
      badge.className = `risk-badge ${riskLevel}`;
      badge.innerHTML = `<span>${fac.risk ? fac.risk.label : 'Normal'}</span>`;
    }

    const tempVal = document.getElementById(`temp-val-${fac.facility_id}`);
    if (tempVal) {
      tempVal.textContent = Number(fac.temperature).toFixed(1);
    }

    const trendBadge = document.getElementById(`trend-badge-${fac.facility_id}`);
    const trendArrow = document.getElementById(`trend-arrow-${fac.facility_id}`);
    const trendText = document.getElementById(`trend-text-${fac.facility_id}`);
    if (trendBadge && fac.trend) {
      trendBadge.className = `trend-badge ${fac.trend.direction}`;
      if (trendArrow) trendArrow.textContent = fac.trend.icon;
      if (trendText) {
        const rate = Math.abs(fac.trend.rate_per_period);
        trendText.textContent = `${fac.trend.direction.toUpperCase()} (${rate > 0 ? '+' : ''}${fac.trend.rate_per_period}°C)`;
      }
    }

    // Time-To-Exceed (TTE) pill
    const ttePill = document.getElementById(`tte-pill-${fac.facility_id}`);
    if (ttePill && fac.risk) {
      if (fac.risk.tte_minutes) {
        ttePill.style.display = 'inline-block';
        ttePill.textContent = `⏱️ ${fac.risk.tte_text}`;
      } else {
        ttePill.style.display = 'none';
      }
    }

    const baseDiff = document.getElementById(`baseline-diff-${fac.facility_id}`);
    if (baseDiff && fac.risk) {
      const delta = fac.risk.delta_baseline;
      const sign = delta >= 0 ? '+' : '';
      baseDiff.textContent = `${sign}${delta}°C vs baseline (${fac.baseline_temp}°C)`;
    }

    const uhiVal = document.getElementById(`uhi-val-${fac.facility_id}`);
    if (uhiVal && fac.risk) {
      uhiVal.textContent = `+${fac.risk.hyperlocal_delta}°C vs City Forecast (${fac.risk.city_ambient}°C)`;
    }

    const hvacVal = document.getElementById(`hvac-val-${fac.facility_id}`);
    if (hvacVal && fac.risk) {
      hvacVal.textContent = `+${fac.risk.chiller_load_penalty_pct}% Load (+$${fac.risk.extra_cooling_cost_hr.toFixed(2)}/hr)`;
    }

    // Render 2m Spatial Microclimate tiles
    const microGrid = document.getElementById(`micro-grid-${fac.facility_id}`);
    if (microGrid && fac.heatmap_tiles) {
      microGrid.innerHTML = fac.heatmap_tiles.map(t => {
        const isHot = t.temperature >= fac.thresholds.normal_max;
        return `
          <div class="micro-tile ${isHot ? 'hotspot' : ''}">
            <span class="tile-name" title="${t.zone_name}">${t.zone_name}</span>
            <span class="tile-temp">${t.temperature}°</span>
          </div>
        `;
      }).join('');
    }

    const adv = document.getElementById(`advisory-${fac.facility_id}`);
    if (adv && fac.risk) {
      adv.textContent = fac.risk.advice;
      adv.className = `advisory-box ${riskLevel}-advisory`;
    }

    const coolingBtn = document.getElementById(`cooling-btn-${fac.facility_id}`);
    if (coolingBtn) {
      coolingBtn.onclick = () => triggerCoolingOverride(fac.facility_id);
    }

    const src = document.getElementById(`source-label-${fac.facility_id}`);
    if (src) {
      src.textContent = fac.is_live_api ? 'FortyGuard Live API' : 'Cached Baseline';
    }
  }

  // ==========================================
  // 9. Canvas Graph Rendering
  // ==========================================
  function renderAllCanvases() {
    Object.keys(facilityHistories).forEach(fId => {
      drawCanvasChart(fId);
    });
  }

  function drawCanvasChart(facilityId) {
    const canvas = document.getElementById(`canvas-${facilityId}`);
    if (!canvas) return;

    const history = facilityHistories[facilityId] || [];
    if (history.length === 0) return;

    const facility = facilitiesData.find(f => f.facility_id === facilityId);
    const thresholds = facility ? facility.thresholds : { normal_max: 28, elevated_max: 34 };

    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();

    const width = rect.width;
    const height = rect.height;

    if (canvas.width !== width * dpr || canvas.height !== height * dpr) {
      canvas.width = width * dpr;
      canvas.height = height * dpr;
    }

    ctx.save();
    ctx.scale(dpr, dpr);

    const isDark = document.body.getAttribute('data-theme') !== 'light';
    const gridColor = isDark ? 'rgba(255, 255, 255, 0.06)' : 'rgba(0, 0, 0, 0.06)';
    const textColor = isDark ? '#64748b' : '#94a3b8';
    const textFont = '10px "JetBrains Mono", monospace';
    
    const currentRisk = facility && facility.risk ? facility.risk.level : 'Normal';
    let strokeColor = '#38bdf8';
    let glowColor = 'rgba(56, 189, 248, 0.3)';
    let gradientStart = 'rgba(56, 189, 248, 0.35)';
    let gradientEnd = 'rgba(56, 189, 248, 0.0)';

    if (currentRisk === 'Critical') {
      strokeColor = '#ef4444';
      glowColor = 'rgba(239, 68, 68, 0.5)';
      gradientStart = 'rgba(239, 68, 68, 0.4)';
      gradientEnd = 'rgba(239, 68, 68, 0.0)';
    } else if (currentRisk === 'Elevated') {
      strokeColor = '#f59e0b';
      glowColor = 'rgba(245, 158, 11, 0.4)';
      gradientStart = 'rgba(245, 158, 11, 0.35)';
      gradientEnd = 'rgba(245, 158, 11, 0.0)';
    }

    const padLeft = 36;
    const padRight = 14;
    const padTop = 16;
    const padBottom = 20;
    const plotW = width - padLeft - padRight;
    const plotH = height - padTop - padBottom;

    ctx.clearRect(0, 0, width, height);

    const temps = history.map(p => p.temperature);
    let minT = Math.min(...temps, facility ? facility.baseline_temp - 1 : 20);
    let maxT = Math.max(...temps, thresholds.elevated_max + 1);

    minT = Math.floor(minT - 1);
    maxT = Math.ceil(maxT + 1);
    const rangeT = maxT - minT || 1;

    function getY(temp) {
      return padTop + plotH - ((temp - minT) / rangeT) * plotH;
    }
    function getX(index) {
      if (history.length <= 1) return padLeft + plotW / 2;
      return padLeft + (index / (history.length - 1)) * plotW;
    }

    ctx.font = textFont;
    ctx.fillStyle = textColor;
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';

    const yStep = Math.max(2, Math.round(rangeT / 4));
    for (let t = minT; t <= maxT; t += yStep) {
      const y = getY(t);
      if (y >= padTop && y <= padTop + plotH) {
        ctx.beginPath();
        ctx.strokeStyle = gridColor;
        ctx.lineWidth = 1;
        ctx.setLineDash([]);
        ctx.moveTo(padLeft, y);
        ctx.lineTo(width - padRight, y);
        ctx.stroke();

        ctx.fillText(`${t}°`, padLeft - 6, y);
      }
    }

    if (thresholds.normal_max >= minT && thresholds.normal_max <= maxT) {
      const yNorm = getY(thresholds.normal_max);
      ctx.beginPath();
      ctx.strokeStyle = 'rgba(245, 158, 11, 0.45)';
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 4]);
      ctx.moveTo(padLeft, yNorm);
      ctx.lineTo(width - padRight, yNorm);
      ctx.stroke();
    }

    if (thresholds.elevated_max >= minT && thresholds.elevated_max <= maxT) {
      const yCrit = getY(thresholds.elevated_max);
      ctx.beginPath();
      ctx.strokeStyle = 'rgba(239, 68, 68, 0.55)';
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 4]);
      ctx.moveTo(padLeft, yCrit);
      ctx.lineTo(width - padRight, yCrit);
      ctx.stroke();
    }
    ctx.setLineDash([]);

    if (history.length > 1) {
      const grad = ctx.createLinearGradient(0, padTop, 0, padTop + plotH);
      grad.addColorStop(0, gradientStart);
      grad.addColorStop(1, gradientEnd);

      ctx.beginPath();
      ctx.moveTo(getX(0), getY(history[0].temperature));
      for (let i = 1; i < history.length; i++) {
        ctx.lineTo(getX(i), getY(history[i].temperature));
      }
      ctx.lineTo(getX(history.length - 1), padTop + plotH);
      ctx.lineTo(getX(0), padTop + plotH);
      ctx.closePath();
      ctx.fillStyle = grad;
      ctx.fill();
    }

    if (history.length > 1) {
      ctx.beginPath();
      ctx.strokeStyle = strokeColor;
      ctx.lineWidth = 2.2;
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      ctx.shadowColor = glowColor;
      ctx.shadowBlur = 8;

      ctx.moveTo(getX(0), getY(history[0].temperature));
      for (let i = 1; i < history.length; i++) {
        ctx.lineTo(getX(i), getY(history[i].temperature));
      }
      ctx.stroke();
      ctx.shadowBlur = 0;
    }

    history.forEach((pt, i) => {
      const x = getX(i);
      const y = getY(pt.temperature);
      const isLatest = i === history.length - 1;

      ctx.beginPath();
      ctx.arc(x, y, isLatest ? 4.5 : 2.5, 0, Math.PI * 2);
      ctx.fillStyle = isLatest ? '#ffffff' : strokeColor;
      ctx.fill();
      ctx.strokeStyle = strokeColor;
      ctx.lineWidth = 1.5;
      ctx.stroke();
    });

    if (history.length > 0) {
      ctx.fillStyle = textColor;
      ctx.font = textFont;
      ctx.textBaseline = 'top';
      ctx.textAlign = 'left';
      ctx.fillText(history[0].time_str || '', padLeft, padTop + plotH + 4);
      ctx.textAlign = 'right';
      ctx.fillText(history[history.length - 1].time_str || '', width - padRight, padTop + plotH + 4);
    }

    const activeHover = activeTooltips[facilityId];
    if (activeHover && activeHover.index !== undefined) {
      const hx = getX(activeHover.index);
      const hy = getY(history[activeHover.index].temperature);

      ctx.beginPath();
      ctx.strokeStyle = isDark ? 'rgba(255, 255, 255, 0.25)' : 'rgba(0, 0, 0, 0.2)';
      ctx.lineWidth = 1;
      ctx.setLineDash([2, 2]);
      ctx.moveTo(hx, padTop);
      ctx.lineTo(hx, padTop + plotH);
      ctx.stroke();
      ctx.setLineDash([]);

      ctx.beginPath();
      ctx.arc(hx, hy, 5.5, 0, Math.PI * 2);
      ctx.fillStyle = strokeColor;
      ctx.fill();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    ctx.restore();
  }

  function setupCanvasEvents(facilityId) {
    const wrap = document.getElementById(`chart-wrap-${facilityId}`);
    const canvas = document.getElementById(`canvas-${facilityId}`);
    const tooltip = document.getElementById(`tooltip-${facilityId}`);
    if (!wrap || !canvas || !tooltip) return;

    canvas.addEventListener('mousemove', (e) => {
      const history = facilityHistories[facilityId] || [];
      if (history.length === 0) return;

      const rect = canvas.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const padLeft = 36;
      const padRight = 14;
      const plotW = rect.width - padLeft - padRight;

      if (mouseX < padLeft || mouseX > rect.width - padRight) {
        tooltip.style.display = 'none';
        activeTooltips[facilityId] = null;
        drawCanvasChart(facilityId);
        return;
      }

      const ratio = (mouseX - padLeft) / plotW;
      const nearestIdx = Math.min(
        history.length - 1,
        Math.max(0, Math.round(ratio * (history.length - 1)))
      );
      const pt = history[nearestIdx];

      activeTooltips[facilityId] = { index: nearestIdx, point: pt };
      drawCanvasChart(facilityId);

      tooltip.style.display = 'block';
      tooltip.innerHTML = `<strong>${pt.temperature.toFixed(2)} °C</strong><br><span style="opacity:0.8;font-size:10px;">${pt.time_str}</span>`;
      
      const ttX = Math.min(rect.width - 90, Math.max(10, mouseX - 35));
      tooltip.style.left = `${ttX}px`;
      tooltip.style.top = `6px`;
    });

    canvas.addEventListener('mouseleave', () => {
      tooltip.style.display = 'none';
      activeTooltips[facilityId] = null;
      drawCanvasChart(facilityId);
    });

    const resizeObserver = new ResizeObserver(() => {
      drawCanvasChart(facilityId);
    });
    resizeObserver.observe(wrap);
  }

  // ==========================================
  // 10. Initialization
  // ==========================================
  function init() {
    initTheme();
    checkNotificationPermission();
    fetchTelemetry();
    startAutoRefreshLoop();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
