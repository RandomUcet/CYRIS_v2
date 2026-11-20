# CYRIS · Příručka správce platformy

Správu platformy otevřete v levé navigaci. V nabídce **Události** najdete jednotlivá cvičení. Před změnou týmu, role nebo scénáře zkontrolujte vybraný ročník. Připojení školního adresáře a Sparku platí pro celou instalaci.

| Když potřebujete… | Otevřete |
|---|---|
| Založit ročník nebo připravit jeho týmy | **Správa platformy → Události** a **Jednotky a týmy** |
| Připojit školní adresář nebo přiřadit skupinu k týmu | **Poskytovatelé identity** |
| Zařadit konkrétního člověka nebo vidět jeho obrazovku | **Uživatelé a přístupy** |
| Zapnout nebo vyzkoušet Spark | **Integrace a AI → CYRIS DGX Spark** |
| Změnit DEFCON, vydat zprávu nebo odpovědět účastníkovi | V pracovním prostředí cvičení **Velení**, **Řízení scénáře** nebo **Podpora cvičení** |

## 1. Spuštění a aktualizace

### Místní zkouška na Macu

Spusťte Docker Desktop. Z kořenové složky repozitáře použijte Node.js 22 nebo novější a verzi pnpm uvedenou v `package.json`. Při první instalaci se použije vzorová konfigurace. Na již používaném Macu příkaz stávající `.env` zachová.

```bash
cd ~/Developer/CYRIS_Preview_clean
test -f .env || cp .env.example .env
pnpm install --frozen-lockfile && pnpm dev
```

Po hlášení o připravenosti otevřete `http://localhost:3000`. Při prvním spuštění vytvořte ve druhém terminálu ve stejné složce lokální účet příkazem `pnpm admin:create`. Zadejte vlastní e-mail, jméno a heslo. Tento účet umožní přihlášení i při výpadku školního adresáře.

**Příští aktualizace.** Ukončete běžící `pnpm dev` pomocí Ctrl+C. Příkazem `git status --short --branch` zkontrolujte větev a místní úpravy. V čisté pracovní kopii s místní větví `main` spusťte následující blok. Pokud Git ohlásí přepsání upraveného souboru, zachovejte vlastní změny před přepnutím větve. Nové migrace provede spouštěč.

```bash
git switch main && git pull --ff-only https://github.com/RandomUcet/CYRIS_v2.git main &&
pnpm install --frozen-lockfile && pnpm dev
```

`pnpm dev:status` ukáže stav API, workeru a kontejnerů. Při chybě `libsimdjson…dylib` v Homebrew nainstalujte `brew install node@22`. Pro aktuální terminál lze tento Node vybrat příkazem `export PATH="$(brew --prefix node@22)/bin:$PATH"`. Ověřte `node --version` a zopakujte spuštění.

### Server pro účastníky

Na podporovaném Ubuntu Serveru 24.04 spusťte z kořenové složky repozitáře `sudo bash deploy/install.sh`. Do `/etc/cyris/cyris.env` nastavte veřejnou adresu v `PUBLIC_WEB_URL` a podle potřeby školní SMTP. Web pro účastníky zpřístupněte přes vlastní HTTPS adresu. Správce serveru uchovává konfiguraci včetně `CYRIS_MASTER_KEY` v chráněné záloze.

```bash
sudo cyrisctl config check
sudo cyrisctl deploy
sudo cyrisctl doctor --full
sudo cyrisctl admin create
```

Server nasazuje vydané obrazy aplikace. Při výběru verze ověřte, že odpovídá požadované verzi CYRIS. Dostupná vydání vypíše `sudo cyrisctl versions`. Příkaz `sudo cyrisctl update --version ZNACKA_VYDANI` proveďte v servisním okně, se skutečnou značkou vydání. Před aktualizací vytváří zálohu.

## 2. Ročník, týmy a oprávnění

