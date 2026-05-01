# HitPoint.Pro -- Agent Instructions

## Project Overview

HitPoint.Pro is a pure static website for a gaming/streaming community. No build system, no framework - just HTML, CSS, and vanilla JavaScript deployed to hitpoint.pro (likely GitHub Pages given `.nojekyll` and `CNAME`).

## Site Structure

```
hitpoint.pro/
├── index.htm              # Landing page - checks stream status, redirects to /live or /x
├── style.css              # Shared global styles
├── adminapply.html        # Admin application form page
├── live/index.html        # Live stream viewer (999 lines, embedded player + UI)
├── x/index.html           # Gaming section "X.X" - canvas-based particle effects, quote system
│   ├── src/
│   │   ├── main.js        # Main game/app entry point
│   │   ├── ParticleSystem.js  # Canvas particle renderer
│   │   ├── controls.js    # Input handling
│   │   ├── menu.js        # In-game menu logic
│   │   └── gachitop/launcher.js  # Gacha top launcher
│   └── games/gachitop/gachitop.js  # Gacha game implementation
├── chat/index.html        # Chat page
├── clips/index.html       # Clips page
├── play/index.html        # Play page
├── vods/index.html        # VODs archive page
├── versa/index.html       # Versa section
├── hx/                    # Another gaming section (similar structure to /x/)
│   ├── index.html
│   └── src/
│       ├── main.js
│       ├── ParticleSystem.js
│       └── controls.js
├── sg/                    # SG section
│   ├── index.html
│   └── app.js
├── bh/                    # Background animation iframe source
│   ├── index.html
│   └── main.js
├── reset-password/        # Password reset page
│   └── index.html
├── verify-email/          # Email verification page
│   └── index.html
├── assets/                # Static assets (favicons, icons, GIFs)
│   ├── favicon.ico
│   ├── apple-touch-icon.png
│   ├── android-chrome-512x512.png
│   └── heart_fan_loop.gif
├── CNAME                  # Custom domain configuration
├── .nojekyll              # GitHub Pages: do not treat as Jekyll site
└── ads.txt                # AdSense verification file
```

## Key Files & Patterns

### Stream Status Check (index.htm)
The landing page checks stream availability via an HLS endpoint with an obfuscated URL path:
```javascript
// Stream URL is built from a byte array at runtime
const _sk = [68,122,78,83,89,98,104,113,...];  // XOR-encoded stream name
const streamUrl = `https://stream.hitpoint.pro/hls/${decoded}.m3u8`;
```
If the stream is live (HEAD request succeeds), redirects to `/live`. Otherwise redirects to `/x`.

### Google Analytics
All pages include gtag.js with ID `AW-18004893946` (Google Ads conversion tracking).

### Canvas-Based Sections (/x, /hx)
Both gaming sections use canvas rendering with:
- Particle systems (`ParticleSystem.js`)
- Custom controls (`controls.js`)
- Quote overlay system with typewriter animation
- HUD elements for stats display

### Shared CSS Conventions (`style.css`)
- Dark theme throughout (#0c0c10 base)
- Fog + vignette overlays via fixed-position pseudo-elements
- CSS animations: fogDrift (60s loop), rainbowShift, scroll-motd
- Responsive breakpoints at 600px and 860px

## Common Tasks

| Task | Files to Edit |
|------|---------------|
| Update landing page redirect logic | `index.htm` |
| Modify live stream player UI | `live/index.html` |
| Add/edit game features | `x/index.html`, `x/src/*.js` or `hx/` |
| Global style changes | `style.css` (shared) + inline `<style>` per page |
| Update favicons/icons | Root directory assets |
| Add new section | Create directory with `index.html`, reference in nav |

## Coding Conventions

- Vanilla HTML/CSS/JS only. No frameworks, no build tools.
- Inline `<style>` and `<script>` blocks preferred over external files for page-specific code.
- External JS files go in `src/` subdirectories within their section folder.
- CSS custom properties used sparingly (only `--bg-x`, `--bg-y` in `style.css`).
- All pages use `system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif` font stack.
- Dark color palette: base `#0c0c10` / `#0b0c10`, text `#f2f2f2`.
- Accent colors: reds/pinks (`#8a2442`, `#961c30`) for branding, blues (`#00afff`, `#bff1ff`) for interactive elements.
- Responsive design with `clamp()` for typography and viewport-relative units (`vw`, `vh`).
- Never use em dashes (-) or double dashes (--). Always prefer a single dash (-).

## Git Rules

- Never run any git command unless explicitly instructed to do so in the current prompt.
- Never stage, commit, or push unattended or speculatively.
- Author is HitPointX only. No co-author lines, no trailer lines, no attribution to tools, assistants, or any third party in any commit message.
- Commit messages describe what changed and why. No reference to AI, agents, sessions, conversations, or any external tooling.
- Never amend a published commit. Create a new commit instead.
- Never force-push to main.
- Never skip hooks (--no-verify).
- AGENTS.md is intentionally untracked and must never be committed or pushed.

## Deployment Notes

- Deployed via GitHub Pages (`.nojekyll` + `CNAME` present).
- Stream HLS endpoint at `stream.hitpoint.pro/hls/`.
- Assets served from root path `/` - favicons, icons, GIFs all at top level.
- No CDN, no bundler, no cache-busting query params on static assets (except stream check with `?_=timestamp`).
