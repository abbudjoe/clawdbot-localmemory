import { Type } from "@sinclair/typebox"
import type { ClawdbotPluginApi } from "clawdbot/plugin-sdk"
import type { LocalMemoryClient } from "../client.ts"
import type { LocalMemoryConfig } from "../config.ts"
import { log } from "../logger.ts"

export function registerForgetTool(
	api: ClawdbotPluginApi,
	client: LocalMemoryClient,
	_cfg: LocalMemoryConfig,
): void {
	api.registerTool(
		{
			name: "supermemory_forget",
			label: "Memory Forget",
			description:
				"Forget/delete a specific memory. Searches for the closest match and removes it.",
			parameters: Type.Object({
				query: Type.Optional(
					Type.String({ description: "Describe the memory to forget" }),
				),
				memoryId: Type.Optional(
					Type.String({ description: "Direct memory ID to delete" }),
				),
			}),
			async execute(
				_toolCallId: string,
				params: { query?: string; memoryId?: string },
			) {
				if (params.memoryId) {
					log.debug(`forget tool: direct delete id="${params.memoryId}"`)
					await client.deleteMemory(params.memoryId)
					return {
						content: [{ type: "text" as const, text: "Memory forgotten." }],
					}
				}

				if (params.query) {
					log.debug(`forget tool: search-then-delete query="${params.query}"`)
					const result = await client.forgetByQuery(params.query)
					return {
						content: [{ type: "text" as const, text: result.message }],
					}
				}

				return {
					content: [
						{
							type: "text" as const,
							text: "Provide a query or memoryId to forget.",
						},
					],
				}
			},
		},
		{ name: "supermemory_forget" },
	)
}
