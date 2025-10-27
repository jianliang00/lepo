import {Action, ActionContext, ActionResult} from './action.js';


export class RuniOSSimulatorAction implements Action {
    description = 'Start an iOS simulator, then installs and launches an APP.';
    name = 'run-ios-simulator';

    async execute(context: ActionContext, previousResult?: ActionResult): Promise<ActionResult> {
        const {device} = context;
        if(device === null){
            throw new Error("Find ios simulator failed");
        }

        let appPath
        if (previousResult && previousResult?.outputPaths && previousResult.outputPaths.length > 0) {
            appPath = previousResult.outputPaths[0];
            context.logger.info(`Using APK from previous action: ${appPath}`);
        } else {
            throw new Error('APK path not provided in inputs or previous action result.');
        }

        if(context.appName === undefined){
            throw new Error("Not found appName in ActionContext!");
        }

        await device?.install(appPath)
        device?.launch(context.appName)
        return {outputPaths: [appPath], result: undefined};
    }
}