import {spawn} from 'node:child_process';
import fs from 'node:fs';
import {platform} from 'node:os';
import path from 'node:path';

import {Action, ActionContext, ActionResult} from './action.js';

const CODEGEN_PACKAGE = '@lynx-js/autolink-codegen';
const CODEGEN_BINARY = 'lynx-autolink-codegen';
const CODEGEN_VERSION = '0.2.0';

export class CodegenAction implements Action {
  description = 'Generate Autolink native module code';
  name = 'codegen';

  async execute(context: ActionContext, _previousResult?: ActionResult): Promise<ActionResult> {
    const {projectRoot} = context;
    if (!projectRoot) {
      throw new Error('Project root not found in action context.');
    }

    const packageJsonPath = path.join(projectRoot, 'package.json');
    if (!fs.existsSync(packageJsonPath)) {
      throw new Error(`package.json not found in ${projectRoot}`);
    }

    const codegenBin = this.resolveLocalCodegenBinary(projectRoot);
    if (!codegenBin) {
      throw new Error(
        `${CODEGEN_BINARY} not found. Install ${CODEGEN_PACKAGE}@${CODEGEN_VERSION} in the extension project first.`,
      );
    }

    context.logger.info(`Running ${CODEGEN_BINARY} in ${projectRoot}`);
    await this.runCodegen(codegenBin, projectRoot, context);

    return {
      outputPaths: [path.join(projectRoot, 'generated')],
      result: undefined,
    };
  }

  private resolveLocalCodegenBinary(projectRoot: string): null | string {
    const executable = platform() === 'win32' ? `${CODEGEN_BINARY}.cmd` : CODEGEN_BINARY;
    const codegenBin = path.join(projectRoot, 'node_modules', '.bin', executable);
    return fs.existsSync(codegenBin) ? codegenBin : null;
  }

  private async runCodegen(command: string, cwd: string, context: ActionContext): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const child = spawn(command, [], {
        cwd,
        shell: platform() === 'win32',
        stdio: 'pipe',
      });

      child.stdout?.on('data', (data) => {
        context.logger.info(data.toString().trim());
      });

      child.stderr?.on('data', (data) => {
        context.logger.warn(data.toString().trim());
      });

      child.on('close', (code) => {
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`${CODEGEN_BINARY} exited with code ${code}`));
        }
      });

      child.on('error', (error) => reject(error));
    });
  }
}
