import {isCancel, text} from '@clack/prompts';

import {PlatformConfig} from "../core/config.js";
import {templatePath} from "../core/project-builder/template.js";
import {defaultLogger} from '../logger.js';
import {AndroidEnvUtils} from '../utils/android-env-utils.js';
import {packageNameToCamelCase} from "../utils/common.js";
import {VariablesMap} from '../utils/file-templater.js';
import {TemplateContextProvider} from './template-context-provider.js';


/**
 * Android platform template provider
 */
export const androidProvider: TemplateContextProvider = {
    async checkAndPrepareEnvironment(): Promise<boolean> {
        const envUtils = new AndroidEnvUtils(defaultLogger);
        await envUtils.checkAndPrepareEnvironment();
        return true;
    },
    async collectAppPlatformConfig(_: string): Promise<PlatformConfig> {
        return {
            assetsDir: 'app/src/main/assets',
            name: 'Android',
            platformDir: 'android',
        };
    },

    async collectAppTemplateVariables(packageName: string): Promise<VariablesMap> {
        const appName = packageName.replaceAll('-', '').toLowerCase();
        // input package name
        const androidPackageName: string | symbol = await text({
            defaultValue: `com.example.${appName}`,
            message: 'Android package name for application',
            placeholder: `com.example.${appName}`,
            validate(value) {
                if (value.length === 0) {
                    return 'Android package name is required';
                }
            },
        });

        if (isCancel(androidPackageName)) {
            throw new Error('Android package name is required');
        }

        return {
            appName,
            packageName: androidPackageName,
            packagePath: androidPackageName.replaceAll('.', '/')
        };
    },

    async collectExtensionPlatformConfig(_: string): Promise<PlatformConfig> {
        return {
            // TODO: implement extension platform config
        };
    },

    async collectExtensionTemplateVariables(packageName: string): Promise<VariablesMap> {
        const formattedPackageName = packageName.replaceAll('-', '');
        const androidPackageName: string | symbol = await text({
            defaultValue: `com.example.${formattedPackageName}`,
            message: 'Android package name',
            placeholder: `com.example.${formattedPackageName}`,
            validate(value) {
                if (value.length === 0) {
                    return 'Android package name is required';
                }
            },
        });

        if (isCancel(androidPackageName)) {
            throw new Error('Android package name is required');
        }

        return {
            packageName: androidPackageName,
            packagePath: androidPackageName.replaceAll('.', '/')
        };
    },

    async getTemplate(): Promise<string> {
        return templatePath('app-common-android-kotlin');
    },
};

/**
 * iOS platform template provider
 */
export const iosProvider: TemplateContextProvider = {
    async checkAndPrepareEnvironment(): Promise<boolean> {
        // TODO: implement iOS environment check
        return true;
    },

    async collectAppPlatformConfig(_: string): Promise<PlatformConfig> {
        return {
            assetsDir: 'app/Resources',
            platformDir: 'ios',
        };
    },

    async collectAppTemplateVariables(packageName: string): Promise<VariablesMap> {
        const appName = packageName.split('-').map((part: string) => part.charAt(0).toUpperCase() + part.slice(1)).join('');
        // input bundle id
        const bundleId: string | symbol = await text({
            defaultValue: `com.example.${appName}`,
            message: 'iOS bundle id for application',
            placeholder: `com.example.${appName}`,
            validate(value) {
                if (value.length === 0) {
                    return 'iOS bundle id is required';
                }
            },
        });

        if (isCancel(bundleId)) {
            throw new Error('iOS bundle id is required');
        }

        return {
            appName,
            bundleId,
        }
    },

    async collectExtensionPlatformConfig(packageName: string): Promise<PlatformConfig> {
        return {
            componentName: packageNameToCamelCase(packageName),
        };
    },
    
    async collectExtensionTemplateVariables(packageName: string): Promise<VariablesMap> {
        const formattedPackageName = packageNameToCamelCase(packageName)
        const iosComponentName = await text({
            defaultValue: formattedPackageName,
            message: 'iOS component name',
            placeholder: formattedPackageName,
            validate(value) {
                if (value.length === 0) {
                    return 'iOS component name is required';
                }
            },
        });
        
        if (isCancel(iosComponentName)) {
            throw new Error('iOS component name is required');
        }

        return {
            componentName: iosComponentName,
        };
    },

    async getTemplate(): Promise<string> {
        return templatePath('app-common-ios-swift');
    }
};

/**
 * Web platform template provider
 */
export const webProvider: TemplateContextProvider = {
    async checkAndPrepareEnvironment(): Promise<boolean> {
        // TODO: implement web environment check
        return true;
    },

    async collectAppPlatformConfig(_: string): Promise<PlatformConfig> {
        return {
            assetsDir: 'public',
            platformDir: 'web',
        };
    },
    async collectAppTemplateVariables(packageName: string): Promise<VariablesMap> {
        const appName = packageName.split('.').map((part: string) => part.charAt(0).toUpperCase() + part.slice(1)).join('');
        return {
            appName,
        }
    },

    async collectExtensionPlatformConfig(_: string): Promise<PlatformConfig> {
        return {
            defaultTemplate: 'extension-common-web',
            name: 'Web',
        };
    },
    
    async collectExtensionTemplateVariables(packageName: string): Promise<VariablesMap> {
        return {
            componentName: packageName,
        };
    },

    async getTemplate(): Promise<string> {
        return templatePath('app-common-web');
    }

};

/**
 * Map of all available platform providers
 */
export const platformProviders: Record<string, TemplateContextProvider> = {
    android: androidProvider,
    ios: iosProvider,
    web: webProvider,
};

/**
 * Get available platform provider names
 * @returns Array of platform names
 */
export function getAvailablePlatforms(): string[] {
    return Object.keys(platformProviders);
}

/**
 * Check if a platform provider exists
 * @param platform Platform name
 * @returns True if platform provider exists
 */
export function isPlatformSupported(platform: string): boolean {
    return platform in platformProviders;
}