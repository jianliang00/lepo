import {expect} from 'chai';
import fs from 'node:fs';
import path from 'node:path';

const repoRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../../..');

describe('Android run template', () => {
  it('does not depend on the removed local Autolink implementation', () => {
    const appBuild = fs.readFileSync(
      path.join(repoRoot, 'templates/template-app-common-android-kotlin/app/build.gradle.kts'),
      'utf8',
    );
    const mainActivity = fs.readFileSync(
      path.join(
        repoRoot,
        'templates/template-app-common-android-kotlin/app/src/main/kotlin/{{packagePath}}/MainActivity.kt',
      ),
      'utf8',
    );

    expect(appBuild).not.to.contain(['native', 'module', 'processor'].join('-'));
    expect(appBuild).not.to.contain(['lynx', 'Packages'].join(''));
    expect(mainActivity).not.to.contain(`${['Extension', 'Registry'].join('')}.applyTo`);
  });
});
