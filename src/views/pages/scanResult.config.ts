export const checkClassificationById = {
	"pem-key": "Private Key Exposure",
	"jwt-token": "Token Exposure",
	"credential-url": "Credential URL Exposure",
	"generic-secret": "Generic Secret Exposure",
	"localstorage-jwt": "Token Storage Exposure"
} as const;

export const classificationFallback = "General Security";

export const severityRankByFinding = {
	critical: 4,
	high: 3,
	medium: 2,
	low: 1,
	info: 0,
	null: 0
} as const;

export const severityScoreByLevel = {
	Critical: 95,
	High: 75,
	Medium: 55,
	Low: 30,
	None: 0
} as const;
