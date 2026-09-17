const recordButton = document.getElementById("record");
const logEl = document.getElementById("log");

for (const button of document.querySelectorAll("[data-permission]")) {
	button.addEventListener("click", () => window.api.requestPermission(button.dataset.permission));
}

recordButton.addEventListener("click", () => {
	if (recordButton.dataset.action === "stop") window.api.stopRecording();
	else window.api.startRecording();
});

window.api.onState((state) => {
	document.getElementById("state").textContent = state.recordingState;
	document.getElementById("upload").textContent = state.uploadId || "—";
	document.getElementById("error").textContent = state.error || "";

	for (const [permission, status] of Object.entries(state.permissions)) {
		const el = document.getElementById(`perm-${permission}`);
		el.textContent = status;
		el.className = `pill ${status}`;
	}

	const isRecording = state.recordingState === "recording";
	recordButton.dataset.action = isRecording ? "stop" : "start";
	recordButton.textContent = isRecording ? "Stop recording" : "Start recording";
	recordButton.disabled = state.recordingState === "starting" || state.recordingState === "stopping";
});

window.api.onLog((line) => {
	logEl.textContent += `${line}\n`;
	logEl.scrollTop = logEl.scrollHeight;
});
