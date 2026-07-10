# BlackBox Desktop (Computer C)

Offline Windows client. Double-click the installer and open the app — server URL and API token are built in for the single-user Tailscale setup.

## Develop

```bash
npm install --prefix apps/blackbox-desktop
npm run blackbox:desktop:start
```

## Build installer

```bash
npm run blackbox:desktop:build
```

Output: `apps/blackbox-desktop/dist/BlackBox-Setup-1.0.0.exe`

Built-in defaults live in `defaults.json` (`serverUrl` + `apiToken`).
