export async function isSshOpen(): Promise<boolean> {
    const command = new Deno.Command('ssh', {
        args: ['-S', `~/.ssh/%r@%h:%p`, '-O', 'check', `liamh@orcd-login.mit.edu`]
    })

    const { code } = await command.output()

    return code === 0
}

export async function getJobState(): Promise<'unkown' | 'not started' | 'queued' | 'active'> {
    const command = new Deno.Command('ssh', {
        args: ['-S', `~/.ssh/%r@%h:%p`, '-o', 'ControlMaster=no', `liamh@orcd-login.mit.edu`, 'squeue --me']
    })

    const { code, stdout } = await command.output()

    if(code !== 0) return 'unkown'

    const result = new TextDecoder().decode(stdout)
    const line = result.split('\n').find(line => line.includes('ollama'))

    if(!line) return 'not started'

    if(line.includes(' 0:00 ')) return 'queued'
    
    return 'active'
}

export async function launchJob() {
    const command = new Deno.Command('ssh', {
        args: ['-S', `~/.ssh/%r@%h:%p`, '-o', 'ControlMaster=no', `liamh@orcd-login.mit.edu`, 'cd infrastructure && sbatch job.sh']
    })

    await command.output()
}