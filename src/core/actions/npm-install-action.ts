import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

import { Logger } from '../../logger.js';
import { Action, ActionContext, ActionResult } from './action.js';

class NpmInstaller {
  private logger: Logger;

  constructor(logger: Logger) {
    this.logger = logger;
  }

  public async runNpmInstall(projectRoot: string): Promise<void> {
    this.logger.info('Running npm install...');
    
    // Check if package.json exists
    const packageJsonPath = path.join(projectRoot, 'package.json');
    if (!fs.existsSync(packageJsonPath)) {
      throw new Error('package.json not found in project root.');
    }

    return new Promise<void>((resolve, reject) => {
      const child = spawn('npm', ['install'], {
        cwd: projectRoot,
        shell: true,
        stdio: 'pipe',
      });

      child.stdout?.on('data', (data) => {
        this.logger.info(data.toString().trim());
      });
      
      child.stderr?.on('data', (data) => {
        this.logger.info(data.toString().trim());
      });

      child.on('close', (code) => {
        if (code === 0) {
          this.logger.info('npm install completed successfully.');
          resolve();
        } else {
          reject(new Error(`npm install failed with exit code: ${code}`));
        }
      });

      child.on('error', (err) => {
        reject(new Error(`Failed to start npm install: ${err.message}`));
      });
    });
  }
}

export class NpmInstallAction implements Action {
  description = 'Installs npm dependencies for the project.';
  name = 'npm-install';

  async execute(context: ActionContext): Promise<ActionResult> {
    if (!context.projectRoot) {
      throw new Error('Project root not found in action context.');
    }

    const installer = new NpmInstaller(context.logger);
    
    context.logger.info('Starting npm install...');
    await installer.runNpmInstall(context.projectRoot);
    context.logger.info('npm install action completed successfully.');

    return { result: undefined };
  }
}