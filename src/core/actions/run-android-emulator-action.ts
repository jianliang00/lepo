import {confirm, isCancel} from "@clack/prompts";
import {execSync, spawn, SpawnOptions} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {Logger} from "../../logger.js";
import {AndroidEnvInfo, AndroidEnvUtils, getJavaVersion} from '../../utils/android-env-utils.js'; // Added import
import {Action, ActionContext, ActionResult} from './action.js';

const DEFAULT_AVD_NAME = 'lepo_avd';
const TARGET_SYSTEM_IMAGE_API_LEVEL = 36; // Example API level, make configurable if needed
const TARGET_SYSTEM_IMAGE_TAG = 'google_apis_playstore'; // Or 'default', 'google_apis'
const DEFAULT_DEVICE_DEFINITION = 'pixel_6'; // A common device definition
const ADB_MAX_CONNECTION_RETRIES = 60; // Max retries to connect to emulator (e.g., 60 * 2s = 2 minute)
const ADB_RETRY_DELAY_MS = 2000;

function getHostAbi(): string {
    const arch = os.arch();
    if (arch === 'arm64') {
        return 'arm64-v8a';
    }

    if (arch === 'x64') {
        return 'x86_64';
    }

    // Fallback or throw error for unsupported architectures
    // For simplicity, defaulting to x86_64, but this should be more robust
    return 'x86_64';
}

class AndroidEmulatorManager {
    private readonly androidSdkRoot: string;
    private readonly cmdlineToolsPath: string;

    constructor(private logger: Logger, envInfo?: AndroidEnvInfo, private onInteractionBegin?: (() => Promise<void>), private onInteractionEnd?: () => Promise<void>) {
        this.androidSdkRoot = envInfo?.androidHome || '';
        this.cmdlineToolsPath = envInfo?.cmdlineToolsPath || '';
        if (!this.androidSdkRoot) {
            throw new Error('ANDROID_HOME (or ANDROID_SDK_ROOT) environment variable is not set.');
        }

        if (!fs.existsSync(this.androidSdkRoot)) {
            throw new Error(`ANDROID_HOME (or ANDROID_SDK_ROOT) path does not exist: ${this.androidSdkRoot}`);
        }
    }

    public async ensureAvdCreated(avdName: string, systemImageId: string, device: string): Promise<void> {
        this.logger.info(`Checking for AVD: ${avdName}`);
        const avdManagerPath = this.getToolPath('avdmanager');
        try {
            const listAvdsOutput = await this.execCmd(avdManagerPath, ['list', 'avd']);
            if (listAvdsOutput.includes(`Name: ${avdName}`)) {
                this.logger.info('AVD already exists.');
                return;
            }
        } catch (error) {
            this.logger.warn(`Failed to check for AVD: ${error}. Proceeding to AVD creation.`);
        }

        this.logger.info(`AVD not found. Creating AVD (ANDROID_SDK_ROOT: ${process.env.ANDROID_SDK_ROOT}, cwd: ${process.cwd()})...`);
        // avdmanager create avd prompts for custom hardware profile. Echo 'no' to use default.
        const command = avdManagerPath;
        const args = ['create', 'avd', '--force', '--name', avdName, '--package', systemImageId, '--device', device, '--abi', systemImageId.split(';').pop() || getHostAbi()];

        this.logger.info(`Executing: echo no | ${command} ${args.join(' ')}`);
        const proc = spawn(command, args, {stdio: ['pipe', 'pipe', 'pipe']});
        proc.stdin?.write('no\n'); // Answer 'no' to "Create a custom hardware profile?"
        proc.stdin?.end();
        
        proc.stdout?.on('data', (data) => {
            this.logger.info(data.toString().trim());
        });
        
        proc.stderr?.on('data', (data) => {
            this.logger.info(data.toString().trim());
        });

        await new Promise<void>((resolve, reject) => {
            proc.on('close', async (code) => { // Added async here
                if (code === 0) {
                    this.logger.info('AVD created successfully.');
                    // FIXME: This is a workaround for the issue that the created AVD's image.sysdir.1 path is incorrect.
                    // Start of workaround for image.sysdir.1 path
                    try {
                        const avdConfigPath = path.join(os.homedir(), '.android', 'avd', `${avdName}.avd`, `config.ini`);
                        this.logger.info(`Attempting to patch AVD config: ${avdConfigPath}`);
                        if (fs.existsSync(avdConfigPath)) {
                            let configContent = fs.readFileSync(avdConfigPath, 'utf8');
                            const originalSysdir = configContent.match(/^image\.sysdir\.1=(.*)$/m);
                            if (originalSysdir && originalSysdir[1].startsWith('android-sdk/')) {
                                const correctedSysdir = originalSysdir[1].slice('android-sdk/'.length);
                                configContent = configContent.replace(/^image\.sysdir\.1=.*$/m, `image.sysdir.1=${correctedSysdir}`);
                                fs.writeFileSync(avdConfigPath, configContent, 'utf8');
                                this.logger.info(`Successfully patched image.sysdir.1 in ${avdConfigPath}. New value: ${correctedSysdir}`);
                            } else if (originalSysdir) {
                                this.logger.info(`image.sysdir.1 in ${avdConfigPath} does not need patching: ${originalSysdir[1]}`);
                            } else {
                                this.logger.warn(`Could not find image.sysdir.1 in ${avdConfigPath}. Skipping patch.`);
                            }
                        } else {
                            this.logger.warn(`AVD config file not found at ${avdConfigPath}. Skipping patch.`);
                        }
                    } catch (patchError: unknown) {
                        this.logger.warn(`Error during AVD config patch for ${avdName}: ${patchError instanceof Error ? patchError.message : String(patchError)}. Proceeding without patch.`);
                    }

                    // End of workaround
                    resolve();
                } else {
                    reject(new Error(`Failed to create AVD '${avdName}'. avdmanager exit code: ${code}`));
                }
            });
            proc.on('error', (err) => {
                reject(new Error(`Failed to start avdmanager for AVD creation: ${err.message}`));
            });
        });
    }

