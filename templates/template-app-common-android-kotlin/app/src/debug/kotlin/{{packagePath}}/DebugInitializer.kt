package {{packageName}}

import android.app.Application
import android.content.Intent
import android.os.Handler
import android.os.Looper
import com.lynx.devtoolwrapper.LynxDevtoolGlobalHelper
import com.lynx.tasm.service.LynxServiceCenter
import com.lynx.service.devtool.LynxDevToolService
import com.lynx.tasm.LynxEnv

class DebugInitializer {

    companion object {
        fun init(app: Application) {
            // register devtool service
            LynxServiceCenter.inst().registerService(LynxDevToolService)
            LynxEnv.inst().init(
                app,
                null,
                null,
                null
            )
            // Turn on Lynx Debug
            LynxEnv.inst().enableLynxDebug(true)
            // Turn on Lynx DevTool
            LynxEnv.inst().enableDevtool(true)
            // Turn on Lynx LogBox
            LynxEnv.inst().enableLogBox(true)
            // Create a Handler associated with the main thread's Looper
            val mainHandler = Handler(Looper.getMainLooper())
            // Register OpenCard for Lynx DevTool
            LynxDevtoolGlobalHelper.getInstance().registerCardListener { url ->
                mainHandler.post {
                    val intent = Intent(
                        app,
                        DebugActivity::class.java
                    )
                    intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                    intent.putExtra("url", url)
                    app.startActivity(intent)
                }
            }
        }
    }
}

typealias LynxInitializer = DebugInitializer
