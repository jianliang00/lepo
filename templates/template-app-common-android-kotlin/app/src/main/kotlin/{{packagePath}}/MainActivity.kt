package {{packageName}}

import android.app.Activity
import android.os.Bundle
import {{packageName}}.provider.DemoTemplateProvider
import {{packageName}}.provider.GenericResourceFetcher
import com.lynx.tasm.LynxBooleanOption
import com.lynx.tasm.LynxView
import com.lynx.tasm.LynxViewBuilder

class MainActivity : Activity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        val lynxView: LynxView = buildLynxView()
        setContentView(lynxView)

        val uri = "main.lynx.bundle";
        lynxView.renderTemplateUrl(uri, "")

        // open switch page
        // startActivity(Intent(this, SwitchActivity::class.java));
    }

    private fun buildLynxView(): LynxView {
        var viewBuilder: LynxViewBuilder = LynxViewBuilder()
        viewBuilder.setEnableGenericResourceFetcher(LynxBooleanOption.TRUE)
        viewBuilder.setTemplateProvider(DemoTemplateProvider(this))
        viewBuilder.setGenericResourceFetcher(GenericResourceFetcher())
        return viewBuilder.build(this)
    }
}
