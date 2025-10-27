import { confirm , select } from '@clack/prompts';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

import {defaultLogger} from "../../logger.js";
import {isEmptyDir} from '../../utils/common.js'
import { FileTemplater, type VariablesMap } from '../../utils/file-templater.js';
import { ActionRunner } from '../actions/action-runner.js';
import { Action, ActionContext, ActionResult } from '../actions/action.js';
import { checkCancel, templatePath } from './template.js';

/**
 * Configuration for a single template copy operation
 */
export interface TemplateStep {
  /** Whether to check if target directory is empty */
  checkEmpty?: boolean;
  /** Source template directory path (optional for hook-only steps) */
  from?: string;
  /** Whether to merge package.json files */
  isMergePackageJson?: boolean;
  /** Whether to override existing files */
  override?: boolean;
  /** Package name for package.json updates */
  packageName?: string;
  /** Hook to execute after copying this step */
  postHook?: (config: ProjectBuilderConfig, step: TemplateStep) => Promise<TemplateStep[] | void> | TemplateStep[] | void;
  /** Hook to execute before copying this step */
  preHook?: (config: ProjectBuilderConfig, step: TemplateStep) => Promise<TemplateStep[] | void> | TemplateStep[] | void;
  /** File rename mappings */
  renameFiles?: Record<string, string>;
  /** Files to skip during copying */
  skipFiles?: string[];
  /** Target directory path (relative to project root) */
  to?: string;
  /** Variables for template replacement */
  variables?: (() => Promise<VariablesMap>) | VariablesMap;
  /** Version information for package.json updates */
  version?: Record<string, string> | string;
}

/**
 * Configuration for the entire project building process
 */
export interface ProjectBuilderConfig {
  /** Whether to check if target directory is empty on first step */
  checkEmpty?: boolean;
  /** Whether to override existing files globally */
  override?: boolean;
  /** Global package name */
  packageName?: string;
  /** Target project directory */
  targetDir: string;
  /** Global version information */
  version?: Record<string, string> | string;
}

/**
 * A builder class for creating projects by copying multiple templates in sequence
 */
export class ProjectBuilder {
  private config: ProjectBuilderConfig;
  private steps: TemplateStep[] = [];

  constructor(config: ProjectBuilderConfig) {
    this.config = config;
  }

  /**
   * Create a new ProjectBuilder instance
   * @param config Project builder configuration
   * @returns New ProjectBuilder instance
   */
  static create(config: ProjectBuilderConfig): ProjectBuilder {
    return new ProjectBuilder(config);
  }

  /**
   * Add a template copy step to the build process
   * @param step Template step configuration
   * @returns This builder instance for chaining
   */
  addStep(step: TemplateStep): ProjectBuilder {
    // Validate that step has either a template path or hooks
    if (!step.from && !step.preHook && !step.postHook) {
      throw new Error('Template step must have either a template path (from) or hooks (preHook/postHook)');
    }

    this.steps.push(step);
    return this;
  }

  /**
   * Add multiple template copy steps to the build process
   * @param steps Array of template step configurations
   * @returns This builder instance for chaining
   */
  addSteps(steps: TemplateStep[]): ProjectBuilder {
    this.steps.push(...steps);
    return this;
  }

  /**
   * Execute all template copy steps in sequence
   * @returns Promise that resolves when all steps are completed
   */
  async build(): Promise<void> {
    if (this.steps.length === 0) {
      throw new Error('No template steps configured. Use addStep() to add template copy operations.');
    }

    // Check if target directory is empty on first step (if configured)
    const shouldCheckEmpty = this.config.checkEmpty ?? true;
    if (shouldCheckEmpty && !this.config.override && fs.existsSync(this.config.targetDir) && !isEmptyDir(this.config.targetDir)) {
      const option = checkCancel<string>(
        await select({
          message: `"${path.basename(this.config.targetDir)}" is not empty, please choose:`,
          options: [
            { label: 'Continue and override files', value: 'yes' },
            { label: 'Cancel operation', value: 'no' },
          ],
        }),
      );

      if (option === 'no') {
        throw new Error('Operation cancelled by user');
      }
    }

    // Execute each step in sequence
    for (let i = 0; i < this.steps.length; i++) {
      await this.executeStepWithHooks(this.steps[i], i === 0);
    }
  }

