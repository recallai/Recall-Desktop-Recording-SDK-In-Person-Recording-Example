const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("api", {
	startRecording: () => ipcRenderer.invoke("start-recording"),
	stopRecording: () => ipcRenderer.invoke("stop-recording"),
	requestPermission: (permission) => ipcRenderer.invoke("request-permission", permission),
	onState: (callback) => ipcRenderer.on("state", (_event, state) => callback(state)),
	onLog: (callback) => ipcRenderer.on("log", (_event, line) => callback(line)),
});
