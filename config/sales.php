<?php
/**
 * Limited-time prices (Mike's decision 08.11.2026; docs/NEWSLETTER.md, «Cyber Monday»).
 * During a sale's window the plan sells at its price: the card goes through the sale's own lava.top offer (its
 * yearly price is set there; lava.top needs a monthly price too, which this site never sells), USDT at the
 * sale price. billing.html shows the old price crossed out and the end date. Nothing else changes.
 * Times are US Pacific, so the sale ends at midnight for the whole American audience.
 */
const BILLING_SALES = [
    [
        'id' => 'cyber-week-2026', 'plan' => 'yearly', 'price' => 63, 'was' => 90,
        'from' => '2026-11-27T00:00:00-08:00', 'until' => '2026-12-02T00:00:00-08:00',
        'label' => 'Cyber Week', 'untilLabel' => 'Dec 1',
        'lavaOffer' => 'cd29f1c3-559c-46f4-97bb-7a67640e2afb', // lava.top «Riff Killer — Year, Cyber Week»
    ],
];

/** The sale running now for this plan, or null. $now — Unix time (tests). */
function billing_sale($plan, $now = null) {
    $now = $now ?? (int)(getenv('BILLING_NOW') ?: time());
    foreach (BILLING_SALES as $s) {
        if ($s['plan'] === $plan && $now >= strtotime($s['from']) && $now < strtotime($s['until'])) return $s;
    }
    return null;
}

/** For the page: { plan: { price, was, label, untilLabel } } of the sales running now. */
function billing_sales_public($now = null) {
    $out = [];
    foreach (BILLING_SALES as $s) {
        if (billing_sale($s['plan'], $now)) $out[$s['plan']] = ['price' => $s['price'], 'was' => $s['was'], 'label' => $s['label'], 'untilLabel' => $s['untilLabel']];
    }
    return (object)$out;
}
