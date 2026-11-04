/**
 * ssh -o ControlMaster=auto -o ControlPath='~/.ssh/%r@%h:%p' -o ControlPersist=yes liamh@orcd-login.mit.edu
 * ssh -M -N -f -o ControlPersist=yes -S "$HOME/.ssh/%r@%h:%p" liamh@orcd-login.mit.edu
 * ssh -S '~/.ssh/%r@%h:%p' -O check liamh@orcd-login.mit.edu
 * ssh -S '~/.ssh/%r@%h:%p' -O exit liamh@orcd-login.mit.edu
 */

async function isSshOpen(): Promise<boolean> {
    const command = new Deno.Command('ssh', {
        args: ['-S', `~/.ssh/%r@%h:%p`, '-O', 'check', `liamh@orcd-login.mit.edu`]
    })

    const { code } = await command.output()

    return code === 0
}

await isSshOpen()