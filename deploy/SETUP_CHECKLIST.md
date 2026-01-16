# VPS Production Setup Checklist (Ubuntu 22.04 LTS)

## 1) Base server prep
- Install Ubuntu 22.04 LTS (most mature LTS right now).
- Update packages:
  - `sudo apt update && sudo apt -y upgrade`

## 2) Create a non-root user + SSH hardening
- Create user and add to sudo:
  - `sudo adduser subslush`
  - `sudo usermod -aG sudo subslush`
- Copy SSH key:
  - `sudo mkdir -p /home/subslush/.ssh`
  - `sudo cp ~/.ssh/authorized_keys /home/subslush/.ssh/`
  - `sudo chown -R subslush:subslush /home/subslush/.ssh`
  - `sudo chmod 700 /home/subslush/.ssh && sudo chmod 600 /home/subslush/.ssh/authorized_keys`
- Harden SSH:
  - `sudo sed -i 's/^#PasswordAuthentication yes/PasswordAuthentication no/' /etc/ssh/sshd_config`
  - `sudo sed -i 's/^#PermitRootLogin prohibit-password/PermitRootLogin no/' /etc/ssh/sshd_config`
  - `sudo systemctl restart ssh`

## 3) Firewall (UFW)
- `sudo ufw default deny incoming`
- `sudo ufw default allow outgoing`
- `sudo ufw allow 22/tcp`
- `sudo ufw allow 80/tcp`
- `sudo ufw allow 443/tcp`
- `sudo ufw enable`

## 4) Fail2ban
- `sudo apt install -y fail2ban`
- Create jail:
  - `sudo tee /etc/fail2ban/jail.d/sshd.local > /dev/null <<'EOF'`
  - `[sshd]`
  - `enabled = true`
  - `maxretry = 5`
  - `bantime = 1h`
  - `findtime = 10m`
  - `EOF`
- `sudo systemctl enable --now fail2ban`

## 5) Install Docker
- `sudo apt install -y ca-certificates curl gnupg`
- `sudo install -m 0755 -d /etc/apt/keyrings`
- `curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg`
- `sudo chmod a+r /etc/apt/keyrings/docker.gpg`
- `echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo $VERSION_CODENAME) stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null`
- `sudo apt update && sudo apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin`
- `sudo usermod -aG docker subslush`

## 6) Create directories
- `sudo mkdir -p /opt/subslush/deploy`
- `sudo mkdir -p /opt/subslush/data/redis /opt/subslush/data/caddy /opt/subslush/data/caddy_config`
- `sudo chown -R subslush:subslush /opt/subslush`

## 7) Copy project + deploy files
- Clone your repo to `/opt/subslush` (or rsync).
- Copy the contents of `deploy/` from this repo into `/opt/subslush/deploy`.

## 8) Configure backend env
- Create `/opt/subslush/deploy/backend.env` using `deploy/backend.env.example`.
- Ensure:
  - `APP_BASE_URL=https://subslush.com`
  - `PASSWORD_RESET_REDIRECT_URL=https://subslush.com/auth/login`
  - `NOWPAYMENTS_WEBHOOK_URL=https://api.subslush.com/api/v1/payments/webhook`
  - Set Redis password and DB creds correctly.
  - Use pooler or direct connection as planned.

## 9) Configure Caddy
- Edit `/opt/subslush/deploy/Caddyfile` and set your email.

## 10) Start services
- `cd /opt/subslush/deploy`
- `docker compose up -d --build`
- Check:
  - `curl -s https://api.subslush.com/health`

## 11) Cloudflare DNS
- `subslush.com` → CNAME to Vercel (proxy ON)
- `www.subslush.com` → CNAME to Vercel (proxy ON)
- `api.subslush.com` → A record to VPS (DNS-only for stability + real IPs)

## 12) Supabase auth URLs
- Site URL: `https://subslush.com`
- Redirect URLs:
  - `https://subslush.com/auth/confirm`
  - `https://subslush.com/auth/login`

## 13) Vercel rewrite
- `frontend/vercel.json` rewrite:
  - `/api/v1/:path*` → `https://api.subslush.com/api/v1/:path*`

## 14) Backups (Restic)
- Install restic:
  - `sudo apt install -y restic`
- Create `/opt/subslush/deploy/backup/restic.env` from example.
- Make script executable:
  - `chmod +x /opt/subslush/deploy/backup/backup.sh`
- Run once:
  - `/opt/subslush/deploy/backup/backup.sh`
- Cron (daily at 03:00):
  - `crontab -e`
  - `0 3 * * * /opt/subslush/deploy/backup/backup.sh >> /var/log/restic.log 2>&1`

## 15) Monitoring
- Add uptime check for `https://api.subslush.com/health`.
- Optional: install Netdata or node_exporter.

## 16) Updates
- OS updates: `sudo apt update && sudo apt -y upgrade`
- App updates: `git pull` then `docker compose up -d --build`.