  /**
   * Build project using ActionRunner for better progress tracking
   * @param context Action context for execution
   * @returns Promise that resolves when all steps are completed
   */
  async buildWithActionRunner(context: ActionContext): Promise<void> {
    const runner = new ActionRunner(context);
    const action = this.toSingleAction();
    runner.addAction(action);
    await runner.run();
  }

  /**
   * Load template from a path and automatically handle inheritance
   * @param templateDir Path to the template directory
   * @param options Configuration options
   * @param options.variables Variables for template replacement
   * @param options.to Target directory path (relative to project root)
   * @param options.skipFiles Files to skip during copying
   * @param options.renameFiles File rename mappings
   * @returns This builder instance for chaining
   */
  async loadTemplate(templateDir: string, options?: {
    renameFiles?: Record<string, string>;
    skipFiles?: string[];
    to?: string;
    variables?: (() => Promise<VariablesMap>) | VariablesMap;
  }): Promise<ProjectBuilder> {
    const { renameFiles, skipFiles = [], to, variables = {} } = options || {};
    
    // Check if template directory exists
    if (!fs.existsSync(templateDir)) {
      throw new Error(`Template directory does not exist: ${templateDir}`);
    }

    // Resolve variables if it's a function
    const resolvedVariables: VariablesMap = variables
      ? typeof variables === 'function'
        ? await variables()
        : variables
      : {};

    // Process inheritance files first
    const inheritanceSteps = this.processInheritanceFiles(templateDir, resolvedVariables);
    
    // Add inheritance steps
    for (const step of inheritanceSteps) {
      this.addStep(step);
    }

    // Add the main template step
    this.addStep({
      from: templateDir,
      renameFiles,
      skipFiles: [...skipFiles, ...this.getInheritanceFileNames(templateDir)],
      to,
      variables,
    });

    return this;
  }

  /**
   * Convert builder steps to Action array
   * @returns Array of Action instances
   */
  toActions(): Action[] {
    const actions: Action[] = [];
    
    // Add directory check action if required
    const shouldCheckEmpty = this.config.checkEmpty ?? true;
    if (shouldCheckEmpty) {
      actions.push(this.createDirectoryCheckAction());
    }

    // Convert each step to an action
    for (const [index, step] of this.steps.entries()) {
      actions.push(this.createStepAction(step, index));
    }

    return actions;
  }

  /**
   * Convert all builder steps to a single Action
   * @param name Optional name for the action (defaults to 'project-builder')
   * @param description Optional description for the action
   * @returns Single Action that executes all steps
   */
  toSingleAction(name?: string, description?: string): Action {
    if (this.steps.length === 0) {
      throw new Error('No template steps configured. Use addStep() to add template copy operations.');
    }

    // Capture the current state to avoid 'this' context issues
    const {config} = this;
    const steps = [...this.steps];
    const executeStep = this.executeStep.bind(this);
    const executeStepWithHooks = this.executeStepWithHooks.bind(this);

    defaultLogger.info(`Building project with ${steps.length} steps`)

    return {
      description: description ?? `Build project with ${steps.length} steps`,
      async execute(_context: ActionContext): Promise<ActionResult> {
        const shouldCheckEmpty = config.checkEmpty ?? true;
        
        // Check if target directory is empty if required
        if (shouldCheckEmpty && !isEmptyDir(config.targetDir)) {
            const shouldContinue = checkCancel<boolean>(
              await confirm({
                message: `Target directory ${config.targetDir} is not empty. Continue?`,
              }),
            );
            if (!shouldContinue) {
              throw new Error('Operation cancelled by user');
            }
          }

        // Execute all steps sequentially
        for (const [i, step] of steps.entries()) {
          const isFirstStep = i === 0;
          await executeStepWithHooks(step, isFirstStep, { collectOutputPaths: false, executeStep });
        }

        return {
          outputPaths: [config.targetDir],
          result: undefined,
        };
      },
      name: name ?? 'project-builder',
    };
  }

