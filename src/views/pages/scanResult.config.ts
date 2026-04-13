export const checkClassificationById = {
	"pem-key": "Private Key Exposure",
	"jwt-token": "Token Exposure",
	"credential-url": "Credential URL Exposure",
	"generic-secret": "Generic Secret Exposure",
	"localstorage-jwt": "Token Storage Exposure",
	"public-source-map": "Source Map Exposure",
	"missing-sitemap": "Site Configuration"
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

export const defaultSeverityLevelByCheckId = {
	"pem-key": "High",
	"jwt-token": "High",
	"credential-url": "High",
	"generic-secret": "Medium",
	"localstorage-jwt": "Medium",
	"public-source-map": "Medium",
	"missing-sitemap": "Low"
} as const;

export const severityScoreByLevel = {
	Critical: 95,
	High: 75,
	Medium: 55,
	Low: 30,
	None: 0
} as const;
