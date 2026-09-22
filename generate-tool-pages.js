#!/usr/bin/env node
/**
 * CodeWithAli PDF Tools — Static Tool Page Generator
 * ---------------------------------------------------
 * This site has no backend/server by design (it's 100% client-side —
 * see the audit notes in the repo). Clean URLs like /tools/merge are
 * served by Vercel as real static files, not by server-side routing.
 *
 * This script generates those 33 files from tool.html as the template,
 * using each tool's name/description already defined in
 * public/js/script.js's TOOLS registry — that registry is the ONLY
 * source of truth; this script parses it rather than duplicating the
 * data, so there's nothing to keep in sync by hand.
 *
 * Run this any time you add, rename, or re-describe a tool:
 *   npm run generate-tool-pages
 *
 * No npm packages required — plain Node.js only.
 */

const fs = require('fs');
const path = require('path');

const PUBLIC_DIR = path.join(__dirname, 'public');
const SITE_URL = 'https://codewithali-pdf-tools.vercel.app';
const EXPECTED_COUNT = 33;

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// Extract the TOOLS registry from script.js using a brace-depth scanner
// (robust to nested objects/arrays inside a tool's config, unlike a plain
// regex which can mis-match on the first nested closing brace it sees).
function parseToolsRegistry(scriptSrc) {
  const startMarker = 'const TOOLS = {';
  const startIdx = scriptSrc.indexOf(startMarker);
  if (startIdx === -1) throw new Error('Could not find "const TOOLS = {" in script.js');

  const bodyStart = startIdx + startMarker.length;
  let depth = 1;
  let i = bodyStart;
  while (depth > 0 && i < scriptSrc.length) {
    if (scriptSrc[i] === '{') depth++;
    else if (scriptSrc[i] === '}') depth--;
    i++;
  }
  const registryBody = scriptSrc.slice(bodyStart, i - 1);

  // Now split registryBody into individual top-level 'slug': { ... } entries
  // by scanning for top-level (depth-1) quoted keys followed by a brace.
  const tools = {};
  const keyRe = /'([a-z0-9-]+)':\s*\{/g;
  let match;
  while ((match = keyRe.exec(registryBody)) !== null) {
    const slug = match[1];
    let d = 1;
    let j = match.index + match[0].length;
    while (d > 0 && j < registryBody.length) {
      if (registryBody[j] === '{') d++;
      else if (registryBody[j] === '}') d--;
      j++;
    }
    const entryBody = registryBody.slice(match.index + match[0].length, j - 1);
    const nameM = entryBody.match(/name:\s*'((?:[^'\\]|\\.)*)'/);
    const descM = entryBody.match(/desc:\s*'((?:[^'\\]|\\.)*)'/);
    tools[slug] = {
      name: nameM ? nameM[1].replace(/\\'/g, "'") : slug,
      desc: descM ? descM[1].replace(/\\'/g, "'") : ''
    };
    keyRe.lastIndex = j; // skip past this entry's nested content
  }
  return tools;
}

function main() {
  const scriptSrc = fs.readFileSync(path.join(PUBLIC_DIR, 'js/script.js'), 'utf8');
  const tools = parseToolsRegistry(scriptSrc);

  const foundCount = Object.keys(tools).length;
  if (foundCount !== EXPECTED_COUNT) {
    console.warn(`Warning: parsed ${foundCount} tools, expected ${EXPECTED_COUNT}. If you added/removed a tool, this is expected — otherwise check TOOLS registry formatting in script.js.`);
  }

  const template = fs.readFileSync(path.join(PUBLIC_DIR, 'tool.html'), 'utf8');
  const outDir = path.join(PUBLIC_DIR, 'tools');
  fs.mkdirSync(outDir, { recursive: true });

  let count = 0;
  for (const [slug, meta] of Object.entries(tools)) {
    const title = `${meta.name} | CodeWithAli PDF Tools`;
    const description = meta.desc || 'Free, private, 100% in-browser PDF tools \u2014 files never leave your device.';
    const canonical = `${SITE_URL}/tools/${slug}`;

    let page = template;
    page = page.replace(/<title>.*?<\/title>/, `<title>${escapeHtml(title)}</title>`);
    page = page.replace(
      /<meta name="description" content="[^"]*">/,
      `<meta name="description" content="${escapeHtml(description)}">`
    );
    const extraTags = `
  <link rel="canonical" href="${canonical}">
  <meta property="og:title" content="${escapeHtml(title)}">
  <meta property="og:description" content="${escapeHtml(description)}">
  <meta property="og:url" content="${canonical}">
  <meta property="og:type" content="website">
  <meta name="twitter:card" content="summary">
  <meta name="twitter:title" content="${escapeHtml(title)}">
  <meta name="twitter:description" content="${escapeHtml(description)}">
</head>`;
    page = page.replace('</head>', extraTags);

    // Directory + index.html (not a bare extensionless file) — this is the
    // universally-supported "pretty URL" pattern: every static host
    // unambiguously serves it as real text/html via directory-index
    // resolution, whereas a bare extensionless file's Content-Type can be
    // host-dependent/ambiguous.
    const slugDir = path.join(outDir, slug);
    fs.mkdirSync(slugDir, { recursive: true });
    fs.writeFileSync(path.join(slugDir, 'index.html'), page);
    count++;
  }

  console.log(`Generated ${count} static tool pages in public/tools/<slug>/index.html (each with unique <title>/description/canonical/OG tags).`);
}

main();