1. Ve **Správa platformy → Události** založte cvičení. Některé administrační formuláře jsou v angličtině. Do pole **Edition Name** zadejte název ročníku a do **Slug Identifier** krátký identifikátor bez mezer a diakritiky. Nastavte termín, jazyk a časové pásmo. Pro české cvičení vyberte `Europe/Prague`. Při přípravě ponechte stav `PREPARATION`.
2. Máte-li předchozí ročník, můžete z jeho řádku vytvořit kopii. Nový ročník ve stavu `DRAFT` převezme strukturu týmů, jejich schopnosti a role. Účastníky přidělíte zvlášť. U kopie zkontrolujte termín a nastavte `PREPARATION`.
3. V řádku ročníku otevřete **Týmy → Doplnit týmy a role**. Tím přidáte chybějící ze sedmi týmů a sedmi rolí CzechCybertronu. Po uložení uvidíte počty doplněných položek. Tlačítko funguje i na novém serveru a můžete ho použít opakovaně. Zachová vlastní názvy, oprávnění i přiřazené lidi.
4. V **Jednotky a týmy** vyberte tento ročník. Zkontrolujte názvy, podřízené týmy a schopnosti. Schopnost týmu určuje jeho agendu, například laboratorní práci. O tom, které záznamy smí konkrétní člověk číst nebo měnit, rozhoduje přidělená role a její rozsah.
5. V **Role a oprávnění** zkontrolujte názvy rolí a rozsah jejich působnosti. Ve **Uživatelé a přístupy** pak pro konkrétního člověka ověřte cvičení, tým i roli. V den zahájení změňte v detailu ročníku stav na `ACTIVE`.

Stejné šablony lze při místní přípravě doplnit z terminálu. Pro již založený ročník se slugem `cybertron-zkouska` použijte `CYRIS_SEED_EVENT_SLUG=cybertron-zkouska pnpm seed:system`. Dosaďte slug svého cvičení.

| Komu přístup nastavujete | Co přiřadit |
|---|---|
| Účastník týmu | Jeho tým a zpravidla `Team Member`. Pro odbornou práci doplňte příslušnou roli, například `Laboratory Worker`. |
| Člověk, který řídí DEFCON | Členství v **Juniorském krizovém štábu**. Ve **Uživatelé a přístupy** zvolte u jeho řádku **Pověřit řízením cvičení**. |
| Organizátor, který řídí scénář a frontu podpory | `Exercise Organizer` ve vybraném cvičení. Tato role obsahuje správu scénáře. Samostatná výchozí role `EXCON` je zaměřená na laboratorní agendu. |
| Správce instalace | Lokální správce z instalace a pověření správci s LDAP účtem. Integrace, přihlašování a dostupnost modulů se spravují na této úrovni. |

### Další správce platformy

Po prvním přihlášení kolegy přes LDAP otevřete **Uživatelé a přístupy → Správci platformy**. Vyhledejte jeho jméno nebo e-mail, ověřte účet ve výsledcích a potvrďte **Přidat správce**. Po obnovení stránky uvidí kolega celou administraci a může jmenovat další správce. Role platí i bez členství ve cvičení.

Pro odebrání otevřete stejnou sekci, vymažte hledání a u daného správce potvrďte **Odebrat roli**. Každou změnu zaznamenává audit. Vlastní roli může odebrat jiný správce. Lokální správce z instalace zůstává k dispozici i při výpadku adresáře.

## 3. LDAP a zařazení účastníků

### Jedno pravidlo pro celou školní skupinu

