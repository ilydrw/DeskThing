# Contributing

DeskThing is an Electron and React application with its desktop runtime in
`DeskThingServer`.

## Requirements

- Node.js 22.15 or newer
- npm 10 or newer

## Development

```sh
cd DeskThingServer
npm ci
npm run dev
```

Before submitting a change, run the same verification used by continuous
integration:

```sh
npm run verify
npm run build:bundle
```

Use focused changes, add tests for changed behavior when practical, and avoid
mixing broad formatting changes into functional work.

## Repository direction

The current modernization priorities and acceptance criteria are tracked in
[`docs/MODERNIZATION.md`](docs/MODERNIZATION.md).
