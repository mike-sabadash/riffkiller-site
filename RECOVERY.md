# RiffKiller recovery, 19 October 2026

The public root opens the existing library with the ordinary email/password modal. No promo code or coming-soon step is needed. Existing Patreon, Stripe and Cryptomus integration remains in place; no paid requests were made during this recovery.

## What was recovered

Production practice/editor code and timings were compared with GitHub `3e7e730`. The later `riffkiller-riff-dna-full.zip` / `riffkiller-riff-dna-update.zip` build contained the missing Riff DNA layer: Scan, Split, Isolate, Decode, Mutate, Molecules and Atoms. That layer is restored without changing the ten saved Black Dog start/end values.

Both cameras use the left video clock. Play, pause, seek, speed, loops and buffering operate on the pair; camera switching keeps time and tabs. All Riff changes tabs as the current segment changes. Atom actions always start the selected loop rather than toggling playback off. Speed Trainer retains three loops per speed, ×0.5 → ×0.75 → ×1.

The editor keeps unknown lesson/segment/DNA fields, binds tab images explicitly, has current-time start/end buttons and structured Atom fields. Segment row reordering carries its tab image and Atom references with it. Invalid bounds and stale concurrent saves are rejected; successful PHP saves replace the catalog atomically.

## Validation

- 11 API/transport tests: ordinary registration/login/logout/session restoration, saved metadata, stale-save rejection, invalid bounds, Range requests, drift, buffering and play/pause races.
- 5 Chromium scenarios using restored original MP4s: library and login, synchronized practice, All Riff/Speed Trainer, editor save/reopen, and 390px mobile practice with every method stage accessible.
- 3 catalog recovery tests: preserve author edits, idempotency, and reject changed timing assumptions.
- FFmpeg decoded all distinct recovered video files without errors. Browser video metadata for both Black Dog angles: 17.136327s.

Run locally with PHP 8.1+, Node 22+, Python 3 and FFmpeg:

```bash
npm ci
npx playwright install chromium
npm test
npm run test:recovery
npm run test:e2e
npm run start:php
```

`npm start` retains the old Node preview; use the PHP preview for auth, billing and editor persistence. CI generates synthetic video fixtures because MP4s are excluded from Git; local recovery validation used the original media.

## Production: preflight before approval

Production was not modified. Direct SSH from the execution environment was unavailable. On 19 October, the eight video paths in the live catalog and the checked `video.php` fallback returned HTTP 404, while `/api/me.php` and the catalog API responded normally.

Use a separate checkout of this PR. Upload the existing **riffkiller-riff-dna-full.zip** archive without extracting it wholesale: it also contains old account/runtime files which must not replace server state. Confirm the actual document root first:

```bash
find /var/www -maxdepth 3 -name practice.html -print
ps -eo pid,args | grep -E 'riff|php-fpm' | grep -v grep
```

Then run a read-only preflight with the real paths:

```bash
python3 tools/apply_recovery.py \
  --site-root /actual/document/root \
  --archive /actual/path/riffkiller-riff-dna-full.zip
```

The script verifies source and destination hashes, reads only ten allowlisted MP4s from the archive, preserves author changes in the catalog, and refuses unexpected code/media or changed Black Dog timings. It never copies old accounts, subscriptions, credentials or payment settings. After review and explicit production approval, the same command with `--apply` creates a dated backup outside the document root and installs the allowlisted files. A write failure rolls back completed file changes. Never use `git reset --hard`, `git clean`, or a whole-archive extraction on the production directory.

## Content still needs author confirmation

- Satisfaction, Whole Lotta Love and Smells Like Teen Spirit contain byte-identical video pairs in the historical archive. They decode and play, but are not independently verified lessons. Supply the correct pairs before presenting all three as finished content.
- Hells Bells is recovered with a full-riff segment. Its detailed segmentation and tab images still require author input.
- Only Black Dog has a verified complete ten-image tab set and recovered DNA annotation. Other lessons handle missing tabs with the existing “Tab not available” state; no new notation was invented.
- Google/Yandex/Patreon OAuth and real billing were not exercised against external accounts. The existing integrations remain; ordinary local email login and server-side membership loading were tested.
