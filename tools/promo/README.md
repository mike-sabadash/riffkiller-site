# Промо-ролик Riff Killer — исходники моушен-композиции (v2, 04.11.2026)
Не сайт: деплой эту папку не использует. Рабочие файлы (кадры, видео) не в git.
1. Съёмка экрана: Xvfb :99 + pulseaudio null sink `rec`; `DPR=2 node shoot3.cjs m2`, `DPR=3 node shoot3.cjs m3`, `DPR=3 node shoot3.cjs t3`; `python3 assemble.py <имя>` → clips/<имя>.mp4.
2. Кадры: clips → v2/fr/{m2,m3,t3}, рилс → v2/fr/reels (a: 0–3.2 с, b: 9.8–10.8, c: 13.9–20.3), шрифты Inter/Oswald (fontsource), лого из assets/logo-main.svg, обложки riff-thumbnails.
3. Рендер: `python3 rv2.py stills h1 <t...>` для проверки, `python3 rv2.py scene <hook> <t0> <t1> out.mp4` по сценам (хук 0–2.6 и основная 2.6–23.6), склейка concat -c copy, звук — reels.mov 0–23.6 с fade-out.
Таймлайн, камера (KEYS), источники экрана (SRC), касания (TAPS) и титры (TITLES) — в comp.js.
