# Service configuration

DeskThing no longer embeds private service credentials in release artifacts.
All optional online services are disabled unless configured. Public distribution
defaults can be bundled by the maintainer; private integrations remain runtime-only.

## Public release defaults

Edit `DeskThingServer/distribution.json` before building to include owned catalog,
update, firmware, and driver locations. It is checked into source and bundled in
the main process, so a normal installer does not need an environment file. The
file intentionally starts as `{}` until the project has real hosting.

Example structure (replace these illustrative addresses with owned services):

```json
{
  "DESKTHING_APP_CATALOG_REPOSITORY": "https://github.com/your-org/app-catalog",
  "DESKTHING_CLIENT_CATALOG_REPOSITORY": "https://github.com/your-org/client-catalog",
  "DESKTHING_UPDATE_FEED_URL": "https://updates.example.org/stable"
}
```

Allowed keys are the app/client catalogs, firmware API/product/recommended
version/file/URL, driver installer URL/SHA-256, and update feed listed below.
Bundled URLs must use HTTPS without embedded credentials, query strings, or
fragments. Catalogs must identify a GitHub owner/repository. A driver URL must
have a matching 64-character SHA-256 digest. Omit unused settings rather than
adding empty values.

The build rejects malformed settings and unknown keys. Credentials, statistics,
feedback, supporter tokens, and private-network permission cannot be placed in
this file. Runtime environment variables take precedence; an explicitly empty
variable disables a bundled default. An invalid runtime URL disables the service
instead of silently restoring the bundled URL.

## Configuration files

During development, copy `DeskThingServer/.env.example` to
`DeskThingServer/.env`.

For operator overrides in a packaged build, create `.env.production` beside the
DeskThing executable. Normal users do not need this when defaults are bundled.
Restart DeskThing after changing the file.

## Variables

- `DESKTHING_STATS_URL`: Base URL for a server implementing the existing
  `/v1/register` and `/v1/stats` API. The desktop app contacts it only after the
  user explicitly enables usage diagnostics.
- `DESKTHING_FEEDBACK_URL`: HTTPS endpoint accepting the current
  Discord-compatible feedback payload. Without it, feedback submission returns
  an unavailable message and gathers no system information.
- `DESKTHING_SUPPORTER_TOKEN`: Optional Buy Me a Coffee API token used to show
  supporter data.
- `DESKTHING_STATS_CLIENT_ID` and `DESKTHING_STATS_PRIVATE_KEY`: Optional fixed
  Ed25519 statistics identity. When omitted, an opted-in installation creates a
  local identity.
- `DESKTHING_APP_CATALOG_REPOSITORY`: Optional GitHub repository containing the
  default app catalog release metadata.
- `DESKTHING_CLIENT_CATALOG_REPOSITORY`: Optional GitHub repository containing
  the default device-client release metadata.
- `DESKTHING_FIRMWARE_API_URL` and `DESKTHING_FIRMWARE_PRODUCT_ID`: Optional
  Thingify-compatible firmware API and product identifier.
- `DESKTHING_RECOMMENDED_FIRMWARE_VERSION_ID` and
  `DESKTHING_RECOMMENDED_FIRMWARE_FILE_ID`: Optional identifiers used to fetch
  the recommended archive from the configured firmware API.
- `DESKTHING_RECOMMENDED_FIRMWARE_URL`: Optional direct URL used when the
  firmware API is unavailable. Users can still upload an archive manually when
  no firmware source is configured.
- `DESKTHING_DRIVER_INSTALLER_URL` and `DESKTHING_DRIVER_INSTALLER_SHA256`:
  Optional paired settings for a driver installer. DeskThing downloads the
  installer to a temporary directory and executes it only after its SHA-256
  digest matches. Windows supports `.exe`, `.msi`, and `.ps1`; Unix-like
  systems support `.sh`.
- `DESKTHING_UPDATE_FEED_URL`: Optional generic `electron-updater` feed
  containing the platform update metadata and matching signed artifacts.
  Automatic startup checks and manual downloads remain disabled when it is
  empty.
- `DESKTHING_PROXY_ALLOW_PRIVATE_NETWORK`: Defaults to `false`. Set to `true`
  only when trusted apps must proxy artwork or resources from a private-network
  media server. Public proxy requests remain limited to HTTP(S), validated
  across redirects, timed out, and size-bounded.

Runtime overrides accept HTTP and HTTPS service URLs. Keep `.env` and
`.env.production` out of source control. Packaging explicitly excludes `.env*`
files at any depth; secrets must never be moved into `distribution.json`.
