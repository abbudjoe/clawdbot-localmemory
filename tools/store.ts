import { Type } from "@sinclair/typebox"
import type { ClawdbotPluginApi } from "clawdbot/plugin-sdk"
import { stringEnum } from "clawdbot/plugin-sdk"
import type { LocalMemoryClient } from "../client.ts"
import type { LocalMemoryConfig } from "../config.ts"
import { log } from "../logger.ts"
import {
	detectCategory,
	MEMORY_CATEGORIES,
} from "../memory.ts"

export function registerStoreTool(
	api: ClawdbotPluginApi,
	client: LocalMemoryClient,
	_cfg: LocalMemoryConfig,
	_getSessionKey: () => string | undefined,
): void {
	api.registerTool(
		{
			name: "supermemory_store",
			label: "Memory Store",
			description: "Save important information to long-term memory.",
			parameters: Type.Object({
				text: Type.String({ description: "Information to remember" }),
				category: Type.Optional(stringEnum(MEMORY_CATEGORIES)),
			}),
			async execute(
				_toolCallId: string,
				params: { text: string; category?: string },
			) {
				const category = params.category ?? detectCategory(params.text)

				log.debug(`store tool: category="${category}"`)

				// Don't use customId - each memory should be unique, not overwritten
				await client.addMemory(
					params.text,
					{ type: category, source: "clawdbot_tool" },
				)

				const preview =
					params.text.length > 80 ? `${params.text.slice(0, 80)}…` : params.text

				return {
					content: [{ type: "text" as const, text: `Stored: "${preview}"` }],
				}
			},
		},
		{ name: "supermemory_store" },
	)
}