1. Ve **Správa platformy → Poskytovatelé identity** přidejte nebo upravte LDAP / Active Directory. Od správce adresáře si vezměte adresu služby, DN čtecího účtu a jeho heslo, počáteční DN uživatelů a DN skupin. DN je úplná cesta v adresáři. Pro přístup přes síť vyberte LDAPS nebo StartTLS podle nastavení školy.
2. Nastavte vyhledávání uživatele. Pro AD je běžný filtr `(sAMAccountName={username})`, pro adresář používající `uid` například `(uid={username})`. Zástupný text `{username}` ponechte ve filtru. Zapněte **Vytvořit účet při prvním přihlášení (JIT)**. Zkontrolujte, že záznam účastníka v adresáři má e-mail.
3. V **Skupiny LDAP a týmy** vyplňte **DN pro hledání skupin**. Obsahují-li skupiny atribut `member` s úplným DN uživatele nebo `memberUid` s jeho přihlašovacím jménem, můžete ponechat výchozí filtr. Jinou strukturu dohodněte se správcem adresáře.
4. Zvolte **Přidat pravidlo**. Do pole **Skupina LDAP (CN nebo DN)** zadejte jméno školní skupiny. Pokud je například `CYRIS-LAB` v adresáři vícekrát, použijte celou cestu, například `CN=CYRIS-LAB,OU=Skupiny,DC=skola,DC=cz`. Vyberte ročník, tým **Laboratoř levandulového oleje** a roli `Laboratory Worker`. Při ostrém nasazení použijte skutečné jméno a cestu ze školního adresáře.
5. Klikněte na **Uložit poskytovatele** a ověřte, že je zapnutý. Tlačítko **Ověřit konfiguraci** prověří vyplněná pole a pravidla. Spojení, heslo a členství ověří až přihlášení skutečného uživatele. V soukromém okně na úvodní stránce vyberte ve **Způsob přihlášení** svůj LDAP adresář a zadejte adresářové jméno a heslo. V druhém okně zkontrolujte výsledný tým a roli ve **Uživatelé a přístupy**.

CYRIS porovnává název skupiny bez ohledu na velikost písmen. Když účastník patří do více odpovídajících skupin, může získat více týmů a rolí. Při dalším úspěšném LDAP přihlášení se skupiny načtou znovu a zaniklé automatické vazby se přepočítají. Bez odpovídající skupiny může vzniknout účet, kterému se zatím žádné cvičení nenabídne.

### Jeden člověk přišel bez týmu nebo patří jinam

1. Nechte účastníka jednou přihlásit přes LDAP. Při hlášení **Zatím nemáte přidělené cvičení** už účet existuje.
2. Ve **Uživatelé a přístupy** vyberte ročník a otevřete **Zařazení účtů LDAP**. Vyhledejte jméno nebo e-mail. Pokud už člověk tým má, vypněte **Pouze bez týmu**.
3. Vyberte člověka, možnost **Ručně zvolený tým**, požadovaný tým a roli. Klikněte na **Uložit zařazení**. Účastník obnoví stránku. Změna platí pro vybrané cvičení a přežije další přihlášení.
4. Při návratu k běžnému rozdělení zvolte **Podle skupin LDAP**. Použijí se naposledy načtené skupiny. Čerstvou změnu ve školním adresáři ověřte novým přihlášením. Pro odebrání tohoto přístupu zvolte **Bez přiřazení z LDAP** a zkontrolujte také samostatně udělené role a členství.

U dříve pozastaveného členství zůstává přístup zablokovaný i po přidělení týmu. Chcete-li člověka vrátit zpět, použijte u jeho řádku **Stav → Aktivovat členství**. Tato volba vyžaduje aktivní uživatelský účet.

**Při odchodu účastníka** upravte členství ve školním adresáři i případnou ruční výjimku v CYRIS. Chcete-li ukončit přístup přidělený přes LDAP během běžící směny, použijte v CYRIS **Bez přiřazení z LDAP** a zkontrolujte výsledná oprávnění. Změna skupiny ve školním adresáři se vyhodnotí až při dalším přihlášení. Pro nouzové přihlášení správce použijte **Místní účet CYRIS**.

**Přihlášení přes OpenID Connect.** Pokud škola používá OIDC, v **Poskytovatelích identity** zadejte název připojení, **Issuer URL**, **Client ID** a podle registrace také **Client Secret**. Po jeho zapnutí zkopírujte na veřejné přihlašovací stránce adresu odkazu **Přihlásit přes** daného poskytovatele. V adrese nahraďte koncovku `/authorize` za `/callback` a výslednou adresu zaregistrujte u poskytovatele jako návratovou adresu CYRIS. Pravidla pro skupiny uvedená výše se uplatňují při přihlášení přes LDAP.

