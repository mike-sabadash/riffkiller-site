# Practice player fixes — 19 October 2026

## Behavior

- Entering Speed Trainer captures Normal speed, loop and whole-riff selection. Returning to Normal restores them on both cameras. Selecting a manual speed exits the ladder and applies that speed; turning Loop off exits the ladder without re-enabling Loop. Entering from All Riff trains the current segment.
- Both practice recordings are downloaded before Play is enabled, then assigned local Blob URLs. Loops, angle changes and seeking need no further video network requests. Progress is downloaded bytes for both cameras; unknown Content-Length stays indeterminate. A stalled download times out after 45 seconds without new bytes, shows Retry, and releases the old attempt. A missing static recording retries through the existing Range endpoint. The separate Lesson video is not prefetched.
- Downloading the original Black Dog pair means about 24 MB before initial playback. This favors stable practice over instant streaming. No recording has been re-encoded or replaced. Blob URLs are revoked when leaving the page (except a back/forward-cache suspension).
- Camera/Tabs/Lesson controls are above the video. Transport, practice mode and speed are below it. Segment controls use neutral compact rows with emphasis on the selection. The automatic free-riff promotional toast no longer covers the header or transport; paid-access checks are unchanged.
- DNA tabs and content form one panel: beside the player on wide screens, below it on smaller screens. Tab roles, selected states and arrow/Home/End keyboard navigation are implemented.

## Restore the light theme

Search for `TEMPORARY_LIGHT_THEME` or `RK_FEATURES.lightTheme`.

In `js/rk-theme-init.js`, change the default `lightTheme: false` to `lightTheme: true`. This restores the header and mobile switches and the existing stored preference. Light styles, icons and preference values are retained. No component reconstruction is required.

## Pattern references

- Soundslice groups speed training under its speed interface and exits training through manual speed selection: https://www.soundslice.com/help/en/player/basic/286/speed-training/
- Soundslice playback speed controls: https://www.soundslice.com/help/en/player/basic/5/playback-speed/
- Guitar Pro progressive speed: https://www.guitar-pro.com/docs/gp8/audio/playback/speed

These informed grouping of related transport controls; the DNA panel arrangement follows this page's specific content and reported navigation problem.

## Validation

Run `npm test`, `npm run test:recovery`, and `npm run test:e2e` with PHP, FFmpeg and Playwright Chromium installed. Browser regressions cover Normal restoration, manual overrides, full-pair loading, offline loops/seeks/angle changes, Retry, theme preference preservation, adjacent tabs/content and no page overflow at 1440/768/390px. The test fixture retains available original media and synthesizes only missing recordings for CI.

Production deployment requires approval. Install only changed static player/theme files and the new `js/practice-media.js`; preserve runtime data and all media. Do not run the historical recovery plan for this UI update.
