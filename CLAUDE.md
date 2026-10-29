# RiffKiller — инструкция для Claude

Сайт riffkiller.fun: онлайн-курс гитары по методу Riff DNA. Риффы нарезаны на части (shots), две камеры, замедление, лупы, табы, прогресс со звёздами. Владелец — Mike, он не разработчик: технические шаги объяснять полностью и по шагам. Отвечать по-русски, термины Riff DNA (Scan, Split, Isolate, Decode, Mutate, Call, Answer, Land, Reset, kill) — по-английски.

Этот файл не попадает на сайт: деплой пропускает все `*.md`.

## Стек и структура
- Статические HTML/JS/CSS без сборки + PHP API в `api/*.php`, общая логика в `config/*.php`.
- Данные только на сервере: `data/` (users.json, progress/, billing, подписки), `.env`, `assets/video/`. В git их нет, деплой их не трогает.
- Главные страницы: `index.html`/`app.html` (каталог), `practice.html`, `profile.html`, `collection.html`, `billing.html`, `admin/`. Юридические: `terms.html`, `privacy.html`, `consent.html` (EN + RU в одном файле, версия в `config/legal.php`).
- Ключевые модули: `js/rk-progress.js` (прогресс, звёзды, ранги, избранное, синхронизация с `api/progress.php`), `js/practice*.js`, `js/riff-dna.js`, `js/riff-gallery-card.js` (карточки + RKFavorites), `js/auth-manager.js` (вход, модалка, согласие), `config/billing.php` (подписки и оплата).

## Правила, которые легко нарушить
- **Кэш.** Любой изменённый JS/CSS требует новой версии `?v=` во всех HTML, которые его подключают (`grep -rl "file.js?v=" --include=*.html .`).
- **Переводы.** Интерфейс пишется на английском. Точные строки → `tools/i18n/strings.py` как (en, ru, es), строки с числами → regex в `tools/i18n/build.py` (RU_PATTERNS / ES_PATTERNS). Затем `python3 tools/i18n/build.py`, поднять `VERSION` в `js/i18n.js` и `js/i18n.js?v=` во всех страницах. Что не переводить — `translate="no"`. RU: kill = «добить», shot = «фрагмент»; ранги и этапы метода не переводятся.
- **Шрифты** свои (`css/fonts.css`, `assets/fonts/`). Не подключать Google Fonts и любые сторонние скрипты/трекеры без обновления `privacy.html` (иначе понадобится баннер cookie).
- **Регистрация** требует согласия (`consent: true` в `api/auth/email-register.php`); новые поля пользователя — через `config/user-store.php`.
- **UI-правила** шапки, модалки входа и профиля — в `.cursorrules` и `docs/AUTH_MODAL.md`, дизайн каталога — `docs/DESIGN_SYSTEM_RIFFS.md`.
- **Табы** риффов — только по регламенту `docs/TAB_AGENT.md`. Не перезапускать автосинхронизацию Black Dog: она откатит ручную правку части 10.

## Проверка
- `npm ci && npm test` — юнит и API-тесты (Node 22, PHP, ffmpeg). Должны проходить все.
- `npm run test:e2e` — Playwright. В облачной сессии: `CHROMIUM_BIN=$(ls -d /opt/pw-browsers/chromium_headless_shell-*/*/chrome-headless-shell) npm run test:e2e`.
- Изменения интерфейса проверять скриншотом в браузере (тестовый сайт: `tests/site-fixture.cjs` → `startSite()`).

## Деплой
- `main` = production. Рабочий процесс: ветка `claude/<тема>` → тесты → `git merge --no-ff` в `main` → push.
- Push в `main` запускает GitHub Actions «Deploy RiffKiller»: тесты → выкладка с бэкапом → проверка → откат при ошибке. Обычно 2–5 минут.
- После push сверять живые файлы: `curl -s -o /tmp/x "https://riffkiller.fun/<file>?x=$RANDOM" && cmp /tmp/x <file>`.
- Очередь деплоя без отмены: если выкладка не появилась за 15 минут, предыдущий запуск, скорее всего, завис — попросить Mike отменить его в GitHub → Actions.
- Сервер общий с другими проектами (ghost.riffkiller.fun, rechord.online, banners.rechord.online): трогать только RiffKiller. Секреты CLAUDE_DEPLOY_* в репозитории не перезаписывать.

## Секреты
Токены, ключи и пароли не писать в репозиторий, Notion, документы проекта и логи. Названия всех ключей — в `.env.example`, значения — только в `.env` на сервере. В claude.ai/code доступ к GitHub даёт Claude GitHub App (токен не нужен). В чатах проекта Cowork токен лежит в закрытом файле на Google Drive Mike («RiffKiller — токен GitHub для Claude (не передавать)»): Claude сам берёт его коннектором Drive в `~/.secrets/` и пушит, у Mike ничего не просит. Коннектор GitHub в Cowork только читает. Подробно — документ проекта `claude/riffkiller-dev-setup.md`.
- В облачной среде claude.ai/code домен riffkiller.fun должен быть в разрешённых (Network access → Custom), иначе живые файлы после деплоя не сверить.

## Где контекст
- Notion — главный источник: «RiffKiller — статус продукта и инфраструктура» (https://app.notion.com/p/407cd8b5343f81dba14fd1d04dc54c92). Каждое заметное изменение — короткой записью туда. Решения — в подпроект, изменения стратегии — в «Единую память проекта».
- Документы проекта Claude «Riff Killer»: `claude/riffkiller-start-here.md`, `claude/riffkiller-integrations.md`, `claude/riffkiller-dev-setup.md`.
- В In progress в Notion не больше трёх задач, у каждой одно следующее действие.
