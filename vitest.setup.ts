import { ioredisClient } from "./src/server/scan/redis.js";

export default async function setup() {
	if (ioredisClient.status !== "ready") {
		await new Promise<void>((resolve) => ioredisClient.once("ready", () => resolve()));
	}
}
