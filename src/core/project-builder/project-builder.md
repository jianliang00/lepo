# ProjectBuilder

A powerful utility class for creating projects by copying multiple templates in sequence with variable replacement support.

## Overview

The `ProjectBuilder` class provides a fluent API for building projects from multiple templates. It's designed to replace manual template copying logic with a more structured and reusable approach.

## Key Features

- **Sequential Template Copying**: Copy multiple templates in a specific order
- **Variable Replacement**: Replace placeholders in file names and content with actual values
- **Flexible Configuration**: Configure each step independently or use global settings
- **File Management**: Skip files, rename files, and merge package.json files
- **Hook System**: Execute custom logic before and after each step
- **Hook-only Steps**: Create steps that only execute hooks without copying templates
- **Action Integration**: Convert steps to Action instances for use with ActionRunner
- **Progress Tracking**: Better progress visualization when using ActionRunner
- **Error Handling**: Graceful error handling with user prompts for conflicts
- **Chain API**: Fluent interface for easy configuration

## Basic Usage

```typescript
import { ProjectBuilder } from './project-builder.js';

// Create a builder instance
const builder = ProjectBuilder.create({
  targetDir: '/path/to/my-project',
  checkEmpty: true,
  version: '1.0.0',
  packageName: 'my-project',
});

// Add template steps with hooks
builder
  .addStep({
    from: '/path/to/base-template',
    variables: { projectName: 'my-project' },
  })
  .addStep({
    from: '/path/to/component-template',
    to: 'components',
    variables: { componentName: 'MyComponent' },
    postHook: async (config, step) => {
      // Custom logic after template copying
      console.log(`Component created in ${config.targetDir}`);
    }
  })
  .addStep({
    // Hook-only step (no template copying)
    postHook: async (config) => {
      // Create additional configuration files
      const configPath = path.resolve(config.targetDir, 'project.config.json');
      await fs.writeFile(configPath, JSON.stringify({ name: config.packageName }));
    }
  });

// Execute all steps
await builder.build();

// Alternative: Use ActionRunner for better progress tracking
const actionContext = {
  devMode: false,
  environment: 'development',
  logger: defaultLogger,
  projectRoot: process.cwd(),
};

await builder.buildWithActionRunner(actionContext);

// Or convert to actions for custom execution
const actions = builder.toActions();
const runner = new ActionRunner(actionContext);
actions.forEach(action => runner.addAction(action));
await runner.run();
```

## API Reference

### ProjectBuilderConfig

Global configuration for the project builder:

```typescript
interface ProjectBuilderConfig {
  /** Target project directory */
  targetDir: string;
  /** Whether to check if target directory is empty on first step */
  checkEmpty?: boolean;
  /** Whether to override existing files globally */
  override?: boolean;
  /** Global version information */
  version?: Record<string, string> | string;
  /** Global package name */
  packageName?: string;
}
```

### TemplateStep

Configuration for a single template copy operation:

```typescript
interface TemplateStep {
  /** Source template directory path (optional for hook-only steps) */
  from?: string;
  /** Target directory path (relative to project root) */
  to?: string;
  /** Version information for package.json updates */
  version?: Record<string, string> | string;
  /** Package name for package.json updates */
  packageName?: string;
  /** Files to skip during copying */
  skipFiles?: string[];
  /** Variables for template replacement */
  variables?: VariablesMap;
  /** File rename mappings */
  renameFiles?: Record<string, string>;
  /** Whether to merge package.json files */
  isMergePackageJson?: boolean;
  /** Whether to check if target directory is empty */
  checkEmpty?: boolean;
  /** Whether to override existing files */
  override?: boolean;
  /** Hook to execute before processing this step */
  preHook?: (config: ProjectBuilderConfig, step: TemplateStep) => Promise<TemplateStep[] | void> | TemplateStep[] | void;
  /** Hook to execute after processing this step */
  postHook?: (config: ProjectBuilderConfig, step: TemplateStep) => Promise<TemplateStep[] | void> | TemplateStep[] | void;
}
```

### Methods

#### `ProjectBuilder.create(config: ProjectBuilderConfig): ProjectBuilder`

Create a new ProjectBuilder instance.

