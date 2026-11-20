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
