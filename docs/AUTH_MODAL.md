# Модалка авторизации (единый контракт)

## Не дублировать

- Разметка и логика только в **`js/auth-manager.js`** (`showAuthModal`, закрытие, Patreon/Google/email).
- Стили только в **`css/auth-modal.css`** (подключаются скриптом при первом открытии или вручную в `<head>`).

## Подключение на новой странице

1. **`js/patreon-config.js`** (или эквивалент с `PATREON_CONFIG`), если нужны OAuth-редиректы.
2. **`js/auth-manager.js`** — после конфига.
3. Опционально в `<head>`:  
   `<link rel="stylesheet" href="css/auth-modal.css">`  
   (путь от корня сайта; на вложенных URL без этого стили всё равно подтянутся из того же каталога, что и `auth-manager.js`.)

## Вызов

```js
// после initPatronAuth() / когда есть window.patreonAuth
window.patreonAuth.showAuthModal();           // вкладка «Log in»
window.patreonAuth.showAuthModal('signup');   // «Sign up»
```

Не копировать HTML модалки и не заводить второй набор классов — только этот API.

## Шапка (чтобы не «поплыла» между страницами)

- Разметка: **`js/site-header.js`**, стили: **`css/rk-header.css`**.
- На страницах приложения: `body` с **`data-rk-header="app"`**, один и тот же набор скриптов, что на Profile/Practice.
- Шрифт Inter в шапке должен совпадать с лендингом (см. комментарий в `rk-header.css`).
