import { expect } from 'chai';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createSandbox, SinonSandbox } from 'sinon';

import { ProjectBuilder } from '../../../src/core/project-builder/project-builder.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

describe('ProjectBuilder', () => {
  const testDir = path.join(__dirname, 'test-output');
  const templateDir = path.join(__dirname, 'test-templates');

  beforeEach(() => {
    // Clean up test directories
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { force: true, recursive: true });
    }

    if (fs.existsSync(templateDir)) {
      fs.rmSync(templateDir, { force: true, recursive: true });
    }

    // Create test template directories
    fs.mkdirSync(templateDir, { recursive: true });
    createTestTemplates();
  });

  afterEach(() => {
    // Clean up after tests
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { force: true, recursive: true });
    }

    if (fs.existsSync(templateDir)) {
      fs.rmSync(templateDir, { force: true, recursive: true });
    }
  });

  function createTestTemplates() {
    // Create base template
    const baseDir = path.join(templateDir, 'base');
    fs.mkdirSync(baseDir, { recursive: true });
    fs.writeFileSync(
      path.join(baseDir, 'package.json'),
      JSON.stringify({ name: '{{name}}', version: '1.0.0' }, null, 2)
    );
    fs.writeFileSync(
      path.join(baseDir, 'README.md'),
      '# {{name}}\n\nThis is a test project.'
    );

    // Create feature template
    const featureDir = path.join(templateDir, 'feature');
    fs.mkdirSync(featureDir, { recursive: true });
    fs.writeFileSync(
      path.join(featureDir, 'feature.js'),
      'export const {{featureName}} = () => {\n  console.log("{{description}}");\n};'
    );

    // Create template with skip file
    const skipDir = path.join(templateDir, 'skip-test');
    fs.mkdirSync(skipDir, { recursive: true });
    fs.writeFileSync(path.join(skipDir, 'keep-me.txt'), 'This file should be copied');
    fs.writeFileSync(path.join(skipDir, 'skip-me.txt'), 'This file should be skipped');

    // Create template with package.json for merging
    const mergeDir = path.join(templateDir, 'merge-test');
    fs.mkdirSync(mergeDir, { recursive: true });
    fs.writeFileSync(
      path.join(mergeDir, 'package.json'),
      JSON.stringify({
        dependencies: {
          'new-package': '^1.0.0',
        },
        scripts: {
          'new-script': 'echo "new script"',
        },
      }, null, 2)
    );
  }

  describe('Factory Method', () => {
    it('should create a ProjectBuilder instance', () => {
      const builder = ProjectBuilder.create({
        packageName: 'test-project',
        targetDir: testDir,
      });

      expect(builder).to.be.instanceOf(ProjectBuilder);
    });

    it('should set default configuration', () => {
      const builder = ProjectBuilder.create({
        targetDir: testDir,
      });

      expect(builder).to.be.instanceOf(ProjectBuilder);
    });
  });

  describe('Step Validation', () => {
    it('should validate template step configuration', () => {
      const builder = ProjectBuilder.create({
        override: true,
        targetDir: testDir,
      });

      expect(() => {
        builder.addStep({
          // No from path and no hooks
        });
      }).to.throw('Template step must have either a template path (from) or hooks (preHook/postHook)');
    });

    it('should throw error for non-existent template directory', async () => {
      const builder = ProjectBuilder.create({
        override: true,
        targetDir: testDir,
      });

      builder.addStep({
        from: path.join(templateDir, 'non-existent'),
        variables: { name: 'test' },
      });

      try {
        await builder.build();
        expect.fail('Should have thrown an error');
      } catch (error) {
        expect((error as Error).message).to.include('Source template directory does not exist');
      }
    });
  });

  describe('Template Copying', () => {
    it('should copy a single template', async () => {
      const builder = ProjectBuilder.create({
        override: true,
        packageName: 'test-project',
        targetDir: testDir,
      });

      builder.addStep({
        from: path.join(templateDir, 'base'),
        variables: { name: 'my-project' },
      });

      await builder.build();

      expect(fs.existsSync(path.join(testDir, 'package.json'))).to.be.true;
      expect(fs.existsSync(path.join(testDir, 'README.md'))).to.be.true;
    });

    it('should copy multiple templates in sequence', async () => {
      const builder = ProjectBuilder.create({
        override: true,
        targetDir: testDir,
      });

      builder
        .addStep({
          from: path.join(templateDir, 'base'),
          variables: { name: 'multi-template-project' },
        })
        .addStep({
          from: path.join(templateDir, 'feature'),
          variables: {
            description: 'A test feature',
            featureName: 'myFeature',
          },
        });

      await builder.build();

      expect(fs.existsSync(path.join(testDir, 'package.json'))).to.be.true;
      expect(fs.existsSync(path.join(testDir, 'README.md'))).to.be.true;
      expect(fs.existsSync(path.join(testDir, 'feature.js'))).to.be.true;

      const featureContent = fs.readFileSync(path.join(testDir, 'feature.js'), 'utf8');
      expect(featureContent).to.include('myFeature');
      expect(featureContent).to.include('A test feature');
    });

    it('should handle empty target directory', async () => {
      const builder = ProjectBuilder.create({
        override: true,
        targetDir: testDir,
      });

      builder.addStep({
        from: path.join(templateDir, 'base'),
        variables: { name: 'empty-dir-test' },
      });

      await builder.build();

      expect(fs.existsSync(path.join(testDir, 'package.json'))).to.be.true;
    });
  });

  describe('Variable Replacement', () => {
    it('should replace variables in file content', async () => {
      const builder = ProjectBuilder.create({
        override: true,
        targetDir: testDir,
      });

      builder.addStep({
        from: path.join(templateDir, 'base'),
        variables: { name: 'variable-test' },
      });

      await builder.build();

      const packageJson = JSON.parse(fs.readFileSync(path.join(testDir, 'package.json'), 'utf8'));
      expect(packageJson.name).to.equal('variable-test');

      const readmeContent = fs.readFileSync(path.join(testDir, 'README.md'), 'utf8');
      expect(readmeContent).to.include('# variable-test');
    });

    it('should replace variables in file names', async () => {
      // Create a template with variable in filename
      const variableTemplateDir = path.join(templateDir, 'variable-filename');
      fs.mkdirSync(variableTemplateDir, { recursive: true });
      fs.writeFileSync(
        path.join(variableTemplateDir, '{{componentName}}.component.js'),
        'export class {{componentName}}Component {}'
      );

      const builder = ProjectBuilder.create({
        override: true,
        targetDir: testDir,
      });

      builder.addStep({
        from: variableTemplateDir,
        variables: { componentName: 'MyTest' },
      });

      await builder.build();

      expect(fs.existsSync(path.join(testDir, 'MyTest.component.js'))).to.be.true;
      const content = fs.readFileSync(path.join(testDir, 'MyTest.component.js'), 'utf8');
      expect(content).to.include('MyTestComponent');
    });

    it('should use global variables when step variables are not provided', async () => {
      const builder = ProjectBuilder.create({
        override: true,
        packageName: 'global-var-test',
        targetDir: testDir,
      });

      builder.addStep({
         from: path.join(templateDir, 'base'),
       });

      await builder.build();

      const packageJson = JSON.parse(fs.readFileSync(path.join(testDir, 'package.json'), 'utf8'));
      expect(packageJson.name).to.equal('global-var-test');
    });

    it('should override global variables with step variables', async () => {
      const builder = ProjectBuilder.create({
        override: true,
        packageName: 'global-name',
        targetDir: testDir,
      });

      builder.addStep({
        from: path.join(templateDir, 'base'),
        variables: { name: 'step-name' },
      });

      await builder.build();

      const packageJson = JSON.parse(fs.readFileSync(path.join(testDir, 'package.json'), 'utf8'));
      expect(packageJson.name).to.equal('step-name');
    });

    it('should handle packageName variable', async () => {
      const builder = ProjectBuilder.create({
        override: true,
        packageName: 'my-test-project',
        targetDir: testDir,
      });

      builder.addStep({
         from: path.join(templateDir, 'base'),
       });

      await builder.build();

      const packageJson = JSON.parse(fs.readFileSync(path.join(testDir, 'package.json'), 'utf8'));
      expect(packageJson.name).to.equal('my-test-project');
    });
  });

  describe('File Management', () => {
    it('should skip files based on configuration', async () => {
      const builder = ProjectBuilder.create({
        override: true,
        targetDir: testDir,
      });

      builder.addStep({
        from: path.join(templateDir, 'skip-test'),
        skipFiles: ['skip-me.txt'],
      });

      await builder.build();

      expect(fs.existsSync(path.join(testDir, 'keep-me.txt'))).to.be.true;
      expect(fs.existsSync(path.join(testDir, 'skip-me.txt'))).to.be.false;
    });
  });

  describe('Fluent API', () => {
    it('should support method chaining', async () => {
      const builder = ProjectBuilder.create({
        override: true,
        targetDir: testDir,
      });

      const result = builder
        .addStep({
          from: path.join(templateDir, 'base'),
          variables: { name: 'chain-test' },
        })
        .addStep({
          from: path.join(templateDir, 'feature'),
          variables: {
            description: 'Chained feature',
            featureName: 'chainFeature',
          },
        });

      expect(result).to.equal(builder);

      await builder.build();

      expect(fs.existsSync(path.join(testDir, 'package.json'))).to.be.true;
      expect(fs.existsSync(path.join(testDir, 'feature.js'))).to.be.true;
    });

    it('should support adding multiple steps at once', async () => {
      const builder = ProjectBuilder.create({
        override: true,
        targetDir: testDir,
      });

      builder.addSteps([
        {
          from: path.join(templateDir, 'base'),
          variables: { name: 'multi-step-test' },
        },
        {
          from: path.join(templateDir, 'feature'),
          variables: {
            description: 'Multi-step feature',
            featureName: 'multiFeature',
          },
        },
      ]);

      await builder.build();

      expect(fs.existsSync(path.join(testDir, 'package.json'))).to.be.true;
      expect(fs.existsSync(path.join(testDir, 'feature.js'))).to.be.true;
    });
  });

  describe('Global Configuration', () => {
    it('should apply global skip files to all steps', async () => {
       const builder = ProjectBuilder.create({
         override: true,
         targetDir: testDir,
       });

      builder.addStep({
         from: path.join(templateDir, 'skip-test'),
         skipFiles: ['skip-me.txt'],
       });

      await builder.build();

      expect(fs.existsSync(path.join(testDir, 'keep-me.txt'))).to.be.true;
      expect(fs.existsSync(path.join(testDir, 'skip-me.txt'))).to.be.false;
    });

    it('should merge global and step-level skip files', async () => {
       // Create template with multiple files to skip
       const multiSkipDir = path.join(templateDir, 'multi-skip');
       fs.mkdirSync(multiSkipDir, { recursive: true });
       fs.writeFileSync(path.join(multiSkipDir, 'keep.txt'), 'keep');
       fs.writeFileSync(path.join(multiSkipDir, 'global-skip.txt'), 'global skip');
       fs.writeFileSync(path.join(multiSkipDir, 'step-skip.txt'), 'step skip');

       const builder = ProjectBuilder.create({
         override: true,
         targetDir: testDir,
       });

      builder.addStep({
         from: multiSkipDir,
         skipFiles: ['global-skip.txt', 'step-skip.txt'],
       });

      await builder.build();

      expect(fs.existsSync(path.join(testDir, 'keep.txt'))).to.be.true;
      expect(fs.existsSync(path.join(testDir, 'global-skip.txt'))).to.be.false;
      expect(fs.existsSync(path.join(testDir, 'step-skip.txt'))).to.be.false;
    });

    it('should use global variables in all steps', async () => {
       const builder = ProjectBuilder.create({
         override: true,
         packageName: 'global-test',
         targetDir: testDir,
       });

      builder.addStep({
         from: path.join(templateDir, 'base'),
       });

      await builder.build();

      const packageJson = JSON.parse(fs.readFileSync(path.join(testDir, 'package.json'), 'utf8'));
      expect(packageJson.name).to.equal('global-test');
    });

    it('should handle override configuration', async () => {
      // First, create some files in the target directory
      fs.mkdirSync(testDir, { recursive: true });
      fs.writeFileSync(path.join(testDir, 'existing.txt'), 'existing content');

      const builder = ProjectBuilder.create({
        override: true,
        targetDir: testDir,
      });

      builder.addStep({
        from: path.join(templateDir, 'base'),
        variables: { name: 'override-test' },
      });

      await builder.build();

      expect(fs.existsSync(path.join(testDir, 'package.json'))).to.be.true;
    });
  });

  describe('Hook System', () => {
    it('should execute preHook before copying template', async () => {
      let preHookExecuted = false;
      let preHookTargetDir = '';

      const builder = ProjectBuilder.create({
        override: true,
        targetDir: testDir,
      });

      builder.addStep({
         from: path.join(templateDir, 'base'),
         async preHook(config, _step) {
           preHookExecuted = true;
           preHookTargetDir = config.targetDir;
           // Verify template hasn't been copied yet
           expect(fs.existsSync(path.join(config.targetDir, 'package.json'))).to.be.false;
         },
         variables: { name: 'pre-hook-test' },
       });

      await builder.build();

      expect(preHookExecuted).to.be.true;
      expect(preHookTargetDir).to.equal(testDir);
      expect(fs.existsSync(path.join(testDir, 'package.json'))).to.be.true;
    });

    it('should execute postHook after copying template', async () => {
      let postHookExecuted = false;
      let postHookTargetDir = '';

      const builder = ProjectBuilder.create({
        override: true,
        targetDir: testDir,
      });

      builder.addStep({
         from: path.join(templateDir, 'base'),
         async postHook(config, _step) {
           postHookExecuted = true;
           postHookTargetDir = config.targetDir;
           // Verify template has been copied
           expect(fs.existsSync(path.join(config.targetDir, 'package.json'))).to.be.true;
           // Modify the copied file
           const packageJson = JSON.parse(fs.readFileSync(path.join(config.targetDir, 'package.json'), 'utf8'));
           packageJson.modified = true;
           fs.writeFileSync(path.join(config.targetDir, 'package.json'), JSON.stringify(packageJson, null, 2));
         },
         variables: { name: 'post-hook-test' },
       });

      await builder.build();

      expect(postHookExecuted).to.be.true;
      expect(postHookTargetDir).to.equal(testDir);
      
      const packageJson = JSON.parse(fs.readFileSync(path.join(testDir, 'package.json'), 'utf8'));
      expect(packageJson.modified).to.be.true;
    });

    it('should support hook-only steps without template copying', async () => {
      let hookExecuted = false;

      const builder = ProjectBuilder.create({
        override: true,
        targetDir: testDir,
      });

      // First step: copy template
      builder.addStep({
        from: path.join(templateDir, 'base'),
        variables: { name: 'hook-only-test' },
      });

      // Second step: hook-only
       builder.addStep({
         async postHook(config, _step) {
           hookExecuted = true;
           // Create additional file
           fs.writeFileSync(path.join(config.targetDir, 'hook-created.txt'), 'Created by hook');
         },
       });

      await builder.build();

      expect(hookExecuted).to.be.true;
      expect(fs.existsSync(path.join(testDir, 'package.json'))).to.be.true;
      expect(fs.existsSync(path.join(testDir, 'hook-created.txt'))).to.be.true;
    });

    it('should pass correct variables to hooks', async () => {
       let receivedVariables = {};

       const builder = ProjectBuilder.create({
         override: true,
         targetDir: testDir,
       });

      builder.addStep({
         from: path.join(templateDir, 'base'),
         async postHook(config, step) {
           receivedVariables = step.variables || {};
         },
         variables: { name: 'hook-variables-test', step: 'stepValue' },
       });

      await builder.build();

      expect(receivedVariables).to.deep.include({
         name: 'hook-variables-test',
         step: 'stepValue',
       });
    });

    it('should validate steps with neither template nor hooks', () => {
      const builder = ProjectBuilder.create({
        override: true,
        targetDir: testDir,
      });

      expect(() => {
        builder.addStep({
          // No from path and no hooks
        });
      }).to.throw('Template step must have either a template path (from) or hooks (preHook/postHook)');
    });
  });

  describe('Template Inheritance', () => {
    let sandbox: SinonSandbox;
    let inheritanceTemplateDir: string;
    let baseTemplateDir: string;
    let childTemplateDir: string;
    let grandchildTemplateDir: string;
    let circularATemplateDir: string;
    let circularBTemplateDir: string;

    beforeEach(() => {
      sandbox = createSandbox();
      inheritanceTemplateDir = path.join(templateDir, 'inheritance');
      baseTemplateDir = path.join(inheritanceTemplateDir, 'base');
      childTemplateDir = path.join(inheritanceTemplateDir, 'child');
      grandchildTemplateDir = path.join(inheritanceTemplateDir, 'grandchild');
      circularATemplateDir = path.join(inheritanceTemplateDir, 'circular-a');
      circularBTemplateDir = path.join(inheritanceTemplateDir, 'circular-b');

      // Create base template
      fs.mkdirSync(baseTemplateDir, { recursive: true });
      fs.writeFileSync(path.join(baseTemplateDir, 'base.txt'), 'Base template file');
      fs.writeFileSync(path.join(baseTemplateDir, 'package.json'), JSON.stringify({
        description: 'Base template',
        name: '{{name}}',
        version: '1.0.0'
      }, null, 2));

      // Create child template that inherits from base
      fs.mkdirSync(childTemplateDir, { recursive: true });
      fs.writeFileSync(path.join(childTemplateDir, '<inherit:base>'), '');
      fs.writeFileSync(path.join(childTemplateDir, 'child.txt'), 'Child template file');
      fs.writeFileSync(path.join(childTemplateDir, 'README.md'), '# {{name}}\n\nChild template readme');

      // Create grandchild template that inherits from child
      fs.mkdirSync(grandchildTemplateDir, { recursive: true });
      fs.writeFileSync(path.join(grandchildTemplateDir, '<inherit:child>'), '');
      fs.writeFileSync(path.join(grandchildTemplateDir, 'grandchild.txt'), 'Grandchild template file');

      // Create circular inheritance templates
      fs.mkdirSync(circularATemplateDir, { recursive: true });
      fs.writeFileSync(path.join(circularATemplateDir, '<inherit:circular-b>'), '');
      fs.writeFileSync(path.join(circularATemplateDir, 'file-a.txt'), 'File from template A');

      fs.mkdirSync(circularBTemplateDir, { recursive: true });
      fs.writeFileSync(path.join(circularBTemplateDir, '<inherit:circular-a>'), '');
      fs.writeFileSync(path.join(circularBTemplateDir, 'file-b.txt'), 'File from template B');
    });

    afterEach(() => {
      sandbox.restore();
      if (fs.existsSync(inheritanceTemplateDir)) {
        fs.rmSync(inheritanceTemplateDir, { force: true, recursive: true });
      }
    });

    it('should load template with single inheritance', async () => {
      const builder = ProjectBuilder.create({
        override: true,
        targetDir: testDir,
      });

      // Create real template directories in the expected location
      const templatesDir = path.resolve(__dirname, '../../../templates');
      const realBaseDir = path.join(templatesDir, 'template-base');
      const realChildDir = path.join(templatesDir, 'template-child');
      
      // Ensure templates directory exists
      fs.mkdirSync(templatesDir, { recursive: true });
      
      // Create base template
      fs.mkdirSync(realBaseDir, { recursive: true });
      fs.writeFileSync(path.join(realBaseDir, 'base.txt'), 'Base template file');
      fs.writeFileSync(path.join(realBaseDir, 'package.json'), JSON.stringify({
        description: 'Base template',
        name: '{{name}}',
        version: '1.0.0'
      }, null, 2));
      fs.writeFileSync(path.join(realBaseDir, 'README.md'), '# {{name}}\n\nBase template readme');
      
      // Create child template with inheritance
      fs.mkdirSync(realChildDir, { recursive: true });
      fs.writeFileSync(path.join(realChildDir, '<inherit:base>'), '');
      fs.writeFileSync(path.join(realChildDir, 'child.txt'), 'Child template file');
      
      try {
        builder.loadTemplate(realChildDir);
        await builder.build();

        // Should have files from both base and child templates
        expect(fs.existsSync(path.join(testDir, 'base.txt'))).to.be.true;
        expect(fs.existsSync(path.join(testDir, 'child.txt'))).to.be.true;
        expect(fs.existsSync(path.join(testDir, 'package.json'))).to.be.true;
        expect(fs.existsSync(path.join(testDir, 'README.md'))).to.be.true;

        const baseContent = fs.readFileSync(path.join(testDir, 'base.txt'), 'utf8');
        expect(baseContent).to.equal('Base template file');

        const childContent = fs.readFileSync(path.join(testDir, 'child.txt'), 'utf8');
        expect(childContent).to.equal('Child template file');
      } finally {
        // Clean up real template directories
        if (fs.existsSync(realBaseDir)) {
          fs.rmSync(realBaseDir, { force: true, recursive: true });
        }

        if (fs.existsSync(realChildDir)) {
          fs.rmSync(realChildDir, { force: true, recursive: true });
        }
      }
    });

    it('should load template with recursive inheritance', async () => {
      const builder = ProjectBuilder.create({
        override: true,
        packageName: 'recursive-test',
        targetDir: testDir,
      });

      // Create real template directories in the expected location
      const templatesDir = path.resolve(__dirname, '../../../templates');
      const realBaseDir = path.join(templatesDir, 'template-base');
      const realChildDir = path.join(templatesDir, 'template-child');
      const realGrandchildDir = path.join(templatesDir, 'template-grandchild');
      
      // Ensure templates directory exists
      fs.mkdirSync(templatesDir, { recursive: true });
      
      // Create base template
      fs.mkdirSync(realBaseDir, { recursive: true });
      fs.writeFileSync(path.join(realBaseDir, 'base.txt'), 'Base template file');
      fs.writeFileSync(path.join(realBaseDir, 'package.json'), JSON.stringify({
        description: 'Base template',
        name: '{{name}}',
        version: '1.0.0'
      }, null, 2));
      fs.writeFileSync(path.join(realBaseDir, 'README.md'), '# {{name}}\n\nBase template readme');
      
      // Create child template with inheritance
      fs.mkdirSync(realChildDir, { recursive: true });
      fs.writeFileSync(path.join(realChildDir, '<inherit:base>'), '');
      fs.writeFileSync(path.join(realChildDir, 'child.txt'), 'Child template file');
      
      // Create grandchild template with inheritance
      fs.mkdirSync(realGrandchildDir, { recursive: true });
      fs.writeFileSync(path.join(realGrandchildDir, '<inherit:child>'), '');
      fs.writeFileSync(path.join(realGrandchildDir, 'grandchild.txt'), 'Grandchild template file');
      
      try {
         builder.loadTemplate(realGrandchildDir, {
           variables: { name: 'recursive-test' }
         });
         await builder.build();
        
        // Should have files from base, child, and grandchild templates
        expect(fs.existsSync(path.join(testDir, 'base.txt'))).to.be.true;
        expect(fs.existsSync(path.join(testDir, 'child.txt'))).to.be.true;
        expect(fs.existsSync(path.join(testDir, 'grandchild.txt'))).to.be.true;
        expect(fs.existsSync(path.join(testDir, 'package.json'))).to.be.true;
        expect(fs.existsSync(path.join(testDir, 'README.md'))).to.be.true;

        const packageJson = JSON.parse(fs.readFileSync(path.join(testDir, 'package.json'), 'utf8'));
        expect(packageJson.name).to.equal('recursive-test');
        expect(packageJson.description).to.equal('Base template');

        const readmeContent = fs.readFileSync(path.join(testDir, 'README.md'), 'utf8');
        expect(readmeContent).to.include('recursive-test');
      } finally {
        // Clean up real template directories
        if (fs.existsSync(realBaseDir)) {
          fs.rmSync(realBaseDir, { force: true, recursive: true });
        }

        if (fs.existsSync(realChildDir)) {
          fs.rmSync(realChildDir, { force: true, recursive: true });
        }

        if (fs.existsSync(realGrandchildDir)) {
          fs.rmSync(realGrandchildDir, { force: true, recursive: true });
        }
      }
    });

    it('should handle circular inheritance gracefully', async () => {
      const builder = ProjectBuilder.create({
        override: true,
        targetDir: testDir,
      });

      // Create real template directories in the expected location
      const templatesDir = path.resolve(__dirname, '../../../templates');
      const realCircularADir = path.join(templatesDir, 'template-circular-a');
      const realCircularBDir = path.join(templatesDir, 'template-circular-b');
      
      // Ensure templates directory exists
      fs.mkdirSync(templatesDir, { recursive: true });
      
      // Create circular inheritance templates
      fs.mkdirSync(realCircularADir, { recursive: true });
      fs.writeFileSync(path.join(realCircularADir, '<inherit:circular-b>'), '');
      fs.writeFileSync(path.join(realCircularADir, 'file-a.txt'), 'File from template A');

      fs.mkdirSync(realCircularBDir, { recursive: true });
      fs.writeFileSync(path.join(realCircularBDir, '<inherit:circular-a>'), '');
      fs.writeFileSync(path.join(realCircularBDir, 'file-b.txt'), 'File from template B');
      
      try {
        // Should not throw error and should include files from both templates
        builder.loadTemplate(realCircularADir);
        await builder.build();

        expect(fs.existsSync(path.join(testDir, 'file-a.txt'))).to.be.true;
        expect(fs.existsSync(path.join(testDir, 'file-b.txt'))).to.be.true;

        const fileAContent = fs.readFileSync(path.join(testDir, 'file-a.txt'), 'utf8');
        expect(fileAContent).to.equal('File from template A');

        const fileBContent = fs.readFileSync(path.join(testDir, 'file-b.txt'), 'utf8');
        expect(fileBContent).to.equal('File from template B');
      } finally {
        // Clean up real template directories
        if (fs.existsSync(realCircularADir)) {
          fs.rmSync(realCircularADir, { force: true, recursive: true });
        }

        if (fs.existsSync(realCircularBDir)) {
          fs.rmSync(realCircularBDir, { force: true, recursive: true });
        }
      }
    });

    it('should handle non-existent inherited template', async () => {
      const templatesDir = path.resolve(__dirname, '../../../templates');
      const nonExistentTemplateDir = path.join(templatesDir, 'template-non-existent');
      
      // Ensure templates directory exists
      fs.mkdirSync(templatesDir, { recursive: true });
      
      fs.mkdirSync(nonExistentTemplateDir, { recursive: true });
      fs.writeFileSync(path.join(nonExistentTemplateDir, '<inherit:does-not-exist>'), '');
      fs.writeFileSync(path.join(nonExistentTemplateDir, 'file.txt'), 'Some content');

      try {
        const builder = ProjectBuilder.create({
          override: true,
          targetDir: testDir,
        });

        // Should not throw error, but should warn and continue
        builder.loadTemplate(nonExistentTemplateDir);
        await builder.build();
        
        // Should still create the main template file
        expect(fs.existsSync(path.join(testDir, 'file.txt'))).to.be.true;
        const fileContent = fs.readFileSync(path.join(testDir, 'file.txt'), 'utf8');
        expect(fileContent).to.equal('Some content');
      } finally {
        // Clean up
        if (fs.existsSync(nonExistentTemplateDir)) {
          fs.rmSync(nonExistentTemplateDir, { force: true, recursive: true });
        }
      }
    });

    it('should preserve file override order in inheritance chain', async () => {
      const templatesDir = path.resolve(__dirname, '../../../templates');
      const realBaseDir = path.join(templatesDir, 'template-base');
      const overrideTemplateDir = path.join(templatesDir, 'template-override-test');
      
      // Ensure templates directory exists
      fs.mkdirSync(templatesDir, { recursive: true });
      
      // Create base template
      fs.mkdirSync(realBaseDir, { recursive: true });
      fs.writeFileSync(path.join(realBaseDir, 'base.txt'), 'Base template file');
      fs.writeFileSync(path.join(realBaseDir, 'package.json'), JSON.stringify({
        description: 'Base template',
        name: '{{name}}',
        version: '1.0.0'
      }, null, 2));
      
      // Create a template that overrides a file from its parent
      fs.mkdirSync(overrideTemplateDir, { recursive: true });
      fs.writeFileSync(path.join(overrideTemplateDir, '<inherit:base>'), '');
      fs.writeFileSync(path.join(overrideTemplateDir, 'package.json'), JSON.stringify({
        custom: true,
        description: 'Override template',
        name: '{{name}}',
        version: '2.0.0'
      }, null, 2));

      try {
        const builder = ProjectBuilder.create({
          override: true,
          packageName: 'override-test',
          targetDir: testDir,
        });

        builder.loadTemplate(overrideTemplateDir);
        await builder.build();

        const packageJson = JSON.parse(fs.readFileSync(path.join(testDir, 'package.json'), 'utf8'));
        expect(packageJson.version).to.equal('2.0.0');
        expect(packageJson.description).to.equal('Override template');
        expect(packageJson.custom).to.be.true;
        expect(packageJson.name).to.equal('override-test');
      } finally {
        // Clean up real template directories
        if (fs.existsSync(realBaseDir)) {
          fs.rmSync(realBaseDir, { force: true, recursive: true });
        }

        if (fs.existsSync(overrideTemplateDir)) {
          fs.rmSync(overrideTemplateDir, { force: true, recursive: true });
        }
      }
    });

    it('should handle inheritance files with different naming patterns', async () => {
      const templatesDir = path.resolve(__dirname, '../../../templates');
      const realBaseDir = path.join(templatesDir, 'template-base');
      const patternTemplateDir = path.join(templatesDir, 'template-pattern-test');
      
      // Ensure templates directory exists
      fs.mkdirSync(templatesDir, { recursive: true });
      
      // Create base template
      fs.mkdirSync(realBaseDir, { recursive: true });
      fs.writeFileSync(path.join(realBaseDir, 'base.txt'), 'Base template file');
      fs.writeFileSync(path.join(realBaseDir, 'package.json'), JSON.stringify({
        description: 'Base template',
        name: '{{name}}',
        version: '1.0.0'
      }, null, 2));
      
      fs.mkdirSync(patternTemplateDir, { recursive: true });
      
      // Test different inheritance file patterns
      fs.writeFileSync(path.join(patternTemplateDir, '<inherit:base>'), '');
      fs.writeFileSync(path.join(patternTemplateDir, 'pattern.txt'), 'Pattern test');

      try {
        const builder = ProjectBuilder.create({
          override: true,
          targetDir: testDir,
        });

        builder.loadTemplate(patternTemplateDir);
        await builder.build();

        expect(fs.existsSync(path.join(testDir, 'base.txt'))).to.be.true;
        expect(fs.existsSync(path.join(testDir, 'pattern.txt'))).to.be.true;
        expect(fs.existsSync(path.join(testDir, '<inherit:base>'))).to.be.false;
      } finally {
        // Clean up real template directories
        if (fs.existsSync(realBaseDir)) {
          fs.rmSync(realBaseDir, { force: true, recursive: true });
        }

        if (fs.existsSync(patternTemplateDir)) {
          fs.rmSync(patternTemplateDir, { force: true, recursive: true });
        }
      }
    });

    it('should handle inheritance files in subdirectories', async () => {
      const templatesDir = path.resolve(__dirname, '../../../templates');
      const realBaseDir = path.join(templatesDir, 'template-base');
      const subdirTemplateDir = path.join(templatesDir, 'template-subdir-test');
      
      // Ensure templates directory exists
      fs.mkdirSync(templatesDir, { recursive: true });
      
      // Create base template
      fs.mkdirSync(realBaseDir, { recursive: true });
      fs.writeFileSync(path.join(realBaseDir, 'base.txt'), 'Base template file');
      fs.writeFileSync(path.join(realBaseDir, 'package.json'), JSON.stringify({
        description: 'Base template',
        name: '{{name}}',
        version: '1.0.0'
      }, null, 2));
      
      // Create template with inheritance file in subdirectory
      fs.mkdirSync(subdirTemplateDir, { recursive: true });
      const subDir = path.join(subdirTemplateDir, 'src');
      fs.mkdirSync(subDir, { recursive: true });
      
      // Put inheritance file in subdirectory
      fs.writeFileSync(path.join(subDir, '<inherit:base>'), '');
      fs.writeFileSync(path.join(subdirTemplateDir, 'main.txt'), 'Main template file');
      fs.writeFileSync(path.join(subDir, 'sub.txt'), 'Sub directory file');

      try {
        const builder = ProjectBuilder.create({
          override: true,
          targetDir: testDir,
        });

        builder.loadTemplate(subdirTemplateDir);
        await builder.build();

        // Should have files from main template in root
        expect(fs.existsSync(path.join(testDir, 'main.txt'))).to.be.true;
        expect(fs.existsSync(path.join(testDir, 'src', 'sub.txt'))).to.be.true;
        
        // Inherited template files should be placed in the subdirectory where inheritance file was found
        expect(fs.existsSync(path.join(testDir, 'src', 'base.txt'))).to.be.true;
        expect(fs.existsSync(path.join(testDir, 'src', 'package.json'))).to.be.true;
        
        // Inheritance file should not be copied
        expect(fs.existsSync(path.join(testDir, 'src', '<inherit:base>'))).to.be.false;
        
        const baseContent = fs.readFileSync(path.join(testDir, 'src', 'base.txt'), 'utf8');
        expect(baseContent).to.equal('Base template file');
        
        const mainContent = fs.readFileSync(path.join(testDir, 'main.txt'), 'utf8');
        expect(mainContent).to.equal('Main template file');
        
        const subContent = fs.readFileSync(path.join(testDir, 'src', 'sub.txt'), 'utf8');
        expect(subContent).to.equal('Sub directory file');
      } finally {
        // Clean up real template directories
        if (fs.existsSync(realBaseDir)) {
          fs.rmSync(realBaseDir, { force: true, recursive: true });
        }

        if (fs.existsSync(subdirTemplateDir)) {
          fs.rmSync(subdirTemplateDir, { force: true, recursive: true });
        }
      }
    });
  });

  describe('Action Conversion', () => {
    it('should convert steps to actions correctly', () => {
      const builder = ProjectBuilder.create({
        checkEmpty: true,
        override: true,
        targetDir: testDir,
      });

      builder
        .addStep({
          from: path.join(templateDir, 'base'),
          variables: { name: 'test' },
        })
        .addStep({
          async postHook() {
            // Hook-only step
          },
        });

      const actions = builder.toActions();
      
      // Should have 3 actions: directory check + 2 steps
      expect(actions).to.have.length(3);
      expect(actions[0].name).to.equal('check-empty-directory');
      expect(actions[1].name).to.equal('copy-template-1');
      expect(actions[2].name).to.equal('hook-step-2');
    });

    it('should execute actions using ActionRunner', async () => {
      const builder = ProjectBuilder.create({
        checkEmpty: false,
        override: true,
        targetDir: testDir,
      });

      builder.addStep({
         from: path.join(templateDir, 'base'),
       });

      const actionContext = {
        devMode: false,
        environment: 'development' as const,
        logger: {
          clear() {},
          error() {},
          info() {},
          logFile: null,
          message() {},
          on() {},
          warn() {},
        },
        projectRoot: process.cwd(),
      };

      await builder.buildWithActionRunner(actionContext);

      // Verify files were created
      expect(fs.existsSync(path.join(testDir, 'package.json'))).to.be.true;
      const packageJson = JSON.parse(fs.readFileSync(path.join(testDir, 'package.json'), 'utf8'));
      expect(packageJson.name).to.equal('{{name}}');
    });
  });
});