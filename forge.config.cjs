module.exports = {
	packagerConfig: {
		derefSymlinks: false,
		asar: false,
		osxSign: {
			continueOnError: false,
			optionsForFile: () => ({ entitlements: "./Entitlements.plist" }),
		},
		extendInfo: {
			NSMicrophoneUsageDescription: "Records your microphone for in-person recordings.",
			NSAudioCaptureUsageDescription: "Records system audio for in-person recordings.",
		},
	},
	makers: [{ name: "@electron-forge/maker-zip", platforms: ["darwin"] }],
};
