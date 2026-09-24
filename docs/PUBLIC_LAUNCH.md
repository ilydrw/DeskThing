# DeskThing Community: public launch plan

Working name: **DeskThing Community**. Position it as **an independent community
continuation of DeskThing, originally created by Riprod**. This is a working
identity, not a claim to the original project's accounts, brand, or endorsement.
Confirm naming availability before reserving accounts or changing installer IDs.

## Recommended launch sequence

1. Publish the source and roadmap under a project-owned GitHub repository.
   Keep Git history, the MIT license, original credits, and upstream attribution.
   Invite contributors with a clearly labeled development status.
2. Run a small hardware-tested preview with experienced Car Thing owners.
   Start with Windows as the first supported installer platform; promote macOS
   and Linux only when their own install, connection, and recovery checks pass.
3. Publish a public beta with signed installers, checksums, written setup and
   migration instructions, known limitations, and a tested recovery path.
4. Promote to stable after beta reports have been resolved and the same release
   candidate has passed the supported-platform and physical-device checklist.

A source launch can precede an installer launch. Do not call the app production
ready simply because CI passes. A new website, donations, telemetry, and a new
Discord server are not prerequisites: GitHub Releases, Issues, and Discussions
are sufficient for the initial project home.

## Current release blockers

Inspection date: 2026-09-24. These are local findings, not a full security audit.

| Area | Evidence in this checkout | Required outcome |
| --- | --- | --- |
| Repository ownership | Only an `upstream` remote exists | Create the owned fork; configure its `origin`, maintainers, protected branch checks, and private vulnerability reporting |
| Application identity | Package name `deskthing`, app ID `com.deskthing.app`, Windows model ID `com.deskthing`, and `deskthing:` protocol | Decide coexistence versus migration before changing all identity consumers; test shortcuts, protocol handlers, autostart, and updates |
| User data | Existing profiles belong to legacy DeskThing | Back up data; use an explicit, versioned import into a separate fork profile; verify rollback without overwriting the original |
| Distribution | Current workflow only uploads unsigned unpacked builds | Configure owned signing identities and a protected publishing workflow with artifact checksums and signature verification |
| Services | Validated bundled defaults are supported; `distribution.json` is intentionally empty | Assign owned catalogs and update hosting, populate public defaults, and verify a clean installation |
| Hardware/client | Desktop build is only one part of the product | Record compatible client, firmware, SDK/types, and app versions; preserve recovery downloads with verified hashes and redistribution notices |
| Dependencies | Runtime and full audits are clean after the Vitest 4.1.11 update | Re-run audit and the full verification suite for every release |
| Validation | Prior documentation describes older successful checks | Record fresh CI, packaging, device, and migration evidence for the exact release commit |

Do not change the public application ID in isolation: it affects installer/update
identity while the package name affects the Electron profile directory. An
intentional migration is required. Do not force updates from the original
maintainer's signed releases onto an independently signed fork.

## Product work before beta

### First-run setup

- A fresh installation should offer a clear sequence: install client software,
  connect a device, install one compatible app, and test a physical control.
- Explain what a client, app, firmware image, and desktop server each do.
- Distinguish an empty catalog, unavailable catalog, incompatible download,
  and missing internet connection. Always expose manual import and Retry.
- Replace the README's historical video-only setup with written instructions
  verified against the release candidate and current screenshots.

### Honest status and recovery

- Count active display clients separately from USB devices discovered by ADB.
- Never present an unconditional green server-health badge. Connection status
  is not proof that every backend service is healthy.
- Make reconnect, refresh, restart, and download failures actionable; controls
  must become usable again after failure and must not hide arbitrary delays.
- Follow-up: expose actual listener/port failures and configuration errors in a
  health panel, with a redacted support bundle and recovery steps.

### Interface quality

- Inspect every main page at the minimum supported window size and at 125%,
  150%, and 200% scaling. Check clipped labels and hidden primary actions.
- Exercise keyboard focus, modal close/cancel, disabled buttons, empty/loading/
  error states, and readable contrast. Inspect physical display performance.
