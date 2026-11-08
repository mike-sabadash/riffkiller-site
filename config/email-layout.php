<?php
/**
 * One look for every Riff Killer email (newsletter, weekly practice summary). Mike's request 08.11.2026:
 * a neat black header with rounded corners and the real logo, the text on white, a footer with contacts and
 * what Riff Killer gives. Pattern of premium learning/streaming services (Fender Play, Spotify, Masterclass):
 * 600 px card on a quiet grey, one headline, one button, a short "why you get this" line under the card.
 *
 *   assets/email/header-2.png  1200×264, black, rounded top corners baked in, logo + technique callouts
 *                            (Mike's own visual language from the Patreon banner, without band photos or logos)
 *   assets/email/logo.png    the wordmark in white for the footer
 * Both are made by tools/email/render-email-images.cjs from the logo SVG; they must stay on the site (emails
 * load them from SITE_URL). The deploy never overwrites an existing file in assets/, so a new look gets new file
 * names (header-2.png…), not just a new RK_EMAIL_V. Tables and inline styles only: Gmail, Apple Mail and Outlook read them alike.
 *
 * Blocks for rk_email_body(): ['eyebrow', text] ['h1', text] ['spec', text] ['p', text] ['b', text]
 * ['btn', label, url] ['cover', imageUrl, href, alt] ['mini', imageUrl, href, title, text] ['links', [[label, url]…]]
 * ['divider'] ['sign', text]
 */

const RK_EMAIL_V = 'e1';

const RK_EMAIL = [
    'page' => '#F1F0F4',     // outer grey, a touch of the brand violet
    'card' => '#FFFFFF',
    'ink' => '#17151C',      // text
    'muted' => '#6E6A78',    // secondary text
    'line' => '#E6E4EB',
    'night' => '#0B0B0E',    // header and footer band
    'accent' => '#8A4FE0',   // brand violet, buttons and eyebrows
    'accentInk' => '#7A3FD6',
    'spark' => '#FFD23F',    // yellow, only on black: the footer marks and one callout in the header (Mike 08.11)
    'onNight' => '#B9B5C4',
    'font' => "-apple-system, BlinkMacSystemFont, 'Segoe UI', 'Helvetica Neue', Helvetica, Arial, sans-serif",
];

function rk_email_e($s) { return htmlspecialchars((string)$s, ENT_QUOTES, 'UTF-8'); }

function rk_email_footer_texts($lang) {
    $all = [
        'en' => ['usp' => ['A new riff every Friday', 'Both hands on camera', 'Loops, slow motion, synced tabs'],
            'proof' => '200K+ people follow Mike’s riff breakdowns.', 'ask' => 'Questions? Message Mike on Instagram.'],
        'ru' => ['usp' => ['Новый рифф каждую пятницу', 'Обе руки в кадре', 'Лупы, замедление, табы в такт'],
            'proof' => 'За разборами Mike следят больше 200 тысяч человек.', 'ask' => 'Вопросы? Напишите Mike в Instagram.'],
        'es' => ['usp' => ['Un riff nuevo cada viernes', 'Las dos manos en cámara', 'Loops, cámara lenta, tabs sincronizadas'],
            'proof' => 'Más de 200 mil personas siguen los riffs de Mike.', 'ask' => '¿Preguntas? Escríbele a Mike en Instagram.'],
    ];
    return $all[$lang] ?? $all['en'];
}

