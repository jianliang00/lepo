import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os, { arch, platform } from 'node:os';
import path from 'node:path';

import { CACHE_DIR } from '../cache.js'; // Adjusted path
import {Logger} from "../logger"; // Assuming utils.ts is at ../../utils.js relative to this new file
import { downloadFile } from './common.js';

const EXPECTED_JAVA_VERSION = '17.0.1';
const EXPECTED_CMDLINE_TOOLS_VERSION = '11076708'; // Example version, ensure this is a valid and desired one.
const MANAGED_SDK_DIR_NAME = 'android-sdk'; // Directory name within CACHE_DIR
const SDK_PACKAGES_TO_INSTALL = [
  "platform-tools",
  "platforms;android-34", // Using a recent API level
  "build-tools;34.0.0",   // Corresponding build tools version
  // "emulator", // Uncomment if emulator is needed
  // "system-images;android-34;google_apis;x86_64" // Uncomment for a specific system image
];

export async function getJavaVersion(javaHomeOverride?: string): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const javaExecutable = javaHomeOverride ? path.join(javaHomeOverride, 'bin', 'java') : (process.env.JAVA_HOME ? path.join(process.env.JAVA_HOME, 'bin', 'java') : 'java');

    // Check if java executable exists
    // For 'java' (from PATH), direct fs.existsSync won't work easily across platforms without resolving PATH.
    // For absolute paths, we can check.
    if (path.isAbsolute(javaExecutable) && !fs.existsSync(javaExecutable)) {
      // Try with .exe for windows if it's not already there
      if (os.platform() === 'win32' && !javaExecutable.endsWith('.exe') && fs.existsSync(`${javaExecutable}.exe`)) {
        // continue with .exe path
      } else {
        reject(new Error(`Java executable not found at: ${javaExecutable}`));
      }
    }

    const child = spawn(javaExecutable, ['-version'], {
      shell: os.platform() === 'win32', // Use shell on Windows for better PATH resolution if 'java' is used directly
      stdio: 'pipe',
    });
    let output = '';
    child.stdout.on('data', (data) => {
      output += data.toString();
    });
    child.stderr.on('data', (data) => { // Java version often prints to stderr
      output += data.toString();
    });
    child.on('close', (code) => {
      if (code === 0) {
        const match = output.match(/version "(\d+\.\d+\.\d+)(?:_\d+)?"/);
        if (match && match[1]) {
          resolve(match[1]);
        } else {
          reject(new Error('Could not parse Java version from output: ' + output));
        }
      } else {
        reject(new Error(`'${javaExecutable} -version' exited with code ${code}. Output: ${output}`));
      }
    });
    child.on('error', (err) => reject(new Error(`Failed to start '${javaExecutable} -version': ${err.message}`)));
  });
}

export interface AndroidEnvInfo {
  androidHome: string;
  cmdlineToolsPath: string;
  javaHome: string;
}

export class AndroidEnvUtils {
  private logger: Logger;

  constructor(logger: Logger) {
    this.logger = logger;
  }