- Keep the existing design language; prioritize successful setup and recovery
  over a large visual redesign.

## Required manual release evidence

Record OS, architecture, desktop/client/firmware/app versions, result, and logs
for each scenario. Use disposable profiles and backups for migration tests.

| Scenario | Acceptance criterion |
| --- | --- |
| Fresh install | Works without Node, developer tools, existing user data, or developer environment variables |
| Existing installation | Explicit import preserves apps, mappings, settings, device names, and credentials safely; original data remains recoverable |
| USB setup | Supported device and data cable detected; missing driver/ADB state explained; no unrelated USB devices modified |
| LAN setup | Real second device connects; firewall and wrong-network failures are explained |
| Reconnect | Unplug/replug, desktop restart, device reboot, host sleep/resume, and network changes recover predictably |
| Daily use | Media, buttons, app switching, brightness, and sleep work during a multi-hour physical-device session |
| Failed operation | Offline catalog, failed download, bad ZIP, incompatible app/client, and unavailable port leave usable UI and intact data |
| Persistence | Restart and interrupted-write tests preserve valid state and retain damaged files for recovery |
| Updates | Previous independently signed build updates correctly; interrupted download and signature failure preserve the installed version |
| Uninstall/reinstall | User data survives by default, app launches after reinstall, and explicit reset is clearly destructive |

## Maintainer and community setup

- Credit Riprod prominently; propose coordination or a handover privately if
  appropriate. Do not announce official successor status without agreement.
- Before posting that the original project is discontinued, link the original
  maintainer's announcement. Repository inactivity alone is not confirmation.
- Keep source, issue tracker, documentation, signing, and release hosting under
  project ownership. Add a second trusted maintainer and recovery procedures.
- Publish scope and support expectations. Separate verified compatible apps
  from unreviewed third-party packages; preserve their individual licenses.
- Announce a specific benefit and evidence: tested reconnect/recovery, clearer
  setup, maintained dependencies, and compatibility. Show current screenshots
  and a short real-device demonstration, then invite beta reports.
- Ask community moderators before promotional posts. Link one canonical release
  page with setup instructions and known issues. Add donations only after the
  fork has its own funding ownership and transparent expectations.

## Verification commands

Local evidence from this pass (Windows, 2026-09-24):

- `npm run verify`: passed both type checks, lint, and 212 tests across 35 files.
  Lint still reports 439 existing formatting warnings; it reports zero errors.
- `npm audit --omit=dev` and full `npm audit`: zero vulnerabilities.
- `npm run build:unpack`: passed the production bundle and Windows x64 unpacked
  package build. Packaging still reports duplicate dependency references.
- Configuration tests verify that bundled catalogs reach release metadata,
  runtime overrides can disable defaults, and unsafe configuration is rejected.
- Not performed: fresh `npm ci`, signed installer verification, macOS/Linux
  packaging, live UI inspection, migration, real updates, or physical-device
  testing. The built package is not a verified public release.

From `DeskThingServer`:

```sh
npm ci
npm run verify
npm audit --omit=dev
npm audit
npm run build:bundle
npm run build:unpack
```

On macOS, unsigned local validation builds must explicitly set
`DESKTHING_SKIP_NOTARIZATION=true` and `CSC_IDENTITY_AUTO_DISCOVERY=false`.
Public macOS builds must not set the skip flag and must provide Apple credentials.
The notarization hook now fails packaging if credentials or notarization fail.
The unsigned validation workflow sets the opt-out; it does not publish releases.

## Sources and related guidance

- [MIT license conditions](https://choosealicense.com/licenses/mit/): keep the
  copyright and license notice in distributed copies. This does not establish
  ownership of names, logos, domains, or third-party bundled assets.
- [Electron distribution guidance](https://www.electronjs.org/docs/latest/tutorial/distribution-overview)
  and [code signing](https://www.electron.build/docs/features/code-signing/).
- [Release ownership](RELEASE_OWNERSHIP.md), [service configuration](SERVICE_CONFIGURATION.md),
  and [modernization roadmap](MODERNIZATION.md).
