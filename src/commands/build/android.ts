import {Args, Command} from '@oclif/core';

import { ActionRunner } from '../../core/actions/action-runner.js';
import { ActionContext } from '../../core/actions/action.js';
import { BuildAndroidAction } from '../../core/actions/build-android-action.js';
import { BuildAppAction } from '../../core/actions/build-app-action.js';
import { NpmInstallAction } from '../../core/actions/npm-install-action.js';
import { PreparePlatformAppAction } from '../../core/actions/prepare-platform-app-action.js';
import {defaultLogger} from "../../logger.js";
import {getProjectRoot} from "../../utils/common.js";

export default class BuildAndroid extends Command {
  static override args = {
    projectRoot: Args.string({description: 'Root of the project', required: false}),
  }
  static override description = 'describe the command here'
  static override examples = [
    '<%= config.bin %> <%= command.id %>',
  ]
  static override flags = {}

  public async run(): Promise<void> {
    const {args} = await this.parse(BuildAndroid);
    const projectRoot = args.projectRoot ?? await getProjectRoot();

    defaultLogger.info("Running android in project: ", projectRoot);

    const actionContext: ActionContext = {
      appName:"unknwon",
      devMode: false,
      environment: process.env.NODE_ENV === 'production' ? 'production' : 'development',
      logger: defaultLogger,
      projectRoot,
    };

    const npmInstallAction = new NpmInstallAction();
    const prepareAndroidProjectAction = new PreparePlatformAppAction('android');
    const buildAppAction = new BuildAppAction();
    const buildAndroidAction = new BuildAndroidAction();

    const runner = new ActionRunner(actionContext);
    runner.addAction(npmInstallAction); // First install npm dependencies
    runner.addAction(prepareAndroidProjectAction); // Then prepare the Android project
    runner.addAction(buildAppAction); // Then build the app and copy assets
    runner.addAction(buildAndroidAction); // Finally, build the Android APK
    await runner.run(); 
  }
}