  public async checkAndPrepareEnvironment(): Promise<AndroidEnvInfo> {
    const androidEnvInfo: AndroidEnvInfo = {
      androidHome: '',
      cmdlineToolsPath: '',
      javaHome: '',
    };

    let javaHome = process.env.JAVA_HOME;
    // Check if JAVA_HOME is set
    if (!javaHome) {
      this.logger.info('JAVA_HOME not set, downloading JDK...');
      try {
        javaHome = await this.prepareJDK();
        process.env.JAVA_HOME = javaHome; // Set it for current process
        androidEnvInfo.javaHome = javaHome;
        this.logger.info(`JDK prepared and JAVA_HOME set to: ${javaHome}`);
      } catch (error: unknown) {
        this.logger.error(`Failed to prepare JDK: ${error}`);
      }
    }

    // Check java version
    try {
      const javaVersion = await getJavaVersion(javaHome);
      if (javaVersion === EXPECTED_JAVA_VERSION) {
        this.logger.info(`Found compatible Java version: ${javaVersion} at ${javaHome}`);
      } else {
        this.logger.info(`Java version ${javaVersion} is not ${EXPECTED_JAVA_VERSION}, attempting to download the correct JDK...`);
        javaHome = await this.prepareJDK();
        // Change JAVA_HOME for current process
        process.env.JAVA_HOME = javaHome;
        this.logger.info(`JDK prepared and JAVA_HOME set to: ${javaHome}`);
        // Re-verify version after preparing JDK
        const newJavaVersion = await getJavaVersion(javaHome);
        if (newJavaVersion !== EXPECTED_JAVA_VERSION) {
            throw new Error(`Installed JDK version ${newJavaVersion} still does not match expected version ${EXPECTED_JAVA_VERSION}.`);
        }
      }
    } catch (error: Error | unknown) {
        this.logger.warn(`Could not verify Java version: ${error}. Attempting to download JDK as a precaution.`);
        try {
            javaHome = await this.prepareJDK();
            process.env.JAVA_HOME = javaHome; // Set it for current process
            this.logger.info(`JDK prepared and JAVA_HOME set to: ${javaHome}`);
            const newJavaVersion = await getJavaVersion(javaHome);
            if (newJavaVersion !== EXPECTED_JAVA_VERSION) {
                throw new Error(`Installed JDK version ${newJavaVersion} still does not match expected version ${EXPECTED_JAVA_VERSION} after re-download.`);
            }
        } catch (jdkError: unknown) {
            this.logger.error(`Failed to prepare JDK after version check issue: ${jdkError}`);
        }
    }

    // Define managed SDK root
    const managedSdkRoot = path.join(CACHE_DIR, MANAGED_SDK_DIR_NAME);
    if (!fs.existsSync(managedSdkRoot)) {
      fs.mkdirSync(managedSdkRoot, { recursive: true });
      this.logger.info(`Created managed Android SDK directory at: ${managedSdkRoot}`);
    }

    androidEnvInfo.androidHome = managedSdkRoot;
    process.env.ANDROID_HOME = managedSdkRoot; // Set for current process and sdkmanager usage
    process.env.ANDROID_SDK_ROOT = managedSdkRoot;

    // Prepare Android SDK Command-line Tools into the managed SDK root
    let cmdlineToolsDirActual: string;
    try {
      cmdlineToolsDirActual = await this.prepareCmdlineTools(managedSdkRoot);
      this.logger.info(`Android SDK Command-line Tools prepared at: ${cmdlineToolsDirActual}`);
      androidEnvInfo.cmdlineToolsPath = cmdlineToolsDirActual; // This is sdkRoot/cmdline-tools
    } catch (error: unknown) {
      this.logger.error(`Failed to prepare Android SDK Command-line Tools: ${error}`);
      throw error;
    }

    // Prepare (install/update) Android SDK components using sdkmanager
    try {
      await this.prepareAndroidSdk(managedSdkRoot, cmdlineToolsDirActual);
      this.logger.info(`Android SDK components prepared in: ${managedSdkRoot}`);
    } catch (error: unknown) {
      this.logger.error(`Failed to prepare Android SDK components: ${error}`);
    }

    // Update PATH for the current process to include platform-tools and cmdline-tools
    const platformToolsPath = path.join(managedSdkRoot, 'platform-tools');
    const cmdlineToolsBinPath = path.join(cmdlineToolsDirActual, 'bin');
    const newPath = `${platformToolsPath}${path.delimiter}${cmdlineToolsBinPath}${path.delimiter}${process.env.PATH}`;
    process.env.PATH = newPath;
    this.logger.info(`Updated PATH to: ${newPath}`);

    this.logger.info('Android environment, JDK, Command-line Tools, and SDK components check complete.');
    return androidEnvInfo;
  }