/** Inner HTML of the white part of the card from blocks; returns [html, plainText]. */
function rk_email_body($blocks) {
    $blocks = array_values($blocks);
    $c = RK_EMAIL;
    $html = ''; $text = [];
    foreach (array_values($blocks) as $n => $b) {
        $next = $blocks[$n + 1][0] ?? '';
        switch ($b[0]) {
            case 'eyebrow':
                $text[] = mb_strtoupper($b[1]);
                $html .= '<p style="margin:0 0 10px;font-size:12px;line-height:16px;font-weight:700;letter-spacing:1.2px;text-transform:uppercase;color:' . $c['accentInk'] . ';">' . rk_email_e($b[1]) . '</p>';
                break;
            case 'h1':
                $text[] = $b[1];
                $html .= '<h1 style="margin:0 0 ' . ($next === 'spec' ? 8 : 20) . 'px;font-size:28px;line-height:34px;font-weight:800;letter-spacing:-0.4px;color:' . $c['ink'] . ';">' . rk_email_e($b[1]) . '</h1>';
                break;
            case 'spec':
                $text[] = $b[1];
                $html .= '<p style="margin:0 0 22px;font-size:14px;line-height:20px;color:' . $c['muted'] . ';">' . rk_email_e($b[1]) . '</p>';
                break;
            case 'p': case 'b':
                $text[] = $b[1];
                $html .= '<p style="margin:0 0 16px;font-size:16px;line-height:25px;color:' . $c['ink'] . ';' . ($b[0] === 'b' ? 'font-weight:700;' : '') . '">' . nl2br(rk_email_e($b[1])) . '</p>';
                break;
            case 'sign':
                $text[] = $b[1];
                $html .= '<p style="margin:24px 0 0;font-size:16px;line-height:25px;color:' . $c['ink'] . ';">' . nl2br(rk_email_e($b[1])) . '</p>';
                break;
            case 'btn':
                $text[] = $b[1] . ': ' . $b[2];
                $html .= '<table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:6px 0 22px;"><tr>'
                    . '<td bgcolor="' . $c['accent'] . '" style="border-radius:12px;">'
                    . '<a href="' . rk_email_e($b[2]) . '" style="display:inline-block;padding:14px 26px;font-size:16px;line-height:20px;font-weight:700;color:#FFFFFF;text-decoration:none;border-radius:12px;">' . rk_email_e($b[1]) . '</a>'
                    . '</td></tr></table>';
                break;
            case 'cover':
                $html .= '<a href="' . rk_email_e($b[2]) . '" style="display:block;margin:0 0 22px;text-decoration:none;">'
                    . '<img src="' . rk_email_e($b[1]) . '" width="504" alt="' . rk_email_e($b[3] ?? '') . '" style="display:block;width:100%;max-width:504px;height:auto;border:0;border-radius:14px;"></a>';
                break;
            case 'mini':
                $text[] = $b[3] . ' — ' . $b[4];
                $html .= '<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:0 0 18px;"><tr>'
                    . '<td width="96" valign="top" style="padding:0 16px 0 0;"><a href="' . rk_email_e($b[2]) . '"><img src="' . rk_email_e($b[1]) . '" width="96" alt="" style="display:block;width:96px;height:auto;border:0;border-radius:10px;"></a></td>'
                    . '<td valign="top"><p style="margin:0 0 4px;font-size:16px;line-height:22px;font-weight:700;color:' . $c['ink'] . ';">' . rk_email_e($b[3]) . '</p>'
                    . '<p style="margin:0;font-size:15px;line-height:22px;color:' . $c['muted'] . ';">' . rk_email_e($b[4]) . '</p></td></tr></table>';
                break;
            case 'links':
                $rows = '';
                foreach ($b[1] as $l) {
                    $text[] = '→ ' . $l[0] . ': ' . $l[1];
                    $rows .= '<tr><td style="padding:0 0 8px;"><a href="' . rk_email_e($l[1]) . '" style="display:block;padding:12px 16px;border:1px solid ' . $c['line'] . ';border-radius:10px;font-size:15px;line-height:20px;font-weight:600;color:' . $c['ink'] . ';text-decoration:none;">' . rk_email_e($l[0]) . ' <span style="color:' . $c['accentInk'] . ';">→</span></a></td></tr>';
                }
                $html .= '<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:0 0 14px;">' . $rows . '</table>';
                break;
            case 'divider':
                $html .= '<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:10px 0 26px;"><tr><td style="border-top:1px solid ' . $c['line'] . ';font-size:0;line-height:0;">&nbsp;</td></tr></table>';
                break;
        }
    }
    return [$html, implode("\n\n", $text)];
}

/**
 * The whole email. $o: base (site URL), lang, preheader, blocks, why, links [[label, url]…] (under the card),
 * socials (bool, default true). Returns ['html' => …, 'text' => …].
 */
