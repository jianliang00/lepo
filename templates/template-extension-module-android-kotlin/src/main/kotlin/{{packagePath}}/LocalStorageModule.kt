package {{packageName}}


import android.content.Context
import {{packageName}}.generated.NativeLocalStorageModuleSpec
import com.lynx.jsbridge.LynxAutolinkNativeModule
import com.lynx.jsbridge.LynxMethod
import com.lynx.tasm.behavior.LynxContext

@LynxAutolinkNativeModule(name = "NativeLocalStorageModule")
class NativeLocalStorageModule(private val lynxContext: LynxContext): NativeLocalStorageModuleSpec(lynxContext) {
    private val PREF_NAME = "MyLocalStorage"

    private fun getContext(): Context {
        return lynxContext.getContext()
    }

    @LynxMethod
    override fun setStorageItem(key: String, value: String) {
        val sharedPreferences = getContext().getSharedPreferences(PREF_NAME, Context.MODE_PRIVATE)
        val editor = sharedPreferences.edit()
        editor.putString(key, value)
        editor.apply()
    }

    @LynxMethod
    override fun getStorageItem(key: String): String? {
        val sharedPreferences = getContext().getSharedPreferences(PREF_NAME, Context.MODE_PRIVATE)
        return sharedPreferences.getString(key, null)
    }

    @LynxMethod
    override fun clearStorage() {
        val sharedPreferences = getContext().getSharedPreferences(PREF_NAME, Context.MODE_PRIVATE)
        val editor = sharedPreferences.edit()
        editor.clear()
        editor.apply()
    }
}
