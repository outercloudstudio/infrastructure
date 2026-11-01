import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { parseArgs } from '@std/cli'
import z from "zod";

const args = parseArgs(Deno.args)

const { name, tools } = JSON.parse(JSON.parse(args.configuration))
const port = parseInt(args.port)

const server = new McpServer({
	name,
	version: '0.0.0',
})

for (const tool of tools) {
	server.registerTool(
		tool.name,
		{
			description: tool.description,
			inputSchema: tool.schema ? z.fromJSONSchema(tool.schema) : undefined,
		},
		async (params: any) => {
			const response = await fetch(`http://localhost:${port}/call`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ name, tool: tool.name, parameters: params }),
			})

			return await response.json()
		},
	)
}

const transport = new StdioServerTransport()

await server.connect(transport)

console.error(`Running Mcp server ${name} for ${port}...`)
