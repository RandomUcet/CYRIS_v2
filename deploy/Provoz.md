# Provoz CYRIS na Ubuntu 24.04 LTS

Správce platformy pracuje v prohlížeči. Správce serveru používá přes SSH příkaz
`sudo cyrisctl`. Stav nasazení na konkrétní VM ukáže `sudo cyrisctl status`.
Přístup k Dockeru přes sudo stačí.

## Jednorázový přechod z instalace s obrazy cyris-local

Na Macu v naklonovaném repozitáři stáhni schválený main a přenes samotný nástroj.

```bash
git fetch origin main &&
git show FETCH_HEAD:deploy/cyrisctl > /tmp/cyrisctl-new &&
scp /tmp/cyrisctl-new cyris@10.15.0.33:cyrisctl-new &&
ssh -t cyris@10.15.0.33
```

Na serveru zadej příkazy do otevřeného terminálu. Token zadej do skryté výzvy.
Pro soukromé vydání a balíčky použij servisní účet, který má čtení repozitáře i
tří balíčků GHCR. GitHub Packages používá klasický token s rozsahem
`read:packages`. Pro čtení soukromého repozitáře klasickým tokenem je potřeba
také `repo`. Skutečný přístup omezuje oprávnění servisního účtu. Nastav expiraci.
Přístup k repozitáři se ukládá do `/etc/cyris/github.token` s právy 0600,
přístup k registru spravuje Docker účtu root.

```bash
sudo install -m 0755 "$HOME/cyrisctl-new" /opt/cyris/bin/cyrisctl &&
sudo cyrisctl github login &&
sudo cyrisctl versions
```

V okně údržby spusť `sudo cyrisctl update`, poté `sudo cyrisctl status`.
Pokud chybí GnuPG, doinstaluj ho pomocí `sudo apt-get install gpg`.
Příkaz `versions` potřebuje dokončené vydání v GitHub Releases. Chyba 404 může znamenat i chybějící přístup k soukromému vydání.

## Vývoj výhradně na GitHubu a GHCR preflight

Repozitář `RandomUcet/CYRIS_v2` je výhradním zdrojem kódu. Server nebere kód
z vývojových větví, ale až z **publikovaného stabilního GitHub Releasu**.
Ten obsahuje ověřený manifest s digesty tří obrazů.

Příkaz `sudo cyrisctl github verify` bezpečně zkontroluje, zda server smí číst
**všechny tři** privátní obrazy (`cyris-api`, `cyris-worker`, `cyris-web`).
Používá manifest-inspect, nestahuje vrstvy, nezastavuje služby a nic nemění v datech.
Je dostupný od vydání s touto opravou; na starém serveru nejprve použij
`sudo cyrisctl self-update` po publikaci vydání.

```bash
sudo cyrisctl github login
sudo cyrisctl github verify --version v2.4.12
sudo cyrisctl versions
# Po schválení nové verze a zálohy:
sudo cyrisctl update --version v2.1.0
sudo cyrisctl status
sudo cyrisctl doctor --full
```

**Problém 403 Forbidden:** I úspěšné `docker login ghcr.io` může skončit 403 při
pokusu o čtení package manifestu. Soukromé GitHub Packages mají vlastní ACL.
Servisní účet musí mít přístup ke všem třem balíčkům; klasický PAT potřebuje
`read:packages` a pro privátní repozitář také `repo`. V GitHub UI ověř
`Packages → balíček → Package settings → Manage access`, povolení účtu a
expiraci tokenu. Při chybě se release nezmění a databáze se nemigruje.
Neřeš 403 změnou SHA nebo vypnutím kontroly manifestu.

## Když GitHub Actions neprovede build

Pokud CI na pull requestu skončí s `runner_id=0`, bez kroků a bez logů,
nejde o výsledek testování CYRIS. Přesný postup diagnostiky, opravy
GitHub Actions účtu a možnosti izolovaného vlastního runneru je v
[obnovení vydávání](../docs/v2/release-runner-recovery.md).
Na Macu lze bez změny serveru spustit
`node scripts/release-doctor.mjs --run CISLO_BĚHU`.
Vydání nesmí přeskočit build, testy, ověření GHCR digestů ani obnovu zálohy.

## Vydání a aktualizace

Vývoj a kontrola změn probíhají v pull requestech do main. Vydání vzniká změnou
`deploy/VERSION` v main. GitHub Actions spustí sestavení a testy, sestaví obrazy
API, workeru a webu pro amd64 a arm64 a nakonec zveřejní release s manifestem.
Přerušené vydání lze znovu spustit přes Actions → Release, pokud verze ještě
nemá tag. Ke každému obrazu je v manifestu uložen jeho digest.

`sudo cyrisctl update` před odstávkou stáhne release, ověří otisk manifestu,
stáhne obrazy a zkontroluje potřebné migrace. Poté zastaví zápisy aplikace,
vytvoří a ověří zálohu a aktivuje novou verzi. Lokální konfigurace Caddy,
LDAPS a tajné hodnoty zůstanou součástí nastavení VM. Verzi potvrdí až po
kontrole připravenosti API. Při chybě aplikace bez migrace vrátí původní obrazy.
Pokud migrace už začala, vypíše přesný archiv pro obnovu. Příští verzi nástroje
nainstaluje `sudo cyrisctl self-update` z publikovaného vydání.

