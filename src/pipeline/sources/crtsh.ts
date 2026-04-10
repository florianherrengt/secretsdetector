import { z } from "zod";
import type { DomainSourceDefinition, SourceFetchResult } from "./types.js";

const crtshInputSchema = z.object({
	tld: z.string().min(1).max(63)
});

export type CrtshInput = z.infer<typeof crtshInputSchema>;

export { crtshInputSchema };

const crtshEntrySchema = z.object({
	name_value: z.string()
});

const fetchCrtsh = z
	.function()
	.args(z.string().min(1))
	.returns(
		z.promise(
			z.discriminatedUnion("ok", [
				z.object({ ok: z.literal(true), entries: z.array(crtshEntrySchema) }),
				z.object({ ok: z.literal(false), error: z.string() })
			])
		)
	)
	.implement(async (tld) => {
		const url = `https://crt.sh/?q=%.${encodeURIComponent(tld)}&output=json`;

		try {
			const response = await fetch(url, {
				signal: AbortSignal.timeout(30_000),
				headers: { "User-Agent": "secret-detector/0.1.0" }
			});

			if (!response.ok) {
				return { ok: false, error: `HTTP ${response.status}` };
			}

			const body = await response.json();
			const entries = crtshEntrySchema.array().parse(body);
			return { ok: true, entries };
		} catch (error) {
			const message = error instanceof Error ? error.message : "Unknown error";
			return { ok: false, error: message };
		}
	});

const normalizeCrtshDomain = z
	.function()
	.args(z.string())
	.returns(z.string().nullable())
	.implement((domain) => {
		const d = domain.trim().toLowerCase();

		if (d.length === 0) return null;

		const withoutWildcard = d.replace(/^\*\./, "");

		if (withoutWildcard.length === 0) return null;

		const parts = withoutWildcard.split(".");

		if (parts.length < 2) return null;

		return `${parts[parts.length - 2]}.${parts[parts.length - 1]}`;
	});

const crtshFetch = z
	.function()
	.args(crtshInputSchema)
	.returns(z.promise(z.custom<SourceFetchResult>()))
	.implement(async (input): Promise<SourceFetchResult> => {
		const crtResult = await fetchCrtsh(input.tld);

		if (!crtResult.ok) {
			return { ok: false, error: crtResult.error };
		}

		const domainSet = new Set<string>();

		for (const entry of crtResult.entries) {
			const lines = entry.name_value.split("\n");

			for (const line of lines) {
				const trimmed = line.trim().toLowerCase();
				if (trimmed.length > 0) {
					domainSet.add(trimmed);
				}
			}
		}

		const domains = Array.from(domainSet).sort();

		return { ok: true, fetchedEntries: crtResult.entries.length, domains };
	});

const crtshSourceFetch = z
	.function()
	.args(z.record(z.unknown()))
	.returns(z.promise(z.custom<SourceFetchResult>()))
	.implement((input) => crtshFetch(crtshInputSchema.parse(input)));

const crtshSourceNormalize = z
	.function()
	.args(z.string())
	.returns(z.string().nullable())
	.implement((domain) => normalizeCrtshDomain(domain));

export const crtshSource: DomainSourceDefinition = {
	key: "crtsh",
	label: "crt.sh",
	description: "Certificate Transparency logs — find domains by TLD",
	inputSchema: crtshInputSchema,
	fetch: crtshSourceFetch,
	normalizeDomain: crtshSourceNormalize
};
