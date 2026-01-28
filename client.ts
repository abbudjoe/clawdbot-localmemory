import { mkdir, readFile, writeFile } from "node:fs/promises"
import { dirname } from "node:path"
import * as lancedb from "@lancedb/lancedb"
import { Ollama } from "ollama"
import { log } from "./logger.ts"

export type SearchResult = {
	id: string
	content: string
	memory?: string
	similarity?: number
	metadata?: Record<string, unknown>
}

export type ProfileSearchResult = {
	memory?: string
	updatedAt?: string
	similarity?: number
	[key: string]: unknown
}

export type ProfileResult = {
	static: string[]
	dynamic: string[]
	searchResults: ProfileSearchResult[]
}

type MemoryRecord = {
	id: string
	content: string
	vector: number[]
	metadata: string
	createdAt: string
	updatedAt: string
}

type UserProfile = {
	static: string[]
	dynamic: string[]
	lastUpdated: string
}

function limitText(text: string, max: number): string {
	return text.length > max ? `${text.slice(0, max)}…` : text
}

function generateId(): string {
	return `mem_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`
}

function cosineSimilarity(a: number[], b: number[]): number {
	if (a.length !== b.length) return 0
	let dot = 0
	let normA = 0
	let normB = 0
	for (let i = 0; i < a.length; i++) {
		dot += a[i] * b[i]
		normA += a[i] * a[i]
		normB += b[i] * b[i]
	}
	return dot / (Math.sqrt(normA) * Math.sqrt(normB))
}

export class LocalMemoryClient {
	private ollama: Ollama
	private model: string
	private dbPath: string
	private profilePath: string
	private db: lancedb.Connection | null = null
	private table: lancedb.Table | null = null
	private initialized = false

	constructor(
		ollamaHost: string,
		ollamaModel: string,
		dbPath: string,
		profilePath: string,
	) {
		this.ollama = new Ollama({ host: ollamaHost })
		this.model = ollamaModel
		this.dbPath = dbPath
		this.profilePath = profilePath
		log.info(`initialized (model: ${ollamaModel}, db: ${dbPath})`)
	}

	private async ensureInitialized(): Promise<void> {
		if (this.initialized) return

		await mkdir(dirname(this.dbPath), { recursive: true })
		await mkdir(dirname(this.profilePath), { recursive: true })

		this.db = await lancedb.connect(this.dbPath)

		const tableNames = await this.db.tableNames()
		if (tableNames.includes("memories")) {
			this.table = await this.db.openTable("memories")
		}

		this.initialized = true
		log.debug("database initialized")
	}

	private async embed(text: string): Promise<number[]> {
		const response = await this.ollama.embed({
			model: this.model,
			input: text,
		})
		return response.embeddings[0]
	}

	private async ensureTable(vectorDim: number): Promise<lancedb.Table> {
		if (this.table) return this.table

		if (!this.db) throw new Error("Database not initialized")

		const emptyRecord: MemoryRecord = {
			id: "__init__",
			content: "",
			vector: new Array(vectorDim).fill(0),
			metadata: "{}",
			createdAt: new Date().toISOString(),
			updatedAt: new Date().toISOString(),
		}

		this.table = await this.db.createTable("memories", [emptyRecord], {
			mode: "overwrite",
		})

		await this.table.delete('id = "__init__"')
		return this.table
	}

	async addMemory(
		content: string,
		metadata?: Record<string, string | number | boolean>,
		customId?: string,
	): Promise<{ id: string }> {
		await this.ensureInitialized()

		const cleaned = content.trim()
		if (!cleaned) throw new Error("Cannot store empty content")

		log.debugRequest("add", {
			contentLength: cleaned.length,
			customId,
			metadata,
		})

		const vector = await this.embed(cleaned)
		const table = await this.ensureTable(vector.length)

		const now = new Date().toISOString()
		const id = customId ?? generateId()

		const record: MemoryRecord = {
			id,
			content: cleaned,
			vector,
			metadata: JSON.stringify(metadata ?? {}),
			createdAt: now,
			updatedAt: now,
		}

		if (customId) {
			try {
				await table.delete(`id = "${customId}"`)
			} catch {
				// Ignore if not found
			}
		}

		await table.add([record])

		log.debugResponse("add", { id })
		return { id }
	}