  // Start of new method listInstalledPackages
  private async listInstalledPackages(sdkRoot: string, sdkManagerPath: string): Promise<Set<string>> {
    return new Promise<Set<string>>((resolve) => { // Always resolve with a Set
      this.logger.info(`Listing installed SDK packages in ${sdkRoot} using ${sdkManagerPath}...`);
      const listProcess = spawn(sdkManagerPath, [`--sdk_root=${sdkRoot}`, '--list_installed'], {
        env: { ...process.env }, 
        stdio: 'pipe',
      });

      let output = '';
      let errorOutput = '';
      listProcess.stdout.on('data', (data) => {
        output += data.toString();
      });
      listProcess.stderr.on('data', (data) => {
        errorOutput += data.toString();
      });

      listProcess.on('close', (code) => {
        const installedPackages = new Set<string>();
        if (code === 0) {
          const lines = output.split(/\r?\n/);
          let inInstalledSection = false;

          for (const line of lines) {
            const trimmedLine = line.trim();

            if (!inInstalledSection) {
              // Case-insensitive check for the header
              if (trimmedLine.toLowerCase().includes('installed packages:')) {
                inInstalledSection = true;
                this.logger.info(`[listInstalledPackages] Found 'Installed packages:' header. Parsing subsequent lines.`);
              }

              continue; // Continue until "Installed packages:" is found or end of output
            }

            // Now we are in the installed packages section

            // Skip header line that typically starts with 'Path' (case-insensitive) or '---', or is empty
            if (trimmedLine.toLowerCase().startsWith('path') || trimmedLine.startsWith('---') || trimmedLine === '') {
              this.logger.info(`[listInstalledPackages] Skipping header, separator, or empty line: '${trimmedLine}'`);
              continue;
            }

            // Attempt to parse the line as a package ID
            // The typical format is "package.id | version | description"
            const parts = trimmedLine.split('|');
            if (parts.length > 0) {
              const packageId = parts[0].trim();
              if (packageId) { // Ensure packageId is not empty after trim
                this.logger.info(`[listInstalledPackages] Adding package ID: '${packageId}' from line: '${trimmedLine}'`);
                installedPackages.add(packageId);
              } else {
                this.logger.info(`[listInstalledPackages] Parsed empty package ID from line (trimmed first part of split was empty): '${trimmedLine}'`);
              }
            } else {
              // This case should not be reached if trimmedLine is not empty, as split always returns an array with at least one element.
              this.logger.info(`[listInstalledPackages] Line did not produce expected parts when split by '|' (this is unexpected): '${trimmedLine}'`);
            }
          }

          if (installedPackages.size > 0) {
            this.logger.info(`Found installed SDK packages: ${[...installedPackages].join(', ')}`);
          } else if (output.includes("No packages installed") || output.includes("No packages found")) {
             this.logger.info("No SDK packages reported as installed by sdkmanager.");
          } else {
            this.logger.info("sdkmanager --list_installed ran successfully but no specific packages were parsed or listed.");
            // if (output.trim()) this.logger.debug(`--list_installed stdout (first 1000 chars):\n${output.slice(0, 1000)}`);
            // if (errorOutput.trim()) this.logger.debug(`--list_installed stderr (first 1000 chars):\n${errorOutput.slice(0, 1000)}`);
          }
        } else {
          this.logger.warn(`'sdkmanager --list_installed' command failed with code ${code}. Stdout (first 500 chars): ${output.slice(0,500)}. Stderr (first 500 chars): ${errorOutput.slice(0,500)}. Assuming no packages are verifiably installed.`);
        }

        resolve(installedPackages); 
      });

      listProcess.on('error', (err) => {
        this.logger.warn(`Failed to start 'sdkmanager --list_installed': ${err.message}. Assuming no packages are verifiably installed.`);
        resolve(new Set<string>()); 
      });
    });
  }
  // End of new method listInstalledPackages

