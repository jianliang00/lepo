import fs from 'node:fs/promises';
import path from 'node:path';

/**
 * Interface for the variables map.
 */
export interface VariablesMap {
  [key: string]: boolean | number | string;
}

/**
 * Utility class for replacing template placeholders in files.
 */
export class FileTemplater {
  /**
   * Escapes special characters in a string for use in a regular expression.
   * @param str The string to escape.
   * @returns The escaped string.
   */
  /**
   * Renames all directories within a given directory that contain template variables in their names.
   *
   * @param directoryPath The absolute path to the directory whose contents need to be processed.
   * @param variables The map of key-value pairs for replacement.
   * @returns A promise that resolves when all applicable directories have been renamed.
   * @throws Error if the directory cannot be read or other FS errors occur.
   */
  public static async renameDirectoryContentsWithVariables(
    directoryPath: string,
    variables: VariablesMap
  ): Promise<void> {
    if (!path.isAbsolute(directoryPath)) {
      throw new Error('Directory path must be absolute.');
    }

    let entries;
    try {
      entries = await fs.readdir(directoryPath, { withFileTypes: true });
    } catch (error: unknown) {
      throw new Error(`Failed to read directory ${directoryPath}: ${error}`);
    }

    for (const entry of entries) {
      if (entry.isDirectory()) {
        const originalEntryPath = path.join(directoryPath, entry.name);
        // Check if the directory name itself contains placeholders
        let hasPlaceholders = false;
        for (const key in variables) {
          if (Object.hasOwn(variables, key)) {
            const placeholder = `{{${key.trim()}}}`;
            if (entry.name.includes(placeholder)) {
              hasPlaceholders = true;
              break;
            }
          }
        }

        let currentEntryPath = originalEntryPath;
        if (hasPlaceholders) {
          try {
            currentEntryPath = await this.renamePathWithVariables(originalEntryPath, variables, directoryPath);
          } catch (error: unknown) {
            // Log error or collect errors to report later, but continue processing other entries
            console.error(`Failed to rename directory ${originalEntryPath}: ${error}`);
            // If renaming failed, we might want to skip recursion for this path or use original path
            // For now, we'll try to recurse into the original path if renaming failed, 
            // or into the new path if it succeeded.
          }
        }

        // Recursively process the directory (either original or renamed path)
        await this.renameDirectoryContentsWithVariables(currentEntryPath, variables);
      }
    }
  }

  /**
   * Replaces placeholders in a path string and renames the path.
   *
   * @param originalPath The original path string, can be relative or absolute.
   * @param variables The map of key-value pairs for replacement in the path.
   * @param basePath Optional base path to resolve relative originalPath. Defaults to `process.cwd()`.
   * @returns A promise that resolves with the new path string after successful rename.
   * @throws Error if path resolution fails, renaming fails, or other FS errors occur.
   */
  public static async renamePathWithVariables(
    originalPath: string,
    variables: VariablesMap,
    basePath: string = process.cwd()
  ): Promise<string> {
    if (!originalPath) {
      throw new Error('Original path cannot be empty.');
    }

    let newPathString = originalPath;
    for (const key in variables) {
      if (Object.hasOwn(variables, key)) {
        const placeholder = `{{${key.trim()}}}`;
        const regex = new RegExp(this.escapeRegExp(placeholder), 'g');
        newPathString = newPathString.replace(regex, String(variables[key]));
      }
    }

    const resolvedOriginalPath = path.isAbsolute(originalPath) ? originalPath : path.resolve(basePath, originalPath);
    const resolvedNewPath = path.isAbsolute(newPathString) ? newPathString : path.resolve(basePath, newPathString);

    if (resolvedOriginalPath === resolvedNewPath) {
      // If paths are the same after variable replacement, no rename is needed.
      // Optionally, log a message or handle as per requirements.
      return resolvedNewPath;
    }

    try {
      await fs.access(resolvedOriginalPath); // Check if original path exists
    } catch (error: unknown) {
      throw new Error(`Error accessing original path ${resolvedOriginalPath}: ${error}`);
    }

    try {
      // Ensure parent directory of the new path exists
      const newPathParentDir = path.dirname(resolvedNewPath);
      await fs.mkdir(newPathParentDir, { recursive: true });

      await fs.rename(resolvedOriginalPath, resolvedNewPath);
      return resolvedNewPath;
    } catch (error: unknown) {
      throw new Error(`Failed to rename path from ${resolvedOriginalPath} to ${resolvedNewPath}: ${error}`);
    }
  }

  /**
   * Replaces placeholders in the format `{{key}}` within a file's content
   * with actual values from the provided variables map.
   *
   * @param filePath The absolute path to the template file.
   * @param variables The map of key-value pairs for replacement.
   * @returns A promise that resolves with the content string with placeholders replaced.
   * @throws Error if the file cannot be read or other FS errors occur.
   */
  public static async replaceInFile(filePath: string, variables: VariablesMap): Promise<string> {
    if (!path.isAbsolute(filePath)) {
      throw new Error('File path must be absolute.');
    }

    let fileContent: string;
    try {
      fileContent = await fs.readFile(filePath, 'utf8');
    } catch (error: unknown) {
      throw new Error(`Failed to read template file ${filePath}: ${error}`);
    }

    if (!variables || Object.keys(variables).length === 0) {
      // If no variables are provided, return the original content
      // Alternatively, one might choose to log a warning.
      return fileContent;
    }

    let modifiedContent = fileContent;

    for (const key in variables) {
      if (Object.hasOwn(variables, key)) {
        const placeholder = `{{${key.trim()}}}`;
        // Using a global regex to replace all occurrences
        const regex = new RegExp(this.escapeRegExp(placeholder), 'g');
        modifiedContent = modifiedContent.replace(regex, String(variables[key]));
      }
    }

    return modifiedContent;
  }

  /**
   * Replaces placeholders in a file and writes the modified content back to the same file.
   *
   * @param filePath The absolute path to the template file.
   * @param variables The map of key-value pairs for replacement.
   * @returns A promise that resolves when the file has been successfully updated.
   * @throws Error if the file cannot be read or written, or other FS errors occur.
   */
  public static async replaceInFileAndUpdate(filePath: string, variables: VariablesMap): Promise<void> {
    const modifiedContent = await this.replaceInFile(filePath, variables);
    try {
      await fs.writeFile(filePath, modifiedContent, 'utf8');
    } catch (error: unknown) {
      throw new Error(`Failed to write updated content to file ${filePath}: ${error}`);
    }
  }

  private static escapeRegExp(str: string): string {
    return str.replaceAll(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`); // $& means the whole matched string
  }
}
