# Camera Ledger

Standalone, local-first proof of concept for reviewing transactions beside camera context. Independent repository: no JuanCarta code, data, credentials, or services.

## Run the demo

With Docker Desktop running:

```sh
docker compose up --build -d
```

Open http://localhost:3040. First launch creates three sample transactions, a mock counter camera, and ±30-second windows. Open a transaction to play the included synthetic eight-second clip and inspect event metadata. Add a transaction, edit cameras, or change the review window in the UI. The mock clip repeats the same illustration for every transaction; it is not time-aligned footage. Mock events are generated per requested window, not detections.

Without Docker (Node 22+):

```sh
npm ci
npm run dev
```

The native server binds to 127.0.0.1:3040. For a production build: `npm run build && npm start`.

## How matching works

Each transaction has a UTC timestamp and register key. Each camera is assigned to a register. Every camera with the same register receives a review window:

```
start = transaction time + camera clock offset - seconds before
end   = transaction time + camera clock offset + seconds after
```

An event overlaps when `event.start <= window.end` and `event.end >= window.start`. An ongoing event has an open end. Boundaries are inclusive. This is temporal correlation, not evidence that an object/person caused a transaction. No face recognition, identity matching, or biometric processing is included.

Timestamps submitted to the API must include a timezone (`Z` or an offset); they normalize to UTC. The browser displays local time. Synchronize POS and camera clocks using NTP. A positive camera offset means its clock is ahead. Window and camera edits recalculate results on the next review; results are not preserved audit snapshots.

## Connect existing Frigate

1. Copy `.env.example` to `.env` and set `FRIGATE_URL` to the Frigate server root, without `/api`. In Docker, use `http://host.docker.internal:5000` for Frigate on your host, or an accessible LAN address. For native development export environment variables in your shell; `.env` is read by Compose, not automatically by Node.
2. Set `FRIGATE_TOKEN` if using Frigate's authenticated API. Credentials stay on the backend. An expired token must be replaced manually.
3. Restart/recreate the app: `docker compose up -d --force-recreate app`.
4. In Settings & cameras, add/edit a camera with source **Frigate**, the exact Frigate camera key (e.g. `counter`), and the transaction register. Edit the sample camera if you do not want its synthetic context alongside real footage.

The adapter reads `/api/events` and requests `/api/{camera}/start/{start}/end/{end}/clip.mp4`. Video is streamed through the backend as a complete generated clip; browser byte-range headers are not forwarded to the dynamic Frigate endpoint. Event pagination includes events that started before the review window; scanning is capped at 10,000 retained events per camera and shows an error if exceeded. This simple approach is suitable for a small POC; continuous event ingestion with a local index is the next step for larger retention.

Frigate recordings must cover the requested window. Detection events alone do not guarantee a recording exists. Missing footage and unavailable sources appear in the review page. Some browsers, especially iOS Safari, may require an HLS adapter; the current real-camera player uses MP4. Live RTSP and authenticated Frigate behavior remain to be verified with your hardware.

