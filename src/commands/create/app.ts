import {intro, note, outro, text} from "@clack/prompts";
import {Args, Command} from '@oclif/core'
import path from "node:path"
import { fileURLToPath } from 'node:url'
import color from 'picocolors';

import { ActionRunner } from '../../core/actions/action-runner.js';
import { ProjectBuilder } from '../../core/project-builder/project-builder.js';
import {checkCancel, formatProjectName, templatePath} from "../../core/project-builder/template.js"
import {defaultLogger} from "../../logger.js";
import {readPackageJson} from "../../utils/common.js";
const __dirname = path.dirname(fileURLToPath(import.meta.url))

export default class CreateApp extends Command {
  static override args = {
    name: Args.string({
      description: 'app name',
      required: false,
    }),
  }
  static override description = 'create app project from template'
  static override examples = [
    '<%= config.bin %> <%= command.id %>',
  ]
  static override flags = {
  }

  public async run(): Promise<void> {
    const {args} = await this.parse(CreateApp);
    const {version} = await readPackageJson(path.resolve(__dirname, '../../..'));

    intro("Create App Project");
    // Get project name from user input
    const projectName = args.name ?? checkCancel<string>(
      await text({
        defaultValue: 'lepo-app-project',
        message: 'Project name or path',
        placeholder: 'lepo-app-project',
        validate(value) {
          if (value.length === 0) {
            return 'Project name is required';
          }
        },
      }),
    );

    const formatted = formatProjectName(projectName);
    const { packageName, targetDir } = formatted;
    const cwd = process.cwd();
    const distFolder = path.isAbsolute(targetDir)
      ? targetDir
      : path.join(cwd, targetDir);

    // Create ProjectBuilder instance
    const builder = ProjectBuilder.create({
      checkEmpty: true,
      packageName,
      targetDir: distFolder,
      version,
    });

    defaultLogger.info(`Creating files from app template`)
    // Use loadTemplate method which automatically handles inheritance
    await builder.loadTemplate(templatePath('app-common-react-ts'), {
      variables: {
        appName: packageName,
        version,
      },
    });

    // Generate a single action from ProjectBuilder and execute with ActionRunner
    const actionContext = {
      devMode: false,
      environment: 'development' as const,
      logger: defaultLogger,
      projectRoot: process.cwd(),
    };
    
    const runner = new ActionRunner(actionContext);
    const projectAction = builder.toSingleAction(
      'create-app-project',
      `Create app project '${packageName}'`
    );
    
    // Add the single action to the runner
    runner.addAction(projectAction);
    
    // Execute the action
    await runner.run();

    const nextSteps = [
      `1. ${color.cyan(`cd ${targetDir}`)}`,
      `2. ${color.cyan('git init')} ${color.dim('(optional)')}`,
      `3. ${color.cyan('pnpm install')}`,
      `4. ${color.cyan('pnpm dev')}`,
    ];

    if (nextSteps.length > 0) {
      note(nextSteps.map((step) => color.reset(step)).join('\n'), 'Next steps');
    }

    outro("Successfully created app project from template");
  }
}
