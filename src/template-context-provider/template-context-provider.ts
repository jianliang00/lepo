import {PlatformConfig} from "../core/config.js";
import {VariablesMap} from "../utils/file-templater";

/**
 * Interface for template providers that can generate template steps based on user selections
 */
export interface TemplateContextProvider {
  /**
   * Check if the environment is ready for this provider
   * @returns Promise that resolves when the environment is ready
   */
  checkAndPrepareEnvironment(): Promise<boolean>;

  /**
   * Collect platform-specific configuration including preparation settings
   * @param packageName Package name
   * @returns Platform configuration for this provider
   */
  collectAppPlatformConfig(packageName: string): Promise<PlatformConfig>;

  /**
   * Collect application template variables from user input
   * @param packageName Package name
   * @returns Template variables for this provider
   */
  collectAppTemplateVariables(packageName: string): Promise<VariablesMap>;

  /**
   * Collect extension-specific configuration
   * @param packageName Package name
   * @returns Platform configuration for this provider
   */
  collectExtensionPlatformConfig(packageName: string): Promise<PlatformConfig>;

  /**
   * Collect template variables from user input
   * @param packageName Package name
   * @returns Template variables for this provider
   */
  collectExtensionTemplateVariables(packageName: string): Promise<VariablesMap>;

  /**
   * Get the template path for this provider
   * @returns Template path
   */
  getTemplate(): Promise<string>;
}
