import { isCancel, select } from '@clack/prompts';
import {execa} from 'execa'

import { ActionContext } from '../core/actions/action'

export type deviceType = "real-device" | "simulator"
export type platform = "android" | "ios"
type deviceState = "booted" | "shutdown"

export interface Device{
    install(app:string):void;
    launch(app:string):void;
    name:string,
    restart():void;
    start():void;
    state: deviceState,
    
    // eslint-disable-next-line perfectionist/sort-interfaces
    deviceType: deviceType,
    stop():void;
    udid?: string
    uninstall(app:string):void;
}

class iOSSimulatorDevice implements Device{
    constructor(
        public name: string,
        public state: deviceState,
        public udid: string,
        public deviceType:deviceType = "simulator"    
    ){}

    async install(app: string): Promise<void> {
        if(this.state !== 'booted'){
            await this.start()
        }

        await execa('xcrun', ['simctl', 'install', this.udid, app])
    }

    async launch(app:string):Promise<void>{
        if(this.state !== 'booted'){
            await this.start()
        }

        await execa('xcrun', ['simctl', 'launch', this.udid, app])
    }

    async restart(): Promise<void> {
        await this.stop()
        await this.start()
    }

    async start(): Promise<void> {
        if(this.state !== "booted"){
            await execa('xcrun', ['simctl', 'boot', this.udid])      
            this.state = "booted"      
        }
    }

    async stop(): Promise<void> {
        if(this.state !== "shutdown"){
            await execa('xcrun', ['simctl', 'shutdown', this.udid])
            this.state = "shutdown"  
        }
    }

    async uninstall(app: string): Promise<void> {
        if(this.state !== 'booted'){
            await this.start()
        }

        await execa('xcrun', ['simctl', 'uninstall', this.udid, app])
    }
}

async function getiOSDevice(context: ActionContext,dt: deviceType):Promise<Device | null>{
    if(dt === "simulator"){
        try{
            const {stdout} = await execa('xcrun', ['simctl', 'list', 'devices', '-j'])
            const simulatorData = JSON.parse(stdout) as {
                devices: Record<string, Array<{
                    isAvailable: boolean;
                    name: string;
                    state: string;
                    udid: string;
                }>>;
            };
            const availableDevices = [];
            for (const [runtime, devices] of Object.entries(simulatorData.devices)) {
                if(runtime.includes('iOS')){
                    const iosVersion = runtime.split('.').at(-1)?.replace('iOS-', '').replaceAll('-', '.');

                    for (const device of devices) {
                        if (device.isAvailable) {
                        availableDevices.push({
                            iosVersion,
                            name: device.name,
                            state: device.state.toLowerCase(),
                            udid: device.udid
                        });
                        }
                    }
                }
            }

            const sortedDevices = [...availableDevices].sort((a, b) => {
                if (a.state === 'booted' && b.state !== 'booted') return -1;
                if (a.state !== 'booted' && b.state === 'booted') return 1;
                return 0;
            });

            const options = []
            for(const d of sortedDevices){
                options.push({
                    label: `${d.iosVersion}-${d.name} (${d.state})`,
                    value: d
                })
            }

            const projectType = await select({
                message: 'Pick a project type.',
                options,
            });
            if(!isCancel(projectType)){
                // eslint-disable-next-line new-cap
                return new iOSSimulatorDevice(projectType.name, projectType.state as deviceState,projectType.udid)
            }
        }catch(error){
            context.logger.error(`xcrun simctl list error ${error}`)
        }
    }

    return null
}




export async function getDevice(context: ActionContext, dt: deviceType, platform:platform):Promise<Device | null>{
    if(platform === "ios"){
        const devices = await getiOSDevice(context, dt)
        return devices
    }

    return null
}