  /**
   * Internal method to copy template with variables (similar to the original function)
   */
  private async copyTemplateWithVariables({
    checkEmpty = false,
    from,
    isMergePackageJson,
    override = false,
    packageName,
    relativePath = '',
    renameFiles = { gitignore: '.gitignore' },
    skipFiles = [],
    to,
    variables = {},
    version,
  }: {
    checkEmpty?: boolean;
    from: string;
    isMergePackageJson?: boolean;
    override?: boolean;
    packageName?: string;
    relativePath?: string;
    renameFiles?: Record<string, string>;
    skipFiles?: string[];
    to: string;
    variables?: VariablesMap;
    version?: Record<string, string> | string;
  }): Promise<void> {
    // Check if source directory exists
    if (!fs.existsSync(from)) {
      throw new Error(`Source template directory does not exist: ${from}`);
    }

    // Check if directory exists and is not empty
    if (checkEmpty && !override && fs.existsSync(to) && !isEmptyDir(to)) {
      const option = checkCancel<string>(
        await select({
          message: `"${path.basename(to)}" is not empty, please choose:`,
          options: [
            { label: 'Continue and override files', value: 'yes' },
            { label: 'Cancel operation', value: 'no' },
          ],
        }),
      );

      if (option === 'no') {
        throw new Error('Operation cancelled by user');
      }
    }

    // Skip local files
    const allSkipFiles = new Set(['dist', 'node_modules', ...skipFiles]);

    fs.mkdirSync(to, { recursive: true });

    for (const file of fs.readdirSync(from)) {
      // Calculate the relative path for this file
      const currentRelativePath = relativePath ? path.join(relativePath, file) : file;
      
      // Skip files that should be ignored (check both file name and relative path)
      // Also skip inheritance files (files matching <inherit:*> pattern)
      if (allSkipFiles.has(file) || allSkipFiles.has(currentRelativePath) || 
          (file.startsWith('<inherit:') && file.endsWith('>'))) {
        continue;
      }

      const srcFile = path.resolve(from, file);
      let distFileName = renameFiles[file] || file;
      
      // Replace variables in file name
      for (const key in variables) {
        if (Object.hasOwn(variables, key)) {
          const placeholder = `{{${key.trim()}}}`;
          const regex = new RegExp(placeholder.replaceAll(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`), 'g');
          distFileName = distFileName.replace(regex, String(variables[key]));
        }
      }
      
      const distFile = path.resolve(to, distFileName);
      
      // Ensure parent directories exist for multi-level paths
      const distDir = path.dirname(distFile);
      if (distDir !== to) {
        fs.mkdirSync(distDir, { recursive: true });
      }

      const stat = fs.statSync(srcFile);

      if (stat.isDirectory()) {
        // Recursively copy directory
        await this.copyTemplateWithVariables({
          checkEmpty: false,
          from: srcFile,
          relativePath: currentRelativePath,
          renameFiles,
          skipFiles,
          to: distFile,
          variables,
        });
      } else if (file === 'package.json') {
        const targetPackage = path.resolve(to, 'package.json');

        if (isMergePackageJson && fs.existsSync(targetPackage)) {
          this.mergePackageJson(targetPackage, srcFile);
        } else {
          fs.copyFileSync(srcFile, distFile);
          this.updatePackageJson(distFile, version, packageName);
        }
      } else {
        // Copy file and replace variables in content
        fs.copyFileSync(srcFile, distFile);
        
        // Replace variables in file content if variables are provided
        if (Object.keys(variables).length > 0) {
          // Check if file is binary before attempting variable replacement
          const isBinaryFile = await this.isBinary(distFile);
          
          if (!isBinaryFile) {
            try {
              await FileTemplater.replaceInFileAndUpdate(distFile, variables);
            } catch (error) {
              // Log error but continue processing other files
              console.warn(`Failed to replace variables in file ${distFile}: ${error}`);
            }
          }
        }
      }
    }
  }

  /**
   * Create an action for directory check
   * @returns Action for checking empty directory
   */
  private createDirectoryCheckAction(): Action {
    return {
      description: `Check if target directory ${this.config.targetDir} is empty`,
      execute: async (_context: ActionContext): Promise<ActionResult> => {
        const shouldCheckEmpty = this.config.checkEmpty ?? true;
        if (shouldCheckEmpty && !this.config.override && fs.existsSync(this.config.targetDir) && !isEmptyDir(this.config.targetDir)) {
          const option = checkCancel<string>(
            await select({
              message: `"${path.basename(this.config.targetDir)}" is not empty, please choose:`,
              options: [
                { label: 'Continue and override files', value: 'yes' },
                { label: 'Cancel operation', value: 'no' },
              ],
            }),
          );

          if (option === 'no') {
            throw new Error('Operation cancelled by user');
          }
        }

        return {
          outputPaths: [this.config.targetDir],
          result: undefined,
        };
      },
      name: 'check-empty-directory',
    };
  }

  /**
   * Create an action for a template step
   * @param step Template step configuration
   * @param index Step index
   * @returns Action for executing the template step
   */
  private createStepAction(step: TemplateStep, index: number): Action {
    const stepName = step.from ? `copy-template-${index + 1}` : `hook-step-${index + 1}`;
    const stepDescription = step.from 
      ? `Copy template from ${step.from}${step.to ? ` to ${step.to}` : ''}` 
      : `Execute hooks for step ${index + 1}`;

    return {
      description: stepDescription,
      execute: async (_context: ActionContext): Promise<ActionResult> => {
        const outputPaths = await this.executeStepWithHooks(step, index === 0);
        
        return {
          crucialOutputPaths: step.from ? outputPaths : undefined,
          outputPaths,
          result: undefined,
        };
      },
      name: stepName,
    };
  }

  /**
   * Execute a shell command
   * @param command Command to execute
   * @param cwd Working directory for the command
   */
  private async executeCommand(command: string, cwd: string): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      // Parse command and arguments
      const parts = command.split(' ');
      const cmd = parts[0];
      const args = parts.slice(1);
      
      const child = spawn(cmd, args, {
        cwd,
        stdio: 'pipe',
      });

      child.stdout?.on('data', (data) => {
        defaultLogger.info(data.toString().trim());
      });
      
      child.stderr?.on('data', (data) => {
        defaultLogger.warn(data.toString().trim());
      });

      child.on('close', (code) => {
        if (code === 0) {
          defaultLogger.info(`Command finished successfully: ${command}`);
          resolve();
        } else {
          reject(new Error(`Command exited with code ${code}: ${command}`));
        }
      });

      child.on('error', (err) => {
        reject(new Error(`Failed to execute command ${command}: ${err.message}`));
      });
    });
  }

  /**
   * Execute prepare commands found in the target directory
   * @param targetDir Target directory to search for prepare commands
   * @param variables Variables for command template replacement
   */
  private async executePrepareCommands(targetDir: string, variables: VariablesMap = {}): Promise<void> {
    const prepareCommandFiles = this.findPrepareCommandFiles(targetDir);
    
    if (prepareCommandFiles.length === 0) {
      return;
    }

    defaultLogger.info(`Found ${prepareCommandFiles.length} prepare command(s) to execute`);
    
    for (const commandFile of prepareCommandFiles) {
      try {
        // Read command content
        let commandContent = fs.readFileSync(commandFile, 'utf8').trim();
        
        // Replace variables in command content
         if (Object.keys(variables).length > 0) {
           try {
             for (const [key, value] of Object.entries(variables)) {
               const placeholder = `{{${key.trim()}}}`;
               const regex = new RegExp(placeholder.replaceAll(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`), 'g');
               commandContent = commandContent.replace(regex, String(value));
             }
           } catch (error: unknown) {
             defaultLogger.warn(`Failed to replace variables in command: ${error}`);
           }
         }
        
        if (commandContent) {
          defaultLogger.info(`Executing prepare command: ${commandContent}`);
          await this.executeCommand(commandContent, path.dirname(commandFile));
        }
        
        // Remove the prepare command file after execution
        fs.unlinkSync(commandFile);
        defaultLogger.info(`Removed prepare command file: ${commandFile}`);
      } catch (error) {
        defaultLogger.error(`Failed to execute prepare command ${commandFile}: ${error}`);
        throw error;
      }
    }
  }

  /**
   * Execute a single template copy step
   * @param step The template step to execute
   * @param isFirstStep Whether this is the first step (affects empty directory checking)
   */
  private async executeStep(step: TemplateStep, isFirstStep: boolean): Promise<void> {
    // Skip template copying if from path is empty (hook-only step)
    if (!step.from) {
      return;
    }
    
    const targetPath = step.to ? path.resolve(this.config.targetDir, step.to) : this.config.targetDir;
    
    // Resolve variables if it's a function
    const resolvedVariables: VariablesMap = step.variables
      ? typeof step.variables === 'function'
        ? await step.variables()
        : step.variables
      : {};
    
    // Merge step configuration with global configuration
    const mergedConfig = {
      checkEmpty: isFirstStep ? false : (step.checkEmpty ?? false), // Only check empty on first step
      from: step.from,
      isMergePackageJson: step.isMergePackageJson ?? false,
      override: step.override ?? this.config.override ?? false,
      packageName: step.packageName ?? this.config.packageName,
      renameFiles: step.renameFiles ?? { gitignore: '.gitignore' },
      skipFiles: step.skipFiles ?? [],
      to: targetPath,
      variables: resolvedVariables,
      version: step.version ?? this.config.version,
    };

    await this.copyTemplateWithVariables(mergedConfig);
    
    // Execute prepare commands after copying template
    await this.executePrepareCommands(targetPath, resolvedVariables);
  }

  /**
   * Execute a step with pre and post hooks
   * @param step - The step to execute
   * @param isFirstStep - Whether this is the first step
   * @param options - Optional configuration
   * @param options.executeStep - Custom execute step function
   * @param options.collectOutputPaths - Whether to collect output paths
   * @returns Array of output paths from executed steps (empty array if collectOutputPaths is false)
   */
  private async executeStepWithHooks(
    step: TemplateStep, 
    isFirstStep: boolean,
    options?: {
      collectOutputPaths?: boolean;
      executeStep?: (step: TemplateStep, isFirstStep: boolean) => Promise<void>;
    }
  ): Promise<string[]> {
    const { collectOutputPaths = true, executeStep = this.executeStep.bind(this) } = options || {};
    const outputPaths: string[] = [];
    
    // Execute pre-hook if defined and handle additional steps
    if (step.preHook) {
      const additionalSteps = await step.preHook(this.config, step);
      if (additionalSteps && additionalSteps.length > 0) {
        // Execute additional steps immediately
        for (const additionalStep of additionalSteps) {
          await executeStep(additionalStep, false);
          if (collectOutputPaths && additionalStep.from) {
            const targetPath = additionalStep.to ? path.resolve(this.config.targetDir, additionalStep.to) : this.config.targetDir;
            outputPaths.push(targetPath);
          }
        }
      }
    }
    
    // Execute template copying if from path is provided
    if (step.from) {
      await executeStep(step, isFirstStep);
      if (collectOutputPaths) {
        const targetPath = step.to ? path.resolve(this.config.targetDir, step.to) : this.config.targetDir;
        outputPaths.push(targetPath);
      }
    }
    
    // Execute post-hook if defined and handle additional steps
    if (step.postHook) {
      const additionalSteps = await step.postHook(this.config, step);
      if (additionalSteps && additionalSteps.length > 0) {
        // Execute additional steps immediately
        for (const additionalStep of additionalSteps) {
          await executeStep(additionalStep, false);
          if (collectOutputPaths && additionalStep.from) {
            const targetPath = additionalStep.to ? path.resolve(this.config.targetDir, additionalStep.to) : this.config.targetDir;
            outputPaths.push(targetPath);
          }
        }
      }
    }
    
    return outputPaths;
  }

  /**
   * Find all <prepare_command> files in a directory recursively
   * @param dir Directory to search in
   * @param relativePath Current relative path from the root directory
   * @returns Array of prepare command file paths
   */
  private findPrepareCommandFiles(dir: string, relativePath: string = ''): string[] {
    const prepareCommandFiles: string[] = [];
    
    if (!fs.existsSync(dir)) {
      return prepareCommandFiles;
    }

    try {
      const files = fs.readdirSync(dir);
      
      for (const file of files) {
        const filePath = path.resolve(dir, file);
        const stat = fs.statSync(filePath);
        
        if (stat.isFile() && file === '<prepare_command>') {
          prepareCommandFiles.push(filePath);
        } else if (stat.isDirectory()) {
          // Recursively search subdirectories
          const subRelativePath = relativePath ? path.join(relativePath, file) : file;
          const subdirFiles = this.findPrepareCommandFiles(filePath, subRelativePath);
          prepareCommandFiles.push(...subdirFiles);
        }
      }
    } catch (error) {
      defaultLogger.warn(`Failed to read directory ${dir}: ${error}`);
    }
    
    return prepareCommandFiles;
  }

  /**
   * Get inheritance file names to skip during template copying
   * @param templateDir Path to the template directory
   * @param relativePath Relative path from the root template directory
   * @returns Array of inheritance file paths (relative to template root)
   */
  private getInheritanceFileNames(templateDir: string, relativePath: string = ''): string[] {
    const inheritanceFiles: string[] = [];
    
    try {
      const files = fs.readdirSync(templateDir);
      
      for (const file of files) {
        const filePath = path.resolve(templateDir, file);
        const stat = fs.statSync(filePath);
        
        if (stat.isFile() && file.startsWith('<inherit:') && file.endsWith('>')) {
          // Add relative path for inheritance files
          const relativeFilePath = relativePath ? path.join(relativePath, file) : file;
          inheritanceFiles.push(relativeFilePath);
        } else if (stat.isDirectory()) {
          // Recursively process subdirectories
          const subRelativePath = relativePath ? path.join(relativePath, file) : file;
          const subdirInheritanceFiles = this.getInheritanceFileNames(filePath, subRelativePath);
          inheritanceFiles.push(...subdirInheritanceFiles);
        }
      }
    } catch (error) {
      defaultLogger.warn(`Failed to get inheritance file names in ${templateDir}: ${error}`);
    }
    
    return inheritanceFiles;
  }

  /**
   * Check if a file is binary by reading the first few bytes
   */
  private async isBinary(filePath: string): Promise<boolean> {
    try {
      const buffer = Buffer.alloc(512);
      const fd = await fs.promises.open(filePath, 'r');
      const { bytesRead } = await fd.read(buffer, 0, 512, 0);
      await fd.close();
      
      // Check for null bytes which typically indicate binary files
      for (let i = 0; i < bytesRead; i++) {
        if (buffer[i] === 0) {
          return true;
        }
      }
      
      return false;
    } catch {
      // If we can't read the file, assume it's not binary to be safe
      return false;
    }
  }

  /**
   * Merge two package.json files and keep the order of keys
   */
  private mergePackageJson(targetPackage: string, extraPackage: string): void {
    if (!fs.existsSync(targetPackage)) {
      return;
    }

    const targetJson = JSON.parse(fs.readFileSync(targetPackage, 'utf8'));
    const extraJson = JSON.parse(fs.readFileSync(extraPackage, 'utf8'));
    
    // Simple merge - in a real implementation you might want to use deepmerge
    const mergedJson = { ...targetJson, ...extraJson };
    mergedJson.name = targetJson.name || extraJson.name;

    // Sort specific keys
    for (const key of ['scripts', 'dependencies', 'devDependencies']) {
      if (key in mergedJson && typeof mergedJson[key] === 'object') {
        const sortedKeys = Object.keys(mergedJson[key]).sort();
        const sortedObj: Record<string, unknown> = {};
        for (const sortedKey of sortedKeys) {
          sortedObj[sortedKey] = mergedJson[key][sortedKey];
        }

        mergedJson[key] = sortedObj;
      }
    }

    fs.writeFileSync(targetPackage, `${JSON.stringify(mergedJson, null, 2)}\n`);
  }

  /**
   * Process inheritance files in template directory with recursive support
   * @param templateDir Path to the template directory
   * @param variables Variables for template replacement
   * @param processedTemplates Set of already processed template paths to prevent circular inheritance
   * @param relativePath Relative path from the root template directory
   * @returns Array of template steps for inherited templates
   */
  private processInheritanceFiles(
    templateDir: string, 
    variables: VariablesMap, 
    processedTemplates: Set<string> = new Set(),
    relativePath: string = ''
  ): TemplateStep[] {
    const inheritanceSteps: TemplateStep[] = [];
    
    // Prevent circular inheritance
    if (processedTemplates.has(templateDir)) {
      defaultLogger.warn(`Circular inheritance detected for template: ${templateDir}`);
      return inheritanceSteps;
    }
    
    // Add current template to processed set
    processedTemplates.add(templateDir);
    
    try {
      const files = fs.readdirSync(templateDir);
      
      for (const file of files) {
        const filePath = path.resolve(templateDir, file);
        const stat = fs.statSync(filePath);
        
        if (stat.isFile() && file.startsWith('<inherit:') && file.endsWith('>')) {
          // Extract template name from <inherit:xxx> format
          const templateName = file.slice(9, -1); // Remove '<inherit:' and '>'
          
          if (templateName) {
            const inheritedTemplatePath = templatePath(templateName);
            
            // Check if inherited template exists
            if (fs.existsSync(inheritedTemplatePath)) {
              // Recursively process inheritance files in the inherited template
              const nestedInheritanceSteps = this.processInheritanceFiles(
                inheritedTemplatePath, 
                variables, 
                new Set(processedTemplates),
                relativePath
              );
              
              // Add nested inheritance steps first (deeper inheritance has higher priority)
              inheritanceSteps.push(...nestedInheritanceSteps, {
                from: inheritedTemplatePath,
                to: relativePath, // Place inherited template in the same subdirectory as the inheritance file
                variables,
              });
            } else {
              defaultLogger.warn(`Inherited template not found: ${inheritedTemplatePath}`);
            }
          }
        } else if (stat.isDirectory()) {
          // Recursively process subdirectories for inheritance files
          const subRelativePath = relativePath ? path.join(relativePath, file) : file;
          const subdirInheritanceSteps = this.processInheritanceFiles(
            filePath,
            variables,
            new Set(processedTemplates),
            subRelativePath
          );
          
          // Add subdirectory inheritance steps
          inheritanceSteps.push(...subdirInheritanceSteps);
        }
      }
    } catch (error) {
      defaultLogger.warn(`Failed to process inheritance files in ${templateDir}: ${error}`);
    }
    
    return inheritanceSteps;
  }

  /**
   * Update package.json with version and name information
   */
  private updatePackageJson(
    pkgJsonPath: string,
    version?: Record<string, string> | string,
    name?: string,
  ): void {
    let content = fs.readFileSync(pkgJsonPath, 'utf8');

    if (typeof version === 'string') {
      // Lock the version if it is not stable
      const isStableVersion = (ver: string) => ['alpha', 'beta', 'rc', 'canary', 'nightly'].every(
        (tag) => !ver.includes(tag),
      );
      const targetVersion = isStableVersion(version) ? `^${version}` : version;
      content = content.replaceAll('workspace:*', targetVersion);
    }

    const pkg = JSON.parse(content);

    if (typeof version === 'object') {
      for (const [depName, ver] of Object.entries(version)) {
        if (pkg.dependencies?.[depName]) {
          pkg.dependencies[depName] = ver;
        }

        if (pkg.devDependencies?.[depName]) {
          pkg.devDependencies[depName] = ver;
        }
      }
    }

    if (name && name !== '.') {
      pkg.name = name;
    }

    fs.writeFileSync(pkgJsonPath, `${JSON.stringify(pkg, null, 2)}\n`);
  }
}