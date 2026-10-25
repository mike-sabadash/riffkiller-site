"""Builds js/i18n/ru.js and js/i18n/es.js from strings.py.

Add or change a string in strings.py as (English, Russian, Spanish), then run:
    python3 tools/i18n/build.py
English must match the site text exactly (spaces collapse). Numbers and mixed text go in the patterns below.
"""
import json, os, sys
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from strings import T
keys = [t[0] for t in T]
dups = {k for k in keys if keys.count(k) > 1}
assert not dups, dups
RU_PATTERNS = r"""
        // Russian plural: 1 фрагмент, 2 фрагмента, 5 фрагментов.
        [/^(\d+) shots$/, function (m) { return m[1] + ' ' + plural(m[1], 'фрагмент', 'фрагмента', 'фрагментов'); }],
        [/^(\d+) days?$/, function (m) { return m[1] + ' ' + plural(m[1], 'день', 'дня', 'дней'); }],
        [/^Shot (\d+)$/, 'Фрагмент $1'],
        [/^Shot (\d+) \((\d+:\d\d)\)$/, 'Фрагмент $1 ($2)'],
        [/^Shot (\d+) · (\d+:\d\d)$/, 'Фрагмент $1 · $2'],
        [/^(\d+)\/(\d+) learned$/, 'Выучено $1/$2'],
        [/^Riffs in Collection \((\d+)\)$/, 'Риффы в коллекции ($1)'],
        [/^Speed Trainer: now (×[\d.]+) — (\d+) loops, then faster\.$/, 'Speed Trainer: сейчас $1 — $2 повтора, потом быстрее.'],
        [/^Downloading both cameras · (\d+)%$/, 'Загружаем обе камеры · $1%'],
        [/^Downloading both cameras…$/, 'Загружаем обе камеры…'],
        [/^Downloading both cameras · ([\d.]+) \/ ([\d.]+) MB$/, 'Загружаем обе камеры · $1 / $2 МБ'],
        [/^— (\d+) full loops at half speed$/, '— $1 полных повтора на половинной скорости'],
        [/^— (\d+) loops$/, '— $1 повтора'],
        [/^Next: (.+) at (\d+:\d\d(?:\.\d+)?)$/, function (m, part) { return 'Далее: ' + part(m[1]) + ' в ' + m[2]; }],
        [/^Next:$/, 'Дальше:'],
        [/^(.+) at (\d+:\d\d(?:\.\d+)?)$/, function (m, part) { return part(m[1]) + ' в ' + m[2]; }],
        [/^(.+) · (\d+:\d\d(?:\.\d+)?)$/, function (m, part) { return part(m[1]) + ' · ' + m[2]; }],
        [/^Loop (.+)$/, function (m, part) { return 'Повторять: ' + m[1].split(', ').map(part).join(', '); }],
        [/^(?:([\d:.]+) )?· in (.+)$/, function (m, part) { return (m[1] ? m[1] + ' ' : '') + '· в части ' + part(m[2]); }],
        [/^(\S+) · (.+) · ([\d:.]+–[\d:.]+)$/, function (m, part) { return part(m[1]) + ' · ' + part(m[2]) + ' · ' + m[3]; }],
        [/^Payment: (\w+)(?: · Next billing: (.+))?$/, function (m, part) { return 'Оплата: ' + part(m[1]) + (m[2] ? ' · Следующее списание: ' + m[2] : ''); }],
        [/^Payment: (\w+) · Paid until: (.+)$/, function (m, part) { return 'Оплата: ' + part(m[1]) + ' · Оплачено до: ' + m[2]; }],
        [/^(~[\d.]+ USDT)$/, '$1'],
        [/^Waiting for the transfer\. This amount is reserved for (\d+) min\.$/, 'Ждём перевод. Сумма закреплена за тобой ещё $1 мин.'],
        [/^Paid until (.+)\. USDT payments do not renew by themselves\.$/, 'Оплачено до $1. Оплата в USDT сама не продлевается.'],
        [/^Your premium ends on (.+)\.$/, 'Твой premium заканчивается $1.'],
        [/^(\d+) \/ (\d+) segments$/, '$1 / $2 фрагментов'],
        [/^Progress to (\d+)-day milestone$/, 'До рубежа в $1 дней'],
        [/^Toward the (\d+)-day mark$/, 'До отметки в $1 дней'],
        [/^(\d+)\/(\d+) parts$/, 'Частей: $1/$2'],
        [/^(\d+) of (\d+) parts at tempo$/, 'На темпе $1 из $2 частей'],
        [/^(\d+) parts to review$/, function (m) { return m[1] + ' ' + plural(m[1], 'часть', 'части', 'частей') + ' на повтор'; }],
        [/^This week: (\d+) of (\d+) days$/, 'На этой неделе: $1 из $2 дней'],
        [/^This session: (\d+) min$/, 'Эта сессия: $1 мин'],
        [/^best (×[\d.]+)$/, 'лучшая $1'],
        [/^Current streak: (\d+) day\(s\)$/, function (m) { return 'Текущая серия: ' + m[1] + ' ' + plural(m[1], 'день', 'дня', 'дней'); }],
        [/^days →$/, 'дней →'],
        [/^Active Premium$/, 'Premium активен'],
        [/^What is (.+)$/, function (m, part) { return 'Что такое ' + part(m[1]) + '?'; }],
        [/^(\d+) riffs?$/, function (m) { return m[1] + ' ' + plural(m[1], 'рифф', 'риффа', 'риффов'); }],
        [/^· (.+)$/, function (m, part) { return '· ' + part(m[1]); }],
        [/^Start free: (.+)$/, 'Начать бесплатно: $1'],
        [/^Continue (.+)$/, 'Продолжить: $1'],
        [/^(\$[\d.]+|[\d\s\u00a0\u202f]+ ₽) \/ month$/, '$1 / мес'],
        [/^(\$[\d.]+|[\d\s\u00a0\u202f]+ ₽) \/ year$/, '$1 / год'],
        [/^(\$[\d.]+|[\d\s\u00a0\u202f]+ ₽) \/ 3 months$/, '$1 / 3 мес'],
        [/^Auto-renewal is off\. Premium stays on until (.+)\.$/, 'Автопродление отключено. Premium действует до $1.'],
        [/^Renews automatically on (.+)\.$/, 'Следующее автоматическое продление: $1.'],
        [/^Left hand: (.+) · Right hand: (.+)$/, function (m, part) { return 'Левая рука: ' + part(m[1]).replace('MB', 'МБ') + ' · Правая рука: ' + part(m[2]).replace('MB', 'МБ'); }]
"""
ES_PATTERNS = r"""
        [/^1 shots$/, '1 toma'],
        [/^(\d+) shots$/, '$1 tomas'],
        [/^1 days?$/, '1 día'],
        [/^(\d+) days?$/, '$1 días'],
        [/^Shot (\d+)$/, 'Toma $1'],
        [/^Shot (\d+) \((\d+:\d\d)\)$/, 'Toma $1 ($2)'],
        [/^Shot (\d+) · (\d+:\d\d)$/, 'Toma $1 · $2'],
        [/^(\d+)\/(\d+) learned$/, '$1/$2 aprendidos'],
        [/^Riffs in Collection \((\d+)\)$/, 'Riffs en la colección ($1)'],
        [/^Speed Trainer: now (×[\d.]+) — (\d+) loops, then faster\.$/, 'Speed Trainer: ahora $1 — $2 loops y luego más rápido.'],
        [/^Downloading both cameras · (\d+)%$/, 'Descargando ambas cámaras · $1%'],
        [/^Downloading both cameras…$/, 'Descargando ambas cámaras…'],
        [/^Downloading both cameras · ([\d.]+) \/ ([\d.]+) MB$/, 'Descargando ambas cámaras · $1 / $2 MB'],
        [/^— (\d+) full loops at half speed$/, '— $1 loops completos a media velocidad'],
        [/^— (\d+) loops$/, '— $1 loops'],
        [/^Next: (.+) at (\d+:\d\d(?:\.\d+)?)$/, function (m, part) { return 'Sigue: ' + part(m[1]) + ' en ' + m[2]; }],
        [/^Next:$/, 'Siguiente:'],
        [/^(.+) at (\d+:\d\d(?:\.\d+)?)$/, function (m, part) { return part(m[1]) + ' en ' + m[2]; }],
        [/^(.+) · (\d+:\d\d(?:\.\d+)?)$/, function (m, part) { return part(m[1]) + ' · ' + m[2]; }],
        [/^Loop (.+)$/, function (m, part) { return 'Repetir: ' + m[1].split(', ').map(part).join(', '); }],
        [/^(?:([\d:.]+) )?· in (.+)$/, function (m, part) { return (m[1] ? m[1] + ' ' : '') + '· en ' + part(m[2]); }],
        [/^(\S+) · (.+) · ([\d:.]+–[\d:.]+)$/, function (m, part) { return part(m[1]) + ' · ' + part(m[2]) + ' · ' + m[3]; }],
        [/^Payment: (\w+)(?: · Next billing: (.+))?$/, function (m, part) { return 'Pago: ' + part(m[1]) + (m[2] ? ' · Próximo cobro: ' + m[2] : ''); }],
        [/^Payment: (\w+) · Paid until: (.+)$/, function (m, part) { return 'Pago: ' + part(m[1]) + ' · Pagado hasta: ' + m[2]; }],
        [/^(~[\d.]+ USDT)$/, '$1'],
        [/^Waiting for the transfer\. This amount is reserved for (\d+) min\.$/, 'Esperando la transferencia. Este monto está reservado por $1 min.'],
        [/^Paid until (.+)\. USDT payments do not renew by themselves\.$/, 'Pagado hasta el $1. Los pagos en USDT no se renuevan solos.'],
        [/^Your premium ends on (.+)\.$/, 'Tu premium termina el $1.'],
        [/^(\d+) \/ (\d+) segments$/, '$1 / $2 segmentos'],
        [/^Progress to (\d+)-day milestone$/, 'Hacia la meta de $1 días'],
        [/^Toward the (\d+)-day mark$/, 'Hacia la marca de $1 días'],
        [/^(\d+)\/(\d+) parts$/, '$1/$2 partes'],
        [/^(\d+) of (\d+) parts at tempo$/, '$1 de $2 partes a tempo'],
        [/^(\d+) parts to review$/, '$1 partes para repasar'],
        [/^This week: (\d+) of (\d+) days$/, 'Esta semana: $1 de $2 días'],
        [/^This session: (\d+) min$/, 'Esta sesión: $1 min'],
        [/^best (×[\d.]+)$/, 'mejor $1'],
        [/^Current streak: (\d+) day\(s\)$/, function (m) { return 'Racha actual: ' + m[1] + (m[1] === '1' ? ' día' : ' días'); }],
        [/^days →$/, 'días →'],
        [/^Active Premium$/, 'Premium activo'],
        [/^What is (.+)$/, function (m, part) { return '¿Qué es ' + part(m[1]) + '?'; }],
        [/^1 riffs?$/, '1 riff'],
        [/^(\d+) riffs$/, '$1 riffs'],
        [/^· (.+)$/, function (m, part) { return '· ' + part(m[1]); }],
        [/^Start free: (.+)$/, 'Empieza gratis: $1'],
        [/^Continue (.+)$/, 'Continuar: $1'],
        [/^(\$[\d.]+|[\d\s\u00a0\u202f]+ ₽) \/ month$/, '$1 / mes'],
        [/^(\$[\d.]+|[\d\s\u00a0\u202f]+ ₽) \/ year$/, '$1 / año'],
        [/^(\$[\d.]+|[\d\s\u00a0\u202f]+ ₽) \/ 3 months$/, '$1 / 3 meses'],
        [/^Auto-renewal is off\. Premium stays on until (.+)\.$/, 'Renovación automática cancelada. El premium sigue activo hasta el $1.'],
        [/^Renews automatically on (.+)\.$/, 'Se renueva automáticamente el $1.'],
        [/^Left hand: (.+) · Right hand: (.+)$/, function (m, part) { return 'Mano izquierda: ' + part(m[1]) + ' · Mano derecha: ' + part(m[2]); }]
"""
HEAD = """/**
 * %s interface strings for js/i18n.js. Keys are the English text exactly as it appears on the site.
 * Riff titles, artists and lesson texts typed in the admin are not here on purpose.
 */
(function () {
    'use strict';
%s
    window.RK_I18N.register({
        exact: %s,
        patterns: [%s    ]
    });
})();
"""
PLURAL = """
    function plural(n, one, few, many) {
        n = Math.abs(parseInt(n, 10)) % 100;
        var d = n % 10;
        if (n > 10 && n < 20) return many;
        if (d === 1) return one;
        if (d > 1 && d < 5) return few;
        return many;
    }
"""
def dump(idx):
    lines = ['{']
    items = [(t[0], t[idx]) for t in T]
    for i,(k,v) in enumerate(items):
        lines.append('            %s: %s%s' % (json.dumps(k, ensure_ascii=False), json.dumps(v, ensure_ascii=False), ',' if i < len(items)-1 else ''))
    lines.append('        }')
    return '\n'.join(lines)
OUT = sys.argv[1] if len(sys.argv) > 1 else os.path.join(HERE, '..', '..', 'js', 'i18n')
open(OUT+'/ru.js','w').write(HEAD % ('Russian', PLURAL, dump(1), RU_PATTERNS))
open(OUT+'/es.js','w').write(HEAD % ('Latin American Spanish (es-419)', '', dump(2), ES_PATTERNS))
print(len(T), 'strings')