## Zálohy a obnova

`sudo cyrisctl backup` na dobu kopírování zastaví běžící služby. Délka výpadku
závisí na objemu dat a rychlosti disku. Archiv obsahuje data PostgreSQL,
Redis, Typesense, celý MinIO včetně auditu a nastavení instalace včetně klíče
CYRIS, interní autority Caddy a nakonfigurované CA pro LDAP.
Archiv je v `/var/backups/cyris`. Potřebuješ místo na pracovní a šifrovanou
kopii. Přenes šifrované archivy na jiné úložiště. Samostatně zabezpeč kopii
`/etc/cyris/backup.key` ve správci tajemství. Ztráta VM spolu s jedinou kopií
klíče znemožní rozšifrování.

| Operace | Příkaz |
|---|---|
| Vypsat zálohy | `sudo cyrisctl backups` |
| Rozšifrovat a ověřit poslední archiv | `sudo cyrisctl backup verify` |
| Zapnout každodenní zálohu ve 02.30 času serveru | `sudo cyrisctl backup enable` |
| Zobrazit příští běh | `systemctl list-timers cyris-backup.timer` |
| Výsledek posledního běhu | `sudo journalctl -u cyris-backup.service -n 40` |
| Vypnout plán | `sudo cyrisctl backup disable` |
| Obnovit zvolený archiv | `sudo cyrisctl restore JMENO_ARCHIVU` |

Plán po ověření nového archivu uchovává posledních 14 plánovaných záloh.
Ruční a předaktualizační zálohy spravuje správce zvlášť. Úložiště mimo VM
nastav podle dostupného cíle a jeho vlastní retence.

Obnovu si vyzkoušej na oddělené VM stejné architektury se stejnou instalací
a verzemi infrastrukturních obrazů. Přenes archiv a obnovovací klíč s právy
0600. Zajisti dostupnost aplikačních obrazů (u starých `cyris-local` též jejich
export nebo sestavení ze stejného commitu). Spusť ověření archivu, obnovu,
`sudo cyrisctl start` a `sudo cyrisctl doctor --full`. Otevři přihlášení, ověř
tým a známou přílohu. Obnova přepisuje data zvoleným bodem v čase. Staré
nešifrované archivy obsahují SQL a někdy jeden bucket. Jejich obnova vyžaduje
původní hlavní klíč v konfiguraci. Před přepsáním dat se vytvoří nový snapshot.

## Běžná kontrola

`sudo cyrisctl logs api` sleduje nové požadavky API. `sudo cyrisctl db status`
ukáže stav migrací a `sudo cyrisctl diagnostics` uloží systémový přehled do
adresáře záloh. Počátečního správce vytvoří `sudo cyrisctl admin create`.
Další LDAP správce může existující správce pověřit v administraci uživatelů.

## Volitelný watchdog aplikačních služeb
Po aktualizaci lze použít `sudo cyrisctl watchdog status` (jen čtení). Automatické zotavení se aktivuje výhradně příkazem `sudo cyrisctl watchdog enable`, vypíná `sudo cyrisctl watchdog disable`. Systemd kontroluje stav přibližně každou minutu. Vyžaduje dvě po sobě jdoucí pozorování unhealthy, běžící aplikační stack a zdravé postgres/redis/typesense/minio. Restartuje nejvýše jednu běžící aplikační službu na kontrolu, s cooldownem 30 minut a nejvýše třemi pokusy za 24 hodin na službu. Používá stejný zámek jako aktualizace, zálohy a restore. Před ručními zásahy mimo cyrisctl watchdog vypněte. Nikdy nezapíná zastavené služby, neobnovuje zálohu, nemigruje data ani nerestartuje úložiště. Worker healthcheck sleduje heartbeat a dokončení cyklu plánovače; nezaručuje úspěch jednotlivých úloh. Sledujte journalctl -u cyris-watchdog.service. Před ostrým cvičením vyzkoušejte v neprodukčním prostředí.

### Aktualizace provozní konfigurace 2.4.22
Samotný update obrazů zachovává stávající Compose. Pro nové limity front a worker healthcheck použijte po vydání nejprve `sudo cyrisctl self-update`, potom v údržbě `sudo cyrisctl update --version v2.4.22 --refresh-compose`. Volba stahuje digestově ověřený Compose z téhož releasu, kontroluje renderovanou infrastrukturu a odmítne změny neaplikačních služeb, sítí, volumes nebo topologie. Lokální úpravy samotných aplikačních služeb mohou být nahrazeny; zkontrolujte je před použitím. Env a samostatná konfigurace Caddy/LDAPS se zachovají. Záloha obsahuje předchozí Compose; bez migrace se při neúspěchu vrátí předchozí konfigurace, po pokusu o migraci je nutný řízený restore. Watchdog zůstává vypnutý, dokud jej výslovně neaktivujete.