## 4. Spark v síti CYLAB

### Příprava zařízení

Spark musí mít na síťovém rozhraní adresu `10.15.69.2`. Mac připojte do sítě CYLAB nebo přes její VPN. Pro čistou instalaci skript počítá s DGX OS na GB10 se 128 GB paměti, Dockerem s NVIDIA runtime a účtem s přístupem k Dockeru. První stažení obrazu a modelů vyžaduje volné místo na disku a přístup k registru NVIDIA a Hugging Face. Následující příkazy spusťte z aktualizované složky CYRIS na Macu.

```bash
scp deploy/spark/setup.sh administrator@10.15.69.2:~/cyris-spark.sh &&
ssh -t administrator@10.15.69.2 'bash ~/cyris-spark.sh'
```

Příště po přihlášení přímo na Spark stačí `bash ~/cyris-spark.sh`. Skript zkontroluje obě služby, využije odpovídající existující instalaci a připraví chybějící službu. Když stejný port používá jiná služba, vypíše konflikt. Příkaz `bash ~/cyris-spark.sh status` ukáže dostupnost modelů. Příkaz `bash ~/cyris-spark.sh test` nechá model odpovědět a spočítat jeden embedding. Při chybě otevřete `bash ~/cyris-spark.sh logs chat` nebo `bash ~/cyris-spark.sh logs embedding`.

### Zapnutí v aplikaci

Ve **Správa platformy → Integrace a AI → CYRIS DGX Spark** klikněte na **Otestovat spojení**. Funguje i při vypnutém profilu. V části **Poslední kontrola spojení** se podívejte na čas a výsledek obou služeb. Pak zapněte **Používat Spark v CYRIS**. Přepínač se uloží hned. Ovládá odesílání požadavků z CYRIS, oba modelové servery mají vlastní provozní stav.

| Služba | Adresa v CYLAB | Model |
|---|---|---|
| Chat a návrhy pro EXCON | `http://10.15.69.2:8000/v1` | `nvidia/Qwen3.8-27B-NVFP4` |
| Embeddings | `http://10.15.69.2:8001/v1` | `Qwen/Qwen3-Embedding-8B` |

Pevný profil má časový limit 120 sekund. Na nové instalaci začíná vypnutý, po aktualizaci převezme stav rozpoznaného staršího profilu. Z počítače, na kterém běží API CYRIS, prověříte síťovou cestu těmito dvěma příkazy. V každém výpisu hledejte odpovídající model z tabulky.

```bash
curl -fsS --connect-timeout 5 --max-time 15 http://10.15.69.2:8000/v1/models
curl -fsS --connect-timeout 5 --max-time 15 http://10.15.69.2:8001/v1/models
```

Pokud na Sparku projde `test`, ale v CYRIS se spojení nezdaří, prověřte trasu z hostitele API do sítě CYLAB. Pokud odpovídá jen jeden port, podle portu otevřete log konkrétní služby. Při výpadku Sparku může EXCON dál přijímat a ručně zpracovávat požadavky.

## 5. Příprava místností a průběh cvičení

### Před příchodem týmů

Ve **Uživatelé a přístupy** použijte u účastníka **Zobrazit jako**. Ověřte jeho **Moje práce**, dostupné moduly a obrazovku správného týmu. Náhled je pouze pro čtení, platí 15 minut a při ukončení vás vrátí do administrace. Pro zkoušku skutečného zápisu použijte zkušební ročník.

Na Macu můžete pro tento účel spustit `CYRIS_TEAM_PREVIEW=1 pnpm dev`. Vznikne samostatné cvičení se sedmi místními účty. Ve **Uživatelé a přístupy → Testovací přihlášení týmů** povolte přístup. V soukromém okně otevřete `/login/teams`. Hesla vypíše ve druhém terminálu `pnpm teams:list`. Vypnutí přepínače po zkoušce ukončí přístup i přihlášeným zkušebním účtům.

