import {intro, multiselect, note, outro, select, text} from "@clack/prompts";
import {Args, Command} from '@oclif/core'
import path from "node:path"
import color from 'picocolors';

import {ActionRunner} from '../../core/actions/action-runner.js';
import {APP_CONFIG_FILE, Config, EXTENSION_CONFIG_FILE} from "../../core/config.js";
import {ProjectBuilder} from '../../core/project-builder/project-builder.js';
import {
    checkCancel, defaultLanguage,
    formatProjectName,
    ProjectType,
    templatePath
} from "../../core/project-builder/template.js"
import {defaultLogger} from "../../logger.js";
import {platformProviders} from '../../template-context-provider/platform-providers.js';
import {readPackageJson, writeJSON, writePackageJson} from "../../utils/common.js";


export default class CreateExtension extends Command {
    static override args = {
        name: Args.string({
            description: 'extension name',
            required: false,
        }),
    }
    static override description = 'create extension project from template'
    static override examples = [
        '<%= config.bin %> <%= command.id %>',
    ]
    static override flags = {}

    public async run(): Promise<void> {
        const {args} = await this.parse(CreateExtension);

        intro("Create Extension Project");

        // Get project name from user input
        const projectName = args.name ?? checkCancel<string>(
            await text({
                defaultValue: 'lepo-project',
                message: 'Project name or path',
                placeholder: 'lepo-project',
                validate(value) {
                    if (value.length === 0) {
                        return 'Project name is required';
                    }
                },
            }),
        );

        const chosenNativePlatforms = checkCancel<string[]>(
            await multiselect({
                message: 'Choose platforms if you want to create native component (Use <space> to select, <enter> to continue)',
                options: [
                    {label: 'Android', value: 'android'},
                    {label: 'iOS', value: 'ios'},
                    {label: 'Web', value: 'web'},
                ],
                required: false,
            })
        )

        const extensionType = chosenNativePlatforms.length > 0 ? checkCancel<ProjectType>(
            await select({
                message: 'Select extension type',
                options: [
                    {label: 'Element', value: 'element'},
                    {label: 'Module', value: 'module'},
                    {label: 'Service', value: 'service'},
                ],
            }),
        ) : null;

        const formatted = formatProjectName(projectName);
        const {packageName, targetDir} = formatted;
        const cwd = process.cwd();
        const distFolder = path.isAbsolute(targetDir)
            ? targetDir
            : path.join(cwd, targetDir);

        // Create ProjectBuilder instance
        const builder = ProjectBuilder.create({
            checkEmpty: true,
            packageName,
            targetDir: distFolder,
        });

        defaultLogger.info(`Creating files from component template`)
        await builder.loadTemplate(templatePath(`extension-${extensionType}-react-ts`), {
            variables: {
                componentName: packageName,
            },
        });

        // load platform templates
        for (const platform of chosenNativePlatforms) {
            defaultLogger.info(`Creating files from ${platform} template`)
            const provider = platformProviders[platform];
            if (!provider) {
                throw new Error(`Platform provider not found for: ${platform}`);
            }
            
            builder.addStep({
                from: templatePath(`extension-${extensionType}-${platform}-${defaultLanguage(platform)}`),
                to: platform,
                variables: await provider.collectExtensionTemplateVariables(packageName),
            })
        }

        // Add post-hook step for example package.json modification
        builder.addStep({
            async postHook(config) {
                // Edit example package.json
                const examplePath = path.resolve(config.targetDir, 'example');
                const examplePackageJson = await readPackageJson(examplePath);
                examplePackageJson.dependencies[packageName] = `file:..`;
                examplePackageJson.name = `${packageName}-example`;
                await writePackageJson(examplePath, examplePackageJson);
            },
        });

        // Create extension config file
        const extensionConfig: Config = {
            platforms: {},
            precommands: [],
        }
        for (const platform of chosenNativePlatforms) {
            extensionConfig.platforms[platform] = await platformProviders[platform].collectExtensionPlatformConfig(packageName);
        }

        // Add post-hook step for extension config file creation
        builder.addStep({
            async postHook(config) {
                const extensionConfigPath = path.resolve(config.targetDir, EXTENSION_CONFIG_FILE);
                await writeJSON(extensionConfigPath, extensionConfig);
            },
        });

        const appConfig: Config = {
            platforms: {},
            precommands: [],
        }
        for (const platform of chosenNativePlatforms) {
            appConfig.platforms[platform] = await platformProviders[platform].collectAppPlatformConfig(packageName);
        }

        builder.addStep({
            async postHook(config) {
                const appConfigPath = path.resolve(config.targetDir, 'example', APP_CONFIG_FILE);
                await writeJSON(appConfigPath, appConfig);
            }
        })

        // Generate a single action from ProjectBuilder and execute with ActionRunner
        const actionContext = {
            devMode: false,
            environment: 'development' as const,
            logger: defaultLogger,
            projectRoot: process.cwd(),
        };

        const runner = new ActionRunner(actionContext);
        const projectAction = builder.toSingleAction(
            'create-component-project',
            `Create component project '${packageName}' with ${chosenNativePlatforms.length > 0 ? 'native platforms' : 'web only'}`
        );

        // Add the single action to the runner
        runner.addAction(projectAction);

        // Execute the action
        await runner.run();
        const nextSteps = [
            `1. ${color.cyan(`cd ${targetDir}`)}`,
            `2. ${color.cyan('git init')} ${color.dim('(optional)')}`,
        ];

        for (const [i, platform] of chosenNativePlatforms.entries()) {
            nextSteps.push(`${i + 3}. ${color.cyan(`lepo run:${platform}`)}`);
        }

        if (nextSteps.length > 0) {
            note(nextSteps.map((step) => color.reset(step)).join('\n'), 'Next steps');
        }

        outro("Successfully created component project from template");
    }


}
