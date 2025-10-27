import {log} from "@clack/prompts";
import fs from "node:fs";
import path from "node:path";
import pino from "pino";

export interface Logger {
  clear(): void;
  end?(): void;
  error(...args: unknown[]): void;
  info(...args: unknown[]): void;
  log?(level: string, ...args: unknown[]): void;
  logFile: null | string;
  message(...args: unknown[]): void;
  on(...args: unknown[]): void;
  warn(...args: unknown[]): void;
}

export const LOG_LEVEL = process.env.LOG_LEVEL || 'info';

// Helper function to remove ANSI color codes
const stripAnsiColors = (str: string): string => str.replaceAll(/\\u001B\[[0-9;]*m/g, '');

const logDir = process.env.LOG_DIR || 'logs';
const logFile = path.join(logDir, `lepo-${Date.now()}.log`);
const debugMode = process.env.LEPO_DEBUG !== undefined && process.env.LEPO_DEBUG.toLowerCase() === 'true';
if (debugMode) {
  console.log('Debug mode enabled');
}

const p = pino(pino.transport({
  targets: [{
    level: LOG_LEVEL,
    options: { colorize: false, destination: logFile, mkdir: true },
    target: 'pino-pretty',
  }]
}));

const pinoLogger: Logger = {
  ...p,
  clear(){
    if (fs.existsSync(logFile)) fs.unlinkSync(logFile)
    // Clear the directory if it exists
    if (fs.existsSync(logDir)) fs.rmSync('logs', { force: true, recursive: true });
  },
  end(){
    // No-op for default logger
  },
  error: p.error.bind(p),
  info: p.info.bind(p),
  log(level,...args: unknown[]) {
    switch (level) {
      case 'error': {
        p.error(args.join(' '))
        break;
      }

      case 'info': {
        p.info(args.join(' '))
        break;
      }

      case 'warn': {
        p.warn(args.join(' '))
        break;
      }

      default: {
        p.info(args.join(' '))
      }
    }
  },
  logFile,
  message: p.info.bind(p),
  on: p.on?.bind(p),
  warn: p.warn.bind(p),
};

export const clackLogger: Logger = {
  clear(){
    // No-op for default logger
  },
  end(){
    // No-op for default logger
  },
  error(...args: unknown[]) {
    log.error(args.join(' '))
    pinoLogger.error(stripAnsiColors(args.join(' ')))
  },
  info(...args: unknown[]) {
    if (debugMode) {log.message(args.join(' '))}
    pinoLogger.info(stripAnsiColors(args.join(' ')))
  },
  log(level, ...args: unknown[]) {
    const message = args.join(' ');
    switch (level) {
    case 'error': {
    log.error(message);
    pinoLogger.error(stripAnsiColors(message));
    break;
    }

    case 'info': {
    if (debugMode) {log.message(message)}
    pinoLogger.info(stripAnsiColors(message));
    break;
    }

    case 'warn': {
    log.warn(message);
    pinoLogger.warn(stripAnsiColors(message));
    break;
    }

    default: {
    log.message(message);
    pinoLogger.message(stripAnsiColors(message));
    }
    }
  },
  logFile: pinoLogger.logFile,
  message(...args: unknown[]) {
    log.message(args.join(' '))
    pinoLogger.message(stripAnsiColors(args.join(' ')))
  },
  on(..._args: unknown[]) {},
  warn(...args: unknown[]) {
    log.warn(args.join(' '))
    pinoLogger.warn(stripAnsiColors(args.join(' ')))
  },
}

export const defaultLogger: Logger = clackLogger;
