import { Type } from "@sinclair/typebox"
import type { ClawdbotPluginApi } from "clawdbot/plugin-sdk"
import type { LocalMemoryClient } from "../client.ts"
import type { LocalMemoryConfig } from "../config.ts"
import { log } from "../logger.ts"

export function registerProfileTool(
	api: ClawdbotPluginApi,
	client: LocalMemoryClient,
	_cfg: LocalMemoryConfig,
): void {
	api.registerTool(
		{
			name: "supermemory_profile",
			label: "User Profile",
			description:
				"Get a summary of what is known about the user — stable preferences and recent context.",
			parameters: Type.Object({
				query: Type.Optional(
					Type.String({
						description: "Optional query to focus the profile",
					}),
				),
			}),
			async execute(_toolCallId: string, params: { query?: string }) {
				log.debug(`profile tool: query="${params.query ?? "(none)"}"`)

				const profile = await client.getProfile(params.query)

				if (profile.static.length === 0 && profile.dynamic.length === 0) {
					return {
						content: [
							{
								type: "text" as const,
								text: "No profile information available yet.",
							},
						],
					}
				}

				const sections: string[] = []

				if (profile.static.length > 0) {
					sections.push(
						"## User Profile (Persistent)\n" +
							profile.static.map((f) => `- ${f}`).join("\n"),
					)
				}

				if (profile.dynamic.length > 0) {
					sections.push(
						"## Recent Context\n" +
							profile.dynamic.map((f) => `- ${f}`).join("\n"),
					)
				}

				return {
					content: [{ type: "text" as const, text: sections.join("\n\n") }],
					details: {
						staticCount: profile.static.length,
						dynamicCount: profile.dynamic.length,
					},
				}
			},
		},
		{ name: "supermemory_profile" },
	)
}