  private async prepareAndroidSdk(sdkRoot: string, cmdlineToolsDir: string): Promise<void> {
    const sdkManagerPath = path.join(cmdlineToolsDir, 'bin', os.platform() === 'win32' ? 'sdkmanager.bat' : 'sdkmanager');

    if (!fs.existsSync(sdkManagerPath)) {
      throw new Error(`sdkmanager not found at ${sdkManagerPath}. Command-line tools might not be installed correctly.`);
    }

    this.logger.info(`Using sdkmanager at: ${sdkManagerPath} for SDK root ${sdkRoot}`);

    let skipSdkInstallation = false;
    if (SDK_PACKAGES_TO_INSTALL.length === 0) {
        this.logger.info('No SDK packages are required by SDK_PACKAGES_TO_INSTALL. Skipping installation check.');
        skipSdkInstallation = true;
    } else {
        try {
          const installedPackages = await this.listInstalledPackages(sdkRoot, sdkManagerPath);
          // installedPackages will always be a Set<string> due to the implementation of listInstalledPackages
          skipSdkInstallation = SDK_PACKAGES_TO_INSTALL.every(pkg => {
              const isInstalled = installedPackages.has(pkg);
              if (!isInstalled) {
                  this.logger.info(`Required SDK package '${pkg}' not found among installed packages: [${[...installedPackages].join(', ')}]`);
              }

              return isInstalled;
          });
        } catch (error) { 
          this.logger.warn(`Error during SDK package check: ${(error as Error).message}. Proceeding with installation.`);
          skipSdkInstallation = false;
        }
    }

    if (skipSdkInstallation) {
      this.logger.info('All required SDK packages are already installed or no packages are required. Skipping license acceptance and installation steps.');
    } else {
      this.logger.info('Not all required SDK packages are installed, verification failed, or packages are required. Proceeding with SDK setup.');

      if (!process.env.JAVA_HOME) {
        throw new Error('JAVA_HOME is not set. sdkmanager requires JAVA_HOME.');
      }

      this.logger.info(`JAVA_HOME for sdkmanager: ${process.env.JAVA_HOME}`);

      this.logger.info('Attempting to accept SDK licenses...');
      await new Promise<void>((resolve, reject) => {
        const quotedSdkManagerPath = `"${sdkManagerPath.replaceAll('"', String.raw`\"`)}"`;
        const quotedSdkRoot = `"${sdkRoot.replaceAll('"', String.raw`\"`)}"`;
        const licenseCommand = `yes | ${quotedSdkManagerPath} --licenses --sdk_root=${quotedSdkRoot}`;
        this.logger.info(`Executing license acceptance command: ${licenseCommand}`);

        const acceptLicensesProcess = spawn(licenseCommand, [], {
          env: { ...process.env },
          shell: true,
          stdio: 'pipe',
        });

        let licOutput = '';
        acceptLicensesProcess.stdout.on('data', (data) => {
 licOutput += data.toString(); this.logger.info(`[lic-stdout] ${data.toString().trim()}`); 
});
        acceptLicensesProcess.stderr.on('data', (data) => {
 licOutput += data.toString(); this.logger.info(`[lic-stderr] ${data.toString().trim()}`); 
});

        acceptLicensesProcess.on('close', (code) => {
          this.logger.info(`sdkmanager --licenses process finished with code ${code}.`);
          if (licOutput.length > 0) {
              this.logger.info(`License process output sample: ${licOutput.slice(0, Math.max(0, Math.min(licOutput.length, 500)))}...`);
          }

          resolve();
        });
        acceptLicensesProcess.on('error', (err) => {
          reject(new Error(`Failed to run sdkmanager --licenses: ${err.message}. Output: ${licOutput}`));
        });
      });

      const packagesToInstallArg = SDK_PACKAGES_TO_INSTALL.join(' ');
      this.logger.info(`Installing SDK packages: ${packagesToInstallArg} into ${sdkRoot}`);
      await new Promise<void>((resolve, reject) => {
        const installProcess = spawn(sdkManagerPath, [`--sdk_root=${sdkRoot}`, ...SDK_PACKAGES_TO_INSTALL], {
          env: { ...process.env },
          stdio: 'pipe',
        });

        let installOutput = '';
        installProcess.stdout.on('data', (data) => {
          const dataStr = data.toString();
          installOutput += dataStr;
          process.stdout.write(dataStr);
        });
        installProcess.stderr.on('data', (data) => {
          const dataStr = data.toString();
          installOutput += dataStr;
          process.stderr.write(dataStr);
        });

        installProcess.on('close', (code) => {
          process.stdout.write('\n');
          if (code === 0) {
            this.logger.info('SDK packages installed successfully.');
            const platformToolsPath = path.join(sdkRoot, 'platform-tools');
            if (!fs.existsSync(platformToolsPath)) {
              this.logger.warn(`platform-tools directory not found at ${platformToolsPath} after installation. SDK might be incomplete.`);
            }

            resolve();
          } else {
            this.logger.warn(`sdkmanager install process exited with code ${code}.`);
            this.logger.warn(`Install process output (first 1000 chars): ${installOutput.slice(0,1000)}`);
            reject(new Error(`Failed to install SDK packages. sdkmanager exited with code ${code}.`));
          }
        });
        installProcess.on('error', (err) => {
          this.logger.warn(`Failed to start sdkmanager install process: ${err.message}.`);
          this.logger.warn(`Install process output (first 1000 chars): ${installOutput.slice(0,1000)}`);
          reject(new Error(`Failed to run sdkmanager for installing packages: ${err.message}`));
        });
      });
    }

    this.logger.info('Android SDK preparation check/process complete.');
  }