Official API references: [Events](https://docs.frigate.video/integrations/api/events-events-get/) and [Recording clip](https://docs.frigate.video/integrations/api/recording-clip-camera-name-start-start-ts-end-end-ts-clip-mp-4-get/).

## Optional bundled Frigate

Replace the placeholder RTSP URL in `frigate/config.yml`. Then:

```sh
FRIGATE_URL=http://frigate:5000 docker compose --profile camera up --build -d
```

The example uses CPU person detection and retains continuous recordings for two days. Tune resolution and CPU/hardware acceleration for your camera. Frigate owns RTSP credentials and recordings; this app only knows camera keys and timestamps. The optional profile is a starting configuration, not a hardware-tested deployment. Port 5000 is Frigate's internal unauthenticated API and is bound only to localhost here. Keep it on a trusted machine/network.

## Ingest transactions

Manual UI entry or JSON API; amounts are displayed values, not accounting calculations. JSON imports are atomic (all validate before writing), up to 1,000 rows. No duplicate detection: repeat imports create repeat transactions. Example:

```sh
curl -X POST http://localhost:3040/api/transactions/import \
  -H 'Content-Type: application/json' \
  --data '[{"timestamp":"2026-10-02T13:32:07Z","register":"1","amount":18.50,"currency":"USD","note":"POS example"}]'
```

`POST /api/transactions` accepts one object with the same fields. Other routes:

- `GET /api/state`: transaction list, camera configuration, settings
- `GET /api/transactions/:id`: transaction and per-camera windows/events/clip URLs
- `POST /api/cameras` / `PUT /api/cameras/:id`: name, source (`mock` or `frigate`), frigateName, register, offsetSeconds
- `PUT /api/settings`: beforeSeconds, afterSeconds (0–600 each)
- `GET /api/health`: application liveness, not a Frigate connectivity check

## Storage and architecture

TypeScript/Express backend, plain browser JavaScript UI, `VideoSource` interface and mock/Frigate implementations. No frontend build tooling required. `src/model.ts` contains pure correlation logic; `src/sources.ts` owns source-specific behavior; `src/store.ts` owns persistence; `src/app.ts` assembles HTTP routes.

A small JSON store uses serialized writes and atomic file replacement. Native data lives in `data/state.json`; Compose uses `ledger-data`. Stop the app before copying the file for a consistent backup. Run only one app process against a file. Postgres is deliberately deferred until multi-user concurrency, indexed event ingestion, or audit history justifies it; replace the Store boundary without changing VideoSource. There is no background event ingestion or video duplication.

Local POC only: no application login, roles, TLS, review sign-off, immutable audit log, or production exposure. Compose binds the app to localhost. Camera clips remain subject to Frigate retention and are not preserved by reviewing them. Avoid committing camera credentials or real transaction exports.

## Verify

```sh
npm run check
npm test
npm run build
npx playwright install chromium
npm run test:browser
```

Core tests cover timezones, asymmetric windows, offsets, overlapping/ongoing events, atomic import validation, persistence, camera assignment and source failures. Browser test creates a sale, plays mock footage, edits the window and camera. Browser testing uses port 3041 and `data/e2e.json`; remove that file to reset browser-test data. Docker smoke test: `docker compose up --build -d`, then visit the UI and `/api/health`.

## Next useful steps

Plug in one real camera and a POS export, measure clock drift, and manually review a few known sales before adding heuristics. Then consider durable event ingestion, indexed Postgres queries, idempotent import IDs, review notes, and clip preservation when needed.

## Connected local sample

This checkout now mounts `samples/` read-only into Frigate and loops `barista-solo.mp4` as `counter`. The local `.env` points the app to `http://frigate:5000`. Run `docker compose --profile camera up -d` to start it. Create transactions using the current replay time and wait for the after-window to finish before reviewing. Stop the replay with `docker compose stop frigate`; it records continuously while running.

Verified the sample replay against Frigate 0.16.2: person events, persisted recordings, and a full approximately 60-second MP4 through the backend. Allow extra time for recording segments to be indexed after the window ends.

Frigate streams fragmented MP4: the browser can initially report a short duration, then extend it as it receives the clip. Verified accelerated browser playback reaches the full 61.9-second test clip without errors.

## Spatial context and live analysis

Open `http://localhost:3040/#live` for the detection stream with boxes and zone polygons, active person track IDs, confidence scores and zones visited. The event panel refreshes every three seconds; counts are active detector tracks (up to 100), not unique individuals. The stream is video-only, five frames per second. Leaving the page closes the stream and stops polling.

The sample video switches camera angles. Its three polygons are therefore neutral image regions: `frame_left`, `frame_right`, and `frame_upper_right`. They describe positions in the image, not consistent physical locations or roles. Counter/customer/doorway semantics are deliberately deferred until a fixed-camera clip is used. Zones use bounding-box bottom centers with three-frame inertia. Partial occlusion can move that point, so inspect overlays before interpreting results. Image-region polygons stay fixed across shot changes; do not interpret them as store geography. With a fixed camera they can be replaced by calibrated counter/customer/doorway polygons. Old detections keep their original metadata; zones apply going forward.

Transaction detail now includes distinct overlapping person tracks, estimated peak concurrent tracks and tracks active at the transaction timestamp. Track fragmentation and false detections can inflate counts. Zones visited refer to the entire overlapping event, not necessarily the transaction instant or even the window. Precise zone entry/exit timestamps require event-lifecycle ingestion, which is not implemented yet. Presence in a zone never implies payment or product handoff.

### Refined live workspace

Live analysis now separates ongoing detector tracks from the 12 latest retained person events. Track cards show age, temporary ID, confidence and lifetime regions visited. Toggle person boxes/regions, reconnect the stream, or pause this view (Frigate continues recording). Activity failures replace the update status with an explicit stale-result message. The transaction shortcut opens a manual form with the camera's register and current replay timestamp; it does not fabricate a sale or amount. Recent-event history comes from Frigate and survives page reloads while retained there.

Browser tests also exercise pause/resume polling, overlay controls and transaction prefill. The live HTTP test checks ended-event exclusion and recent history independently of actual camera hardware. The browser's video-connected badge confirms a decoded image, not continuous frame freshness; use reconnect if the image freezes.
