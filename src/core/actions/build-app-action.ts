import {ChildProcess, spawn} from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";

import {Logger} from "../../logger.js";
import {Action, ActionContext, ActionResult} from './action.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

class AppBuilder {
  private devProcess: ChildProcess | undefined; // Type for the child process
  private logger: Logger; // Changed Logger to Command
  private rspeedyBin: string | undefined;

  constructor(logger: Logger) { // Changed Logger to Command
    this.logger = logger;
    this.rspeedyBin = undefined;
  }

  public async buildApp(projectRoot: string, dev: boolean = false, waitForCompletion: boolean = false): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      if (!this.rspeedyBin) {
        throw new Error('rspeedy is not installed. Please run `npm install` first.');
      }

      waitForCompletion = dev || waitForCompletion;

      const command = dev ? 'dev' : 'build';
      this.logger.info(`${dev ? 'Starting development server' : 'Building application'}...`);
      this.logger.info(`rspeedyBin: ${this.rspeedyBin}`);
      this.logger.info(`projectRoot: ${projectRoot}`);
      this.logger.info(`command: ${command}`);
      
      const child = spawn(this.rspeedyBin, [command], {
        cwd: path.resolve(projectRoot),
        shell: true,
        stdio: 'pipe',
      })
      
      let devServerReady = false;

      child.stdout?.on('data', (data) => {
        const output = data.toString();
        this.logger.info(output.trim());

        // Check for dev server ready signal
        if (dev && !devServerReady) {
          this.logger.info('Checking for dev server ready signal...');
          if (/ready\s+built in \d+\.\d+ s/.test(output.replaceAll("/\u001B[[0-9;]*m/g", ''))) {
            devServerReady = true;
            this.logger.info('Development server is ready, continuing with background execution...');

            // Reset configure the output listener
            child.stdout?.removeAllListeners('data');
            child.stdout?.on('data', (data) => {
              this.logger.message(data.toString().trim())
            });
            child.stderr?.on('data', (data) => {
              this.logger.error(data.toString().trim());
            });
            resolve(); // Continue with the rest of the flow
          } else if (/error\s+Build errors:/.test(output.replaceAll("/\u001B[[0-9;]*m/g", ''))) {
            // Stop the process if there are build errors
            child.stdout?.removeAllListeners('data');
            child.stderr?.removeAllListeners('data');
            child.kill('SIGINT');
            this.logger.error('Build errors detected. Exiting...');
            this.logger.error(`Output: ${output});`)
            reject(new Error(`Application ${dev? 'development server' : 'build'} failed`));
          }
        }
      });
      
      child.stderr?.on('data', (data) => {
        this.logger.error(data.toString().trim());
      });
      
      child.on('close', (code) => {
        if (!dev || !devServerReady) {
          if (code === 0) {
            this.logger.info(`Application ${dev ? 'development server' : 'build'} completed successfully.`);
            resolve();
          } else {
            reject(new Error(`Application ${dev ? 'development server' : 'build'} failed.`));
          }
        } else if (dev && devServerReady && waitForCompletion) {
          // In dev mode, if waiting for completion is required, resolve when process ends
          this.logger.info('Development server has been terminated.');
          resolve();
        }
      });
      
      child.on('error', (err) => {
        this.logger.error(`Error: ${err.toString()}`);
        reject(err);
      });
      
      // For dev mode, we need to handle the background process
      if (dev && !waitForCompletion) {
        // Only store process reference when not waiting for completion
        this.devProcess = child;
      }
    })
  }

  public async prepareEnvironment(_projectRoot: string): Promise<void> {
    this.logger.info('Preparing environment...');
    // Check if rspeedy is installed
    const rspeedyBin = path.resolve(__dirname, '..', '..', '..', 'node_modules', '.bin', 'rspeedy');
    if (!fs.existsSync(rspeedyBin)) {
      throw new Error('rspeedy is not installed. Please run `npm install` first.');
    }

    this.rspeedyBin = rspeedyBin;
  }

  public async waitForDevProcess(): Promise<void> {
    return new Promise<void>((resolve) => {
      const {devProcess} = this;
      if (devProcess && !devProcess.killed) {
        this.logger.info('Waiting for development server to finish...');
        devProcess.on('close', () => {
          this.logger.info('Development server has been terminated.');
          resolve();
        });
      } else {
        resolve();
      }
    });
  }
}

// Action to build the application (frontend assets)
export class BuildAppAction implements Action { // Expects android project path as string from previous action
  description = 'Builds the application (frontend assets) and copies them to the Android assets folder.';
  name = 'build-app';

  async execute(context: ActionContext, previousResult?: ActionResult): Promise<ActionResult> {
    if (!previousResult || !previousResult.outputPaths) {
      throw new Error('BuildAppAction requires the Android project path from the previous action.');
    }

    const androidProjectPath = previousResult.outputPaths[0];
    context.logger.info(`${this.name} received Android project path: ${androidProjectPath}`);

    const builder = new AppBuilder(context.logger); // context.logger is already Command
    await builder.prepareEnvironment(context.projectRoot);
    await builder.buildApp(context.projectRoot, context.devMode);

    // Define output paths for frontend assets
    const builtAppOutputPaths = [
      path.join(context.projectRoot, 'dist', 'main.lynx.bundle'),
      // path.join(context.projectRoot, 'dist', 'static'),
    ];

    // Verify that build outputs exist
    const existingOutputPaths: string[] = [];
    for (const outputPath of builtAppOutputPaths) {
      if (fs.existsSync(outputPath)) {
        existingOutputPaths.push(outputPath);
      } else {
        context.logger.error(`Build output not found at ${outputPath}`);
        throw new Error(`Build output not found at ${outputPath}`);
      }
    }

    context.logger.info(`Built app assets: ${existingOutputPaths.join(', ')}`);
    
    // Return the output paths for downstream actions to handle copying
    return { outputPaths: existingOutputPaths ,result: undefined};
  }
}