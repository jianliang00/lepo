import fs from "node:fs";

export const APP_CONFIG_FILE = 'lynx.app.json'
export const EXTENSION_CONFIG_FILE = 'lynx.ext.json'

export interface PlatformConfig {
  [key: string]: unknown;
}

export interface Config {
    platforms: Record<string, PlatformConfig>;
    precommands: string[];
}

export function saveConfig(path: string, config: Config) {
    const configJson = JSON.stringify(config, null, 2)
    fs.writeFileSync(path, configJson, 'utf8')
}

export function loadConfig(path: string) {
    const configJson = JSON.parse(fs.readFileSync(path).toString())
    return configJson as Config
}