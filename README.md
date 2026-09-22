# CodeWithAli PDF Tools Suite

Free, 100% client-side, privacy-first PDF tools — a portfolio project inspired by iLovePDF. Every tool runs entirely in the visitor's browser using WebAssembly/JS libraries (pdf-lib, PDF.js, Tesseract.js, Mammoth, SheetJS, PptxGenJS, JSZip). No document ever touches a server, **except** the AI Summarizer, which explicitly sends text to Google Gemini and discloses this in its own UI.

## Architecture

**This is a pure static site. There is no backend, server, or API.** That's a deliberate choice (see below), not an oversight — if you see references anywhere to `server.js`, `routes/`, or `/api/*` in old notes, that infrastructure was removed.

```
public/
  index.html          Homepage — all 33 tool cards
  tool.html            Template used to generate every /tools/<slug> page
  why-us.html           Why-Us / comparison page
  404.html              Branded "Tool Not Found" page (reuses tool.html's own logic)
  tools/<slug>/index.html   33 generated static pages (see below) — DO NOT hand-edit these
  css/, js/, icons/     Styles, application logic, engine files
  manifest.json, sw.js  PWA manifest + service worker
generate-tool-pages.js  Regenerates public/tools/* — run after editing a tool's name/desc
vercel.json             Clean URLs + legacy redirects (no functions, pure static config)
```

### Why no backend?
1. Every tool already runs client-side in the live product — the backend was proven, by tracing every `fetch()` call in the codebase, to be **unreachable dead code**.
2. A pure static site is free/cheap to host at any traffic level (matters for an ad-supported site).
3. It makes "your files never leave your device" an honestly provable claim — a real differentiator vs. iLovePDF, which processes server-side.
4. Nothing to patch, monitor, or secure server-side — appropriate for a portfolio project without dedicated ongoing maintenance.

If you later need a real API (e.g., colleagues integrating this into their own projects), that's a clean, scoped addition to build when there's an actual requirement — not something to maintain unused in the meantime.

## Regenerating the 33 tool pages

`public/tools/<slug>/index.html` files are **generated**, not hand-written. Each one is `tool.html` plus a unique `<title>`/meta description/canonical/Open Graph tag set, pulled directly from the `TOOLS` registry in `public/js/script.js` (the single source of truth — nothing is duplicated by hand).

Whenever you add a tool, rename one, or change its description:
```bash
npm run generate-tool-pages
```
Then commit the regenerated files in `public/tools/`.

## URL structure

```
/                          Homepage
/home                      → redirects to /
/why-us                    Why-Us page
/tools/<slug>              Each tool (e.g. /tools/merge, /tools/ocr)

Legacy (still work, redirect forward automatically):
/index.html                → /
/why-us.html                → /why-us
/tool.html?tool=<slug>      → /tools/<slug>
```

## Local development

No build step, no server, no `npm install` required to run it — it's flat HTML/CSS/JS. Open `public/index.html` directly, or serve the `public/` folder with any static file server:
```bash
npx serve public
```

## Deploying

Push to `main` — Vercel auto-deploys `public/` as a static site using the rules in `vercel.json`. No environment variables, no build command, no serverless functions needed.