V každé místnosti otevřete pod účtem příslušného týmu **Týmové obrazovky**. Vyberte tým, klikněte na **Zapnout a vyzkoušet zvuk** a potom na **Celá obrazovka**. Přehrání ověří i hlasitost daného monitoru. Po novém otevření stránky zvuk znovu povolte. V režii můžete otevřít **Společná obrazovka cvičení**.

### Kdo dostane kterou zprávu

| Situace | Postup |
|---|---|
| Všichni potřebují stejný stupeň připravenosti a pokyn. | Ve **Velení** vyberte DEFCON, napište **Pokyn pro všechny týmy** a povinný interní důvod. Klikněte na **Zveřejnit DEFCON** a potvrďte. Stupeň 5 je klid, stupeň 1 katastrofa. Pokyn se zobrazí na obrazovkách týmů a změna v upozorněních. Interní důvod patří do historie velení. |
| Vybraný tým má dostat nové informace ve vhodný okamžik. | V **Řízení scénáře** založte fázi, zvolte **Připravit vstup**, napište zprávu pro příjemce a vyberte tým. Interní záměr a poznámky patří režii. Pro ruční vydání zkontrolujte **Náhled briefingu → Potvrdit vydání**. Příjemce najde zprávu v **Briefinzích** a může potvrdit přijetí, pokud o ně režie požádala. |
| Účastník potřebuje pomoc nebo něco hlásí. | V **Podpoře cvičení** má k dispozici **Časté dotazy** a **Napsat podpoře**. EXCON otevře **Fronta žádostí → Čeká na odpověď**. Může odpovědět ručně nebo použít **Navrhnout odpověď**. Návrh přečte, vloží, případně upraví a sám odešle. Při výměně obsluhy slouží **Připravit předání směny**. |

Plánovaný vstup se řídí **scénářovými hodinami**. Při automatickém vydání může připravená zpráva s již splněnými podmínkami odejít hned po uložení i ve stavu `PREPARATION`. Pro čistou zkoušku vyberte ruční potvrzení. Pauza hodin pozastaví automatické vydávání. Režie může způsobilý vstup stále vydat ručně.

### Když potřebujete omezit modul

Ve **Správa platformy → Dostupnost modulů** ověřte ročník. Vyberte modul, režim **Pouze pro čtení** nebo **Nedostupné** a rozsah **Celá událost**, **Tým** nebo **Účastník**. Prázdný začátek znamená ihned, prázdný konec trvání do ručního obnovení. Po vyplnění interního důvodu zvolte **Uložit omezení**. Nastavení a jeho historii vidí správce. Účastníci ve **Stavu služeb** vidí dopad na svou práci.

Pro předčasné ukončení otevřete konkrétní položku v **Aktivní a plánovaná omezení**, zvolte **Obnovit dostupnost** a doplňte důvod. Budoucí omezení lze zrušit volbou **Zrušit plán**. Pokud má o obnově rozhodnout výsledek práce týmu, rozbalte **Cíle obnovy**, založte cíl pro příslušného adresáta a zveřejněte ho. Po posouzení zprávy schvalte výsledek a obnovte dostupnost. Pokud se přístup nevrátil, zkontrolujte také ostatní omezení platná pro téhož člověka a modul.

## 6. Ukončení, zálohy a hledání chyb

Po poslední fázi ukončete plánovaná omezení, vyřiďte otevřené žádosti EXCONu a ve **Správa platformy → Události** převeďte ročník do `CLOSED`. Pro rozbor použijte **Časovou osu** a **Závěrečné vyhodnocení**. Změny oprávnění, přihlášení a administrátorské zásahy dohledáte v **Auditních záznamech** podle času, aktéra či akce. Až máte uzavřený i rozbor, můžete ročník archivovat.

### Provozní záloha a zkušební obnova

```bash
sudo cyrisctl backup
sudo cyrisctl backups
sudo cyrisctl backup verify
```

