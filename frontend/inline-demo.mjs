// Inlines the demo build (dist/index.html + its single JS + CSS asset) into one
// self-contained fragment suitable for a claude.ai Artifact page: no external
// requests, no <html>/<head>/<body> wrapper (the Artifact host provides those).
// Run after `VITE_DEMO=1 vite build` (see the build:demo script).
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const dist = resolve("dist");
const html = readFileSync(resolve(dist, "index.html"), "utf8");

const jsMatch = html.match(/<script[^>]+src="([^"]+\.js)"[^>]*>\s*<\/script>/);
const cssMatch = html.match(/<link[^>]+href="([^"]+\.css)"[^>]*>/);
if (!jsMatch) throw new Error("Could not find the built JS asset in dist/index.html");

const jsPath = resolve(dist, jsMatch[1].replace(/^\//, ""));
const js = readFileSync(jsPath, "utf8").replace(/<\/script>/g, "<\\/script>");
const css = cssMatch ? readFileSync(resolve(dist, cssMatch[1].replace(/^\//, "")), "utf8") : "";

const out = `<style>
${css}
</style>
<div id="root"></div>
<script type="module">
${js}
</script>
`;

const target = resolve(dist, "vau-demo.html");
writeFileSync(target, out, "utf8");
console.log(`Wrote ${target} (${(out.length / 1024).toFixed(0)} KB)`);
