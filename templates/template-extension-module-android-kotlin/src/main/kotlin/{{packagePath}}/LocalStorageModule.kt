package {{packageName}}


import android.content.Context
import com.lynx.jsbridge.LynxMethod
import com.lynx.jsbridge.LynxModule
import com.lynx.tasm.behavior.LynxContext
import com.lepo.nativemoduleprocessor.LynxNativeModule

@LynxNativeModule(name = "NativeLocalStorageModule")
class NativeLocalStorageModule(context: Context): LynxModule(context) {
    private val PREF_NAME = "MyLocalStorage"

    private fun getContext(): Context {
        val lynxContext = mContext as LynxContext
        return lynxContext.getContext()
    }

    @LynxMethod
    fun setStorageItem(key: String, value: String) {
        val sharedPreferences = getContext().getSharedPreferences(PREF_NAME, Context.MODE_PRIVATE)
        val editor = sharedPreferences.edit()
        editor.putString(key, value)
        editor.apply()
    }

    @LynxMethod
    fun getStorageItem(key: String): String? {
        val sharedPreferences = getContext().getSharedPreferences(PREF_NAME, Context.MODE_PRIVATE)
        return sharedPreferences.getString(key, null)
    }

    @LynxMethod
    fun clearStorage() {
        val sharedPreferences = getContext().getSharedPreferences(PREF_NAME, Context.MODE_PRIVATE)
        val editor = sharedPreferences.edit()
        editor.clear()
        editor.apply()
    }
}

@LynxNativeModule(name = "NativeLocalStorage2")
class NativeLocalStorageModule2(context: Context) : LynxModule(context) {
    private val PREF_NAME = "MyLocalStorage"

    private fun getContext(): Context {
        val lynxContext = mContext as LynxContext
        return lynxContext.getContext()
    }

    @LynxMethod
    fun setStorageItem(key: String, value: String) {
        val sharedPreferences = getContext().getSharedPreferences(PREF_NAME, Context.MODE_PRIVATE)
        val editor = sharedPreferences.edit()
        editor.putString(key, value)
        editor.apply()
    }

    @LynxMethod
    fun getStorageItem(key: String): String? {
        val sharedPreferences = getContext().getSharedPreferences(PREF_NAME, Context.MODE_PRIVATE)
        return sharedPreferences.getString(key, null)
    }

    @LynxMethod
    fun clearStorage() {
        val sharedPreferences = getContext().getSharedPreferences(PREF_NAME, Context.MODE_PRIVATE)
        val editor = sharedPreferences.edit()
        editor.clear()
        editor.apply()
    }
}