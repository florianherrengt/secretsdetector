const fingerprintInput = document.getElementById("visitorFingerprint");

if (fingerprintInput instanceof HTMLInputElement) {
	const assignVisitorFingerprint = async () => {
		try {
			const { default: FingerprintJS } = await import("https://openfpcdn.io/fingerprintjs/v5");
			const fingerprintAgent = await FingerprintJS.load();
			const fingerprintResult = await fingerprintAgent.get();
			fingerprintInput.value = fingerprintResult.visitorId;
		} catch {
			fingerprintInput.value = "";
		}
	};

	void assignVisitorFingerprint();
}
