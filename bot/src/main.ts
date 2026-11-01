import config from '../.env.json' with { type: "json" }

import { Client, Events, GatewayIntentBits } from 'discord.js'
import { Agent } from './agent.ts'

const { TOKEN, ID } = config

const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent] });

client.once(Events.ClientReady, (readyClient: any) => {
	console.log(`Ready! Logged in as ${readyClient.user.tag}`)
})

const agent = new Agent()
    .model('qwen3.8')
    .think(true)

client.on(Events.MessageCreate, async event => {
    if(event.author.id === ID) return
    if(event.channelId !== '1490564754035576902') return

    const result = await agent.prompt(event.content)

    await event.reply(result)
})

client.login(TOKEN)