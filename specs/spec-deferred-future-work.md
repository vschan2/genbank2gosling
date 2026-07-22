# Spec — Deferred Future Work

A holding area for future-facing decisions raised while designing the Gosling visualization layer (`spec-002-gosling-visualization.md`), explicitly **out of scope for now**. Server deployment is a long-term goal, not a near-term one — the immediate priority is proving the two example genome clusters visualize correctly locally (see spec-002's "Immediate goal"). Nothing here should be implemented until it's promoted into its own dated spec with real requirements behind it; this file just prevents the reasoning from being lost.

## Server deployment shape

- **Subdomain split**: `app.example.com` for the Next.js/React app, `higlass.example.com` for higlass-server, each behind a reverse proxy (nginx/Caddy) with its own TLS cert. Standard pattern for two independently-deployable services in one repo.
- **CORS**: only needs configuring on higlass-server's side (`django-cors-headers`, already in its `requirements.txt`) to allow the app's origin. Gosling's multivec track fetches tiles directly from the browser to higlass-server, so that's the one real cross-origin hop. The Next.js app's own API routes (`/api/genomes/...`) are called by its own frontend on the same origin — no CORS needed there unless a third service is added later that calls in cross-origin.
- **higlass-server production hardening**: `manage.py runserver` (used locally, see spec-002) is a Django dev server, not meant for production regardless of Docker vs. source install. A real deployment would front it with gunicorn/uwsgi. This is an orthogonal decision to Docker-vs-source (already resolved: source install, for reasons in spec-002) — revisit only once a real server target exists.
- **RAM/footprint on a VPS**: the ~6GB figure that ruled out Docker locally was almost certainly Docker Desktop's own WSL2 overhead (see spec-002's corrected reasoning), not higlass-server's actual usage — a bare VPS running the source install directly shouldn't hit that. Worth confirming with real numbers once an actual VPS is in play, not assumed.

## Next.js API routes → FastAPI

- **Current (near-term) design**, per spec-002: Next.js API routes read `output/` files server-side to hand to the browser, and — if a pipeline-trigger UI is ever built — would spawn `scripts/stageN_*.py` as subprocesses directly. No FastAPI, no separate pipeline service.
- **When to revisit**: only once the pipeline needs to run as its own scalable/remote process — multi-user access, job queuing, or running independently of the web server's own process lifecycle. Spawning subprocesses from a Node server works fine for one local user; it's a poor fit once several users could trigger runs concurrently or the pipeline needs to survive a web-server restart/redeploy.
- **Shape if/when it happens**: `scripts/` gets wrapped as FastAPI endpoints (e.g. `POST /pipeline/run`, `GET /pipeline/status/<job_id>`), and `web/`'s existing `/api/genomes/...` and (if built) `/api/run-pipeline` routes become thin proxies to that service instead of doing the file-reading/subprocess-spawning themselves. The frontend's `fetch()` calls shouldn't need to change — only what's behind the same-origin API routes.

## Server-side / production project structure

- Revisit directory layout once deployment is actually near-term: where higlass-server's data cache (`hg-data/`) lives in a deployed environment, how pipeline output is persisted/served for more than one local run (still flat files? object storage?), and whether multiple users means outputs need per-user namespacing.
- Not scoped now — premature to design storage/multi-tenancy for a single-user local tool.

## Not yet decided (parking lot, no reasoning yet)

- Hosting provider/VPS specifics.
- CI/CD for either the Next.js app or higlass-server.
- Auth, if the tool ever becomes multi-user.
- Backup/retention strategy for pipeline outputs in a deployed setting.
