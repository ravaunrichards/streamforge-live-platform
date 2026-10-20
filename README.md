# StreamForge — Live Streaming Community

An independent Twitch-inspired starter with creator channels, stream sessions, a browser-based broadcaster preview, live-channel discovery, and room chat. Original branding; not affiliated with Twitch.

## Run
Requires Node.js 20+.
```sh
npm test
npm start
```
Open http://localhost:3000.

## Current scope
This starter includes a working HTTP API, account registration/login, channel creation, session state, room chat polling, and a browser camera/microphone preview. The preview is local to the broadcaster's browser: **it does not broadcast media to remote viewers**. Actual scalable streaming needs a media ingest/transcoding provider or WebRTC SFU, TURN, storage/CDN, moderation, abuse reporting, and hardened production authentication.

Data is stored in `data/db.json` for local development. Do not use the file-backed store as a production database. Configure a long `SESSION_SECRET` before deployment.
