import {intro, log, outro} from '@clack/prompts';
import {Args, Command} from '@oclif/core';

import { ActionRunner } from '../../core/actions/action-runner.js';
import { ActionContext } from '../../core/actions/action.js';
import { BuildAppAction } from '../../core/actions/build-app-action.js';
import { BuildiOSAction } from '../../core/actions/build-ios-action.js';
import { NpmInstallAction } from '../../core/actions/npm-install-action.js';
import { PrepareDeviceAction } from '../../core/actions/prepare-device-action.js';
import { PreparePlatformAppAction } from '../../core/actions/prepare-platform-app-action.js';
import { RuniOSSimulatorAction } from '../../core/actions/run-ios-simulator-action.js';
import {defaultLogger} from "../../logger.js";
import {getProjectRoot} from "../../utils/common.js";

export default class RuniOS extends Command {
  static override args = {
    projectRoot: Args.string({description: 'Root of the project', required: false}),
  }
  static override description = 'describe the command here'
  static override examples = [
    '<%= config.bin %> <%= command.id %>',
  ]
  static override flags = {}

  public async run(): Promise<void> {
    const {args} = await this.parse(RuniOS);
    const projectRoot = args.projectRoot ?? await getProjectRoot();

    intro("Run iOS Application");
    defaultLogger.info(`Running iOS in project: ${projectRoot}`);

    const actionContext: ActionContext = {
      devMode: process.env.NODE_ENV !== 'production',
      environment: process.env.NODE_ENV === 'production' ? 'production' : 'development',
      logger: defaultLogger,
      platform: 'ios',
      projectRoot
    };

    const npmInstallAction = new NpmInstallAction();
    const prepareiOSProjectAction = new PreparePlatformAppAction('ios');
    const buildAppAction = new BuildAppAction();
    const prepareDeviceAction = new PrepareDeviceAction();
    const buildiOSAction = new BuildiOSAction();
    const runiOSDeviceAction = new RuniOSSimulatorAction();

    const runner = new ActionRunner(actionContext);
    runner.addAction(npmInstallAction); // First install npm dependencies
    runner.addAction(prepareiOSProjectAction); // Then prepare the iOS project
    runner.addAction(buildAppAction); // Then build the app and copy assets
    runner.addAction(prepareDeviceAction);
    runner.addAction(buildiOSAction); // Build the iOS APK
    runner.addAction(runiOSDeviceAction); // Finally, run the iOS emulator
    await runner.run();

    if (actionContext.environment === 'development') {
      log.message('Development server is ready, try editing the app and see the changes.');
      log.message('Press Ctrl+C to stop the development server.');
    } else {
      outro('Android application runs successfully.');
    }
  }
}
