# Промо-ролик Riff Killer — исходники моушен-композиции (v2, 04.11.2026)
Не сайт: деплой эту папку не использует. Рабочие файлы (кадры, видео) не в git.
1. Съёмка экрана: Xvfb :99 + pulseaudio null sink `rec`; `DPR=2 node shoot3.cjs m2`, `DPR=3 node shoot3.cjs m3`, `DPR=3 node shoot3.cjs t3`; `python3 assemble.py <имя>` → clips/<имя>.mp4.
2. Кадры: clips → v2/fr/{m2,m3,t3}, рилс → v2/fr/reels (a: 0–3.2 с, b: 9.8–10.8, c: 13.9–20.3), шрифты Inter/Oswald (fontsource), лого из assets/logo-main.svg, обложки riff-thumbnails.
3. Рендер: `python3 rv2.py stills h1 <t...>` для проверки, `python3 rv2.py scene <hook> <t0> <t1> out.mp4` по сценам (хук 0–2.6 и основная 2.6–23.6), склейка concat -c copy, звук — reels.mov 0–23.6 с fade-out.
Таймлайн, камера (KEYS), источники экрана (SRC), касания (TAPS) и титры (TITLES) — в comp.js.

## v3 (04.11): плавное видео внутри телефона, пэкшот по Figma
- Запись экрана даёт 15–26 кадров/с и тормоза в ×0.5, поэтому видео внутри телефона подменяется: fr/vl = paranoid front.MOV, crop 1979x1113+1200+181 (совпадение с левой камерой приложения 0.998), 60 fps, рифф 0–3.2 с (часть 1); fr/vs = то же + правая камера (app-right.mp4, minterpolate до 60 fps) картинкой-в-картинке 0.434 ширины, как в paranoid-left-split.mp4. Полоса частей и бейдж скорости берутся поверх из захвата (vidState в comp.js).
- Пэкшот — по макету Mike в Figma (файл tSk7QQuqBXCEPkz8ykGOka, узел 4425:95383), координаты ×1.3155.
- KILL в финальном слогане — салатовая плашка, чёрный текст.
