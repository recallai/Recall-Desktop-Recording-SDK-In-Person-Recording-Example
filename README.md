# Recall Audio Recorder

A bare-bones Electron app on top of the Recall Desktop SDK (`@recallai/desktop-sdk@2.0.32`).
It does one thing: **audio-only in-person recordings**, requesting only the
**microphone** and **system-audio** permissions.

No meeting detection, no calendar, no transcript, no video.

## Setup

```bash
cp .env.example .env    # fill in RECALL_API_KEY and your region
npm install             # fetches the native SDK tarball + the Electron binary
npm start
```

`npm install` runs the SDK's `setup.js`, which downloads the matching native binary from S3.
Do **not** set `RECALL_LOCAL_BUILD` — this uses the published release, not a local build.

| Variable | Meaning |
|----------|---------|
| `RECALL_API_KEY` | Recall API key for the workspace recordings upload to |
| `RECALL_API_URL` | Region base host, no path. Default `https://us-west-2.recall.ai` |

## How it works

1. `RecallAiSdk.init()` with `acquirePermissionsOnStartup: ["microphone", "system-audio"]`.
   Those two are sufficient: the SDK gates capture on microphone **AND**
   (screen-capture **OR** system-audio), so it never asks for screen capture or accessibility.
2. Start → `prepareDesktopAudioRecording()` returns a synthetic window id for the
   whole-desktop ("in-person") recorder.
3. `POST {RECALL_API_URL}/api/v1/sdk_upload/` with `audio_mixed_mp3: {}` **and
   `video_mixed_mp4: null`**. The null matters — that field defaults to `{}` server-side,
   so omitting it still produces video.
4. `startRecording({ windowId, uploadToken })`, then `stopRecording({ windowId })`.

## macOS notes

System audio is the `kTCCServiceAudioCapture` TCC service, which needs
`NSAudioCaptureUsageDescription` in the host bundle's `Info.plist`. Electron 42 ships it,
which covers `npm start`; packaged builds get it from `extendInfo` in `forge.config.cjs`.
If you downgrade Electron, check that key first when system audio goes quiet.

## Files

| File | Role |
|------|------|
| `main.js` | SDK lifecycle, upload creation, start/stop, IPC |
| `preload.js` | contextBridge surface |
| `renderer/` | Permission pills, record button, event log |
| `forge.config.cjs`, `Entitlements.plist` | Packaging + codesign |