#### `addStep(step: TemplateStep): ProjectBuilder`

Add a single template copy step. Returns the builder instance for chaining.

#### `addSteps(steps: TemplateStep[]): ProjectBuilder`

Add multiple template copy steps. Returns the builder instance for chaining.

#### `build(): Promise<void>`

Execute all configured template copy steps in sequence.

#### `buildWithActionRunner(context: ActionContext): Promise<void>`

Execute all template steps using the ActionRunner for better progress tracking and logging.

#### `toActions(): Action[]`

Convert all builder steps to an array of Action instances that can be executed independently.

## Advanced Examples

### Component Project Creation

```typescript
// Recreate the component creation logic from component.ts
const builder = ProjectBuilder.create({
  targetDir: distFolder,
  checkEmpty: true,
  version,
  packageName,
});

// Step 1: Copy common template
builder.addStep({
  from: path.resolve(__dirname, '../../../templates/template-common'),
});

// Step 2: Copy component template
builder.addStep({
  from: path.resolve(__dirname, '../../../templates/template-component-react-ts'),
});

// Step 3: Create example project
builder.addStep({
  from: path.resolve(__dirname, '../../../templates/template-app-react-ts'),
  to: 'example',
  skipFiles: ['App.tsx'],
  variables: {
    appName: packageName,
  },
});

// Step 4: Add Android component conditionally
if (chosenNativePlatforms.includes('android')) {
  builder.addStep({
    from: path.resolve(__dirname, '../../../templates/template-component-android-kotlin'),
    to: 'android',
    variables: {
      packageName: androidPackageName,
      packagePath: androidPackageName.replaceAll('.', '/'),
    },
  });
}

await builder.build();
```

### Multi-Platform Project

```typescript
const builder = ProjectBuilder.create({
  targetDir: '/path/to/multi-platform-project',
  packageName: 'my-app',
  version: '1.0.0',
});

// Base project structure
builder.addStep({
  from: '/templates/base',
  variables: {
    appName: 'MyApp',
    description: 'A multi-platform application',
  },
});

// Web frontend
builder.addStep({
  from: '/templates/web-react',
  to: 'web',
  variables: {
    appTitle: 'MyApp Web',
  },
});

// Mobile app
builder.addStep({
  from: '/templates/mobile-react-native',
  to: 'mobile',
  variables: {
    bundleId: 'com.example.myapp',
  },
});

// Backend API
builder.addStep({
  from: '/templates/api-node',
  to: 'api',
  variables: {
    serviceName: 'myapp-api',
    port: '3001',
  },
});

await builder.build();
```

### Conditional Template Steps

```typescript
const features = ['auth', 'database', 'api'];
const builder = ProjectBuilder.create({
  targetDir: '/path/to/feature-project',
  packageName: 'feature-app',
});

// Base template
builder.addStep({
  from: '/templates/base',
});

// Add feature templates conditionally
if (features.includes('auth')) {
  builder.addStep({
    from: '/templates/auth-module',
    to: 'src/auth',
    variables: {
      authProvider: 'firebase',
    },
  });
}

if (features.includes('database')) {
  builder.addStep({
    from: '/templates/database-module',
    to: 'src/database',
    variables: {
      dbType: 'postgresql',
    },
  });
}

if (features.includes('api')) {
  builder.addStep({
    from: '/templates/api-module',
    to: 'src/api',
    variables: {
      apiVersion: 'v1',
    },
  });
}

await builder.build();
```

## Variable Replacement

The ProjectBuilder supports variable replacement in both file names and file content using the `{{variableName}}` syntax:

### File Name Replacement

```typescript
// Template file: {{componentName}}.tsx
// With variables: { componentName: 'Button' }
// Result: Button.tsx
```

### File Content Replacement

```typescript
// Template content:
// export const {{componentName}} = () => {
//   return <div>{{componentName}} Component</div>;
// };

// With variables: { componentName: 'Button' }
// Result:
// export const Button = () => {
//   return <div>Button Component</div>;
// };
```

## Error Handling

The ProjectBuilder includes comprehensive error handling:

