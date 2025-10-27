package {{packageName}}

import android.app.Application

class ReleaseInitializer{
    companion object {
        fun init(app: Application) {
            LynxEnv.inst().init(
                app,
                null,
                null,
                null
            )
        }
    }
}

typealias LynxInitializer = ReleaseInitializer
