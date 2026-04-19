/* eslint-disable custom/no-raw-functions */
import { ioredisClient } from "../scan/redis.js";

const CONFIRM_TOKEN_KEY_PREFIX = "confirm-tokens:";

export interface ConfirmTokenRow {
	key: string;
	value: string;
}

export interface StoredConfirmTokenValue {
	action: string;
	context: Record<string, string>;
	userId: string;
}

export const getConfirmTokenStorageKey = (token: string) =>
	`${CONFIRM_TOKEN_KEY_PREFIX}${token}`;

export const getConfirmTokenRow = async (token: string): Promise<ConfirmTokenRow | null> => {
	const key = getConfirmTokenStorageKey(token);
	const value = await ioredisClient.get(key);

	if (value === null) {
		return null;
	}

	return { key, value };
};

export const parseConfirmTokenRow = (row: ConfirmTokenRow): StoredConfirmTokenValue => {
	return JSON.parse(row.value);
};

export const clearConfirmTokenRows = async () => {
	const keys = await ioredisClient.keys(`${CONFIRM_TOKEN_KEY_PREFIX}*`);

	if (keys.length > 0) {
		await ioredisClient.del(...keys);
	}
};
