# Монетизация через Patreon и вход через Google

Premium на сайте даётся только при **активном платном членстве в кампании RiffKiller**
(`PATREON_CAMPAIGN_ID`). Если задан `PATREON_TIER_IDS`, учитываются только эти tiers.
Патроны других авторов и бесплатные участники premium не получают.
Пока `PATREON_CAMPAIGN_ID` не задан, premium через Patreon не выдаётся никому.

Доступ действует до `next_charge_date` + 3 дня. Его обновляют повторный вход, проверка токена
и webhook. Если отписаться, доступ сохраняется до конца оплаченного периода.

Сервер не может обращаться к Patreon напрямую: Cloudflare отвечает error 1009, регион заблокирован.
Поэтому все запросы к Patreon идут через Vercel-прокси `patreon-proxy-vercel/`.

## 1. Paid plan на Patreon

1. https://www.patreon.com/cw/MikeSabadash → **Edit page → Membership → Tiers**.
2. Создай платный tier (например, «Riff Killer Premium»). Бесплатный tier premium не даёт.
3. В описании tier дай ссылку на https://riffkiller.fun и напиши, что войти нужно через Patreon
   **тем же аккаунтом**.

## 2. OAuth client: новый секрет

Старый `client_secret` попал в git, поэтому его нужно считать скомпрометированным.

1. https://www.patreon.com/portal/registration/register-clients → клиент RiffKiller.
2. Если есть кнопка перевыпуска секрета, перевыпусти. Если нет — создай новый client
   и удали старый. Тогда новый `Client ID` нужно вписать в `js/patreon-config.js`.
3. Redirect URIs:
   - `https://riffkiller.fun/patreon-callback.html`
   - `http://localhost:8000/patreon-callback.html`
4. Сохрани **Creator's Access Token** с той же страницы. Он нужен для шага 3 и в git не попадает.

## 3. Campaign ID и tier IDs

Patreon блокирует запросы из региона сервера. Выполни команды на своём компьютере
(при необходимости через VPN):

```bash
TOKEN='<Creator Access Token>'
curl -s https://www.patreon.com/api/oauth2/v2/campaigns -H "Authorization: Bearer $TOKEN"
# → data[0].id = PATREON_CAMPAIGN_ID

curl -s "https://www.patreon.com/api/oauth2/v2/campaigns/<CAMPAIGN_ID>?include=tiers&fields%5Btier%5D=title,amount_cents" \
  -H "Authorization: Bearer $TOKEN"
# → included[].id платных tiers = PATREON_TIER_IDS (через запятую, необязательно)
```

## 4. Webhook

1. https://www.patreon.com/portal/registration/register-webhooks
2. URL: `https://riffkiller.fun/patreon-webhook.php`
3. Triggers: `members:create`, `members:update`, `members:delete`,
   `members:pledge:create`, `members:pledge:update`, `members:pledge:delete`.
4. Secret → `PATREON_WEBHOOK_SECRET`. Запросы без верной подписи отклоняются с кодом 401.

## 5. Vercel-прокси (до выкладки сайта)

1. Vercel → проект прокси → Settings → Environment Variables: новые
   `PATREON_CLIENT_ID` и `PATREON_CLIENT_SECRET`.
2. Задеплой `patreon-proxy-vercel/` из этой версии: `cd patreon-proxy-vercel && vercel --prod`.
   Новый `/api/identity` передаёт в Patreon запрос с кампанией и tiers.
   С этой правкой старая версия сайта тоже работает, поэтому прокси выкладывается **первым**.

## 6. `.env` на сервере

```
PATREON_CLIENT_ID=<новый>
PATREON_CLIENT_SECRET=<новый>
PATREON_CAMPAIGN_ID=<из шага 3>
# PATREON_TIER_IDS=<id1,id2>
PATREON_WEBHOOK_SECRET=<из шага 4>
ADMIN_PASSWORD=<пароль админки /admin/>
```

`.env` принадлежит `root:www-data` с правами `0640`. В git его не коммитить.

## 7. Вход через Google

Код уже готов: state, PKCE, принимается только подтверждённый email.
Не хватает только ключей на сервере.

1. https://console.cloud.google.com → создай проект (или выбери существующий).
2. **Google Auth Platform → Branding** (раньше «OAuth consent screen»): название RiffKiller,
   support email, домен `riffkiller.fun`, ссылки на `/privacy.html` и `/terms.html`.
3. **Audience**: External → **Publish app**. Scopes `openid email profile` верификации не требуют.
4. **Clients → Create client → Web application**:
   - Authorized JavaScript origins: `https://riffkiller.fun`
   - Authorized redirect URIs: `https://riffkiller.fun/api/auth/google-callback.php`
5. Впиши Client ID и Client secret в `.env` на сервере:
   ```
   GOOGLE_CLIENT_ID=<...>.apps.googleusercontent.com
   GOOGLE_CLIENT_SECRET=<...>
   ```
6. Проверка: «Continue with Google» → вход → `app.html`. Если пользователь с этим email
   уже входил через Patreon или по email, Google привязывается к тому же аккаунту,
   подписка сохраняется.

## 8. Очистка сервера после выкладки

Удаление файлов из git не удаляет их с сервера. После выкладки:

```bash
cd <document root>
rm -f test.php env-check.php patreon-secrets.php *.log *.save patreon-proxy-vercel.zip
```

Подключи `deploy/nginx-riffkiller-security.conf` в `server {}` сайта перед PHP location,
затем `nginx -t && systemctl reload nginx`. Проверка (все запросы должны вернуть 404):

```bash
for p in .env data/users.json config/load-env.php test.php patreon-validate.log \
         "video.php?file=.env"; do
  printf '%s %s\n' "$(curl -s -o /dev/null -w '%{http_code}' "https://riffkiller.fun/$p")" "$p"
done
```
