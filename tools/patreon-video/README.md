# Patreon video — horizontal full breakdown

1920×1080 video for a Patreon post: the riff video (both hands, full width), a synced alphaTab tab strip with a cursor and the current note in lime, numbered technique markers (Riff DNA atoms) on the tab, a hint column per part (technique tips, or Rule / Law / Keep / Free to change / Mutate from the riff's DNA), header with part number, role and section. Intro (3.4 s) in the Patreon cover style (B&W hand, Riff Killer block, lime tagline block, title block) and an outro card (Rule + Law, Mutate steps, riffkiller.fun).

Style (Mike, 10.11.2026): his Patreon cover grid — flat blocks, no rounding, #0B0B0F dark, #B8F05A lime, Inter; tagline "Don't just learn the riff. Understand its DNA."

- `comp.html` / `comp.js` — the overlay page; `window.frame(mode, t)` draws one frame (`intro`, `main`, `outro`). Per-part hint content is the `hints()` table in `comp.js` (written per riff), sections in `SECTIONS`.
- `render.cjs` — Playwright, transparent PNG per frame.
- `build.sh` — whole pipeline (Iron Man splice and crops are inside; change for another riff).

Iron Man (10.11.2026): source "Iron man-for app.MOV" (4K, Drive «video for claud»), riff.json from branch `riff-media/iron-man`. Result 93 s, shared on branch `share` as `iron-man-patreon.mp4` + `iron-man-patreon-cover.png`.

## YouTube version (10.11.2026)
~2:46, rendered in 4K (overlay at deviceScaleFactor 2), delivered as 1440p (GitHub 100 MB limit; YouTube treats 1440p like 4K). Order: intro → full riff ("Full riff" chip) → Main riff part by part (each part twice) → Verse part by part → outro (Rule/Law, Mutate) → 15 s packshot with WATCH NEXT / SUBSCRIBE slots for the YouTube end screen. `render-youtube.sh` renders overlays (`render2.cjs <scale> <dir> <jobs>`), `youtube.sh` assembles. Patreon version got a 6 s packshot (`pack` with `{yt:false}`).
