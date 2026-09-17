const { app, BrowserWindow, ipcMain } = require("electron");
const path = require("node:path");
const fs = require("node:fs");

require("dotenv").config({ path: path.join(__dirname, ".env") });

const RecallAiSdk = require("@recallai/desktop-sdk").default;

// Region base host with no path; the SDK takes it as-is, the REST API sits under /api/v1.
const API_BASE = (process.env.RECALL_API_URL || "https://us-west-2.recall.ai").replace(/\/+$/, "");
const UPLOAD_URL = `${API_BASE}/api/v1/sdk_upload/`;
const API_KEY = process.env.RECALL_API_KEY;
// SDK scratch dir. It only lands a local copy when RECALLAI_DESKTOP_SDK_DEV is set;
// otherwise audio streams straight to S3 and this stays empty.
const RECORDING_PATH = path.join(app.getPath("userData"), "recordings");

let mainWindow = null;

const state = {
	recordingState: "idle", // idle | starting | recording | stopping
	windowId: null,
	uploadId: null,
	permissions: { microphone: "unknown", "system-audio": "unknown" },
	error: null,
};

function sendState() {
	mainWindow?.webContents.send("state", state);
}

function log(message) {
	console.log(message);
	mainWindow?.webContents.send("log", `${new Date().toLocaleTimeString()}  ${message}`);
}

function createWindow() {
	mainWindow = new BrowserWindow({
		width: 560,
		height: 620,
		webPreferences: {
			preload: path.join(__dirname, "preload.js"),
			contextIsolation: true,
			nodeIntegration: false,
		},
	});
	mainWindow.loadFile(path.join(__dirname, "renderer", "index.html"));
	mainWindow.webContents.once("did-finish-load", sendState);
}

async function createUpload(title) {
	if (!API_KEY) throw new Error("RECALL_API_KEY is not set (see .env.example)");

	const response = await fetch(UPLOAD_URL, {
		method: "POST",
		headers: {
			Authorization: `Token ${API_KEY}`,
			"Content-Type": "application/json",
		},
		body: JSON.stringify({
			metadata: { title },
			recording_config: {
				// video_mixed_mp4 defaults to {} server-side; null is what makes this audio-only.
				video_mixed_mp4: null,
				audio_mixed_mp3: {},
			},
		}),
	});

	if (!response.ok) {
		throw new Error(`Upload create failed: ${response.status} ${await response.text()}`);
	}

	const { id, upload_token } = await response.json();
	if (!upload_token) throw new Error("No upload_token in response");
	return { id, uploadToken: upload_token };
}

async function startRecording() {
	if (state.recordingState !== "idle") return;

	state.recordingState = "starting";
	state.error = null;
	sendState();

	try {
		// In-person recording: no meeting window, just mic + system audio.
		const windowId = await RecallAiSdk.prepareDesktopAudioRecording();
		const { id, uploadToken } = await createUpload(`In-person recording ${new Date().toISOString()}`);

		state.windowId = windowId;
		state.uploadId = id;
		log(`Upload ${id} created; starting recording`);

		await RecallAiSdk.startRecording({ windowId, uploadToken });
	} catch (error) {
		state.recordingState = "idle";
		state.windowId = null;
		state.uploadId = null;
		state.error = error.message;
		log(`Start failed: ${error.message}`);
		sendState();
	}
}

async function stopRecording() {
	if (state.recordingState !== "recording" || !state.windowId) return;

	state.recordingState = "stopping";
	sendState();

	try {
		await RecallAiSdk.stopRecording({ windowId: state.windowId });
	} catch (error) {
		state.recordingState = "recording";
		state.error = error.message;
		log(`Stop failed: ${error.message}`);
		sendState();
	}
}

function registerSdkEvents() {
	RecallAiSdk.addEventListener("permission-status", (event) => {
		if (event.permission in state.permissions) {
			state.permissions[event.permission] = event.status;
			sendState();
		}
		log(`Permission ${event.permission}: ${event.status}`);
	});

	RecallAiSdk.addEventListener("recording-started", () => {
		state.recordingState = "recording";
		sendState();
		log("Recording started");
	});

	RecallAiSdk.addEventListener("recording-ended", () => {
		state.recordingState = "idle";
		state.windowId = null;
		sendState();
		log(`Recording ended; upload ${state.uploadId} finalizing`);
	});

	RecallAiSdk.addEventListener("error", (event) => {
		state.error = event.message;
		sendState();
		log(`SDK error (${event.type}): ${event.message}`);
	});

	RecallAiSdk.addEventListener("network-status", (event) => log(`Network ${event.status}`));

	RecallAiSdk.addEventListener("shutdown", (event) =>
		log(`SDK process exited (code=${event.code} signal=${event.signal})`),
	);
}

async function initSdk() {
	fs.mkdirSync(RECORDING_PATH, { recursive: true });
	registerSdkEvents();

	try {
		await RecallAiSdk.init({
			api_url: API_BASE,
			// Sufficient on their own: the SDK gates capture on microphone AND
			// (screen-capture OR system-audio), so neither of those is requested.
			acquirePermissionsOnStartup: ["microphone", "system-audio"],
			config: { recording_path: RECORDING_PATH },
		});
		log(`SDK initialized against ${API_BASE}`);
	} catch (error) {
		state.error = `SDK init failed: ${error.message}`;
		sendState();
		log(state.error);
	}
}

ipcMain.handle("start-recording", startRecording);
ipcMain.handle("stop-recording", stopRecording);
ipcMain.handle("request-permission", (_event, permission) => RecallAiSdk.requestPermission(permission));

app.whenReady().then(() => {
	createWindow();
	initSdk();
});

app.on("window-all-closed", () => app.quit());

let shuttingDown = false;
app.on("before-quit", async (event) => {
	if (shuttingDown) return;
	shuttingDown = true;
	event.preventDefault();
	try {
		await RecallAiSdk.shutdown();
	} catch {
		// Quitting either way.
	}
	app.quit();
});
