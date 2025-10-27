import {
  cancel,
  isCancel,
  select,
} from '@clack/prompts';
import deepmerge from 'deepmerge';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from "node:url";

import {isEmptyDir} from "../../utils/common.js";
import { FileTemplater, type VariablesMap } from '../../utils/file-templater.js';


/**
 * Check if a file is binary by reading the first few bytes
 * @param filePath Path to the file to check
 * @returns Promise<boolean> True if the file is binary, false otherwise
 */
async function isBinary(filePath: string): Promise<boolean> {
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



function cancelAndExit() {
  cancel('Operation cancelled.');
  // eslint-disable-next-line n/no-process-exit,unicorn/no-process-exit
  process.exit(0);
}

export function checkCancel<T>(value: unknown) {
  if (isCancel(value)) {
    cancelAndExit();
  }

  return value as T;
}

/**
 * 1. Input: 'foo'
 *    Output: folder `<cwd>/foo`, `package.json#name` -> `foo`
 *
 * 2. Input: 'foo/bar'
 *    Output: folder -> `<cwd>/foo/bar` folder, `package.json#name` -> `bar`
 *
 * 3. Input: '@scope/foo'
 *    Output: folder -> `<cwd>/@scope/bar` folder, `package.json#name` -> `@scope/foo`
 *
 * 4. Input: './foo/bar'
 *    Output: folder -> `<cwd>/foo/bar` folder, `package.json#name` -> `bar`
 *
 * 5. Input: '/root/path/to/foo'
 *    Output: folder -> `'/root/path/to/foo'` folder, `package.json#name` -> `foo`
 */
export function formatProjectName(input: string) {
  const formatted = input.trim().replaceAll(/\/+$/g, '');
  return {
    packageName: formatted.startsWith('@')
        ? formatted
        : path.basename(formatted),
    targetDir: formatted,
  };
}

export type Argv = {
  dir?: string;
  help?: boolean;
  override?: boolean;
  'package-name'?: string;
  template?: string;
  tools?: string | string[];
};

export type ESLintTemplateName =
    | 'react-js'
    | 'react-ts'
    | 'svelte-js'
    | 'svelte-ts'
    | 'vanilla-js'
    | 'vanilla-ts'
    | 'vue-js'
    | 'vue-ts';

export type ProjectType = 'app' | 'package-component' | 'package-module';

function sortObjectKeys(obj: Record<string, unknown>) {
  const sortedKeys = Object.keys(obj).sort();

  const sortedObj: Record<string, unknown> = {};
  for (const key of sortedKeys) {
    sortedObj[key] = obj[key];
  }

  return sortedObj;
}

/**
 * Merge two package.json files and keep the order of keys.
 * @param targetPackage Path to the base package.json file
 * @param extraPackage Path to the extra package.json file to merge
 */
export function mergePackageJson(targetPackage: string, extraPackage: string) {
  if (!fs.existsSync(targetPackage)) {
    return;
  }

  const targetJson = JSON.parse(fs.readFileSync(targetPackage, 'utf8'));
  const extraJson = JSON.parse(fs.readFileSync(extraPackage, 'utf8'));
  const mergedJson: Record<string, unknown> = deepmerge(targetJson, extraJson);

  mergedJson.name = targetJson.name || extraJson.name;

  for (const key of ['scripts', 'dependencies', 'devDependencies']) {
    if (!(key in mergedJson)) {
      continue;
    }

    mergedJson[key] = sortObjectKeys(
        mergedJson[key] as Record<string, unknown>,
    );
  }

  fs.writeFileSync(targetPackage, `${JSON.stringify(mergedJson, null, 2)}\n`);
}

/**
 * Copy files from one folder to another.
 * @param options - Configuration options
 * @param options.from - Source folder
 * @param options.to - Destination folder
 * @param options.version - Optional. The version to update in the package.json. If not provided, version will not be updated.
 * @param options.packageName - Optional. The name to update in the package.json. If not provided, name will not be updated.
 * @param options.isMergePackageJson - Merge package.json files
 * @param options.skipFiles - Files to skip
 */
export function copyFolder({
                             from,
                             isMergePackageJson,
                             packageName,
                             skipFiles = [],
                             to,
                             version,
                           }: {
  from: string;
  isMergePackageJson?: boolean;
  packageName?: string;
  skipFiles?: string[];
  to: string;
  version?: Record<string, string> | string;
}) {
  const renameFiles: Record<string, string> = {
    gitignore: '.gitignore',
  };

  // Skip local files
  const allSkipFiles = new Set(['dist', 'node_modules', ...skipFiles]);

  fs.mkdirSync(to, { recursive: true });

  for (const file of fs.readdirSync(from)) {
    if (allSkipFiles.has(file)) {
      continue;
    }

    const srcFile = path.resolve(from, file);
    const distFile = renameFiles[file]
        ? path.resolve(to, renameFiles[file])
        : path.resolve(to, file);
    const stat = fs.statSync(srcFile);

    if (stat.isDirectory()) {
      copyFolder({
        from: srcFile,
        skipFiles,
        to: distFile,
        version,
      });
    } else if (file === 'package.json') {
      const targetPackage = path.resolve(to, 'package.json');

      if (isMergePackageJson && fs.existsSync(targetPackage)) {
        mergePackageJson(targetPackage, srcFile);
      } else {
        fs.copyFileSync(srcFile, distFile);
        updatePackageJson(distFile, version, packageName);
      }
    } else {
      fs.copyFileSync(srcFile, distFile);
    }
  }
}

/**
 * Copy template files from one folder to another with variable replacement.
 * This function combines file copying with template variable replacement in both file contents and file paths.
 * 
 */
export async function copyTemplateWithVariables({
  checkEmpty = true,
  from,
  isMergePackageJson,
  override = false,
  packageName,
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
  renameFiles?: Record<string, string>;
  skipFiles?: string[];
  to: string;
  variables?: VariablesMap;
  version?: Record<string, string> | string;
}): Promise<void> {
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
    if (allSkipFiles.has(file)) {
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
       
      await copyTemplateWithVariables({
        checkEmpty,
        from: srcFile,
        renameFiles,
        skipFiles,
        to: distFile,
        variables,
      });
    } else if (file === 'package.json') {
      const targetPackage = path.resolve(to, 'package.json');

      if (isMergePackageJson && fs.existsSync(targetPackage)) {
        mergePackageJson(targetPackage, srcFile);
      } else {
        fs.copyFileSync(srcFile, distFile);
        updatePackageJson(distFile, version, packageName);
      }
    } else {
      // Copy file and replace variables in content
      fs.copyFileSync(srcFile, distFile);
      
      // Replace variables in file content if variables are provided
      if (Object.keys(variables).length > 0) {
        // Check if file is binary before attempting variable replacement
         
        const isBinaryFile = await isBinary(distFile);
        
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

const isStableVersion = (version: string) => ['alpha', 'beta', 'rc', 'canary', 'nightly'].every(
      (tag) => !version.includes(tag),
  );

/**
 * Updates the package.json file at the specified path with the provided version and name.
 *
 * @param pkgJsonPath - The file path to the package.json file.
 * @param version - Optional. The version to update in the package.json. If not provided, version will not be updated.
 * @param name - Optional. The name to update in the package.json. If not provided, name will not be updated.
 */
export const updatePackageJson = (
    pkgJsonPath: string,
    version?: Record<string, string> | string,
    name?: string,
) => {
  let content = fs.readFileSync(pkgJsonPath, 'utf8');

  if (typeof version === 'string') {
    // Lock the version if it is not stable
    const targetVersion = isStableVersion(version) ? `^${version}` : version;
    content = content.replaceAll('workspace:*', targetVersion);
  }

  const pkg = JSON.parse(content);

  if (typeof version === 'object') {
    for (const [name, ver] of Object.entries(version)) {
      if (pkg.dependencies?.[name]) {
        pkg.dependencies[name] = ver;
      }

      if (pkg.devDependencies?.[name]) {
        pkg.devDependencies[name] = ver;
      }
    }
  }

  if (name && name !== '.') {
    pkg.name = name;
  }

  fs.writeFileSync(pkgJsonPath, `${JSON.stringify(pkg, null, 2)}\n`);
};

const __dirname = path.dirname(fileURLToPath(import.meta.url))
export function templatePath(template: string) {
  return path.resolve(__dirname, `../../../templates/template-${template}`);
}

export function languages(platform: string) {
  return {
    android: ['kotlin', 'java'],
    ios: ['objc', 'swift'],
    web: ['js', 'ts'],
  }[platform];
}

export function defaultLanguage(platform: string) {
  return languages(platform)?.[0];
}