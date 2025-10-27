package {{packageName}};

import android.content.Context
import android.view.Gravity
import android.widget.Button
import com.lynx.tasm.behavior.LynxContext
import com.lynx.tasm.behavior.LynxProp
import com.lynx.tasm.behavior.ui.LynxUI
import com.lynx.tasm.event.LynxCustomEvent
import com.lepo.nativemoduleprocessor.LynxNativeUI

@LynxNativeUI(name = "button")
class LynxExplorerButton(context: LynxContext) : LynxUI<Button>(context) {

  override fun createView(context: Context): Button {
    return Button(context).apply {
      gravity = Gravity.CENTER
      background = null
      setPadding(0, 0, 0, 0)
      isAllCaps = false
      setOnClickListener {
        // "click" is a default event name, so we use "clickevent" to avoid conflict
        emitEvent("clickevent", null)
      }
    }
  }

  override fun onLayoutUpdated() {
    super.onLayoutUpdated()
    val paddingTop = mPaddingTop + mBorderTopWidth
    val paddingBottom = mPaddingBottom + mBorderBottomWidth
    val paddingLeft = mPaddingLeft + mBorderLeftWidth
    val paddingRight = mPaddingRight + mBorderRightWidth
    mView.setPadding(paddingLeft, paddingTop, paddingRight, paddingBottom)
  }

  @LynxProp(name = "text")
  fun setText(text: String) {
    mView.text = text
  }

  private fun emitEvent(name: String, value: Map<String, Any>?) {
    val detail = LynxCustomEvent(sign, name)
    value?.forEach { (key, v) -> detail.addDetail(key, v) }
    lynxContext.eventEmitter.sendCustomEvent(detail)
  }
}