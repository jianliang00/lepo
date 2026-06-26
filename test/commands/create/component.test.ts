import {expect} from 'chai';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

import {androidProvider, iosProvider} from '../../../src/template-context-provider/platform-providers.js';

const repoRoot = fileURLToPath(new URL('../../..', import.meta.url));

describe('extension platform config', () => {
  it('uses the Autolink library manifest file name', async () => {
    const {LIBRARY_CONFIG_FILE} = await import('../../../src/core/config.js');

    expect(LIBRARY_CONFIG_FILE).to.equal('lynx.lib.json');
  });

  it('writes Android Autolink manifest fields from template variables', async () => {
    const config = await androidProvider.collectExtensionPlatformConfig('sample-extension', {
      packageName: 'com.example.sample',
      packagePath: 'com/example/sample',
    });

    expect(config).to.deep.equal({
      packageName: 'com.example.sample',
      sourceDir: 'android',
    });
  });

  it('writes iOS Autolink manifest fields from template variables', async () => {
    const config = await iosProvider.collectExtensionPlatformConfig('sample-extension', {
      componentName: 'SampleExtension',
    });

    expect(config).to.deep.equal({
      podspecPath: 'ios/SampleExtension.podspec',
      sourceDir: 'ios',
    });
  });

  it('implements the generated Android module spec', () => {
    const moduleTemplate = fs.readFileSync(
      path.join(
        repoRoot,
        'templates/template-extension-module-android-kotlin/src/main/kotlin/{{packagePath}}/LocalStorageModule.kt',
      ),
      'utf8',
    );

    expect(moduleTemplate).to.contain('override fun setStorageItem');
    expect(moduleTemplate).to.contain('override fun getStorageItem');
    expect(moduleTemplate).to.contain('override fun clearStorage');
  });

  it('imports the generated iOS module spec from the external codegen output path', () => {
    const moduleHeader = fs.readFileSync(
      path.join(repoRoot, 'templates/template-extension-module-ios-objc/{{componentName}}/module.h'),
      'utf8',
    );

    expect(moduleHeader).to.contain('#import "../src/generated/NativeLocalStorageModuleSpec.h"');
  });

  it('uses the library codegen package directly', () => {
    const packageTemplate = JSON.parse(
      fs.readFileSync(
        path.join(repoRoot, 'templates/template-extension-module-react-ts/package.json'),
        'utf8',
      ),
    );

    expect(packageTemplate.scripts.codegen).to.equal('lynx-autolink-codegen');
    expect(packageTemplate.devDependencies['@lynx-js/autolink-codegen']).to.equal('0.2.0');
  });
});
