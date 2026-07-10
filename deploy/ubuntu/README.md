# BlackBox Server on Ubuntu (Computer B)

All technical services run here. Windows users only install `BlackBox-Setup.exe` on computer C.

## What runs on B

- Node sales dashboard API (`:5177`)
- Caddy HTTPS reverse proxy (`:80` / `:443`)
- Optional local MiroFish / Pixelle / ffmpeg / ComfyUI on the same host
- Secrets in `.env` (never ship these to C)

## Quick start

```bash
cd deploy/ubuntu
cp .env.example .env
# edit .env — especially BLACKBOX_DOMAIN and BLACKBOX_API_TOKEN
mkdir -p secrets
# optional: copy Google service account JSON to secrets/
chmod +x start.sh
./start.sh
```

Firewall recommendation:

```bash
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable
```

Keep `5177` private (only Caddy should reach it on the Docker network). The compose file publishes 5177 for debugging; remove that port mapping in production if desired.

## Client setup (Computer C)

1. Install `apps/blackbox-desktop/dist/BlackBox-Setup-1.0.0.exe`
2. Open BlackBox
3. Enter:
   - Server URL: `https://your-domain`
   - API Token: same value as `BLACKBOX_API_TOKEN`

## MiroFish / Pixelle on B

Start MiroFish so Visionist works:

```bash
# example — adjust to your MiroFish install
export MIROFISH_BASE_URL=http://127.0.0.1:5001
```

Point `PIXELLE_BASE_URL` / `COMFYUI_BASE_URL` at local services on B. Computer C never installs Python or ffmpeg.
