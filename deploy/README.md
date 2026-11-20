# CYRIS v2 — Production Deployment & Operations Guide

[Provoz serveru, vydání z GitHubu, zálohy a obnova](Provoz.md).


Production-grade deployment and operations layer for **Ubuntu Server 24.04 LTS (x86_64 / aarch64)**.

Pro první nasazení z Macu použijte [český návod pro samostatnou VM v CYLAB](Prvni-server.md). Stažený balíček obsahuje průvodce i zdrojový kód. Níže uvedený postup používá obrazy z registru.

---

## 1. Operator Experience on Fresh Ubuntu Server 24.04 LTS

On a clean Ubuntu Server 24.04 LTS host with standard packages:

```bash
# 1. Clone repository bootstrap source
git clone https://github.com/RandomUcet/CYRIS_v2.git
cd CYRIS_v2

# 2. Run idempotent system installer
sudo ./deploy/install.sh

# 3. Deploy and start CYRIS production stack
sudo cyrisctl deploy

# 4. Verify complete system health and isolated functional probe
sudo cyrisctl doctor --full

# 5. Bootstrap initial Platform Administrator
sudo cyrisctl admin create
```

**Zero manual interventions required:**
- No host `pnpm` or `node` required.
- No manual database shell operations.
- No hand-written Docker Compose commands.
- No manual drizzle migration commands.
- No local development `.env` dependencies.

---

## 2. Linux Production Filesystem Layout

CYRIS follows standard Linux production conventions and does **not** run from a development checkout:

| Path | Purpose | Permissions |
| :--- | :--- | :--- |
| `/opt/cyris` | Installed release runtime definition, release manifest, and `cyrisctl` binary | `0755` (`root:root`) |
| `/etc/cyris` | Production configuration secrets (`cyris.env`) | `0700` / file `0600` (`root:root`) |
| `/var/lib/cyris` | Persistent runtime data (`postgres`, `redis`, `typesense`, `minio`) | `0700` (`root:root`) |
| `/var/backups/cyris`| Verified disaster recovery backups and diagnostics archives | `0700` (`root:root`) |

---

## 3. Operational Command Surface: `cyrisctl`

The supported system management utility is `/usr/local/bin/cyrisctl`:

### System Lifecycle & Status
```bash
sudo cyrisctl deploy          # Pull images, run migrations, initialize search, start all services
sudo cyrisctl status          # Show live status table (Host, Postgres, Redis, Typesense, MinIO, API, Worker, Web)
sudo cyrisctl start           # Start all CYRIS containers
sudo cyrisctl stop            # Stop all CYRIS containers
sudo cyrisctl restart         # Restart all CYRIS containers
sudo cyrisctl logs            # Follow all service logs
sudo cyrisctl logs api        # Follow API server logs
sudo cyrisctl logs worker     # Follow background worker logs
```

### Verification & Health Checking
```bash
sudo cyrisctl doctor          # Fast sanity diagnostics
sudo cyrisctl doctor --full   # Comprehensive deep verification (Host, Infra, Application, Probes, Security)
sudo cyrisctl config check    # Verify /etc/cyris/cyris.env completeness and security
```

### Database & Migrations
```bash
sudo cyrisctl db status       # View applied vs pending database migrations
sudo cyrisctl db migrate      # Execute pending database migrations safely
sudo cyrisctl admin create    # Bootstrap or create Platform Administrator accounts
```

### Disaster Recovery & Backups
```bash
sudo cyrisctl backup                  # Create authoritative snapshot (Postgres + MinIO + Manifest)
sudo cyrisctl backup verify <file>    # Verify archive integrity, checksum, and contents
sudo cyrisctl backups                 # List all snapshots with timestamps, size, and status
sudo cyrisctl restore <file>          # Restore database and storage from a verified backup
sudo cyrisctl diagnostics             # Collect non-sensitive logs and system information archive
```

### Updates & Versioning
```bash
sudo cyrisctl versions                # Display installed version and available GitHub releases
sudo cyrisctl update                  # Upgrade to latest release with mandatory pre-update backup
sudo cyrisctl update --version v0.1.1  # Upgrade or pin to a specific release version
sudo cyrisctl self-update             # Update cyrisctl operations CLI utility
```

---

## 4. Production Security Architecture

1. **Network Isolation**:
   PostgreSQL (`5432`), Redis (`6379`), Typesense (`8108`), and MinIO internal API (`9000`) are isolated within internal Docker bridge networks (`cyris-internal`). They are **never** exposed to the public internet.

2. **Web Reverse Proxy**:
   CYRIS Web (`cyris-web`) proxies client-side requests internally to `cyris-api`. External clients only connect to port `3000` (or reverse proxy port `80`/`443`).

3. **Credential Rejection**:
   `cyrisctl config check` and `cyrisctl doctor --full` strictly reject default development credentials (e.g., `AdminPassword123!`, `cyris_dev_secret_change_in_prod`).

4. **Envelope Cryptography**:
   All integration credentials and session secrets use AES-256 envelope encryption governed by `CYRIS_MASTER_KEY` in `/etc/cyris/cyris.env`.

5. **AI Integration**:
   Optional external AI infrastructure (e.g. DGX Spark at `10.15.69.2`) is treated as non-blocking. If the CYLAB VPN is disabled, CYRIS reports a `WARNING` in `doctor` rather than failing core platform operations.
