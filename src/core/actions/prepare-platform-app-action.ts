import path from "node:path";

import {platformProviders} from '../../template-context-provider/platform-providers.js';
import {TemplateContextProvider} from '../../template-context-provider/template-context-provider.js';
import {readJSON, readPackageJson} from '../../utils/common.js';
import {VariablesMap} from "../../utils/file-templater.js";
import {APP_CONFIG_FILE} from "../config.js";
import {ProjectBuilder} from '../project-builder/project-builder.js';
import {Action, ActionContext, ActionResult} from './action.js';

/**
 * Platform project preparer class
 */
class PlatformProjectPreparer {
    constructor(
        private targetDir: string,
        private platformName: string,
        private packageName: string,
    ) {}

    async execute(provider: TemplateContextProvider): Promise<VariablesMap> {
        // Check environment if required
        await provider.checkAndPrepareEnvironment();

        // Collect platform-specific variables
        const variables = await provider.collectAppTemplateVariables(this.packageName);

        // Use ProjectBuilder to load and execute template
        const builder = new ProjectBuilder({
            packageName: this.packageName,
            targetDir: this.targetDir,
        });


        const templatePath = await provider.getTemplate()
        await builder.loadTemplate(templatePath, {
            variables
        })

        await builder.build();
        return variables;
    }
}

/**
 * Generic platform project preparation action
 */
export class PreparePlatformAppAction implements Action {
    description?: string;
    name: string;

    constructor(
        private platformName: string,
    ) {
        const provider = platformProviders[platformName];
        if (!provider) {
            throw new Error(`Platform ${platformName} is not supported`);
        }

        this.name = `prepare-${platformName}-project`;
        this.description = `Prepare ${platformName} project`;
    }

    async execute(context: ActionContext): Promise<ActionResult> {
        try {
            // Load package.json if it exists
            const packageJson = await readPackageJson(context.projectRoot).catch(() => null);
            const provider = platformProviders[this.platformName];
            const {platforms} = await readJSON(path.resolve(context.projectRoot, APP_CONFIG_FILE));

            const preparer = new PlatformProjectPreparer(
                path.resolve(context.projectRoot, platforms[this.platformName].platformDir),
                this.platformName,
                packageJson?.name,
            );

            const variables = await preparer.execute(provider);
            context.appName = variables.appName as string;

            return {
                outputPaths: [context.projectRoot],
                result: {
                    appName: variables.AppName,
                },
            };
        } catch (error) {
            throw new Error(`Failed to prepare ${this.platformName} project: ${String(error)}`);
        }
    }
}
