import { Message, Ollama, Tool } from 'ollama'
import { CustomMcpServer, McpServer, ToolDefinition } from './mcp.ts'

const ollama = new Ollama({
  host: 'http://34.41.70.175:25568',
})

export class Agent {
	private _systemPrompt: string | null = null
	private _prompt: string | null = null
	private _model: string = 'qwen3:8b'
	private _mcpServers: (McpServer | CustomMcpServer)[] = []
	private _think: boolean = true

	private messages: Message[] | null = null

	public model(model: string): Agent {
		this._model = model

		return this
	}

	public mcpServer(mcpServer: McpServer | CustomMcpServer): Agent {
		this._mcpServers.push(mcpServer)

		return this
	}

	public systemPrompt(prompt: string): Agent {
		this._systemPrompt = prompt

		return this
	}

	public prompt(prompt: string): Agent {
		this._prompt = prompt

		return this
	}

	public think(think: boolean): Agent {
		this._think = think

		return this
	}

	private buildMessages(): Message[] {
		if (this.messages !== null) return this.messages

		this.messages = []

		if (this._systemPrompt !== null) {
			this.messages.push({
				role: 'system',
				content: this._systemPrompt,
			})
		}

		if (this._prompt !== null) {
			this.messages.push({
				role: 'user',
				content: this._prompt,
			})
		}

		return this.messages
	}

	private async buildTools(): Promise<ToolDefinition[]> {
		let toolDefinitions: ToolDefinition[] = []

		for (const client of this._mcpServers) {
			const serverTools = await client.getToolDefinitions()

			toolDefinitions = toolDefinitions.concat(serverTools)
		}

		return toolDefinitions
	}

	public async execute() {
		const messages = this.buildMessages()

		// console.log('Executing!')
		// console.log('System > ' + this._systemPrompt)
		// console.log('Prompt > ' + this._prompt)

		while (true) {
			const tools = await this.buildTools()

			const response = await ollama.chat({
				model: this._model,
				messages: messages,
				tools: tools.map(
					tool =>
						({
							type: 'function',
							function: {
								name: tool.name,
								description: tool.description,
								parameters: tool.parameters,
							},
						}) satisfies Tool,
				),
				think: false,
			})

			messages.push(response.message)

			// if (response.message.content) {
			// 	console.log('-----')
				console.log(': ' + response.message.content)
			// 	console.log('-----')
			// }

			if (!response.message.tool_calls?.length) break

			for (const toolCall of response.message.tool_calls) {
				const toolDefinition = tools.find(tool => tool.name === toolCall.function.name)

				if (!toolDefinition) {
                    messages.push({
                        role: 'tool',
                        content: JSON.stringify({
                            type: 'error',
                            message: `Tool ${toolCall.function.name} does not exist`
                        }),
                    })

                    continue
                }

				// console.log(`! Calling tool ${toolCall.function.name}`)
                // console.log(toolCall.function.arguments)

				const result = await toolDefinition.client.callTool({
					name: toolCall.function.name,
					arguments: toolCall.function.arguments,
				})

                // console.log(result.content)

				messages.push({
					role: 'tool',
					content: JSON.stringify(result.content),
				})
			}
		}
	}
}
