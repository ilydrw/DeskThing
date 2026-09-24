# Release ownership

DeskThing can produce unsigned development builds without access to the former
maintainer's accounts. Source publication can precede binary distribution; see
[the public launch plan](PUBLIC_LAUNCH.md). Public installers need the relevant
platform signing, ownership, compatibility, and migration gates below.

## Required project assets

- A GitHub organization or repository used for source, issues, releases, and
  update metadata
- A project name and unique desktop application identifier. The current
  `com.deskthing.app` identifier is retained only for compatibility during
  development and must not be used by an independent public fork without an
  explicit ownership decision.
- A Windows code-signing certificate controlled by the project
- An Apple Developer ID certificate, Apple team, and notarization credentials
- App and client catalog repositories
- Firmware hosting or a documented manual firmware source
- A generic update feed hosting signed artifacts and platform metadata such as
  `latest.yml`
- A maintained support and incident-response channel

Windows can launch first. Apple credentials are required when distributing macOS,
not when publishing source or a Windows-only beta. Telemetry, donations, a separate
website, and custom firmware hosting are optional; a documented, verified manual
firmware source is sufficient.

## Release policy

1. Run `npm ci` and `npm run verify`.
2. Build unpacked packages and perform a startup smoke test.
3. Produce installers only from a protected release workflow.
4. Sign Windows and macOS artifacts with project-owned identities.
5. Notarize macOS artifacts and verify signatures before uploading.
6. Publish checksums alongside every artifact.
7. Test automatic updates from the previous public release before promoting
   the new release.

Windows update signature verification uses the secure electron-updater default.
Do not disable it to make unsigned public updates work. Unsigned builds are for
local development and hardware testing only.

The current `package validation` GitHub Actions workflow is manual, read-only,
and uploads short-lived unsigned artifacts. It never creates a GitHub release.
A publishing workflow should be added only after the project owns its signing
identities and has protected release approvals.

The macOS notarization hook rejects missing credentials and failed submissions.
Unsigned validation builds explicitly set `DESKTHING_SKIP_NOTARIZATION=true`
and `CSC_IDENTITY_AUTO_DISCOVERY=false`; publishing jobs must never opt out.

Uninstallers preserve user data by default. A separate, explicit reset or
cleanup action should be provided before any release offers destructive data
removal.
