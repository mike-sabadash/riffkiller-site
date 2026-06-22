/**
 * Единый источник правды для границ сегментов. Используется на странице практики и в админке.
 * В админке вводят реальный тайминг (start/end); при воспроизведении применяются эти смещения,
 * чтобы слышать то же самое, что на фронте.
 */
(function(global) {
    var SEGMENT_END_OFFSET = 0.27;
    var SEGMENT_START_OFFSET_T1 = 1.2;
    var SEGMENT_START_OFFSET_T2 = 6;
    var SEGMENT_START_OFFSET_T3 = 7.21;
    var SEGMENT_START_OFFSET_O1 = 0.6;
    var SEGMENT_START_OFFSET_O2 = 0.09;
    var SEGMENT_START_OFFSET_O3 = 0.5;

    function getSegmentEnd(seg) {
        return Number(seg.end) + SEGMENT_END_OFFSET;
    }

    function getSegmentStart(seg) {
        var s = Number(seg.start);
        if (s === 0) return 0;
        var t1 = SEGMENT_START_OFFSET_T1, t2 = SEGMENT_START_OFFSET_T2, t3 = SEGMENT_START_OFFSET_T3;
        var o1 = SEGMENT_START_OFFSET_O1, o2 = SEGMENT_START_OFFSET_O2, o3 = SEGMENT_START_OFFSET_O3;
        var offset;
        if (s <= t2) {
            offset = o1 + (s - t1) * (o2 - o1) / (t2 - t1);
        } else if (s <= t3) {
            offset = o2 + (s - t2) * (o3 - o2) / (t3 - t2);
        } else {
            offset = o3 + (s - t3) * (o3 - o2) / (t3 - t2);
            if (offset < o3) offset = o3;
        }
        return s + offset;
    }

    global.SEGMENT_END_OFFSET = SEGMENT_END_OFFSET;
    global.getSegmentStart = getSegmentStart;
    global.getSegmentEnd = getSegmentEnd;
})(typeof window !== 'undefined' ? window : this);
