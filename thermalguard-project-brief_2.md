# Project Brief: ThermalGuard

Keep this file in the repo root (e.g. `PROJECT.md`) so any agent session can
read it for context without me re-explaining the project from scratch.

## What this is

ThermalGuard is a hackathon submission for **FortyGuard Hackathon'26**,
built for **Track 03 — Industrial & Enterprise**. It's a real-time facility
heat-risk dashboard: it polls FortyGuard's hyperlocal Temperature API for a
handful of facility locations and turns raw temperature data into an
operational risk signal (Normal / Elevated / Critical) that a facilities or
operations manager could act on — think data center cooling risk, warehouse
worker safety, industrial thermal risk.

## Why this track / this idea

- Track 03 asks for tools that turn heat intelligence into operational and
  business decisions — logistics, data centers, industrial risk.
- This is a direct extension of an existing project of mine, **DevPulse**
  (a Flask/psutil real-time system monitoring dashboard). Same shape —
  live polling loop, Canvas-drawn history graphs, dark/light mode, CSV
  export, browser notifications — applied to a new data source
  (temperature instead of system metrics).
- Goal is a fast, credible build using patterns I already know well, rather
  than learning a new stack under hackathon time pressure.

## Who's building it

Solo (or small team, TBD) — Santosh, 3rd-year Diploma CSE student, working
toward a Cloud Engineer path. This project is also meant to double as a
portfolio piece relevant to cloud/ops-monitoring work.

## Core user story

"As a facilities/ops manager, I want to see at a glance whether any of my
sites are heading into dangerous heat territory, so I can act before it
becomes a cooling failure, safety incident, or equipment risk."

## Functional scope (v1 — hackathon deadline)

- Monitor 2–3 hardcoded facility locations (real coordinates, wrapped as
  small polygon AOIs for the FortyGuard API)
- Background poller hits FortyGuard's Temperature API per facility on an
  interval (async submit → poll → result pattern)
- Store latest reading + short rolling history per facility
- Rule-based risk scorer: Normal / Elevated / Critical based on thresholds
  (explicitly NOT a trained ML model — keep the pitch honest about this)
- Dashboard UI: facility cards, Canvas-drawn history graph, trend indicator,
  dark/light toggle, CSV export of history
- Browser notification when a facility crosses into Critical

## Explicitly out of scope for v1

- Real ML/forecasting models (that's Track 05 territory, not this build)
- User accounts / auth / multi-tenant anything
- Arbitrary user-added facilities (hardcoded list is fine for a demo)
- Mobile app — web dashboard only

## Tech stack

- Backend: Python + Flask (`templates/`, `static/` folders; `app.run()`
  last line — established convention)
- Frontend: vanilla JS, HTML5 Canvas for graphs, hand-written CSS (no chart
  libraries, no CSS frameworks)
- Data: FortyGuard Temperature API (async submit/poll pattern, polygon AOI
  input) — exact endpoint/auth details TBD, confirm against real docs before
  building against them
- Deploy: Railway (same as DevPulse)

## Known constraints

- Dev machine: Windows (HP OMEN, 16GB RAM), VS Code + Git Bash, `py` for
  Python, `py -m pip install` for pip
- Hackathon timeline is short — every feature addition should be weighed
  against demo-readiness, not completeness

## Reference project (same author, same patterns)

DevPulse — github.com/SantoshNagendran/devpulse — real-time system health
dashboard, same architectural shape this project is extending.

## Status

Not yet started. This brief exists to keep any coding agent session aligned
on scope, stack, and intent without re-deriving it each time.
