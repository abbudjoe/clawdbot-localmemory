import { homedir, hostname } from "node:os"
import { join } from "node:path"

export type CaptureMode = "everything" | "all"

export type LocalMemoryConfig = {
	ollamaHost: string
	ollamaModel: string
	dbPath: string
	profilePath: string
	autoRecall: boolean
	autoCapture: boolean
	maxRecallResults: number
	profileFrequency: number
	captureMode: CaptureMode
	debug: boolean
}

const ALLOWED_KEYS = [
	"ollamaHost",
	"ollamaModel",
	"dbPath",
	"profilePath",
	"autoRecall",
	"autoCapture",
	"maxRecallResults",
	"profileFrequency",
	"captureMode",
	"debug",
]

function assertAllowedKeys(
	value: Record<string, unknown>,
	allowed: string[],
	label: string,
): void {
	const unknown = Object.keys(value).filter((k) => !allowed.includes(k))
	if (unknown.length > 0) {
		throw new Error(`${label} has unknown keys: ${unknown.join(", ")}`)
	}
}

function resolveEnvVars(value: string): string {
	return value.replace(/\$\{([^}]+)\}/g, (_, envVar: string) => {
		const envValue = process.env[envVar]
		if (!envValue) {
			throw new Error(`Environment variable ${envVar} is not set`)
		}
		return envValue
	})
}

function expandPath(path: string): string {
	if (path.startsWith("~")) {
		return join(homedir(), path.slice(1))
	}
	return path
}

function sanitizeTag(raw: string): string {
	return raw
		.replace(/[^a-zA-Z0-9_]/g, "_")
		.replace(/_+/g, "_")
		.replace(/^_|_$/g, "")
}

function defaultDbPath(): string {
	const tag = sanitizeTag(`clawdbot_${hostname()}`)
	return join(homedir(), ".clawdbot", "memory", tag, "lancedb")
}

function defaultProfilePath(): string {
	const tag = sanitizeTag(`clawdbot_${hostname()}`)
	return join(homedir(), ".clawdbot", "memory", tag, "profile.json")
}

export function parseConfig(raw: unknown): LocalMemoryConfig {
	const cfg =
		raw && typeof raw === "object" && !Array.isArray(raw)
			? (raw as Record<string, unknown>)
			: {}

	if (Object.keys(cfg).length > 0) {
		assertAllowedKeys(cfg, ALLOWED_KEYS, "localmemory config")
	}

	const ollamaHost =
		typeof cfg.ollamaHost === "string"
			? resolveEnvVars(cfg.ollamaHost)
			: process.env.OLLAMA_HOST ?? "http://127.0.0.1:11434"

	const ollamaModel =
		typeof cfg.ollamaModel === "string"
			? cfg.ollamaModel
			: process.env.OLLAMA_EMBED_MODEL ?? "nomic-embed-text"

	const dbPath =
		typeof cfg.dbPath === "string"
			? expandPath(cfg.dbPath)
			: defaultDbPath()

	const profilePath =
		typeof cfg.profilePath === "string"
			? expandPath(cfg.profilePath)
			: defaultProfilePath()

	return {
		ollamaHost,
		ollamaModel,
		dbPath,
		profilePath,
		autoRecall: (cfg.autoRecall as boolean) ?? true,
		autoCapture: (cfg.autoCapture as boolean) ?? true,
		maxRecallResults: (cfg.maxRecallResults as number) ?? 10,
		profileFrequency: (cfg.profileFrequency as number) ?? 50,
		captureMode:
			cfg.captureMode === "everything"
				? ("everything" as const)
				: ("all" as const),
		debug: (cfg.debug as boolean) ?? false,
	}
}

export const localMemoryConfigSchema = {
	parse: parseConfig,
}