    public async ensureSystemImageInstalled(): Promise<string> {
        const systemImageId = this.getTargetSystemImageIdentifier();
        this.logger.info(`Checking for system image: ${systemImageId}`);
        const sdkManagerPath = this.getToolPath('sdkmanager');
        const sdkManagerCommonArgs = [`--sdk_root=${this.androidSdkRoot}`];

        try {
            const installedPackages = await this.execCmd(sdkManagerPath, [...sdkManagerCommonArgs, '--list_installed']);
            if (installedPackages.includes(systemImageId.split(';').pop() as string)) { // Check for ABI part or full ID
                this.logger.info('System image already installed.');
                this.logger.info('Installed packages:');
                this.logger.info(installedPackages);
                return systemImageId;
            }
        } catch (error: unknown) {
            this.logger.warn(`Could not accurately check installed packages: ${error}. Proceeding to install attempt.`);
        }

        this.logger.info('System image not found or check failed. Attempting to install (This may take some time)...');

        // For debug, print current java version
        const javaVersion = await getJavaVersion();
        this.logger.info(`Current Java version: ${javaVersion}`);

        try {
            // sdkmanager uses 'yes' to auto-accept licenses
            const process = spawn(sdkManagerPath, [...sdkManagerCommonArgs, `--install`, systemImageId], {stdio: ['pipe', 'pipe', 'pipe']});
            process.stdin?.write('yes\n');
            process.stdin?.end();
            
            process.stdout?.on('data', (data) => {
                this.logger.info(data.toString().trim());
            });
            
            process.stderr?.on('data', (data) => {
                this.logger.info(data.toString().trim());
            });

            await new Promise<void>((resolve, reject) => {
                process.on('close', code => code === 0 ? resolve() : reject(new Error(`sdkmanager failed to install ${systemImageId}, exit code: ${code}`)))
                process.on('error', reject);
            });
            this.logger.info('System image installed successfully.');
            return systemImageId;
        } catch (error: unknown) {
            this.logger.error(`Failed to install system image '${systemImageId}': ${error}`);
        }

        throw new Error(`Failed to install system image '${systemImageId}'.`);
    }

