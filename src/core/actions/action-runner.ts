import {log, spinner} from "@clack/prompts";
import path from "node:path";

import {defaultLogger} from "../../logger.js";
import { Action, ActionContext, ActionResult } from './action.js';


export class ActionRunner {
  private actions: Action[] = [];
  private context: ActionContext;

  constructor(context: ActionContext) {
    this.context = context;
  }

  addAction(action: Action): void {
    this.actions.push(action);
  }

  async run(): Promise<void> {
    let previousResult: ActionResult | undefined;
    this.context.logger = defaultLogger
    defaultLogger.info('Running actions... (environment: ' + this.context.environment + ')');

    for (const action of this.actions) {
      const spin = spinner();
      this.context.spinner = spin;

      spin.start(`Run action: ${action.name}`);
      this.context.logger.message(`Action: ${action.description || ''}`)
      this.context.logger.message("")
      const startTime = Date.now();
      // Pass the previous action's result to the current action's execute method
      try {
        const currentResult = await action.execute(this.context, previousResult);
        const endTime = Date.now();
        spin.stop(`Finished action: ${action.name} (took ${endTime - startTime}ms)`);

        if (currentResult.crucialOutputPaths && currentResult.crucialOutputPaths.length > 0) {
          log.message("")
          log.message('Output paths:');
          for (const outputPath of currentResult.crucialOutputPaths) log.message(`  - ${path.resolve(outputPath)}`);
          log.message("")
        }

        previousResult = currentResult; // Store current result for the next iteration

      } catch (error) {
        log.error(`${error}`);
        if (this.context.logger.logFile !== null) {
          log.message(`You can find the details at file://${path.resolve(this.context.logger.logFile)}`);
        }

        log.message("");
        throw error;
      }
    }

    log.success('All actions completed.');
    this.context.logger.clear();
  }
}

// Helper function to execute a single action and log its timing and output (can be kept for individual action execution if needed)
export async function executeAndLogAction(action: Action, context: ActionContext, previousResult?: ActionResult): Promise<ActionResult> {
  context.logger.info(`Starting action: ${action.name} - ${action.description || ''}`);
  const startTime = Date.now();
  const actionResult = await action.execute(context, previousResult);
  const endTime = Date.now();
  context.logger.info(`Finished action: ${action.name} (took ${endTime - startTime}ms)`);

  if (actionResult.outputPaths && actionResult.outputPaths.length > 0) {
    context.logger.info('Output paths:');
    for (const outputPath of actionResult.outputPaths) context.logger.info(`  - ${outputPath}`);
  }

  return actionResult;
}