function rk_email_layout($o) {
    $c = RK_EMAIL;
    $base = rtrim((string)($o['base'] ?? 'https://riffkiller.fun'), '/');
    $f = rk_email_footer_texts((string)($o['lang'] ?? 'en'));
    [$inner, $plain] = rk_email_body($o['blocks'] ?? []);
    $img = function ($name) use ($base) { return $base . '/assets/email/' . $name . '?v=' . RK_EMAIL_V; };
    $usp = '';
    foreach ($f['usp'] as $i => $u) {
        $usp .= '<td valign="top" width="33%" style="padding:0 ' . ($i < 2 ? '10px' : '0') . ' 0 0;font-size:13px;line-height:18px;color:#FFFFFF;font-weight:600;">'
            . '<span style="display:block;width:6px;height:6px;margin:0 0 8px;border-radius:3px;background:' . $c['spark'] . ';font-size:0;line-height:0;">&nbsp;</span>' . rk_email_e($u) . '</td>';
    }
    $social = [['Instagram', 'https://www.instagram.com/mikesabad'], ['YouTube', 'https://www.youtube.com/@Mikesabadash'], ['Patreon', 'https://www.patreon.com/cw/MikeSabadash']];
    $socialHtml = implode('<span style="color:#4A4752;">&nbsp;&nbsp;·&nbsp;&nbsp;</span>', array_map(function ($s) use ($c) {
        return '<a href="' . rk_email_e($s[1]) . '" style="color:' . $c['onNight'] . ';text-decoration:none;font-weight:600;">' . rk_email_e($s[0]) . '</a>';
    }, $social));
    $under = implode('&nbsp;&nbsp;·&nbsp;&nbsp;', array_map(function ($l) use ($c) {
        return '<a href="' . rk_email_e($l[1]) . '" style="color:' . $c['muted'] . ';text-decoration:underline;">' . rk_email_e($l[0]) . '</a>';
    }, $o['links'] ?? []));
    $pre = rk_email_e((string)($o['preheader'] ?? ''));

    $html = '<!doctype html><html lang="' . rk_email_e($o['lang'] ?? 'en') . '"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'
        . '<meta name="color-scheme" content="light only"><meta name="supported-color-schemes" content="light only"><title>Riff Killer</title>'
        . '<style>@media (max-width:620px){.rk-pad{padding-left:22px!important;padding-right:22px!important}.rk-usp td{display:block!important;width:100%!important;padding:0 0 12px!important}.rk-stack td{display:block!important;text-align:left!important}h1{font-size:24px!important;line-height:30px!important}}</style></head>'
        . '<body style="margin:0;padding:0;background:' . $c['page'] . ';-webkit-text-size-adjust:100%;">'
        . '<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">' . $pre . str_repeat('&#8199;&#65279;&#847; ', 40) . '</div>'
        . '<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" bgcolor="' . $c['page'] . '" style="background:' . $c['page'] . ';"><tr><td align="center" style="padding:28px 12px 36px;">'
        . '<table role="presentation" width="600" cellspacing="0" cellpadding="0" border="0" style="width:100%;max-width:600px;font-family:' . $c['font'] . ';">'
        // header: black, rounded top corners baked into the picture
        . '<tr><td style="font-size:0;line-height:0;"><a href="' . rk_email_e($base) . '/" style="display:block;text-decoration:none;">'
        . '<img src="' . rk_email_e($img('header-2.png')) . '" width="600" alt="Riff Killer" style="display:block;width:100%;max-width:600px;height:auto;border:0;background:' . $c['night'] . ';border-radius:18px 18px 0 0;color:#FFFFFF;font-size:20px;"></a></td></tr>'
        // white body
        . '<tr><td class="rk-pad" bgcolor="' . $c['card'] . '" style="background:' . $c['card'] . ';padding:40px 48px 40px;">' . $inner . '</td></tr>'
        // footer band: what Riff Killer gives, proof, contacts
        . '<tr><td class="rk-pad" bgcolor="' . $c['night'] . '" style="background:' . $c['night'] . ';padding:30px 48px 32px;border-radius:0 0 18px 18px;">'
        . '<table role="presentation" class="rk-usp" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:0 0 22px;"><tr>' . $usp . '</tr></table>'
        . '<table role="presentation" class="rk-stack" width="100%" cellspacing="0" cellpadding="0" border="0" style="border-top:1px solid #24222A;"><tr>'
        . '<td valign="middle" style="padding:20px 0 0;"><a href="' . rk_email_e($base) . '/"><img src="' . rk_email_e($img('logo.png')) . '" width="112" alt="Riff Killer" style="display:block;width:112px;height:auto;border:0;"></a></td>'
        . '<td valign="middle" align="right" style="padding:20px 0 0;font-size:13px;line-height:18px;">' . $socialHtml . '</td></tr></table>'
        . '<p style="margin:16px 0 0;font-size:13px;line-height:19px;color:' . $c['onNight'] . ';">' . rk_email_e($f['proof']) . ' <a href="https://www.instagram.com/mikesabad" style="color:#FFFFFF;text-decoration:underline;">' . rk_email_e($f['ask']) . '</a></p>'
        . '</td></tr>'
        // under the card: why this email, switches, unsubscribe
        . '<tr><td style="padding:22px 24px 0;text-align:center;font-size:12px;line-height:18px;color:' . $c['muted'] . ';">'
        . '<p style="margin:0 0 6px;">' . rk_email_e((string)($o['why'] ?? '')) . '</p>'
        . ($under !== '' ? '<p style="margin:0 0 6px;">' . $under . '</p>' : '')
        . '<p style="margin:0;"><a href="' . rk_email_e($base) . '/" style="color:' . $c['muted'] . ';text-decoration:none;">riffkiller.fun</a></p>'
        . '</td></tr></table></td></tr></table></body></html>';

    $foot = "\n\n---\n" . (string)($o['why'] ?? '');
    foreach ($o['links'] ?? [] as $l) $foot .= "\n" . $l[0] . ': ' . $l[1];
    return ['html' => $html, 'text' => $plain . $foot];
}
