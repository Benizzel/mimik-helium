<div align="center">

<img src="public/icon.svg" width="120" height="120" alt="Mimik Helium logo" />

# Mimik — Helium Edition

Auto-capture any browser workflow into a step-by-step guide. No backend, no account, no data leaves the browser.

</div>

## What this is

This is an internal fork of the open-source [Mimik](https://github.com/westpoint-io/mimik) Chrome extension, customized for Helium. It keeps the original's entire feature set — recording, AI descriptions, smart blur, Guide Me replay, multi-format export — and layers a few changes on top:

- **Helium branding**: the extension icon, in-app logo, and the default watermark used on exported guides now use the Helium mark instead of the original Mimik mascot.
- **Prominent, toggleable click-target spotlight**: the highlighted click target in screenshots now dims the rest of the image (spotlight effect) so the target reads clearly at a glance. This can be switched on or off per screenshot from the guide editor.

Everything else — architecture, storage, privacy model — matches upstream. See [CLAUDE.md](./CLAUDE.md) for the full architecture reference and [CONTRIBUTING.md](./CONTRIBUTING.md) for the original contributor guide.

## How it works

You click "Record," perform a workflow in your browser, and the extension automatically captures each action as a step with an annotated screenshot and description. You can edit the guide, replay it on a live page, or export it as a file.

**Core loop: Record → Edit → Replay or Export.**

Everything runs client-side in the extension:

- **Storage**: IndexedDB via Dexie.js, browser-local only
- **AI descriptions**: optional, bring your own API key (OpenAI or Anthropic)
- **Export**: HTML, PDF, DOCX, Markdown, and video (mp4/H.264), all generated client-side
- No auth, no database, no hosting, no Docker

## Building the extension

### Prerequisites

- Node.js 22+
- [pnpm](https://pnpm.io) 10+ (the project ships a `pnpm-lock.yaml`; `npm install` also works if pnpm isn't available)
- Chrome (or Firefox) for testing

### Install dependencies

```bash
pnpm install
```

### Development build (hot reload)

```bash
pnpm dev
```

This launches a dedicated Chrome profile with the extension pre-loaded and hot-reloads on file changes.

### Production build

```bash
pnpm build
```

This produces an unpacked, load-ready extension at `.output/chrome-mv3/`.

### Load it into Chrome

1. Open `chrome://extensions`
2. Enable **Developer mode** (top right)
3. Click **Load unpacked**
4. Select the `.output/chrome-mv3/` folder

For Firefox, use `pnpm build:firefox` (outputs to `.output/firefox-mv3/`) and load it via `about:debugging` → **This Firefox** → **Load Temporary Add-on**.

### Tests, lint, typecheck

```bash
pnpm test          # run the test suite once
pnpm test:watch    # watch mode
pnpm typecheck      # tsc --noEmit
pnpm lint           # biome check
```

## Privacy & storage

Guides, steps, and screenshots live on your device. There's no backend, no account, no telemetry. API keys you provide never leave your browser — they're stored locally and used to call the provider you configured directly. Site icons are fetched from Google's favicon service (sends the domain only), and the optional AI/voice features send text or audio to the provider you configured — both documented in the upstream [privacy policy](https://mimik.westpoint.io/privacy/).

## License

MIT, inherited from the upstream [westpoint-io/mimik](https://github.com/westpoint-io/mimik) project. See [LICENSE](./LICENSE).