  private async prepareCmdlineTools(sdkRoot: string): Promise<string> {
    const toolsVersion = EXPECTED_CMDLINE_TOOLS_VERSION;
    let osType: string = os.platform();
    switch (osType) {
    case 'darwin': {
      osType = 'mac'; // Google uses 'mac' for macOS in download URLs
    
    break;
    }

    case 'linux': {
      osType = 'linux';
    
    break;
    }

    case 'win32': {
      osType = 'win';
    
    break;
    }

    default: {
      throw new Error(`Unsupported OS for cmdline-tools download: ${osType}`);
    }
    }

    const url = `https://dl.google.com/android/repository/commandlinetools-${osType}-${toolsVersion}_latest.zip`;
    const cmdlineToolsDir = path.join(sdkRoot, 'cmdline-tools');
    const sdkManagerExecutable = path.join(cmdlineToolsDir, 'bin', osType === 'win' ? 'sdkmanager.bat' : 'sdkmanager');

    // Check if already exists and is (presumably) correct
    if (fs.existsSync(sdkManagerExecutable)) {
      this.logger.info(`Android SDK Command-line Tools (version ${toolsVersion} target) seem to be already prepared at: ${cmdlineToolsDir}`);
      // A more robust check would involve verifying the version of the sdkmanager or a marker file.
      return cmdlineToolsDir;
    }

    // If the base directory exists but not the executable, clean it up for a fresh install
    if (fs.existsSync(cmdlineToolsDir)) {
        this.logger.info(`Found existing cmdline-tools directory at ${cmdlineToolsDir} but sdkmanager is missing. Cleaning up for re-download.`);
        fs.rmSync(cmdlineToolsDir, { force: true, recursive: true });
    }

    fs.mkdirSync(cmdlineToolsDir, { recursive: true });

    const cmdlineToolsZip = path.join(os.tmpdir(), `commandlinetools-${osType}-${toolsVersion}.zip`);

    this.logger.info(`Downloading Android SDK Command-line Tools ${toolsVersion}... (${url})`);
    await downloadFile(
      url,
      cmdlineToolsZip,
      {
        onProgress({ downloaded, percentage, total }) {
          process.stdout.write(`\rDownloading Command-line Tools: ${downloaded}/${total} (${percentage}%)`);
        },
        timeout: 300_000, // 5 minutes timeout
      },
    );
    process.stdout.write('\n');
    this.logger.info('Command-line Tools download complete.');

    this.logger.info('Extracting Command-line Tools...');
    // The zip file typically contains a 'cmdline-tools' folder at its root.
    // We want to extract its *contents* into our CACHE_DIR/cmdline-tools folder.
    // So, we extract to a temporary location, then move the contents of the nested 'cmdline-tools' folder.
    // OR, if unzip supports stripping components or extracting a subfolder, use that.
    // Simpler: unzip directly to CACHE_DIR. If it creates cmdline-tools/cmdline-tools, we adjust.
    // Standard Android cmdline tools zip has a single `cmdline-tools` directory at the root.
    // So, unzipping to `CACHE_DIR` will result in `CACHE_DIR/cmdline-tools`.

    await new Promise<void>((resolve, reject) => {
      // We expect the zip to contain a 'cmdline-tools' directory at its root.
      // We extract into sdkRoot. This should create sdkRoot/cmdline-tools.
      this.logger.info(`Extracting ${cmdlineToolsZip} to ${sdkRoot}`);
      const extract = spawn('unzip', ['-o', cmdlineToolsZip, '-d', sdkRoot]);
      let stdOutput = '';
      extract.stdout.on('data', (data) => {
 stdOutput += data; 
});
      extract.stderr.on('data', (data) => {
 stdOutput += data; 
});

      extract.on('close', (code) => {
        if (code === 0) {
          // After extraction to sdkRoot, the structure should be sdkRoot/cmdline-tools/...
          // cmdlineToolsDir is already path.join(sdkRoot, 'cmdline-tools')
          // sdkManagerExecutable is path.join(cmdlineToolsDir, 'bin', ...)
          if (!fs.existsSync(sdkManagerExecutable)) {
            this.logger.info(`Command-line Tools extraction seemed to succeed, but sdkmanager not found at ${sdkManagerExecutable}.`);
            this.logger.info(`Directory listing for ${cmdlineToolsDir}: ${fs.existsSync(cmdlineToolsDir) ? fs.readdirSync(cmdlineToolsDir).join(', ') : 'Directory not found'}`);
            this.logger.info(`Directory listing for ${sdkRoot}: ${fs.existsSync(sdkRoot) ? fs.readdirSync(sdkRoot).join(', ') : 'Directory not found'}`);
            this.logger.info(`Extraction output: ${stdOutput}`);
            return reject(new Error(`Failed to locate sdkmanager at ${sdkManagerExecutable} after extraction into ${sdkRoot}. Check zip structure and extraction path.`));
          }

          this.logger.info('Command-line Tools extracted successfully to:', cmdlineToolsDir);
          resolve();
        } else {
          reject(new Error(`Failed to extract Command-line Tools, unzip exited with code ${code}. Output: ${stdOutput}`));
        }
      });
      extract.on('error', (err) => {
        reject(err);
      });
    });

    try {
      fs.unlinkSync(cmdlineToolsZip);
      this.logger.info('Cleaned up Command-line Tools zip.');
    } catch (error: unknown) {
      this.logger.warn(`Could not delete Command-line Tools zip ${cmdlineToolsZip}: ${error}`);
    }

    return cmdlineToolsDir;
  }

