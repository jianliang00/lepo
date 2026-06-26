import {expect} from 'chai';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const repoRoot = fileURLToPath(new URL('../../..', import.meta.url));

describe('app templates', () => {
  it('uses the external Android Autolink plugins', () => {
    const settings = fs.readFileSync(
      path.join(repoRoot, 'templates/template-app-common-android-kotlin/settings.gradle.kts'),
      'utf8',
    );
    const appBuild = fs.readFileSync(
      path.join(repoRoot, 'templates/template-app-common-android-kotlin/app/build.gradle.kts'),
      'utf8',
    );
    const debugInitializer = fs.readFileSync(
      path.join(repoRoot, 'templates/template-app-common-android-kotlin/app/src/debug/kotlin/{{packagePath}}/DebugInitializer.kt'),
      'utf8',
    );

    expect(settings).to.contain('org.lynxsdk.library-settings');
    expect(settings).to.contain('org.lynxsdk.lynx:lynx-library-plugin:3.9.0');
    expect(appBuild).to.contain('org.lynxsdk.library-build');
    expect(appBuild).to.contain('org.lynxsdk.lynx:lynx:3.9.0');
    expect(debugInitializer).to.contain('registerService(LynxDevToolService.INSTANCE)');
    expect(settings).not.to.contain(`includeBuild("${['lepo', 'plugin'].join('-')}")`);
    expect(appBuild).not.to.contain(['Extension', 'Registry'].join(''));
  });

  it('uses the external iOS Autolink CocoaPods plugin', () => {
    const podfile = fs.readFileSync(
      path.join(repoRoot, 'templates/template-app-common-ios-swift/Podfile'),
      'utf8',
    );
    const gemfile = fs.readFileSync(
      path.join(repoRoot, 'templates/template-app-common-ios-swift/Gemfile'),
      'utf8',
    );

    expect(podfile).to.contain("plugin 'cocoapods-lynx-library'");
    expect(podfile).to.contain('use_lynx_library!');
    expect(podfile).to.contain("lynx_version = '3.9.0'");
    expect(podfile).to.contain("pod 'PrimJS', '3.8.0-alpha.6'");
    expect(gemfile).to.contain("cocoapods-lynx-library', '3.9.0'");
    expect(podfile).not.to.contain(['lepo', 'deps'].join('_'));
    expect(podfile).not.to.contain(['Module', 'Provider'].join(''));
  });
});
