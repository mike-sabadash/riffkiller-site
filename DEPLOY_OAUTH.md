# Чеклист деплоя: OAuth и админка

## 0. Ошибка «redirect_uri не совпадает» / redirect_uri_mismatch

Яндекс и Google сравнивают redirect_uri **символ в символ** (протокол, хост, порт, путь). Даже `localhost` и `127.0.0.1` — разные.

**Шаг 1 — взять точные строки:** открой в браузере **`http://ТВОЙ_ХОСТ:ПОРТ/api/auth/redirect-uris.php`** (тем же адресом, с которого заходишь в приложение). Скопируй обе строки в настройки приложений [Яндекс OAuth](https://oauth.yandex.ru/) (Callback URI) и [Google](https://console.cloud.google.com/) (Authorized redirect URIs). Сохрани в обоих кабинетах.

**Шаг 2 — если ошибка остаётся:** зафиксируй базовый URL через `.env`, чтобы он не зависел от того, как открыт сайт (localhost vs 127.0.0.1 и т.д.). В корне проекта в файле `.env` добавь (подставь тот же хост и порт, что в адресной строке приложения):

```env
OAUTH_REDIRECT_BASE=http://localhost:8000
```

Перезапусти сервер, снова открой `.../api/auth/redirect-uris.php`, скопируй обновлённые URI и **заново** добавь их в Google и Яндекс (старые можно не удалять). После этого при логине будет отправляться ровно этот base.

## 1. Переменная SITE_URL и локальный тест

- **Локально:** при открытии с `localhost` или `127.0.0.1` базовый URL берётся из запроса — менять `SITE_URL` в `.env` не нужно.
- **На сервере:** в `.env` задай `SITE_URL=https://riffkiller.fun` (без слэша в конце).

## 2. Redirect URI в Google

1. [Google Cloud Console](https://console.cloud.google.com/) → APIs & Services → Credentials.
2. OAuth 2.0 Client ID (тип «Web application») → **Authorized redirect URIs**.
3. Добавь точный URI (лучше взять с `.../api/auth/redirect-uris.php`, см. раздел 0), например:
   - прод: `https://riffkiller.fun/api/auth/google-callback.php`
   - локально: `http://localhost:8000/api/auth/google-callback.php` (порт свой).
4. Сохрани.

## 3. Redirect URI в Yandex

1. [Яндекс OAuth](https://oauth.yandex.ru/) → приложение → **Callback URI**.
2. Добавь точный URI (с `.../api/auth/redirect-uris.php`), например:
   - прод: `https://riffkiller.fun/api/auth/yandex-callback.php`
   - локально: `http://localhost:8000/api/auth/yandex-callback.php`.
3. Сохрани.

## 4. Файлы для заливки на сервер

Залить обновлённые файлы (те же версии, что и в репозитории/локально):

| Путь |
|------|
| `admin/riffs.html` |
| `api/auth/google-login.php` |
| `api/auth/google-callback.php` |
| `api/auth/yandex-login.php` |
| `api/auth/yandex-callback.php` |
| `api/auth/redirect-uris.php` |
| `config/site-url.php` |

После этого OAuth (Google/Yandex) и раздел «Риффы» в админке должны работать корректно. На проде — с `SITE_URL` из `.env`, локально — без смены конфига, по текущему хосту.