	async search(query: string, limit = 5): Promise<SearchResult[]> {
		await this.ensureInitialized()

		if (!this.table) {
			return []
		}

		log.debugRequest("search", { query, limit })

		const queryVector = await this.embed(query)

		const results = await this.table
			.vectorSearch(queryVector)
			.limit(limit)
			.toArray()

		const searchResults: SearchResult[] = results.map((r) => {
			let meta: Record<string, unknown> = {}
			try {
				meta = JSON.parse(r.metadata as string)
			} catch {
				// ignore
			}

			const similarity = r._distance != null ? 1 - r._distance : undefined

			return {
				id: r.id as string,
				content: r.content as string,
				memory: r.content as string,
				similarity,
				metadata: meta,
			}
		})

		log.debugResponse("search", { count: searchResults.length })
		return searchResults
	}

	async getProfile(query?: string): Promise<ProfileResult> {
		await this.ensureInitialized()

		log.debugRequest("profile", { query })

		let profile: UserProfile = { static: [], dynamic: [], lastUpdated: "" }
		try {
			const data = await readFile(this.profilePath, "utf-8")
			profile = JSON.parse(data)
		} catch {
			// No profile yet
		}

		let searchResults: ProfileSearchResult[] = []
		if (query && this.table) {
			const results = await this.search(query, 10)
			searchResults = results.map((r) => ({
				memory: r.content,
				updatedAt: (r.metadata?.timestamp as string) ?? undefined,
				similarity: r.similarity,
			}))
		}

		const result: ProfileResult = {
			static: profile.static,
			dynamic: profile.dynamic,
			searchResults,
		}

		log.debugResponse("profile", {
			staticCount: result.static.length,
			dynamicCount: result.dynamic.length,
			searchCount: result.searchResults.length,
		})

		return result
	}

	async updateProfile(
		staticFacts?: string[],
		dynamicFacts?: string[],
	): Promise<void> {
		await this.ensureInitialized()

		let profile: UserProfile = { static: [], dynamic: [], lastUpdated: "" }
		try {
			const data = await readFile(this.profilePath, "utf-8")
			profile = JSON.parse(data)
		} catch {
			// Start fresh
		}

		if (staticFacts) {
			const existing = new Set(profile.static)
			for (const fact of staticFacts) {
				if (!existing.has(fact)) {
					profile.static.push(fact)
				}
			}
		}

		if (dynamicFacts) {
			profile.dynamic = dynamicFacts.slice(0, 20)
		}

		profile.lastUpdated = new Date().toISOString()
		await writeFile(this.profilePath, JSON.stringify(profile, null, 2))

		log.debug("profile updated")
	}

	async deleteMemory(id: string): Promise<void> {
		await this.ensureInitialized()

		if (!this.table) return

		log.debugRequest("delete", { id })
		await this.table.delete(`id = "${id}"`)
		log.debugResponse("delete", { success: true })
	}

	async forgetByQuery(
		query: string,
	): Promise<{ success: boolean; message: string }> {
		log.debugRequest("forgetByQuery", { query })

		const results = await this.search(query, 5)
		if (results.length === 0) {
			return { success: false, message: "No matching memory found to forget." }
		}

		const target = results[0]
		await this.deleteMemory(target.id)

		const preview = limitText(target.content || target.memory || "", 100)
		return { success: true, message: `Forgot: "${preview}"` }
	}

	async wipeAllMemories(): Promise<{ deletedCount: number }> {
		await this.ensureInitialized()

		log.debugRequest("wipe", {})

		if (!this.table || !this.db) {
			return { deletedCount: 0 }
		}

		const count = await this.table.countRows()

		await this.db.dropTable("memories")
		this.table = null

		log.debugResponse("wipe", { deletedCount: count })
		return { deletedCount: count }
	}

	getDbPath(): string {
		return this.dbPath
	}
}