- **Missing Source Templates**: Throws error if source template directory doesn't exist
- **Directory Conflicts**: Prompts user when target directory is not empty
- **File Processing Errors**: Logs warnings for individual file processing failures but continues
- **User Cancellation**: Gracefully handles user cancellation during prompts

## Integration with Existing Code

The ProjectBuilder is designed to be a drop-in replacement for manual `copyTemplateWithVariables` calls. It maintains compatibility with the existing template system while providing better organization and reusability.

### Before (Manual Approach)

```typescript
// Multiple manual calls
await copyTemplateWithVariables({
  checkEmpty: true,
  from: commonFolder,
  to: distFolder,
  version,
});

await copyTemplateWithVariables({
  checkEmpty: false,
  from: componentTemplate,
  packageName,
  to: distFolder,
  version,
});

await copyTemplateWithVariables({
  checkEmpty: false,
  from: exampleTemplate,
  skipFiles: ['App.tsx'],
  to: examplePath,
  variables: { appName: packageName },
});
```

### After (ProjectBuilder Approach)

```typescript
// Structured and reusable
const builder = ProjectBuilder.create({
  targetDir: distFolder,
  checkEmpty: true,
  version,
  packageName,
});

builder
  .addStep({ from: commonFolder })
  .addStep({ from: componentTemplate })
  .addStep({
    from: exampleTemplate,
    to: 'example',
    skipFiles: ['App.tsx'],
    variables: { appName: packageName },
  });

await builder.build();
```

## Hook System

The ProjectBuilder supports a powerful hook system that allows you to execute custom logic before and after each step. Hooks can also return additional template steps that will be executed immediately.

### Hook Types

- **preHook**: Executed before the template copying operation
- **postHook**: Executed after the template copying operation

### Basic Hook Usage

```typescript
builder.addStep({
  from: '/templates/base',
  preHook: async (config, step) => {
    console.log('About to copy template:', step.from);
  },
  postHook: async (config, step) => {
    console.log('Template copied to:', config.targetDir);
  },
});
```

### Dynamic Step Generation

Hooks can return additional template steps that will be executed immediately:

```typescript
builder.addStep({
  from: '/templates/base',
  postHook: async (config, step) => {
    // Return additional steps based on conditions
    const additionalSteps = [];
    
    if (shouldAddAndroidSupport) {
      additionalSteps.push({
        from: '/templates/android',
        to: 'android',
        variables: { packageName: 'com.example.app' },
      });
    }
    
    if (shouldAddIOSSupport) {
      additionalSteps.push({
        from: '/templates/ios',
        to: 'ios',
        variables: { bundleId: 'com.example.app' },
      });
    }
    
    return additionalSteps;
  },
});
```

### Hook-only Steps

You can create steps that only execute hooks without copying templates:

```typescript
builder.addStep({
  postHook: async (config) => {
    // Generate platform-specific steps based on user input
    const platforms = await getUserPlatformChoices();
    const steps = [];
    
    for (const platform of platforms) {
      steps.push({
        from: `/templates/${platform}`,
        to: platform,
        variables: { platformName: platform },
      });
    }
    
    return steps;
  },
});
```

### Hook Execution Order

1. **preHook** is executed
2. Any additional steps returned by preHook are executed immediately
3. The main template copying operation is performed (if `from` is specified)
4. **postHook** is executed
5. Any additional steps returned by postHook are executed immediately

## Best Practices

1. **Use Global Configuration**: Set common properties like `version` and `packageName` in the global config
2. **Chain Method Calls**: Use the fluent API for better readability
3. **Conditional Steps**: Add steps conditionally based on user choices or feature flags
4. **Error Handling**: Wrap `build()` calls in try-catch blocks for proper error handling
5. **Template Organization**: Organize templates in a logical directory structure
6. **Variable Naming**: Use descriptive variable names that clearly indicate their purpose

## Migration Guide

To migrate existing code that uses `copyTemplateWithVariables`:

1. Create a `ProjectBuilder` instance with global configuration
2. Replace each `copyTemplateWithVariables` call with an `addStep` call
3. Move common parameters to the global configuration
4. Replace the multiple await calls with a single `await builder.build()`
5. Test the migration with your existing templates

This approach provides better organization, reusability, and maintainability for complex project creation workflows.