    public async getPackageAndLaunchActivity(apkPath: string): Promise<null | {
        launchActivity: string;
        packageName: string,
    }> {
        this.logger.info(`Attempting to get package name and launch activity from ${apkPath}`);
        const aaptPath = this.getToolPath('aapt');
        try {
            const badgingOutput = await this.execCmd(aaptPath, ['dump', 'badging', apkPath]);
            const packageNameMatch = badgingOutput.match(/package: name='([^']+)'/);
            const launchActivityMatch = badgingOutput.match(/launchable-activity: name='([^']+)'/);

            if (packageNameMatch && packageNameMatch[1] && launchActivityMatch && launchActivityMatch[1]) {
                const packageName = packageNameMatch[1];
                const launchActivity = launchActivityMatch[1];
                this.logger.info(`Found package: ${packageName}, launch activity: ${launchActivity}`);
                return {launchActivity, packageName};
            }

            this.logger.warn('Could not determine package name or launchable activity from APK.');
            return null;
        } catch (error: unknown) {
            this.logger.error(`Error getting package info using aapt: ${error}`);
        }

        return null;
    }

    public async installApk(emulatorId: string, apkPath: string): Promise<void> {
        this.logger.info(`Installing APK ${apkPath} on ${emulatorId}...`);
        if (!fs.existsSync(apkPath)) {
            throw new Error(`APK file not found: ${apkPath}`);
        }

        const adbPath = this.getToolPath('adb');
        // Use -r to reinstall if already exists, -d to allow downgrade (optional)
        await this.execCmd(adbPath, ['-s', emulatorId, 'install', '-r', apkPath], undefined, true);
        this.logger.info('APK installed successfully.');
    }

    public async launchApp(emulatorId: string, packageName: string, activityName: string): Promise<void> {
        this.logger.info(`Launching app ${packageName}/${activityName} on ${emulatorId}...`);
        const adbPath = this.getToolPath('adb');
        await this.execCmd(adbPath, ['-s', emulatorId, 'shell', 'am', 'start', '-n', `${packageName}/${activityName}`], undefined, true);
        this.logger.info('App launch command sent.');
    }

    public async startEmulator(avdName: string): Promise<string> {
        const adbPath = this.getToolPath('adb'); // Get adbPath early

        const devicesOutput = await this.execCmd(adbPath, ['devices']);
        const runningEmulators = devicesOutput.split('\n').slice(1)
            .map(line => line.trim().split('\t')[0])
            .filter(id => id.startsWith('emulator-') && id.trim() !== '');

        if (runningEmulators.length > 0) {
            this.logger.info(`Found running emulator(s): ${runningEmulators.join(', ')}`);

            if (this.onInteractionBegin) {
                await this.onInteractionBegin();
            }

            const stopExistingEmulator = await confirm({
                message: `Emulator(s) [${runningEmulators.join(', ')}] are already running. Do you want to stop them and start the new AVD '${avdName}'?`,
            });
            if (this.onInteractionEnd) {
                await this.onInteractionEnd();
            }

            if (isCancel(stopExistingEmulator)) {
                throw new Error('User chose to cancel.');
            }

            if (stopExistingEmulator) { // Check response.value
                this.logger.info('User chose to stop existing emulator(s).');
                for (const emuId of runningEmulators) {

                    await this.stopEmulator(emuId);
                }
                // Proceed to start new emulator (logic below)
            } else {
                this.logger.info(`Reusing existing emulator(s) [${runningEmulators.join(', ')}] and starting AVD '${avdName}'.`);
                return runningEmulators[0]; // Return the first running emulator ID
            }
        }

        // Original logic to start a new emulator
        this.logger.info(`Starting emulator for AVD: ${avdName}`);
        const emulatorPath = this.getToolPath('emulator');
        // adbPath is already defined above. The original `const adbPath = this.getToolPath('adb');` is removed by this replacement.

        // Get list of devices before starting
        const devicesBeforeOutput = await this.execCmd(adbPath, ['devices']); // Use adbPath defined above
        const devicesBefore = new Set(devicesBeforeOutput.split('\n').slice(1)
            .map(line => line.trim().split('\t')[0]) // Corrected parsing
            .filter(id => id.trim() !== ''));

        // Start emulator in background
        // Common flags: -no-snapshot-load (clean start), -no-audio, -no-boot-anim, -gpu auto/swiftshader_indirect
        // -read-only can be useful for CI to prevent accidental state changes to the AVD system image itself.
        let emulatorOutput = '';
        const emulatorProcess = spawn(emulatorPath, [`@${avdName}`, '-no-snapshot', '-no-audio', '-no-boot-anim', '-gpu', 'swiftshader_indirect'], {
            detached: true,
            stdio: ['ignore', 'pipe', 'pipe'], // Capture stdout and stderr
        });

        emulatorProcess.stdout?.on('data', (data) => {
            const log = data.toString();
            emulatorOutput += log;
            // this.logger.debug(`Emulator stdout: ${log.trim()}`); // Optional: log in real-time if needed
        });
        emulatorProcess.stderr?.on('data', (data) => {
            const log = data.toString();
            emulatorOutput += log;
            // this.logger.debug(`Emulator stderr: ${log.trim()}`); // Optional: log in real-time if needed
        });

        let adbConnectedEmulatorId: null | string = null;
        let emulatorProcessExited = false;
        let emulatorExitCode: null | number = null;

        const exitPromise = new Promise<void>((resolve) => {
            emulatorProcess.on('exit', (code, signal) => {
                emulatorProcessExited = true;
                emulatorExitCode = code;
                this.logger.info(`Emulator process exited with code: ${code}, signal: ${signal}`);
                resolve(); // Resolve the promise when the process exits
            });
            emulatorProcess.on('error', (err) => {
                emulatorProcessExited = true;
                this.logger.error(`Emulator process error: ${err.message}`);
                emulatorOutput += `Emulator process error: ${err.message}\n`;
                resolve(); // Resolve on error as well, to not block indefinitely
            });
        });

        this.logger.info(`Emulator process for ${avdName} starting...`);

        // Wait for the new emulator to appear in adb devices OR for the process to exit
        this.logger.info('Waiting for emulator to connect via ADB or exit...');
        for (let i = 0; i < ADB_MAX_CONNECTION_RETRIES; i++) {
            if (emulatorProcessExited) {
                // If process exited before ADB connection, it's a failure
                break;
            }

            await new Promise(resolve => {
                setTimeout(resolve, ADB_RETRY_DELAY_MS)
            });
            try {
                const devicesAfter = (await this.execCmd(adbPath, ['devices'])).split('\n').slice(1).filter(line => line.trim() !== '');
                const newDevices = devicesAfter.filter(d => !devicesBefore.has(d));
                if (newDevices.length > 0) {
                    adbConnectedEmulatorId = newDevices[0].split('\t')[0];
                    this.logger.info(`Emulator connected: ${adbConnectedEmulatorId}`);
                    break; // Emulator connected
                }
            } catch (adbError: unknown) {
                this.logger.warn(`Error checking ADB devices (attempt ${i + 1}): ${adbError}`);
                // Continue retrying if ADB itself has issues, but monitor emulator process
            }

            this.logger.info(`Still waiting for emulator... (${i + 1}/${ADB_MAX_CONNECTION_RETRIES})`);
        }

        // Wait for the exitPromise to resolve if it hasn't already (e.g. if ADB timed out first)
        // This ensures we capture the exit code if the process exits shortly after timeout.
        if (!emulatorProcessExited) {
            // Give a short moment for the process to potentially exit if it was about to
            await Promise.race([exitPromise, new Promise(resolve => {
                setTimeout(resolve, 500)
            })]);
        }

        if (adbConnectedEmulatorId) {
            // Completely detach the emulator process from parent
            emulatorProcess.unref(); // Allow parent process to exit independently
            emulatorProcess.disconnect?.(); // Disconnect IPC if exists
            
            // Clean up all listeners to prevent memory leaks and process hanging
            emulatorProcess.stdout?.removeAllListeners();
            emulatorProcess.stderr?.removeAllListeners();
            emulatorProcess.removeAllListeners('exit');
            emulatorProcess.removeAllListeners('error');
            emulatorProcess.removeAllListeners('close');
            
            // Close stdio streams to fully detach
            emulatorProcess.stdout?.destroy();
            emulatorProcess.stderr?.destroy();
            
            this.logger.info(`Emulator process for ${avdName} started successfully in background and connected as ${adbConnectedEmulatorId}.`);
            return adbConnectedEmulatorId;
        }

        // If we reach here, emulator failed to connect via ADB or exited prematurely
        let errorMessage = `Failed to start emulator AVD '${avdName}'.`;
        errorMessage += emulatorProcessExited ? ` Process exited with code ${emulatorExitCode}.` : ' Timeout waiting for emulator to connect via ADB.';
        if (emulatorOutput.trim()) {
            errorMessage += `\nEmulator logs:\n${emulatorOutput.trim()}`;
        }

        // Ensure the process is killed if it's still running but didn't connect
        if (!emulatorProcess.killed && emulatorProcess.pid) {
            try {
                this.logger.info(`Attempting to kill unresponsive emulator process PID: ${emulatorProcess.pid}`);
                process.kill(emulatorProcess.pid);
            } catch (killError: unknown) {
                this.logger.warn(`Failed to kill emulator process PID ${emulatorProcess.pid}: ${killError}`);
            }
        }

        throw new Error(errorMessage);
    }

    public async stopEmulator(emulatorId: string): Promise<void> {
        this.logger.info(`Stopping emulator ${emulatorId}...`);
        const adbPath = this.getToolPath('adb');
        try {
            await this.execCmd(adbPath, ['-s', emulatorId, 'emu', 'kill']);
            this.logger.info(`Emulator ${emulatorId} stop command sent.`);
        } catch (error: unknown) {
            this.logger.warn(`Failed to stop emulator ${emulatorId} gracefully: ${error}. It might already be stopped or unresponsive.`);
        }

        // Wait for emulator to actually exit
        this.logger.info(`Waiting for emulator ${emulatorId} to exit...`);
        for (let i = 0; i < ADB_MAX_CONNECTION_RETRIES; i++) {
            try {
                 
                const devicesOutput = await this.execCmd(adbPath, ['devices']);
                const devices = devicesOutput.split('\n').slice(1).filter(line => line.trim() !== '');
                const isStillRunning = devices.some(line => line.includes(emulatorId));
                
                if (!isStillRunning) {
                    this.logger.info(`Emulator ${emulatorId} has exited successfully.`);
                    return;
                }
            } catch (error) {
                // If adb devices fails, the emulator might have exited
                this.logger.info(`ADB devices check failed, emulator might have exited: ${error}`);
                return;
            }

            this.logger.info(`Still waiting for ${emulatorId} to exit... (${i + 1}/${ADB_MAX_CONNECTION_RETRIES})`);
             
            await new Promise(resolve => {
                setTimeout(resolve, ADB_RETRY_DELAY_MS);
            });
        }

        this.logger.warn(`Timeout waiting for emulator ${emulatorId} to exit. It may still be running.`);
    }

    public async waitForDevice(emulatorId: string): Promise<void> {
        this.logger.info(`Waiting for emulator ${emulatorId} to fully boot...`);
        const adbPath = this.getToolPath('adb');
        for (let i = 0; i < ADB_MAX_CONNECTION_RETRIES * 2; i++) { // Longer timeout for boot
            try {
                 
                const bootCompleted = await this.execCmd(adbPath, ['-s', emulatorId, 'shell', 'getprop', 'sys.boot_completed']);
                if (bootCompleted.trim() === '1') {
                    // Additional check for package manager ready
                     
                    const pmReady = await this.execCmd(adbPath, ['-s', emulatorId, 'shell', 'getprop', 'dev.bootcomplete']);
                    if (pmReady.trim() === '1') {
                        this.logger.info(`Emulator ${emulatorId} booted successfully.`);
                        return;
                    }
                }
            } catch (error) {
                // ADB might not be ready yet, or shell command fails, continue retrying
                this.logger.info(`Waiting for boot: ${error}`);
            }

            this.logger.info(`Still waiting for ${emulatorId} to boot... (${i + 1}/${ADB_MAX_CONNECTION_RETRIES * 2})`);
             
            await new Promise(resolve => {
                setTimeout(resolve, ADB_RETRY_DELAY_MS)
            });
        }

        throw new Error(`Timeout waiting for emulator ${emulatorId} to boot.`);
    }

    private async execCmd(command: string, args: string[], options?: SpawnOptions, captureOutput: boolean = true): Promise<string> {
        this.logger.info(`Executing: ${command} ${args.join(' ')}`);
        return new Promise((resolve, reject) => {
            const process = spawn(command, args, {stdio: captureOutput ? 'pipe' : 'inherit', ...options});
            let output = '';
            let errorOutput = '';

            if (captureOutput && process.stdout) {
                process.stdout.on('data', (data) => {
                    output += data.toString();
                });
            }

            if (captureOutput && process.stderr) {
                process.stderr.on('data', (data) => {
                    errorOutput += data.toString();
                });
            }

            process.on('close', (code) => {
                this.logger.info(`Command ${command} ${args.join(' ')} exited with code ${code}`);
                if (code === 0) {
                    resolve(output.trim());
                } else {
                    reject(new Error(`Command failed: ${command} ${args.join(' ')}\nExit code: ${code}\nStdout: ${output}\nStderr: ${errorOutput}`));
                }
            });
            process.on('error', (err) => {
                reject(new Error(`Failed to start command: ${command} ${args.join(' ')}\nError: ${err.message}`));
            });
        });
    }

    private getTargetSystemImageIdentifier(): string {
        const abi = getHostAbi();
        return `system-images;android-${TARGET_SYSTEM_IMAGE_API_LEVEL};${TARGET_SYSTEM_IMAGE_TAG};${abi}`;
    }

    private getToolPath(tool: 'aapt' | 'adb' | 'avdmanager' | 'emulator' | 'sdkmanager'): string {
        let toolPath = '';
        // Check if the tool is already in the PATH
        try {
            toolPath = execSync(`which ${tool}`, {encoding: 'utf8'}).trim();
            if (toolPath) {
                this.logger.info(`Found ${tool} in PATH: ${toolPath}`);
                return toolPath;
            }
        } catch {
            // If not found in PATH, check Android SDK tools directory
            if (!this.androidSdkRoot) throw new Error('Could not get tool path');
        }

        switch (tool) {
            case 'aapt': {
                const buildToolsDir = path.join(this.androidSdkRoot, 'build-tools');
                if (!fs.existsSync(buildToolsDir)) throw new Error('Android build-tools directory not found.');
                const versions = fs.readdirSync(buildToolsDir).sort().reverse(); // Get latest version
                if (versions.length === 0) throw new Error('No build-tools versions found.');
                toolPath = path.join(buildToolsDir, versions[0], tool);
                break;
            }

            case 'adb': {
                toolPath = path.join(this.androidSdkRoot, 'platform-tools', tool);
                break;
            }

            case 'avdmanager':
            case 'sdkmanager': {
                // Prioritize cmdline-tools
                const cmdlineToolsDir = this.cmdlineToolsPath;
                let foundInCmdlineTools = false;
                if (fs.existsSync(cmdlineToolsDir)) {
                    // 1. Try 'latest/bin'
                    const latestPath = path.join(cmdlineToolsDir, 'latest', 'bin', tool);
                    if (fs.existsSync(latestPath)) {
                        toolPath = latestPath;
                        foundInCmdlineTools = true;
                    } else {
                        // 2. If 'latest/bin' not found, scan other versioned directories in cmdline-tools
                        const versions = fs.readdirSync(cmdlineToolsDir).filter(f => fs.statSync(path.join(cmdlineToolsDir, f)).isDirectory());
                        // Sort versions, attempting to find the newest if possible (simple string sort might not be perfect for all versioning schemes)
                        versions.sort().reverse();
                        for (const version of versions) {
                            const versionedPath = path.join(cmdlineToolsDir, version, 'bin', tool);
                            if (fs.existsSync(versionedPath)) {
                                toolPath = versionedPath;
                                foundInCmdlineTools = true;
                                break;
                            }
                        }
                    }
                }

                // 3. Fallback to older tools/bin path if not found in cmdline-tools
                if (!foundInCmdlineTools) {
                    const toolsBinPath = path.join(this.androidSdkRoot, 'tools', 'bin', tool);
                    toolPath = fs.existsSync(toolsBinPath) ? toolsBinPath : tool;
                }

                break;
            }

            case 'emulator': {
                toolPath = path.join(this.androidSdkRoot, 'emulator', tool);
                break;
            }

            default: {
                throw new Error(`Unknown tool: ${tool}`);
            }
        }

        // For Windows, append .bat or .exe if necessary (though platform() check is better)
        if (os.platform() === 'win32' && (tool === 'sdkmanager' || tool === 'avdmanager')) {
            if (fs.existsSync(`${toolPath}.bat`)) toolPath = `${toolPath}.bat`;
            else if (fs.existsSync(`${toolPath}.cmd`)) toolPath = `${toolPath}.cmd`;
        } else if (os.platform() === 'win32' && (tool === 'emulator' || tool === 'adb' || tool === 'aapt') && fs.existsSync(`${toolPath}.exe`)) toolPath = `${toolPath}.exe`;

        // Final check if the resolved tool path (not for PATH fallbacks) exists
        if (toolPath !== tool && !fs.existsSync(toolPath)) {
            throw new Error(`Android SDK tool '${tool}' not found at expected path: ${toolPath}. Please ensure your Android SDK is correctly installed and configured.`);
        }

        return toolPath;
    }
}

