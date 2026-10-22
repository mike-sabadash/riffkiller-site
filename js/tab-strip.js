/**
 * Tab strip: shows a segment's tab picture as a full-width band under the video.
 * Uploaded tab pictures are usually a 16:9 frame with dark margins around a light card,
 * so the visible part is found automatically and the rest is cropped away in CSS.
 */
(function (global) {
    'use strict';

    var TOLERANCE = 48;
    var STEP = 2;

    function pixel(data, w, x, y) {
        var i = (y * w + x) * 4;
        return [data[i], data[i + 1], data[i + 2]];
    }

    function differs(a, b) {
        return Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2]) > TOLERANCE;
    }

    // Bounding box of everything that is not the colour found at the box's top-left corner.
    function contentBox(data, w, box) {
        var bg = pixel(data, w, box.x + 2, box.y + 2);
        var x0 = Infinity, y0 = Infinity, x1 = -1, y1 = -1;
        for (var y = box.y; y < box.y + box.h; y += STEP) {
            for (var x = box.x; x < box.x + box.w; x += STEP) {
                if (!differs(pixel(data, w, x, y), bg)) continue;
                if (x < x0) x0 = x;
                if (x > x1) x1 = x;
                if (y < y0) y0 = y;
                if (y > y1) y1 = y;
            }
        }
        if (x1 < 0) return null;
        return { x: x0, y: y0, w: Math.min(x1 + STEP, box.x + box.w) - x0, h: Math.min(y1 + STEP, box.y + box.h) - y0 };
    }

    /**
     * Part of the picture worth showing, in natural pixels.
     * Step 1 drops the outer margin (the dark frame), step 2 trims the card's own padding.
     */
    function cropBox(data, w, h) {
        var full = { x: 0, y: 0, w: w, h: h };
        var card = contentBox(data, w, full) || full;
        var inset = 6;
        var inner = card.w > inset * 2 && card.h > inset * 2
            ? { x: card.x + inset, y: card.y + inset, w: card.w - inset * 2, h: card.h - inset * 2 }
            : card;
        var ink = contentBox(data, w, inner);
        if (!ink) return card;
        var pad = Math.round(Math.max(8, ink.h * 0.08));
        var x = Math.max(card.x, ink.x - pad), y = Math.max(card.y, ink.y - pad);
        return {
            x: x,
            y: y,
            w: Math.min(card.x + card.w, ink.x + ink.w + pad) - x,
            h: Math.min(card.y + card.h, ink.y + ink.h + pad) - y,
            background: 'rgb(' + pixel(data, w, card.x + 2, card.y + 2).join(',') + ')'
        };
    }

    var cache = {};

    function measure(img) {
        var key = img.currentSrc || img.src;
        if (cache[key] !== undefined) return cache[key];
        var w = img.naturalWidth, h = img.naturalHeight, box = null;
        if (w && h) {
            try {
                var canvas = document.createElement('canvas');
                canvas.width = w;
                canvas.height = h;
                var ctx = canvas.getContext('2d', { willReadFrequently: true });
                ctx.drawImage(img, 0, 0);
                box = cropBox(ctx.getImageData(0, 0, w, h).data, w, h);
            } catch (e) {
                box = null; // cross-origin picture: show it whole
            }
        }
        cache[key] = box;
        return box;
    }

    // Frames the <img> inside its parent so only the crop box is visible.
    function apply(img) {
        var frame = img.parentElement;
        if (!frame) return;
        var box = measure(img);
        var w = img.naturalWidth, h = img.naturalHeight;
        if (!box || !w || !h) {
            frame.style.aspectRatio = w && h ? w + ' / ' + h : '';
            frame.style.setProperty('--tab-ratio', w && h ? String(w / h) : '');
            frame.style.background = '';
            img.style.width = '100%';
            img.style.left = img.style.top = '0';
            return;
        }
        frame.style.aspectRatio = box.w + ' / ' + box.h;
        frame.style.setProperty('--tab-ratio', String(box.w / box.h));
        frame.style.background = box.background || '';
        img.style.width = (w / box.w * 100) + '%';
        img.style.left = (-box.x / box.w * 100) + '%';
        img.style.top = (-box.y / box.h * 100) + '%';
    }

    global.TabStrip = { cropBox: cropBox, apply: apply };
})(typeof window !== 'undefined' ? window : this);