Na Ubuntu vzniká archiv a součet `.sha256` ve `/var/backups/cyris`. Bez názvu souboru prověří `backup verify` poslední archiv. Přeneste oboje na oddělené úložiště a chráněnou cestou uchovejte také konfiguraci `/etc/cyris/cyris.env`. Pro dešifrování dříve uložených hesel integrací potřebujete původní `CYRIS_MASTER_KEY`. Dodávaný serverový příkaz kopíruje soubory z místního úložiště `cyris-storage`. Pokud používáte další S3 buckety nebo vzdálené úložiště, zahrňte je do své zálohy samostatně.

Zkoušku obnovy proveďte na samostatném serveru s odpovídající verzí. Po přenesení archivu i součtu do adresáře záloh spusťte `sudo cyrisctl restore SOUBOR.tar.gz` se skutečným názvem. Obnova po potvrzení nahradí aktuální databázi cíle a obnoví soubory obsažené v archivu. Kontrola archivu ověřuje přítomnost manifestu a SQL, při přítomnosti `.sha256` také součet. Po obnově se přihlaste, otevřete známý záznam a stáhněte jeho přílohu. Tím ověříte i čitelnost přenesených dat. Pro místní zkoušku na Macu slouží `pnpm backup:create` a `pnpm backup:verify`.

### Rychlá diagnostika

| Co hlásí obsluha | První kontrola |
|---|---|
| Účastník se přihlásí, ale nevidí své cvičení nebo tým. | V **Zařazení účtů LDAP** ověřte uživatele, ročník, skupinu, zvolený režim i roli. Po změně ve školním adresáři zopakujte přihlášení. |
| Tým vidí modul, ale nemůže zapisovat. | Ověřte roli a její rozsah. Pak zkontrolujte **Dostupnost modulů** pro ročník, tým i osobu. |
| Týmová obrazovka mlčí nebo ukazuje starý stupeň. | Zkontrolujte stav spojení a naposledy potvrzený stav. Přímo na monitoru otevřete ovládání a vyzkoušejte zvuk. |
| Web se neotevře nebo se opožďují úlohy. | Na Macu `pnpm dev:status`. Na serveru `sudo cyrisctl status`, poté `sudo cyrisctl doctor --full`. Chyby aplikace ukáže `sudo cyrisctl logs api`, zpracování úloh `sudo cyrisctl logs worker`. |

Podrobný postup pro místní prostředí obsahuje [Spuštění CYRIS](STARTUP.md). Rozložení a příkazy serverové instalace uvádí [Provozní dokumentace](../deploy/README.md).

## Generátor registru pro cvičení

Ve vybraném cvičení otevřete **Scenario data → Dataset**. Režim **Local generator**
připraví osoby, organizace, místa a vybavení přímo v CYRIS. Při každé nové dávce
dostanete nový seed. Stejný seed lze zadat znovu pro opakovatelný náhled při
stejném stavu registru. Generátor kontroluje jména i proti osobám už uloženým
v tomto cvičení.

Pro obsah podle vlastního příběhu vyberte **Spark · scenario brief**. Do zadání
popište místo, pracovní prostředí, jazyk a důvod, proč se lidé ve cvičení potkávají.
Například „Pardubické depo během výměny směn. V češtině připrav dispečery,
pracovníky expedice a externí servis. U každé osoby popiš, co ten den předávala.“
Pro první pokus v **Custom counts** stačí 8 osob, 2 organizace, 2 místa a 3 zařízení.

**Prepare with Spark** ukládá návrh po částech. Model píše jednotlivé záznamy
a vybírá vazby na další položky v téže dávce. CYRIS přiděluje identifikátory.
Přes **Pause after this page** můžete práci přerušit. Po zavření stránky otevřete
dávku v historii přes **Open draft → Resume draft**. Při vytížení nebo výpadku
Sparku zůstanou dokončené části uložené. Před zápisem zkontrolujte ukázky osob,
popisy a počty. Tlačítkem **Add to registry** zveřejníte celou dávku v registru
daného cvičení. **Discard** odstraní rozpracovaný návrh.
