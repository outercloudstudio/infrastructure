import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import { resolve } from '@std/path'
import { Application, Router } from '@oak/oak'

export type McpServerConfiguration = {
	name: string
	version: string
	transport: {
		type: 'stdio'
		command: string
		arguments?: string[]
	}
}

export type ToolDefinition = {
	name: string
	description: string
	parameters: any
	client: Client
}

export class McpServer {
	private client: Client
	private transport: any

	constructor(public configuration: McpServerConfiguration) {
		this.client = new Client({ name: configuration.name, version: configuration.version })
		this.transport = new StdioClientTransport({
			command: configuration.transport.command,
			args: configuration.transport.arguments,
		})
	}

	public async connect() {
		await this.client.connect(this.transport)
	}

	public async getToolDefinitions(): Promise<ToolDefinition[]> {
		const { tools }: any = await this.client.listTools()

		return tools.map((tool: any) => ({
			name: tool.name,
			description: tool.description,
			parameters: tool.inputSchema,
			client: this.client,
		}))
	}
}

export class CustomMcpServerRegistry {
	private servers: CustomMcpServer[] = []

	constructor(public port: number = 9147) {
		const router = new Router()

		router.post('/call', async ctx => {
			const { name, tool, parameters } = await ctx.request.body.json()

			const server = this.servers.find(server => server.name === name)

			if (!server) throw new Error(`Received tool call for non existant server ${name}!`)

			const response = await server.callTool(tool, parameters)

			ctx.response.body = response
		})

		const app = new Application()
		app.use(router.routes())
		app.use(router.allowedMethods())

		app.listen({ port, hostname: 'localhost' })
	}

	public register(customMcpServer: CustomMcpServer): CustomMcpServer {
		this.servers.push(customMcpServer)

		customMcpServer.port = this.port

		return customMcpServer
	}
}

export type CustomToolConfiguration = {
	name: string
	description?: string
	schema?: any
	callback: (params: any) => any
}

export class CustomMcpServer {
	public port: number | null = null

	private tools: CustomToolConfiguration[] = []

	private mcpServer: McpServer | null = null

	constructor(public name: string) {}

	public tool(configuration: CustomToolConfiguration): CustomMcpServer {
		this.tools.push(configuration)

		return this
	}

	public async connect() {
		if (this.port === null) throw new Error('CustomMcpServer not registered to a CustomMcpServerRegistry!')

		this.mcpServer = new McpServer({
			name,
			version: '0.0.0',
			transport: {
				type: 'stdio',
				command: 'deno',
				arguments: [
					'run',
					'--allow-all',
					resolve(import.meta.dirname!, './bin/dynamicMcpServer.ts'),
					'--configuration',
					JSON.stringify(
						JSON.stringify({
							name: this.name,
							tools: this.tools.map(tool => ({ name: tool.name, description: tool.description, schema: tool.schema })),
						}),
					),
					'--port',
					this.port.toString(),
				],
			},
		})

		await this.mcpServer.connect()
	}

	public async getToolDefinitions(): Promise<ToolDefinition[]> {
		if (!this.mcpServer) throw new Error('CustomMcpServer has not been connected yet! Make sure to call connect() first!')

		return await this.mcpServer.getToolDefinitions()
	}

	public async callTool(name: string, parameters: any): Promise<any> {
		const tool = this.tools.find(tool => tool.name === name)

		if (!tool) throw new Error(`Attempted to call non existant tool ${name} on server ${this.name}`)

		return await tool.callback(parameters)
	}
}
