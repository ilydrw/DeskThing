# Security policy

## Supported builds

This modernization branch is pre-release. Only the newest signed release from
the future project-owned repository should be considered supported once public
distribution begins. Unsigned local builds are for development and hardware
testing.

## Reporting a vulnerability

Use GitHub private vulnerability reporting in the repository that distributed
your build. If that repository has not enabled private reporting, open a
minimal issue asking the maintainers for a private contact and do not include
exploit details, credentials, device identifiers, or personal information in
the issue.

Include the DeskThing version, operating system, affected component, expected
impact, and the smallest safe reproduction available. Never test against
systems or devices you do not own or have permission to assess.

## Network proxy boundary

DeskThing exposes resource proxy routes to connected device clients. By
default, those routes accept only HTTP(S) targets resolving entirely to public
addresses. DNS results are pinned for the outbound connection, redirects are
revalidated, requests time out after 15 seconds, and responses are capped at
25 MiB.

`DESKTHING_PROXY_ALLOW_PRIVATE_NETWORK=true` intentionally relaxes the address
boundary for operators using a trusted private media server. Do not enable it
on an untrusted network or for installations that run unreviewed apps.

App packages and device clients cannot use traversal-style identifiers or
resource paths to escape the app and user-data directories. Package manifests
using unsupported path characters are rejected before installation.

OAuth callbacks listen on IPv4 loopback only, validate the destination app and
authorization code, and do not write callback URLs or codes to logs.

## Current dependency notes

The project upgrades direct runtime dependencies when compatible fixes are
available. On 2026-09-24, both `npm audit --omit=dev` and the full `npm audit`
reported zero vulnerabilities after updating `adm-zip` to 0.6.1, `sharp` to
0.35.4, and Vitest to 4.1.11. The Vitest update also addresses the previously
recorded mock-server redirect advisory (GHSA-82fw-gwwq-j7x9).

This supersedes the July dependency snapshot. Re-run both production and full
audits for every release; a clean audit is not a comprehensive security review.

## Bundled configuration

Only allowlisted public distribution settings can be placed in
`DeskThingServer/distribution.json`. Builds reject unsupported keys, insecure
URLs, credential-bearing URLs, and unpaired driver URLs/hashes. Credentials and
privacy permissions remain runtime/user controlled. Packaging excludes `.env*`
files at every depth. Review distribution URLs and artifact contents before release.
