import os from "node:os";
import path from "node:path";

// Cache path ~/.cache
export const CACHE_DIR = path.join(os.homedir(), '.lepo')
