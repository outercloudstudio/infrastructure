import { join, resolve } from '@std/path'
import { copy } from 'jsr:@std/fs/copy'
import { walk } from 'jsr:@std/fs/walk'
import { Agent } from './agent.ts'
import { McpServer, CustomMcpServer, CustomMcpServerRegistry } from './mcp.ts'
import { custom, z } from 'npm:zod'
import { be, fa, id } from "zod/v4/locales";

const registry = new CustomMcpServerRegistry()

async function verify(id: string): Promise<{ success: true; } | { success: false; message: string; }> {
    const command = new Deno.Command('cambc', {
        args: ['build', id],
        cwd: join(Deno.cwd(), 'workspace')
    })

    const { code, stdout, stderr } = await command.output();

    if(code === 0) {
        return { success: true }
    }

    const errorText = new TextDecoder().decode(stderr)

    return { success: false, message: errorText }
}

async function battle(botAId: string, botBId: string): Promise<string> {
    const command = new Deno.Command('cambc', {
        args: ['run', botAId, botBId],
        cwd: join(Deno.cwd(), 'workspace')
    })

    const { code, stdout, stderr } = await command.output();

    const result = new TextDecoder().decode(stdout)
    const winner = result.split('\n').filter(line => line.includes('wins: '))[0].match(/\(([^)]+)\)/)![1]

    return winner
}

async function createBot(base: string, id: string) {
    await copy(join(Deno.cwd(), 'workspace/bots', base), join(Deno.cwd(), 'workspace/bots', id))
}

const IGNORE_PATHS = ['/.cambc', '/.cargo', '/Cargo.lock', '/Cargo.toml', '/rust-toolchain.toml', '/.gitignore']

async function availableFiles(id: string, base?: string): Promise<string[]> {
    let entries: string[] = []

    for await (const entry of Deno.readDir(join(Deno.cwd(), 'workspace/bots', id, base ?? '/'))) {
        const path = join(base ?? '/', entry.name)

        if(IGNORE_PATHS.includes(path)) continue
        
        if(entry.isDirectory) {
            entries = entries.concat(await availableFiles(id, path))
        } else {
            entries.push(path)
        }
    }

    return entries
}

