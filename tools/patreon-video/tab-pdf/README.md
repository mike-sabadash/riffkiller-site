# Tab PDF (2 pages, tab only)

Mike 11.11.2026: PDF = tab only, 2 pages, no parts list. alphaTab Page layout, 2 bars per row, rhythm hidden (slurs collided with beams), each page rendered separately with startBar/barCount (clipping one big render leaked into other pages in some PDF viewers). Serve a folder with card2.html, card2.js, alphaTab.min.js, font/, Inter woff2, logo-dark.svg (assets/logo-main.svg) and tab.tex (with \\section markers), then `node pdf.cjs`.
