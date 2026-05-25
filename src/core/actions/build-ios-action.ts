import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

import {Logger} from "../../logger.js";
import {copyFolder} from "../../utils/common.js";
import { Device } from '../../utils/devices.js';
import {Action, ActionContext, ActionResult} from './action.js';

export class iOSBuilder {
  private logger: Logger;

  constructor(logger: Logger) {
    this.logger = logger;
  }

  public async runiOSBuild(projectRoot: string, appName: string, _: 'debug' | 'release', device: Device): Promise<void> {
    this.logger.info(`Running ios build`);
    const iosDir = path.join(projectRoot, 'ios');
    const hasGemfile = fs.existsSync(path.join(iosDir, 'Gemfile'));
    if (hasGemfile) {
      await this.runCommand('bundle', ['install'], iosDir, 'bundle install');
    }

    await this.runCommand(
      hasGemfile ? 'bundle' : 'pod',
      hasGemfile ? ['exec', 'pod', 'install'] : ['install'],
      iosDir,
      'pod install',
    );

    const xcodebuild = "xcodebuild";
    const xcodebuildArgs = [
        "-workspace", `${appName}.xcworkspace`, 
        "-scheme", appName, 
        "-configuration", "Debug", 
        "-sdk", "iphonesimulator",
        "-destination", `platform=iOS Simulator,name=${device.name}`,
        "-derivedDataPath", "out/app/simulator"
    ];

    await this.runCommand(xcodebuild, xcodebuildArgs, iosDir, 'xcodebuild');
  }

  private async runCommand(command: string, args: string[], cwd: string, label: string): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const child = spawn(command, args, {
        cwd,
        stdio: 'pipe',
      });

      child.stdout?.on('data', (data) => {
        this.logger.info(data.toString().trim());
      });
      
      child.stderr?.on('data', (data) => {
        this.logger.warn(data.toString().trim());
      });

      child.on('close', (code) => {
        if (code === 0) {
          this.logger.info(`${label} finished successfully for app`);
          resolve();
        } else {
          reject(new Error(`${label} process exited for app code：${code}`));
        }
      });

      child.on('error', (err) => reject(err));
    });
  }

}



export class BuildiOSAction implements Action {
  description = 'Builds the iOS application xcode-build.';
  name = 'build-ios';

  async execute(context: ActionContext, previousResult?: ActionResult): Promise<ActionResult> {
    if (previousResult) {
      context.logger.info(`${this.name} is executing after BuildAppAction.`);
      if (previousResult.outputPaths && previousResult.outputPaths.length > 0) {
        context.logger.info(`${this.name} noted previous action output paths: ${previousResult.outputPaths.join(', ')} (these should be assets in the iOS project)`);
      }

      if(context.appName === undefined){
        context.logger.error(`${this.name} not found xcode project name`)
        throw new Error('Xcode project name not found in previous action result.');
      }
    }

    const appAssetPaths = previousResult?.outputPaths ?? [];
    context.logger.info(`${this.name} received app asset paths: ${appAssetPaths.join(', ')}`);

    if (!context.projectRoot) {
      throw new Error('Project root not found in action context.');
    }

    const assetsFolder = path.join(context.projectRoot, 'ios', context.appName as string, 'Resources');
    if (!fs.existsSync(assetsFolder)) {
      fs.mkdirSync(assetsFolder, { recursive: true });
    }

    const copiedAssetPaths: string[] = [];
    for (const assetPath of appAssetPaths) {
      if (fs.existsSync(assetPath)) {
        const fileName = path.basename(assetPath);
        const destPath = path.join(assetsFolder, fileName);
        if (fs.lstatSync(assetPath).isDirectory()) {
          copyFolder({
            from: assetPath,
            to: destPath,
          });
        } else {
          fs.copyFileSync(assetPath, destPath);
        }

        copiedAssetPaths.push(destPath);
        context.logger.info(`Copied asset: ${assetPath} -> ${destPath}`);
      } else {
        context.logger.error(`Asset not found at ${assetPath}`);
        throw new Error(`Asset not found at ${assetPath}`);
      }
    }

    // eslint-disable-next-line new-cap
    const builder = new iOSBuilder(context.logger);

    if (!context.projectRoot) {
      throw new Error('Project root not found in action context.');
    }

    context.logger.info('Starting iOS build...');
    const buildType = 'debug';
    await builder.runiOSBuild(context.projectRoot, context.appName as string, buildType, context.device as Device);

    const appPath = path.join(context.projectRoot, 'ios', 'out', 'app', 'simulator', 'Build', 'Products', `${buildType}-iphonesimulator`, `${context.appName}.app`);
    return { crucialOutputPaths: [appPath], outputPaths: [appPath], result: undefined };
  }
}