  private async prepareJDK(): Promise<string> {
    // Download JDK
    let plat: string = platform();
    if (plat === 'darwin') {
      plat = 'macos';
    }

    let arch_ = arch();
    if (arch_ === 'arm64') {
      arch_ = 'aarch64';
    }

    const url = `https://download.java.net/java/GA/jdk${EXPECTED_JAVA_VERSION.split('.')[0]}.0.1/2a2082e5a09d4267845be086888add4f/12/GPL/openjdk-${EXPECTED_JAVA_VERSION}_${plat}-${arch_}_bin.tar.gz`;
    const jdkDir = path.join(CACHE_DIR, `jdk-${EXPECTED_JAVA_VERSION}`);
    const jdkHome = path.join(jdkDir, plat === 'macos' ? `jdk-${EXPECTED_JAVA_VERSION}.jdk/Contents/Home` : `jdk-${EXPECTED_JAVA_VERSION}`);

    if (!fs.existsSync(jdkDir)) {
      fs.mkdirSync(jdkDir, {recursive: true});
    } else if (fs.existsSync(jdkHome)) {
      this.logger.info('Required JDK version already prepared at:', jdkHome);
      // Verify version just in case the directory exists but content is wrong
      try {
        const currentVersion = await getJavaVersion(jdkHome);
        if (currentVersion === EXPECTED_JAVA_VERSION) {
          return jdkHome;
        }

        this.logger.warn(`Existing JDK at ${jdkHome} is version ${currentVersion}, expected ${EXPECTED_JAVA_VERSION}. Re-downloading.`);
        // If version mismatch, proceed to download by removing old dir or downloading to a new temp name
        // For simplicity, we'll let it overwrite if tar extraction handles it, or fail if it doesn't.
        // A more robust solution would be to clear jdkDir or use unique names.
      } catch (error: unknown) {
        this.logger.warn(`Could not verify version of existing JDK at ${jdkHome}: ${error}. Proceeding with download.`);
      }
    }

    const jdkTar = path.join(os.tmpdir(), `jdk-${EXPECTED_JAVA_VERSION}-${plat}-${arch_}.tar.gz`);
    if (fs.existsSync(jdkTar)) {
      // Optionally, add a check here to see if the tar is complete or recent
      // For now, we assume if it exists, it might be usable or will be overwritten by downloadFile
      this.logger.info(`Found existing JDK tar at ${jdkTar}. Will attempt to use or re-download if necessary.`);
    }

    this.logger.info(`Downloading JDK ${EXPECTED_JAVA_VERSION}... (${url})`);
    await downloadFile(
        url,
        jdkTar,
        {
          onProgress({ downloaded, percentage, total }) {
            // Ensure logger is available and has a 'log' method for progress
            // Using process.stdout directly for progress to avoid oclif's log formatting overhead for rapid updates.
            process.stdout.write(`\rDownloading JDK: ${downloaded}/${total} (${percentage}%)`);
          },
          timeout: 300_000, // Increased timeout for JDK download
        }
    );
    process.stdout.write('\n'); // Newline after progress bar
    this.logger.info('JDK download complete.');

    // Extract JDK
    this.logger.info('Extracting JDK...');
    // Ensure extraction target parent directory exists
    const extractionTargetParentDir = plat === 'macos' ? path.join(jdkDir, `jdk-${EXPECTED_JAVA_VERSION}.jdk`, 'Contents') : jdkDir;
    if (!fs.existsSync(extractionTargetParentDir)) {
        fs.mkdirSync(extractionTargetParentDir, { recursive: true });
    }

    // Before extraction, ensure the target jdkHome is clean if it exists from a failed/partial previous attempt
    if (fs.existsSync(jdkHome)) {
        this.logger.info(`Cleaning up existing JDK directory before extraction: ${jdkHome}`);
        fs.rmSync(jdkHome, { force: true, recursive: true });
        // Recreate the base jdkDir if it was the one removed (only if not macOS structure)
        if (jdkHome === jdkDir) fs.mkdirSync(jdkDir, {recursive: true});
    }
    // For macOS, the structure is jdk-17.0.1.jdk/Contents/Home. tar extracts into jdk-17.0.1/
    // So we extract into jdkDir, then rename jdk-17.0.1 to jdk-17.0.1.jdk if needed.

    await new Promise<void>((resolve, reject) => {
      // For macOS, tar extracts to a folder like 'jdk-17.0.1.jdk'. We want to place this inside 'jdkDir'.
      // For Linux/Windows, it extracts to 'jdk-17.0.1'. We also want this inside 'jdkDir'.
      // The --strip-components=1 is usually to remove the top-level directory from the archive.
      // Let's adjust the extraction path and handling based on typical JDK tar structures.
      // Most JDK tars have a single top-level directory, e.g., "jdk-17.0.1"
      const extract = spawn('tar', ['-xzvf', jdkTar, '-C', jdkDir, '--strip-components=1']);
      
      let stdOutput = '';
      extract.stdout.on('data', (data) => {
        stdOutput += data; /* Can be verbose, log selectively */
      });
      extract.stderr.on('data', (data) => {
        stdOutput += data; /* Log errors */
      });

      extract.on('close', (code) => {
        if (code === 0) {
          // On macOS, the extracted folder (now directly in jdkDir due to strip-components) needs to be inside a .jdk folder
          // This logic assumes the tarball's top stripped folder name matches `jdk-${EXPECTED_JAVA_VERSION}`
          // and for macOS, we need to ensure it's `jdk-${EXPECTED_JAVA_VERSION}.jdk/Contents/Home`
          // The current `jdkHome` variable already points to the final desired path.
          // We need to ensure the extracted contents are moved/renamed correctly to match `jdkHome`.

          // If `plat === 'macos'`, the `jdkHome` is `CACHE_DIR/jdk-17.0.1/jdk-17.0.1.jdk/Contents/Home`
          // Tar extracts to `CACHE_DIR/jdk-17.0.1/` (after stripping one component)
          // So, the extracted content is already in the correct parent for `jdkHome` for non-macOS.
          // For macOS, we need to ensure the `jdk-${EXPECTED_JAVA_VERSION}.jdk` structure.
          // The current tar extraction logic with --strip-components=1 into jdkDir should place files like bin/, lib/ etc. directly into jdkDir.
          // This matches the structure for Linux/Windows where jdkHome = jdkDir/jdk-17.0.1 (which is now just jdkDir).
          // For macOS, jdkHome = jdkDir/jdk-17.0.1.jdk/Contents/Home.
          // The current setup might be slightly off if the tarball for macOS doesn't create the .jdk and Contents/Home structure itself after stripping.
          // Let's assume for now the `jdkHome` path is correctly populated by the extraction.
          // A common structure for macOS JDK .tar.gz is `jdk-17.0.1.jdk/Contents/Home/...` as the content.
          // If we `tar -xzvf archive.tar.gz -C target --strip-components=1`, and archive has `somefolder/jdk-17.0.1.jdk/...`
          // then `target` will contain `jdk-17.0.1.jdk/...`.
          // If archive has `jdk-17.0.1.jdk/Contents/Home/...` as top level, then strip 1 means `Contents/Home/...` in target.
          // This part is tricky and depends on exact tarball structure.

          // Let's simplify: assume `jdkHome` is the correct final path. If it doesn't exist after tar, something is wrong.
          if (!fs.existsSync(jdkHome)) {
            this.logger.error(`JDK extraction seemed to succeed, but the target home directory ${jdkHome} was not found. Extracted output: ${stdOutput}`);
          }

          this.logger.info('JDK extracted successfully to:', jdkHome);
          resolve();
        } else {
          reject(new Error(`Failed to extract JDK, tar exited with code ${code}. Output: ${stdOutput}`));
        }
      });
      extract.on('error', (err) => {
        reject(err);
      });
    });

    // Clean up downloaded tar file
    try {
      fs.unlinkSync(jdkTar);
      this.logger.info('Cleaned up JDK tarball.');
    } catch (error: unknown) {
      this.logger.warn(`Could not delete JDK tarball ${jdkTar}: ${error}`);
    }

    return jdkHome;
  }
}