async function botIteration(base: string): Promise<string> {
    const id = crypto.randomUUID()

    await createBot(base, id)

    let submitted = false
    const botMcpServer = registry.register(
        new CustomMcpServer(`bot-${id}`)
        .tool({
            name: 'submit',
            description: 'Marks your changes as submitted',
            callback: params => {
                submitted = true

                return {
                    content: [
                        {
                            type: 'text',
                            text: `Changes submitted`,
                        },
                    ],
                }
            },
        })
        .tool({
            name: 'build',
            description: 'Builds your bot and returns any build errors',
            callback: async params => {
                const result = await verify(id)

                if(result.success) {
                    return {
                        content: [
                            {
                                type: 'text',
                                text: 'Build successful',
                            },
                        ],
                    }
                } else {
                    return {
                        content: [
                            {
                                type: 'text',
                                text: result.message,
                            },
                        ],
                    }
                }
            },
        })
        .tool({
            name: 'list',
            description: 'Lists all of the available files',
            callback: async params => {
                return {
                    content: [
                        {
                            type: 'text',
                            text: (await availableFiles(id)).join('\n'),
                        },
                    ],
                }
            },
        })
        .tool({
            name: 'read',
            description: 'Reads a file',
            schema: z.object({
                path: z.string().describe('File path')
            }).toJSONSchema(),
            callback: async params => {
                const path = resolve('/', params.path)

                console.log(`Reading ${path}`)

                try {
                    if(IGNORE_PATHS.includes(path)) throw new Error('Protected path')

                    return {
                        content: [
                            {
                                type: 'text',
                                text: await Deno.readTextFile(join(Deno.cwd(), 'workspace/bots', id, path)),
                            },
                        ],
                    }
                } catch{
                    return {
                        content: [
                            {
                                type: 'text',
                                text: `Failed to read file`,
                            },
                        ],
                    }
                }
            },
        }).tool({
            name: 'write',
            description: 'Writes content to a file',
            schema: z.object({
                path: z.string().describe('File path'),
                content: z.string().describe('New file content')
            }).toJSONSchema(),
            callback: async params => {
                const path = resolve('/', params.path)

                console.log(`Writing ${path}`)

                try {
                    if(IGNORE_PATHS.includes(path)) throw new Error('Protected path')

                    await Deno.writeTextFile(join(Deno.cwd(), 'workspace/bots', id, path), params.content)

                    return {
                        content: [
                            {
                                type: 'text',
                                text: 'Wrote to file',
                            },
                        ],
                    }
                } catch{
                    return {
                        content: [
                            {
                                type: 'text',
                                text: `Failed to write file`,
                            },
                        ],
                    }
                }
            },
        }).tool({
            name: 'delete',
            description: 'Deletes a file',
            schema: z.object({
                path: z.string().describe('File path')
            }).toJSONSchema(),
            callback: async params => {
                const path = resolve('/', params.path)

                console.log(`Deleting ${path}`)

                try {
                    if(IGNORE_PATHS.includes(path)) throw new Error('Protected path')

                    return {
                        content: [
                            {
                                type: 'text',
                                text: await Deno.remove(join(Deno.cwd(), 'workspace/bots', id, path)),
                            },
                        ],
                    }
                } catch{
                    return {
                        content: [
                            {
                                type: 'text',
                                text: `Failed to delete file`,
                            },
                        ],
                    }
                }
            },
        }).tool({
            name: 'edit',
            description: 'Replaces content in a file with new content. Use the replace_all parameter to replace more than a single instance.',
            schema: z.object({
                path: z.string().describe('File path'),
                target: z.string().describe('Target string to replace'),
                new_content: z.string().describe('Text to insert'),
                replace_all: z.boolean().describe('If replace all is false, only one instance is allowed to be edited.'),
            }).toJSONSchema(),
            callback: async params => {
                const path = resolve('/', params.path)

                console.log(`Editing ${path}`)
                console.log(params.target)
                console.log(params.new_content)

                try {
                    if(IGNORE_PATHS.includes(path)) throw new Error('Protected path')

                    const text = await Deno.readTextFile(join(Deno.cwd(), 'workspace/bots', id, path))
                    
                    if(text.split(params.target).length - 1 === 0) return {
                        content: [
                            {
                                type: 'text',
                                text: `Failed to edit file. No instance of target exists in the file.`,
                            },
                        ],
                    }
                    
                    const newText = params.replace_all ? text.replace(params.target, params.new_content) : text.replaceAll(params.target, params.new_content)
                    
                    if(!params.replace_all && text.split(params.target).length - 1 > 1) return {
                        content: [
                            {
                                type: 'text',
                                text: `Failed to edit file with replace_all=false. Multiple instances of target in file.`,
                            },
                        ],
                    }
                    
                    await Deno.writeTextFile(join(Deno.cwd(), 'workspace/bots', id, path), newText)

                    return {
                        content: [
                            {
                                type: 'text',
                                text: 'Edited file',
                            },
                        ],
                    }
                } catch{
                    return {
                        content: [
                            {
                                type: 'text',
                                text: `Failed to edit file`,
                            },
                        ],
                    }
                }
            },
        }),
    )

    await botMcpServer.connect()

    const agent = new Agent()
        .model('qwen3.8')
        .mcpServer(botMcpServer)
        .prompt(`
    You need to improve this cambridge battlecode bot.

    Your changes should follow the these guidlines:
    - Improvements should be atomic. They should be smaller meaningful improvements upon the base.
    - Clean and minimal code. Keep the structure simple, use data structures effectively and clearly.
    - Feel free to plan or leave notes for future iterations in dedicated note files

    You are given tools to check for a failed build, view files, edit files, and submit. Submit
    when you are finished with your changes and terminate. Afterwards, your changes will be evaluated via a tournament.
    Only the best changes and agents will survive.

    Some notes from the overseer:
    - The bug with recalls being cancelled on damage causing a loop of recalling and dying is now fixed, good job.
    - However the units should move to safety and recall when low, not just continue fighting, as the units are dying for no reason.
    - Additionally, units can get stuck in spawn because they don't wait for a tick to heal up before leaving
`)
        .think(true)
    await agent.execute()

    return id
}

const BASE = 'eca3289b-4640-4917-a5b0-532d74117264'

const ids: string[] = []
for(let i = 0; i < 10; i++) {
    ids.push(await botIteration(BASE))
}

const tournament = (await Promise.all([BASE, ...ids].map(async id => [id, await verify(id)]))).filter(([id, result]) => (result as any).success).map(([id, _]) => id) as string[]
const scores: Record<string, number> = Object.fromEntries(tournament.map(id => [id, 0]))

for(const id of tournament) {
    for(const otherId of tournament){
        if(id === otherId) continue

        console.log(`Running ${id} vs ${otherId}`)
        const result = await battle(id, otherId)

        if(result === id) {
            scores[id] += 1
        } else {
            scores[otherId] += 1
        }
    }
}

const best = Object.entries(scores).sort((a, b) => b[1] as number - a[1] as number)[0][0]

for await (const entry of Deno.readDir(join(Deno.cwd(), 'workspace/bots'))) {
    if(entry.name === BASE) continue
    if(entry.name === best) continue

    await Deno.remove(join(Deno.cwd(), 'workspace/bots', entry.name), { recursive: true })
}

console.log(scores)
console.log('ALL BOTS COMPLETE')