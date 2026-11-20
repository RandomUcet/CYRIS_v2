# První server CYRIS pro CYLAB

## 1. Připrav virtuální stroj

Na hypervizoru CYLAB založ samostatnou VM s názvem cyris a nainstaluj Ubuntu Server 24.04 LTS (amd64). Jako výchozí velikost pro první nasazení doporučuji 8 vCPU, 16 GB RAM a 160 GB SSD. Po zkoušce s týmy zkontroluj hlavně spotřebu paměti a velikost příloh. GPU zůstává na Sparku.

V instalátoru Ubuntu vytvoř účet správce a zaškrtni Install OpenSSH server. Přiděl VM volnou stálou IPv4 nebo rezervaci DHCP. Pokud chceš používat DNS jméno, nastav jeho záznam ještě před instalací a používej toto jméno i v průvodci. Podle něj se vystaví certifikát. Přesnou adresu přiděluje správce sítě.

Z Macu musí být dostupné SSH na VM (TCP 22). Týmy potřebují z LAN/VPN HTTPS na VM (TCP 443). Na školním firewallu povol jen potřebné zdrojové sítě. VM během instalace stahuje balíky Ubuntu, obrazy z Docker Hubu a balíky z registru npm. Pro AI potřebuje síťovou cestu ze serveru na 10.15.69.2, TCP 8000 a 8001.

## 2. Spusť instalaci z Macu

Rozbal stažený ZIP do Stažených souborů. V Terminálu spusť:

    bash ~/Downloads/CYRIS-server/Instalovat.command

Zadej SSH cíl ve tvaru uživatel@adresa-nové-VM. Při prvním spojení ověř otisk SSH serveru proti konzoli VM. Používáš-li heslo místo SSH klíče, SSH si ho může vyžádat opakovaně. Na serveru potvrď sudo heslem svého účtu Ubuntu. Instalátor přenese verzi aplikace obsaženou v archivu a sestaví ji na VM. Nech terminál otevřený až do konce.

Průvodce připraví Docker, databázi, vyhledávání, úložiště, fronty, API, worker, web a HTTPS. Po kontrole přihlašovací stránky a dostupnosti služeb přes API se zeptá na e-mail, jméno a nové heslo prvního správce CYRIS. Heslo zadáváš dvakrát. Na konci vypíše adresu aplikace a stáhne na Mac veřejný kořenový certifikát.

## 3. Důvěřuj certifikátu a přihlas se

Ve složce vedle Instalovat.command najdeš CYRIS-<adresa>.crt. Na spravovaném školním zařízení může důvěru zajistit správce pomocí MDM. Na svém Macu otevři Klíčenku, importuj soubor do klíčenky Systém a u tohoto certifikátu v sekci Důvěra povol SSL. Pokud prohlížeč používá vlastní úložiště certifikátů, přidej certifikát i tam. Používej veřejný certifikát přenesený přes ověřené SSH. Soukromý klíč autority zůstává na serveru.

Otevři vypsané https://adresa/login a přihlas se novým účtem. Ověř, že prohlížeč spojení považuje za důvěryhodné. Stejnou důvěru potřebují zařízení týmů. Do ostrého cvičení lze využít školní certifikační autoritu prostřednictvím školní HTTPS proxy po dohodě se správcem.

## 4. Připrav první cvičení

Ve správě platformy vytvoř zkušební ročník. Pro první kontrolu projdi přihlášení týmu, jeho obrazovku a požadavek na podporu. Ve Správa platformy → Integrace a AI → CYRIS DGX Spark vyber Otestovat spojení. Pokud projde chat i embeddings, zapni Používat Spark v CYRIS. LDAP vyžaduje skutečné připojení ke školnímu adresáři a přiřazení účastníků k týmům. Provozní postupy obsahuje přiložená Příručka správce. E-mailové doručování vyžaduje školní SMTP relay.

## Provoz a přerušení instalace

Při neúspěchu oprav příčinu podle posledních řádků výpisu a spusť stejný balíček se stejnou adresou. Instalátor zachová vytvořené klíče a data. Průvodce slouží k prvnímu nasazení konkrétní verze. Na existující instalaci z jiného zdroje se zastaví.

Na VM použij podle potřeby:

    sudo cyrisctl status
    sudo cyrisctl logs api
    sudo cyrisctl backup

Trvalá data jsou ve /var/lib/cyris, nastavení a hlavní šifrovací klíč v /etc/cyris/cyris.env. Před ostrým cvičením pořiď zálohu mimo VM, včetně chráněné kopie konfigurace a TLS autority z /var/lib/cyris/caddy, a ověř obnovu na odděleném stroji. Služby jsou nastavené pro automatické spuštění s Dockerem po restartu.

## Přidání interního DNS jména po instalaci na IP

V interním DNS nastav A záznam jména webu na IPv4 serveru. Připoj Mac ke školní síti nebo VPN. V kopii repozitáře spusť `bash deploy/configure-web-dns.sh uživatel@IPv4-serveru` a zadej celé DNS jméno. Skript ověří adresu na Macu, přidá HTTPS jméno do Caddy a nastaví ho v CYRIS jako hlavní adresu. Při změně hlavní adresy se krátce restartují aplikační služby. Na konci prověří HTTPS i z Macu a vypíše adresu pro přihlášení.

Certifikát webu vydá stávající místní autorita CYRIS. Zařízení, která jí dosud nedůvěřují, potřebují její veřejný kořenový certifikát. Mac jej v takovém případě stáhne přes SSH a vypíše příkaz k nastavení důvěry pro SSL. Ve školních učebnách lze tentýž veřejný certifikát distribuovat centrálně. Přes nové jméno se přihlas znovu. Používáš-li také OIDC, přidej před přechodem odpovídající callback URL u poskytovatele identity.
