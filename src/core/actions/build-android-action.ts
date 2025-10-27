import { spawn } from 'node:child_process';
import fs from 'node:fs';
import { platform } from 'node:os';
import path from 'node:path';

import {Logger} from "../../logger.js"; // Logger might be used internally, or can be Command if only log is used
import {copyFolder} from "../../utils/common.js";
import {Action, ActionContext, ActionResult} from './action.js';

// AndroidBuilder class, now focused on running the Gradle build
export class AndroidBuilder {
  private logger: Logger; // Changed Logger to Command

  constructor(logger: Logger) { // Changed Logger to Command
    this.logger = logger;
  }

  // Note: checkAndPrepareEnvironment and prepareAndroidProject methods
  // have been moved to PrepareAndroidProjectAction.
  // getJavaVersion and prepareJDK were part of checkAndPrepareEnvironment.

  public async runAndroidBuild(projectDir: string, buildType: 'debug' | 'release'): Promise<void> {
    const task = buildType === 'debug' ? 'assembleDebug' : 'assembleRelease';
    this.logger.info(`Running android build: app:${task}`);
    const gradleCommand = platform() === 'win32' ? 'gradlew.bat' : './gradlew';
    const args = [`app:${task}`];

    return new Promise<void>((resolve, reject) => {
      const child = spawn(gradleCommand, args, {
        cwd: path.join(projectDir, 'android'),
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
          this.logger.info(`Gradle build finished successfully for app:${task}`);
          resolve();
        } else {
          reject(new Error(`Gradle process exited for app:${task}, code：${code}`));
        }
      });

      child.on('error', (err) => reject(err));
    });
  }

  // getJavaVersion and prepareJDK methods were part of the old checkAndPrepareEnvironment
  // and are now handled by PrepareAndroidProjectAction.
}



// Action to build the Android application using Gradle
export class BuildAndroidAction implements Action { // Expects previous action (BuildAppAction) to be void result type
  description = 'Builds the Android application using Gradle.';
  name = 'build-android';

  async execute(context: ActionContext, previousResult?: ActionResult): Promise<ActionResult> {
    // previousResult from BuildAppAction is available if needed, but this action primarily relies on
    // the side effects (assets copied to Android project) of BuildAppAction.
    if (previousResult) {
      context.logger.info(`${this.name} is executing after BuildAppAction.`);
      if (previousResult.outputPaths && previousResult.outputPaths.length > 0) {
        context.logger.info(`${this.name} noted previous action output paths: ${previousResult.outputPaths.join(', ')} (these should be assets in the android project)`);
      }
    }

    const appAssetPaths = previousResult?.outputPaths ?? [];
    context.logger.info(`${this.name} received app asset paths: ${appAssetPaths.join(', ')}`);

    if (!context.projectRoot) {
      throw new Error('Project root not found in action context.');
    }

    // Copy app assets to Android assets folder
    const assetsFolder = path.join(context.projectRoot, 'android', 'app', 'src', 'main', 'assets');
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

    const androidBuilder = new AndroidBuilder(context.logger);

    context.logger.info('Starting Android Gradle build...');
    // Environment (ANDROID_HOME, JAVA_HOME) and project structure (android folder)
    // are assumed to be prepared by PrepareAndroidProjectAction.

    // Default to debug build, or make it configurable via action parameters if needed
    const buildType = 'debug'; // Or make configurable
    await androidBuilder.runAndroidBuild(context.projectRoot, buildType);

    // The output path for the Android APK
    const apkPath = path.join(context.projectRoot, 'android', 'app', 'build', 'outputs', 'apk', buildType, `app-${buildType}.apk`);
    return { crucialOutputPaths: [apkPath], outputPaths: [apkPath], result: undefined };
  }
}