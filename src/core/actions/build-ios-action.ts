import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

import {Logger} from "../../logger.js"; // Logger might be used internally, or can be Command if only log is used
import {copyFolder} from "../../utils/common.js";
import { Device } from '../../utils/devices.js';
import {Action, ActionContext, ActionResult} from './action.js';

// AndroidBuilder class, now focused on running the Gradle build
export class iOSBuilder {
  private logger: Logger; // Changed Logger to Command

  constructor(logger: Logger) { // Changed Logger to Command
    this.logger = logger;
  }

  // Note: checkAndPrepareEnvironment and prepareAndroidProject methods
  // have been moved to PrepareAndroidProjectAction.
  // getJavaVersion and prepareJDK were part of checkAndPrepareEnvironment.

  public async runiOSBuild(projectRoot: string, appName: string, _: 'debug' | 'release', device: Device): Promise<void> {
    this.logger.info(`Running ios build`);
    const podCommand = "pod"
    const args = ["install"];

    await new Promise<void>((resolve, reject) => {
      const child = spawn(podCommand, args, {
        cwd: path.join(projectRoot, 'ios'),
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
          this.logger.info(`pod install finished successfully for app`);
          resolve();
        } else {
          reject(new Error(`pod process exited for app code：${code}`));
        }
      });

      child.on('error', (err) => reject(err));
    });

    const xcodebuild = "xcodebuild";
    const xcodebuildArgs = [
        "-workspace", `${appName}.xcworkspace`, 
        "-scheme", appName, 
        "-configuration", "Debug", 
        "-sdk", "iphonesimulator",
        "-destination", `platform=iOS Simulator,name=${device.name}`,
        "-derivedDataPath", "out/app/simulator"
    ];

    return new Promise<void>((resolve, reject) => {
      const child = spawn(xcodebuild, xcodebuildArgs, {
        cwd: path.join(projectRoot, 'ios'),
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
          this.logger.info(`pod install finished successfully for app`);
          resolve();
        } else {
          reject(new Error(`pod process exited for app code：${code}`));
        }
      });

      child.on('error', (err) => reject(err));
    });
  }

  // getJavaVersion and prepareJDK methods were part of the old checkAndPrepareEnvironment
  // and are now handled by PrepareAndroidProjectAction.
}



// Action to build the Android application using Gradle
export class BuildiOSAction implements Action { // Expects previous action (BuildAppAction) to be void result type
  description = 'Builds the iOS application xcode-build.';
  name = 'build-ios';

  async execute(context: ActionContext, previousResult?: ActionResult): Promise<ActionResult> {
    // previousResult from BuildAppAction is available if needed, but this action primarily relies on
    // the side effects (assets copied to Android project) of BuildAppAction.
    if (previousResult) {
      context.logger.info(`${this.name} is executing after BuildAppAction.`);
      if (previousResult.outputPaths && previousResult.outputPaths.length > 0) {
        context.logger.info(`${this.name} noted previous action output paths: ${previousResult.outputPaths.join(', ')} (these should be assets in the android project)`);
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

    // Copy app assets to Android assets folder
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
    const builder = new iOSBuilder(context.logger); // context.logger is already Command

    if (!context.projectRoot) {
      throw new Error('Project root not found in action context.');
    }

    context.logger.info('Starting iOS build...');
    // Environment (ANDROID_HOME, JAVA_HOME) and project structure (android folder)
    // are assumed to be prepared by PrepareAndroidProjectAction.
    // App assets are assumed to be copied by BuildAppAction.

    // Default to debug build, or make it configurable via action parameters if needed
    const buildType = 'debug'; // Or make configurable
    await builder.runiOSBuild(context.projectRoot, context.appName as string, buildType, context.device as Device);

    // The output path for the Android APK
    const appPath = path.join(context.projectRoot, 'ios', 'out', 'app', 'simulator', 'Build', 'Products', `${buildType}-iphonesimulator`, `${context.appName}.app`);
    return { crucialOutputPaths: [appPath], outputPaths: [appPath], result: undefined };
  }
}