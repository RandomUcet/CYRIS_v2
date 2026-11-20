# CYRIS

Cybertron Registry & Intelligence System

CYRIS is an operational information and exercise-management platform for
Czech Cybertron / CYLAB.

## Stack

- Next.js
- NestJS
- PostgreSQL
- Redis / BullMQ
- Typesense
- MinIO
- pnpm workspaces

## Running CYRIS locally

The supported local workflow is documented in
[docs/STARTUP.md](./docs/STARTUP.md).

Quick start:

```bash
pnpm install
cp .env.example .env
pnpm dev
```

Then open http://localhost:3000. The launcher starts PostgreSQL, Redis,
Typesense, MinIO, Mailpit, the API, the worker, and the Next.js web
application. Use `pnpm dev:status` to check the live services.

For prerequisites, migrations, seeding, shutdown, reset, troubleshooting, and
service URLs, read [docs/STARTUP.md](./docs/STARTUP.md).

## Development checks

```bash
pnpm typecheck
pnpm build
git diff --check
```

### Místní zkouška sedmi týmů

Spusťte `CYRIS_TEAM_PREVIEW=1 pnpm dev`. Vznikne cvičení **CzechCybertron · Zkouška týmů**, sedm místních účtů a jeden výchozí úkol pro každý tým. Přístup je po první instalaci i po aktualizaci starší verze vypnutý.

1. Jako administrátor otevřete **Uživatelé a přístupy → Testovací přihlášení týmů** a zapněte přístup.
2. Otevřete odkaz `/login/teams` v soukromém okně, vyberte tým a zadejte jeho heslo. Příkaz `pnpm teams:list` ve druhém terminálu vypíše místní přihlašovací údaje.
3. V **Moje práce** otevřete týmovou obrazovku. Na monitoru lze zapnout celou obrazovku a tlačítkem **Zapnout a vyzkoušet zvuk** povolit původní signál DEFCON. Pro souběžnou zkoušku více účtů použijte samostatné profily prohlížeče.
4. V druhém profilu se přihlaste za **Juniorský krizový štáb**. Ve **Velení** změňte DEFCON a vyplňte pokyn účastníkům. Na týmové obrazovce se po aktualizaci objeví stupeň a pokyn, v otevřené aplikaci upozornění a ve zvonku záznam. Interní důvod je součástí historie velení.

Vypnutí přístupu ukončí platnost týmových relací. Opětovné spuštění zachová nastavení, hesla i průběh úkolů. Při přenosu zkušební databáze si uchovejte i místní soubor `.cyris-preview/teams.json`. Ve skutečném cvičení může správce v přehledu **Uživatelé a přístupy** u člena Juniorského krizového štábu zvolit **Pověřit řízením cvičení**. Na stejném místě může roli odebrat.

Pro vyzkoušení předání mezi týmy otevřete jako **Bezpečnostně právní služby** v evidenci vzorek **CV-L01**, zvolte **Zadat laboratorní rozbor** a vyberte **Laboratoř levandulového oleje**. Po přihlášení za laboratoř požadavek převezměte, zapište závěr a uzavřete rozbor. Žadatel pak u stejného požadavku uvidí výsledek.
