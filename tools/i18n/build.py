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
        [/^(\d+) of (\d+) stars$/, function (m) { return m[1] + ' из ' + m[2] + ' ' + plural(m[2], 'звезды', 'звёзд', 'звёзд'); }],
        [/^(\d+) shots to kill$/, function (m) { return 'Ещё ' + m[1] + ' ' + plural(m[1], 'фрагмент', 'фрагмента', 'фрагментов') + ', чтобы добить'; }],
        [/^1 more kill to (.+)$/, 'Ещё 1 рифф до $1'],
        [/^(\d+) more kills to (.+)$/, function (m) { return 'Ещё ' + m[1] + ' ' + plural(m[1], 'рифф', 'риффа', 'риффов') + ' до ' + m[2]; }],
        [/^(\d+) riffs? killed · (\d+) techniques? learned$/, function (m) { return 'Добито риффов: ' + m[1] + ' · освоено приёмов: ' + m[2]; }],
        [/^(\d+) riffs killed$/, 'Добито риффов: $1'],
        [/^(\d+) techniques learned$/, 'Освоено приёмов: $1'],
        [/^(\d+) min played$/, 'Сыграно $1 мин'],
        [/^(\d+) more days to reach your goal$/, function (m) { return 'Ещё ' + m[1] + ' ' + plural(m[1], 'день', 'дня', 'дней') + ' до цели'; }],
        [/^(\d+) of (\d+) unlocked$/, 'Открыто $1 из $2'],
        [/^(\d+) of (\d+) riffs$/, function (m) { return m[1] + ' из ' + m[2] + ' ' + plural(m[2], 'риффа', 'риффов', 'риффов'); }],
        [/^Learned in (\d+) riffs$/, function (m) { return 'Освоен в ' + m[1] + ' ' + plural(m[1], 'риффе', 'риффах', 'риффах'); }],
        [/^Riff DNA (\d)\/(\d)$/, 'Riff DNA $1/$2'],
        [/^Practised on (\d+) days$/, function (m) { return 'Занимался ' + m[1] + ' ' + plural(m[1], 'день', 'дня', 'дней'); }],
        [/^(\d+) shots at ×1$/, function (m) { return m[1] + ' ' + plural(m[1], 'фрагмент', 'фрагмента', 'фрагментов') + ' на ×1'; }],
        [/^1 shot at ×1$/, '1 фрагмент на ×1'],
        [/^(\d+) shots · (\d+) stars · every part at full speed$/, function (m) { return m[1] + ' ' + plural(m[1], 'фрагмент', 'фрагмента', 'фрагментов') + ' · ' + m[2] + ' ' + plural(m[2], 'звезда', 'звезды', 'звёзд') + ' · каждая часть на полной скорости'; }],
        [/^I killed (.+) on Riff Killer\. riffkiller\.fun$/, 'Я добил $1 на Riff Killer. riffkiller.fun'],
        [/^(★{1,3}) (.+): clean at (×[\d.]+)\.$/, function (m, part) { return m[1] + ' ' + part(m[2]) + ': чисто на ' + m[3] + '.'; }],
        [/^★★★ (.+): at tempo\. We’ll ask you to review it in 3 days\.$/, function (m, part) { return '★★★ ' + part(m[1]) + ': на темпе. Через 3 дня попросим повторить.'; }],
        [/^✓ (.+)$/, function (m, part) { return '✓ ' + part(m[1]); }],
        [/^Decode (.+)$/, 'Decode: $1'],
        [/^Mutate (.+)$/, 'Mutate: $1'],
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
        [/^(\d+)\/(\d+) parts at tempo$/, 'На темпе $1/$2'],
        [/^of (\d+) days$/, function (m) { return 'из ' + m[1] + ' ' + plural(m[1], 'дня', 'дней', 'дней'); }],
        [/^This week · (\d+) min$/, 'Эта неделя · $1 мин'],
        [/^Goal met this week · (\d+) min$/, 'Цель недели выполнена · $1 мин'],
        [/^(\d+) days a week$/, function (m) { return m[1] + ' ' + plural(m[1], 'день', 'дня', 'дней') + ' в неделю'; }],
        [/^Review: (.+)$/, 'Повтор: $1'],
        [/^(.+) reached tempo a few days ago\. Play it once at ×1 to lock it in\.$/, function (m, part) { return part(m[1]) + ' вышла на темп несколько дней назад. Сыграй её один раз на ×1, чтобы закрепить.'; }],
        [/^Next part: (.+)\.$/, function (m, part) { return 'Следующая часть: ' + part(m[1]) + '.'; }],
        [/^Finish (.+)$/, 'Закончить: $1'],
        [/^Try (.+)$/, 'Попробуй: $1'],
        [/^One new technique: (.+)\. The rest you already play\.$/, function (m, part) { return 'Один новый приём: ' + part(m[1]) + '. Остальные ты уже играешь.'; }],
        [/^New techniques: (.+)\.$/, function (m, part) { return 'Новые приёмы: ' + m[1].split(', ').map(part).join(', ') + '.'; }],
        [/^Learned · (\d+) riffs$/, function (m) { return 'Освоен · ' + m[1] + ' ' + plural(m[1], 'рифф', 'риффа', 'риффов'); }],
        [/^(\d+) parts? · (\d+) riffs?$/, function (m) { return m[1] + ' ' + plural(m[1], 'часть', 'части', 'частей') + ' · ' + m[2] + ' ' + plural(m[2], 'рифф', 'риффа', 'риффов'); }],
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
        [/^lava\.top did not accept (.+)\. Try another email\.$/, 'lava.top не принял $1. Попробуй другой email.'],
        [/^lava\.top, our card payment service, did not accept your account email (.+)\. Enter another email for the receipt: premium still goes to the account you are signed in with\.$/, 'lava.top, наш сервис оплаты картой, не принял email твоего аккаунта $1. Введи другой email для чека: premium всё равно придёт на аккаунт, в который ты вошёл.'],
        [/^Left hand: (.+) · Right hand: (.+)$/, function (m, part) { return 'Левая рука: ' + part(m[1]).replace('MB', 'МБ') + ' · Правая рука: ' + part(m[2]).replace('MB', 'МБ'); }]
