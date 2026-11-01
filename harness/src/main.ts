import { Agent } from './agent.ts'
import { McpServer, CustomMcpServer, CustomMcpServerRegistry } from './mcp.ts'
import { custom, z } from 'npm:zod'

const registry = new CustomMcpServerRegistry()

let answer: undefined | number = undefined
const harnessMcpServer = registry.register(
	new CustomMcpServer('harness')
    .tool({
		name: 'evaluate',
		description: 'Evaluates your answer',
		callback: params => {
			if(answer === undefined) {
                return {
                    content: [
                        {
                            type: 'text',
                            text: `[FAILED] No answer submitted`,
                        },
                    ],
                }
            }

            if(answer === 4) {
                return {
                    content: [
                        {
                            type: 'text',
                            text: `[OK] Answer correct`,
                        },
                    ],
                }
            } else {
                return {
                    content: [
                        {
                            type: 'text',
                            text: `[FAILED] Answer incorrect`,
                        },
                    ],
                }
            }
		},
	})
    .tool({
		name: 'sumbmit',
		description: 'Submit a guess',
        schema: z.object({
            guess: z.number().describe('Your guess. An integer from 1-10.')
        }).toJSONSchema(),
		callback: params => {
            answer = params.guess

			return {
				content: [
					{
						type: 'text',
						text: `Submition success.`,
					},
				],
			}
		},
	}),
)

await harnessMcpServer.connect()

const agent = new Agent()
	.model('qwen3.8')
	.mcpServer(harnessMcpServer)
	.prompt('Guess my favorite number 1-10. Continue until you verify the answer.')
	.think(true)
await agent.execute()
