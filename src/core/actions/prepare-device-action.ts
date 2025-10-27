import { isCancel, select} from '@clack/prompts';

import { deviceType, getDevice, platform } from '../../utils/devices.js';
import {Action, ActionContext, ActionResult} from './action.js';


export class PrepareDeviceAction implements Action {
    description = 'Prepare device.';
    name = 'prepare-device';

    async execute(context: ActionContext, previousResult?: ActionResult): Promise<ActionResult> {
        if(context.platform === undefined){
            throw new Error('You should supply build platform.');
        }

            const devices :deviceType[] = ['real-device', 'simulator']
            const options = []
            for(const d of devices){
                options.push({
                    label: `${d}`,
                    value: d
                })
            }

            const result = await select({
                message: 'Pick device type.',
                options,
            });
            if(!isCancel(result)){
                const device = await getDevice(context, result, context.platform as platform);
                if(device !== null){
                    context.device = device;
                }
            }

        return {outputPaths: previousResult?.outputPaths, result: undefined};
    }
}
