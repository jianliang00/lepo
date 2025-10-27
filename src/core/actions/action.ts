import { Logger } from '../../logger.js';
import {Device, platform} from '../../utils/devices.js';

export type LoggerFunction = (message?: string | undefined, ...args: unknown[]) => void;

// Defines the context for an action execution
export interface ActionContext {
  [key: string]: unknown; // Allow for additional context properties
  appName?: string,
  device?:Device,
  devMode: boolean;
  environment: "development" | "production";
  logger: Logger; // Changed Logger to Command
  platform?:platform,
  projectRoot: string;
  spinner?: {
    message: (msg?: string | undefined) => void;
    start: (msg?: string | undefined) => void;
    stop: (msg?: string | undefined, code?: number | undefined) => void;
  };
}

// Defines the result of an action execution
export interface ActionResult {
  crucialOutputPaths?: string[]; // Optional: paths to the essential output artifacts, which will be shown in the output
  outputPaths?: string[]; // Optional: paths to the output artifacts
  result?: Record<string, unknown>;
}

// Defines the interface for an action
export interface Action { // P represents the type of the previous action's result
  description?: string;

  execute(context: ActionContext, previousResult?: ActionResult): Promise<ActionResult>;
  name: string;
}