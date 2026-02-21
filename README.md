# OpenClaw Agent Dashboard

A reusable monitoring dashboard for OpenClaw agents: sessions, activity, memory, sub-agents, cron, and system health in one UI.

Built with Next.js 16, React 19, Tailwind v4, and shadcn/ui.

---

## What’s improved in this version

- ✅ **Real-data routes fixed** (no hardcoded machine-specific `/Users/...` paths)
- ✅ **Portable workspace detection** (`OPENCLAW_WORKSPACE` override + sane default)
- ✅ **Service reliability fix** (systemd user service PATH includes OpenClaw CLI)
- ✅ **Color/legibility pass**
  - Softer dark mode
  - “Paper gray” light mode
  - Reduced purple intensity and lower glare gradients

---

## Quick start

```bash
git clone https://github.com/zhound420/mordecai-dashboard
cd mordecai-dashboard
npm install
cp .env.example .env.local
# edit .env.local
npm run build && npm start
```

Default port is **3100**.

Dev mode:

```bash
npm run dev
```

---

## Environment variables

Copy `.env.example` to `.env.local`.

| Variable | Required | Description |
|---|---:|---|
| `NEXT_PUBLIC_AGENT_NAME` | no | Sidebar/title branding |
| `NEXT_PUBLIC_AGENT_TAGLINE` | no | Subtitle/tagline |
| `OPENCLAW_GATEWAY_URL` | yes | OpenClaw Gateway URL |
| `OPENCLAW_GATEWAY_TOKEN` | yes | Gateway token |
| `OPENCLAW_WORKSPACE` | no | Workspace root for memory/activity routes (default: `$HOME/.openclaw/workspace`) |

> The dashboard shells out to `openclaw` CLI. It does not directly call the gateway API.

---

## Data sources by page

| Page | Source |
|---|---|
| Overview | `openclaw status --json`, sessions, cron |
| Activity | sessions + cron + workspace memory files |
| Memory | `MEMORY.md` + `memory/*.md` from workspace |
| Agents | `openclaw status --json` + agent session metadata |
| System | status + cron |

API routes use short in-process caching (~3s TTL) to avoid hammering CLI calls.

---

## Make it easy for other agents to adapt

### 1) Branding
Set in `.env.local`:

```env
NEXT_PUBLIC_AGENT_NAME=Octavius
NEXT_PUBLIC_AGENT_TAGLINE=Sharp wit with a touch of humor
```

### 2) Theme tuning
Edit `app/globals.css` tokens:

- `:root` for light mode
- `.dark` for dark mode
- `--primary`, `--accent`, `--background`, `--card`, `--muted-foreground`

### 3) Port
Update `package.json` scripts (`-p 3100`) if needed.

### 4) Workspace portability
If your OpenClaw workspace is non-standard, set:

```env
OPENCLAW_WORKSPACE=/custom/path/to/.openclaw/workspace
```

---

## Run as a reboot-persistent service (recommended)

Create `~/.config/systemd/user/<agent>-dashboard.service`:

```ini
[Unit]
Description=OpenClaw Agent Dashboard
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
WorkingDirectory=/path/to/mordecai-dashboard
Environment=NODE_ENV=production
Environment=PATH=/home/YOUR_USER/.npm-global/bin:/usr/local/bin:/usr/bin:/bin
ExecStart=/usr/bin/env npm start
Restart=always
RestartSec=5

[Install]
WantedBy=default.target
```

Then:

```bash
systemctl --user daemon-reload
systemctl --user enable --now <agent>-dashboard.service
systemctl --user status <agent>-dashboard.service
```

---

## Requirements

- Node.js 18+
- `openclaw` CLI installed and authenticated
- OpenClaw gateway running/reachable

---

## OpenClaw docs

- https://docs.openclaw.ai
- https://github.com/openclaw/openclaw
