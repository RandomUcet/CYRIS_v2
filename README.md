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

Spusťte `CYRIS_TEAM_PREVIEW=1 pnpm dev`. Po migracích vznikne samostatné cvičení **CzechCybertron · Zkouška týmů**, sedm místních účtů a po jednom úkolu pro každý tým. Na přihlašovací stránce vyberte tým. Hesla zobrazí `pnpm teams:list` ve druhém terminálu ve stejném adresáři. Při změně týmu se odhlaste přes uživatelskou nabídku. Pro současnou práci dvou týmů použijte dva samostatné profily prohlížeče.

Údaje zůstávají v souboru `.cyris-preview/teams.json`. Při přenosu databáze zkušebního cvičení si uchovejte i tento soubor. Opakované spuštění zachová hesla i průběh úkolů. Běžné `pnpm dev` nové účty nezakládá, již založené účty zůstávají aktivní.

Pro vyzkoušení předání mezi týmy otevřete jako **Bezpečnostně právní služby** v evidenci vzorek **CV-L01**, zvolte **Zadat laboratorní rozbor** a vyberte **Laboratoř levandulového oleje**. Po přihlášení za laboratoř požadavek převezměte, zapište závěr a uzavřete rozbor. Žadatel pak u stejného požadavku uvidí výsledek.
