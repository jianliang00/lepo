import {expect} from 'chai';

import {androidProvider, iosProvider} from '../../../src/template-context-provider/platform-providers.js';

describe('extension platform config', () => {
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
});
