# Obnovení vydávání CYRIS (GitHub Actions, GHCR, Ubuntu)

## Co znamená současná chyba

U běhů CI z 23. 11. 2026 skončil job `validate` za několik sekund
s prázdným `runner_name`, `steps: []` a bez dostupných job logů.
**Neproběhl build ani jediný test.** Samotný tento příznak neprokazuje
nedostatek kreditu, účetní problém ani chybu kódu. Přesnou příčinu může
zobrazovat anotace chyby v GitHub webovém rozhraní (Actions → CI → validate).

Diagnostika z Macu nebo izolované vývojové VM (pouze čte GitHub):

```bash
gh auth status
node scripts/release-doctor.mjs --run 45232999107
```

Příkaz nerozesílá data, nic nedeployuje ani nevytváří release. Rozlišuje:
- `RUNNER_NOT_ALLOCATED`: selhání ještě před spuštěním kroků
- `JOB_FAILED`: test či build skutečně běžel a selhal
- `PASSED`: nahlášené joby proběhly úspěšně a měly kroky
- `PENDING`/`UNVERIFIED`: **není důkaz** úspěšné validace

## Varianta A — opravit GitHub-hosted runner

1. Na stránce [aktuálního CI](https://github.com/RandomUcet/CYRIS_v2/actions)
   otevřít konkrétní neúspěšný job `validate` a přečíst jeho *anotaci*.
2. V GitHub repository **Settings → Actions → General** ověřit povolení Actions.
   Pokud anotace uvádí omezený rozpočet, pozastavenou fakturaci nebo limit,
   opravit příslušnou položku pod **Billing / Budgets** účtu vlastníka.
3. Znovu spustit CI přes GitHub UI na přesném commitu PR (nikoliv na
   starším „zeleném“ commitu); ověřit, že job skutečně provede kroky.
4. Nepokračovat k merge ani release, dokud nezelená sada testů a
   izolovaná obnova zálohy.

V samotném repozitáři nelze dodatečně „vynutit“ přidělení GitHub-hosted
runneru, pokud je blokuje nastavení účtu či platformy.

## Varianta B — izolované vlastní Linux runnery

Pokud GitHub-hosted joby stále nejdou přidělovat a účet dovoluje vlastní
runnery, lze použít důsledně oddělené **jednorázové Ubuntu VM**:

1. GitHub repository → **Settings → Actions → Runners → New self-hosted runner**.
   Postupovat podle **aktuálních příkazů, které GitHub zobrazí** (token
   registrace sem ani do repozitáře nevkládat).
2. Zřídit **izolovanou CI VM**, bez přístupu k produkčním datům/síti a
   bez produkčních tajemství, se štítkem `cyris-ci`. Musí podporovat
   Linux + Docker daemon, Docker Compose v2, sudo bez interaktivní výzvy pro
   izolovanou obnovu, Python 3, Node (nastavuje workflow) a potřebné místo.
   PR kód je nedůvěryhodný — ideálně čerstvý ephemeral runner pro každý běh.
3. Zřídit **oddělenou důvěryhodnou release VM** se štítkem `cyris-release`,
   Docker Buildx/QEMU pro `linux/amd64,linux/arm64`, s oprávněním push do GHCR.
   Používat jen pro ověřené commity z `main`, nikdy pro PR běhy.
4. GitHub repository → **Settings → Secrets and variables → Actions → Variables**
   nastavit **repository variables**:

   | Název | Hodnota | Účel |
   | --- | --- | --- |
   | `CYRIS_CI_RUNNER` | `cyris-ci` | Izolovaná validace PR i release preflight |
   | `CYRIS_RELEASE_RUNNER` | `cyris-release` | Pouze sestavení a publikace release |

   Workflow používají jinak výchozí `ubuntu-latest`. Nevyžadují
   ukládání tokenů do kódu. Pokud obě proměnné nejsou nastavené,
   nic se na běžném provozu GitHub Actions nemění.

5. CI pro PR #38 a PR #40 musí na nových runnerech **včetně DB testů,
   buildu, typové kontroly a obnovy zálohy** skutečně projít.
   Release job musí mít `contents:write`, `packages:write` a ověřenou
   správu přístupu k GHCR.

**Nikdy neinstalovat CI runner na produkční server CYRIS.**
Nenahrazovat selhání CI voláním release workflow bez předchozích testů,
nepřepínat branch protection a nezveřejňovat neověřené artefakty.

## Po obnovení CI: bezpečné vydání

1. Dokončit PR #38 (`v2.4.12`) a PR #40 (`v2.4.13`) **postupně**
   podle jejich závislosti. Každý PR musí mít zelený CI na svém aktuálním HEAD.
2. Vydávat změnou `deploy/VERSION` na `main`. Workflow **Release**
   nejdřív znovu spouští `validate`, potom sestaví a zveřejní
   tři immutable GHCR obrazy (API, Worker, Web) a přiloží manifest.
3. Ověřit [GitHub Releases](https://github.com/RandomUcet/CYRIS_v2/releases),
   assety `release-manifest.json`, `cyris-ubuntu.tar.gz`, `cyrisctl`,
   `install.sh`, `compose.prod.yml` a ne-prázdné digesty tří obrazů.
   Při neúplném release nepokračovat na server.
4. Na Ubuntu **až po úspěšném zveřejnění**:

   ```bash
   sudo cyrisctl self-update
   sudo cyrisctl github verify --version v2.4.12
   sudo cyrisctl versions
   sudo cyrisctl update --version v2.4.12
   sudo cyrisctl status
   sudo cyrisctl doctor --full
   ```

   Po ověření v2.4.12 stejný postup pro v2.4.13.
   Pokud GHCR vrátí 403, zkontrolovat **Package settings → Manage access**
   všech tří balíčků a oprávnění servisního účtu `read:packages`.

## Vývoj může mezitím pokračovat

Během blokace runneru lze dál vytvářet commity, testy a draft PR.
Nesmí se tím ale zaměňovat **ověřený zdrojový kód** za **otestovanou,
publikovanou a na serveru nasazenou verzi**.
