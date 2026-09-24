# DeskThing Modernization

For the current release gates and launch sequence, see
[PUBLIC_LAUNCH.md](PUBLIC_LAUNCH.md). The baseline observations below are
historical; current dependency findings are maintained in `SECURITY.md`.

## Product direction

DeskThing should become the dependable, extensible Car Thing platform: easy
enough for a new owner to install, stable enough for daily use, and open enough
for developers to build experiences beyond music playback.

The app platform is the differentiator. Modernization should preserve that
architecture while bringing setup, connection reliability, media handling, and
system polish up to the standard set by newer Car Thing projects.

## Parity targets

### Setup and recovery

- Guided flashing with clear device-state detection
- Actionable recovery steps when ADB, USB drivers, or networking fail
- A tested restore path
- No requirement to follow an external video for routine installation

### Runtime reliability

- Automatic reconnect after host or device restarts
- Bounded logs and caches
- Clear health information for the desktop server, device, and active apps
- Graceful behavior when an external service or repository is unavailable

### Connectivity

- Reliable USB and local-network operation
- A documented path toward phone-assisted or Bluetooth operation
- Connection state that explains what is failing instead of showing a generic
  disconnected state

### Media and hardware

- Responsive now-playing UI with complete physical control support
- Predictable album art, progress, shuffle, repeat, volume, and device switching
- Screensaver, sleep, brightness, and preset-button behavior
- Performance profiling on the Car Thing hardware before visual effects are
  expanded

### Updates and ecosystem

- Reproducible signed desktop releases
- In-app desktop, client, and app updates with rollback-safe failure handling
- A maintained app catalog with compatibility metadata
- Versioned SDK documentation and starter templates

### Security and privacy

- Supported Electron and web dependencies
- No build-time secrets embedded in distributed binaries
- Telemetry disabled by default and inactive unless the user opts in and an
  independent endpoint is configured
- Explicit trust and permission boundaries for third-party apps

## Delivery phases

### Phase 0: Trusted baseline

- Reproducible install and verification commands
- Continuous integration on Windows and Linux
- Passing type checks, lint, and tests
- Security-patched dependencies within the current architecture
- Documented external-service and release-account dependencies

### Phase 1: Independent distribution

- Decide project name and ownership model
- Replace updater, catalog, website, telemetry, support, and firmware endpoints
- Establish signing, release, and incident-response processes
- Preserve the MIT license and original attribution

### Phase 2: Daily-driver reliability

- Fix reconnect and startup failures
- Bound logs, downloads, and caches
- Add device and service health diagnostics
- Make flashing and recovery self-contained

### Phase 3: Hardware and media parity

- Complete physical controls and media states
- Improve rendering performance and visual polish
- Add phone-assisted connectivity where technically viable
- Test long-running desk and in-car scenarios

### Phase 4: Platform advantage

- Stabilize the app and plugin APIs
- Add permissions and compatibility declarations
- Publish developer documentation and examples
- Build a community-owned catalog and review process

## Branch assessment

- `main` is the latest released and most complete base.
- `v1.0` currently matches `main` except for README changes.
- `v1.0-dev` is an incomplete reduction/refactor that removes major features and
  is not the modernization base.
- `Agent` contains unreleased plugin work. It should be reviewed and integrated
  in small pieces after the baseline is stable.

## Current external ownership dependencies

The application now starts without contacting services controlled by the
original project. Operators must configure their own distribution sources
before publishing a full community build:

- Legacy builds targeted `ItsRiprod/DeskThing`; publishing and updater metadata
  now follow the repository that produces the release.
- Default app and client catalogs are empty until the operator configures
  repositories or the user adds them in the application.
- Firmware APIs and recommended downloads are optional. Manual firmware upload
  remains available when no service is configured.
- Automatic driver installation requires an operator-provided installer URL
  and matching SHA-256 digest. The old remote shell-pipe installer was removed.
- Desktop update checks are disabled until the operator configures
  `DESKTHING_UPDATE_FEED_URL`. Configured feeds use electron-updater's generic
  provider and checks do not download an update without an explicit user
  action.
- Active application navigation, recovery, and donation UI no longer points at
  the former project website or community accounts.
- Legacy builds sent usage statistics to `stats.deskthing.app`; modernized
  builds have no default statistics endpoint.
- Feedback, statistics, and supporter services now require operator-provided
  runtime configuration; the original endpoints and credentials are no longer
  embedded.
- Windows signing ownership and macOS notarization are not configured for a new
  maintainer. The required ownership and release gates are documented in
  `docs/RELEASE_OWNERSHIP.md`.

Local development and unsigned test builds are independent. Official releases
still need project-owned catalog and firmware hosting plus signing accounts.
The current `com.deskthing.app` desktop identifier is intentionally unchanged
for development compatibility and remains a public-release blocker until
project ownership and naming are decided.

## Known baseline debt

- ESLint now completes with no errors or warnings.
- Route and overlay-level code splitting reduced the required renderer entry
  from roughly 2.2 MB to 369 KB.
- The Lottie dashboard dependency and its roughly 719 KB optional chunk were
  removed in favor of a native HTML/CSS visual.
- ADB device discovery now restores reverse-port mappings and detects
  same-count replacements and removals; this still needs extended testing on
  physical Car Thing hardware.
- The configured device port and bind address are now used at initial startup
  and server restart. ADB uses the same configured port and does not probe or
  alter connected devices while automatic detection is disabled.
- OAuth callbacks are loopback-only and do not log authorization codes.
  Missing local clients and first-run empty catalogs are reported as normal
  setup states instead of startup failures.
- The WebSocket server now checks stale clients and recreates a failed worker;
  long-running suspend/resume and network-change testing remains.
- JSON logs retain the newest 2,000 entries. Human-readable logs rotate at
  5 MiB, retain three archives, and serialize writes so long-running sessions
  cannot grow files without bound or lose entries during overlapping saves.
- Music updates now emit once per change after normalization. Embedded and
  local album art is capped at 5 MiB, addressed by SHA-256, and pruned to a
  50 MiB/100-file cache instead of being rebroadcast as unbounded base64 data.
- The web resource proxy permits public HTTP(S) targets by default, validates
  DNS results and every redirect, pins each connection to its validated
  address, limits responses to 25 MiB, and times out stalled requests. Private
  network targets require an explicit operator opt-in.
- App identifiers, app assets, generated resources, action icons, and
  user-data file operations are confined to their intended directories.
  Traversal-style package IDs and resource paths are rejected before install,
  removal, read, or write operations.
- A verified driver installer can be configured, but the project does not yet
  bundle a redistributable GX-CHIP driver.
- Packaging reports duplicate dependency references that should be reviewed
  during bundle-size work.
- Direct ZIP and image-processing dependencies were upgraded past their July
  2026 advisories. npm still reports an RSC/server-only React Router advisory
  that is not reachable from this client-only Electron renderer, plus
  build-tool `brace-expansion` advisories awaiting compatible upstream
  releases.
- Browserslist compatibility data was refreshed on 2026-07-25; CI should
  refresh it on a regular maintenance cadence.
- Windows unpacked packaging and an isolated-profile startup smoke test pass.

## Definition of done for Phase 0

- `npm ci` succeeds from a clean checkout.
- `npm run verify` succeeds locally and in CI.
- Production dependencies have no known vulnerabilities reported by
  `npm audit`.
- Release builds do not require the former maintainer's private services.
- The remaining high-risk upgrades are documented with owners and test plans.