"""
ES_PATTERNS = r"""
        [/^(\d+) of (\d+) stars$/, '$1 de $2 estrellas'],
        [/^(\d+) shots to kill$/, '$1 tomas para dominarlo'],
        [/^1 more kill to (.+)$/, '1 riff más para $1'],
        [/^(\d+) more kills to (.+)$/, '$1 riffs más para $2'],
        [/^(\d+) riffs? killed · (\d+) techniques? learned$/, function (m) { return m[1] + (m[1] === '1' ? ' riff dominado' : ' riffs dominados') + ' · ' + m[2] + (m[2] === '1' ? ' técnica aprendida' : ' técnicas aprendidas'); }],
        [/^(\d+) riffs killed$/, '$1 riffs dominados'],
        [/^(\d+) techniques learned$/, '$1 técnicas aprendidas'],
        [/^(\d+) min played$/, '$1 min tocados'],
        [/^(\d+) more days to reach your goal$/, '$1 días más para tu meta'],
        [/^(\d+) of (\d+) unlocked$/, '$1 de $2 desbloqueados'],
        [/^(\d+) of (\d+) riffs$/, '$1 de $2 riffs'],
        [/^Learned in (\d+) riffs$/, 'Aprendida en $1 riffs'],
        [/^Riff DNA (\d)\/(\d)$/, 'Riff DNA $1/$2'],
        [/^Practised on (\d+) days$/, 'Practicaste $1 días'],
        [/^(\d+) shots at ×1$/, '$1 tomas a ×1'],
        [/^1 shot at ×1$/, '1 toma a ×1'],
        [/^(\d+) shots · (\d+) stars · every part at full speed$/, '$1 tomas · $2 estrellas · cada parte a velocidad completa'],
        [/^I killed (.+) on Riff Killer\. riffkiller\.fun$/, 'Dominé $1 en Riff Killer. riffkiller.fun'],
        [/^(★{1,3}) (.+): clean at (×[\d.]+)\.$/, function (m, part) { return m[1] + ' ' + part(m[2]) + ': limpia a ' + m[3] + '.'; }],
        [/^★★★ (.+): at tempo\. We’ll ask you to review it in 3 days\.$/, function (m, part) { return '★★★ ' + part(m[1]) + ': a tempo. En 3 días te pediremos repasarla.'; }],
        [/^✓ (.+)$/, function (m, part) { return '✓ ' + part(m[1]); }],
        [/^Decode (.+)$/, 'Decode: $1'],
        [/^Mutate (.+)$/, 'Mutate: $1'],
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
        [/^(\d+)\/(\d+) parts at tempo$/, '$1/$2 partes a tempo'],
        [/^of (\d+) days$/, 'de $1 días'],
        [/^This week · (\d+) min$/, 'Esta semana · $1 min'],
        [/^Goal met this week · (\d+) min$/, 'Meta cumplida esta semana · $1 min'],
        [/^(\d+) days a week$/, '$1 días por semana'],
        [/^Review: (.+)$/, 'Repaso: $1'],
        [/^(.+) reached tempo a few days ago\. Play it once at ×1 to lock it in\.$/, function (m, part) { return part(m[1]) + ' llegó a tempo hace unos días. Tócala una vez a ×1 para afianzarla.'; }],
        [/^Next part: (.+)\.$/, function (m, part) { return 'Siguiente parte: ' + part(m[1]) + '.'; }],
        [/^Finish (.+)$/, 'Termina $1'],
        [/^Try (.+)$/, 'Prueba $1'],
        [/^One new technique: (.+)\. The rest you already play\.$/, function (m, part) { return 'Una técnica nueva: ' + part(m[1]) + '. Las demás ya las tocas.'; }],
        [/^New techniques: (.+)\.$/, function (m, part) { return 'Técnicas nuevas: ' + m[1].split(', ').map(part).join(', ') + '.'; }],
        [/^Learned · (\d+) riffs$/, 'Aprendida · $1 riffs'],
        [/^1 part · 1 riff$/, '1 parte · 1 riff'],
        [/^(\d+) parts? · (\d+) riffs?$/, '$1 partes · $2 riffs'],
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
        [/^lava\.top did not accept (.+)\. Try another email\.$/, 'lava.top no aceptó $1. Prueba con otro email.'],
        [/^lava\.top, our card payment service, did not accept your account email (.+)\. Enter another email for the receipt: premium still goes to the account you are signed in with\.$/, 'lava.top, nuestro servicio de pago con tarjeta, no aceptó el email de tu cuenta $1. Escribe otro email para el recibo: el premium igual va a la cuenta con la que iniciaste sesión.'],
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
