import { Command } from 'commander'
import { program as openapi } from './commands/openapi/cli'

let program = new Command()

program = program.name('Defjs cli')
program = program.description('CLI to some JavaScript string utilities')
program = program.version('0.8.0')

program.addCommand(openapi)

program.parse(process.argv)
