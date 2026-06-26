import {expect} from 'chai';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {ActionContext} from '../../src/core/actions/action.js';
import {CodegenAction} from '../../src/core/actions/codegen-action.js';

describe('codegen', () => {
  const testDir = path.join(os.tmpdir(), 'lepo-codegen-test');

  afterEach(() => {
    fs.rmSync(testDir, {force: true, recursive: true});
  });

  it('requires the external Autolink codegen binary from the extension project', async () => {
    fs.mkdirSync(testDir, {recursive: true});
    fs.writeFileSync(path.join(testDir, 'package.json'), JSON.stringify({name: 'sample-extension'}));

    const action = new CodegenAction();
    const context: ActionContext = {
      devMode: false,
      environment: 'development',
      logger: {
        clear() {},
        error() {},
        info() {},
        logFile: null,
        message() {},
        on() {},
        warn() {},
      },
      projectRoot: testDir,
    };

    try {
      await action.execute(context);
      expect.fail('codegen should fail when the local binary is missing');
    } catch (error) {
      expect((error as Error).message).to.contain('@lynx-js/autolink-codegen@0.2.0');
    }
  });

  it('runs the local codegen binary against the library manifest', async () => {
    fs.mkdirSync(path.join(testDir, 'node_modules', '.bin'), {recursive: true});
    fs.writeFileSync(path.join(testDir, 'package.json'), JSON.stringify({name: 'sample-extension'}));
    fs.writeFileSync(
      path.join(testDir, 'lynx.lib.json'),
      JSON.stringify({
        platforms: {
          android: {packageName: 'com.example.sample', sourceDir: 'android'},
          ios: {sourceDir: 'ios'},
        },
        precommands: [],
      }),
    );

    const codegenBin = path.join(testDir, 'node_modules', '.bin', 'lynx-autolink-codegen');
    const codegenBinCmd = `${codegenBin}.cmd`;
    fs.writeFileSync(
      codegenBin,
      [
        '#!/usr/bin/env node',
        'const fs = require("node:fs");',
        'process.exit(fs.existsSync("lynx.lib.json") ? 0 : 2);',
      ].join('\n'),
    );
    fs.writeFileSync(
      codegenBinCmd,
      [
        '@echo off',
        'node -e "const fs = require(\'node:fs\'); process.exit(fs.existsSync(\'lynx.lib.json\') ? 0 : 2)"',
      ].join('\n'),
    );
    fs.chmodSync(codegenBin, 0o755);

    const action = new CodegenAction();
    const context: ActionContext = {
      devMode: false,
      environment: 'development',
      logger: {
        clear() {},
        error() {},
        info() {},
        logFile: null,
        message() {},
        on() {},
        warn() {},
      },
      projectRoot: testDir,
    };

    await action.execute(context);
  });
});
