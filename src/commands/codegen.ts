import {Args, Command} from '@oclif/core'

import {ActionRunner} from "../core/actions/action-runner.js";
import {ActionContext} from "../core/actions/action.js";
import {CodegenAction} from "../core/actions/codegen-action.js";
import {defaultLogger} from "../logger.js";

export default class Codegen extends Command {
  static override args = {
    dir: Args.string({description: 'root directory of the package to scan'}),
  }
  static override description = 'generate modules from d.ts files'
  static override examples = [
    '<%= config.bin %> <%= command.id %>',
  ]
  static override flags = {
    // flag with a value (-n, --name=VALUE)
  }

  public async run(): Promise<void> {
    const {args} = await this.parse(Codegen)

    const action = new CodegenAction()
    const context: ActionContext = {
      devMode: false,
      environment: 'development',
      logger: defaultLogger,
      projectRoot: args.dir ?? process.cwd(),
    }
    const runner = new ActionRunner(context)
    runner.addAction(action)
    await runner.run()
  }
}