export class RunAndroidEmulatorAction implements Action {
    description = 'Downloads (if needed), creates, and starts an Android emulator, then installs and launches an APK.';
    name = 'run-android-emulator';

    async execute(context: ActionContext, previousResult?: ActionResult): Promise<ActionResult> {
        const {logger,} = context;
        logger.info('Starting Android emulator action...');

        let apkPath;
        if (previousResult && previousResult?.outputPaths && previousResult.outputPaths.length > 0) {
            apkPath = previousResult.outputPaths[0];
            logger.info(`Using APK from previous action: ${apkPath}`);
        } else {
            throw new Error('APK path not provided in inputs or previous action result.');
        }

        if (!apkPath) {
            throw new Error('APK path not provided in inputs or previous action result.');
        }

        if (!fs.existsSync(apkPath)) {
            throw new Error(`Specified APK path does not exist: ${apkPath}`);
        }

        const avdName = DEFAULT_AVD_NAME;
        // Note: System image API, tag, and device definition are currently hardcoded constants
        // but could be exposed via inputs if more flexibility is needed.
        // const systemImageApiLevel = inputs?.systemImageApiLevel || TARGET_SYSTEM_IMAGE_API_LEVEL;
        // const systemImageTag = inputs?.systemImageTag || TARGET_SYSTEM_IMAGE_TAG;
        const deviceDefinition = DEFAULT_DEVICE_DEFINITION;

        // Prepare environment before starting emulator tasks
        const envUtils = new AndroidEnvUtils(logger);
        const androidEnvInfo = await envUtils.checkAndPrepareEnvironment();

        const manager = new AndroidEmulatorManager(logger, androidEnvInfo,
            async () => {
                context.spinner?.stop('Waiting for user to confirm...');
            }
            ,
            async () => {
                context.spinner?.start(`Continue action: ${this.name}`);
            }
        );
        let emulatorId: string | undefined;

        try {
            const systemImageId = await manager.ensureSystemImageInstalled();
            await manager.ensureAvdCreated(avdName, systemImageId, deviceDefinition);
            emulatorId = await manager.startEmulator(avdName);
            await manager.waitForDevice(emulatorId);
            await manager.installApk(emulatorId, apkPath);

            const appInfo = await manager.getPackageAndLaunchActivity(apkPath);
            if (appInfo) {
                await manager.launchApp(emulatorId, appInfo.packageName, appInfo.launchActivity);
                logger.info(`App ${appInfo.packageName} launched successfully on ${emulatorId}.`);
            } else {
                logger.warn('Could not automatically launch the app as package/activity info was not found. APK is installed.');
            }

            logger.info('Android emulator action completed successfully.');
            // Optionally, keep emulator running or stop it.
            // For CI, usually stop it. For local dev, might want to keep it.
            // await manager.stopEmulator(emulatorId);

            return {outputPaths: [apkPath], result: undefined}; // Output APK path for potential further actions
        } catch (error: unknown) {
            logger.info(`Android emulator action failed: ${error}`);
            if (emulatorId) {
                logger.info(`Attempting to stop emulator ${emulatorId} due to error...`);
                await manager.stopEmulator(emulatorId).catch(stopError => logger.warn(`Failed to stop emulator during error cleanup: ${stopError.message}`));
            }

            throw error;
        }
    }
}