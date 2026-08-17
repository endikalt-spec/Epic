// Renders the VAU gift box to a PNG served from /public, so the e-voucher email
// can show it as a plain <img> inside a link: images are a reliable tap target
// in every mail client, and dark mode does not recolour them.
//
// Playwright is not a dependency of this project — the PNG is committed and only
// needs regenerating when the artwork changes. To do that, from frontend/:
//   npx playwright@1 install chromium && node scripts/gift-box.mjs
import { chromium } from 'playwright';

const W = 440, H = 430; // 2x the 220px display size

const NAVY = '#1F3160';
const NAVY_LIGHT = '#2C4079';
const GOLD = '#D9B45F';
const GOLD_DARK = '#BE9640';
const GOLD_LIGHT = '#EBD08A';

// The bow is painted *after* the lid so its tails drape visibly over it — with
// the lid on top the tails disappeared and the loops read as a propeller.
const bow = `
<svg width="300" height="180" viewBox="0 0 300 180" style="position:absolute;top:0;left:${(W - 300) / 2}px;z-index:2">
  <defs>
    <linearGradient id="loop" x1="0" y1="0" x2="0.3" y2="1">
      <stop offset="0" stop-color="${GOLD_LIGHT}"/>
      <stop offset="1" stop-color="${GOLD}"/>
    </linearGradient>
    <linearGradient id="knot" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${GOLD_LIGHT}"/>
      <stop offset="1" stop-color="${GOLD_DARK}"/>
    </linearGradient>
  </defs>
  <g stroke="${GOLD_DARK}" stroke-width="2.5" stroke-linejoin="round" fill="url(#loop)">
    <path d="M144 124 C 132 137, 114 148, 92 154 C 101 139, 118 129, 136 119 Z"/>
    <path d="M156 124 C 168 137, 186 148, 208 154 C 199 139, 182 129, 164 119 Z"/>
    <path d="M140 102 C 112 64, 76 28, 52 42 C 28 56, 34 92, 60 106 C 88 120, 122 120, 142 120 Z"/>
    <path d="M160 102 C 188 64, 224 28, 248 42 C 272 56, 266 92, 240 106 C 212 120, 178 120, 158 120 Z"/>
    <ellipse cx="150" cy="116" rx="24" ry="18" fill="url(#knot)"/>
  </g>
</svg>`;

const html = `<!doctype html><html><body style="margin:0;background:transparent">
<div style="width:${W}px;height:${H}px;position:relative;font-family:Georgia,'Times New Roman',serif">
  <!-- lid: solid navy, wordmark in gold -->
  <div style="position:absolute;top:118px;left:12px;width:416px;height:84px;background:linear-gradient(180deg,${NAVY_LIGHT},${NAVY});border-radius:16px">
    <div style="position:absolute;inset:0;display:flex;align-items:flex-end;justify-content:center;padding-bottom:13px;color:${GOLD};font-size:26px;letter-spacing:14px;font-weight:bold;padding-left:14px">VAU</div>
  </div>

  <!-- body: navy with a vertical gold ribbon, aligned under the bow -->
  <div style="position:absolute;top:208px;left:46px;width:348px;height:214px;background:linear-gradient(180deg,${NAVY_LIGHT},${NAVY});border-radius:14px;overflow:hidden">
    <div style="position:absolute;left:50%;top:0;transform:translateX(-50%);width:66px;height:100%;background:linear-gradient(90deg,${GOLD_DARK},${GOLD} 22%,${GOLD_LIGHT} 50%,${GOLD} 78%,${GOLD_DARK})"></div>
    <div style="position:absolute;inset:0;background:linear-gradient(180deg,rgba(255,255,255,.14),rgba(255,255,255,0) 55%)"></div>
  </div>

  ${bow}
</div></body></html>`;

const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
const p = await b.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
await p.setContent(html, { waitUntil: 'load' });
await p.screenshot({ path: 'public/gift-box.png', omitBackground: true });
console.log('public/gift-box.png готов');
await b.close();
