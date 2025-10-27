# Template Inheritance

This document describes the template inheritance feature implemented in the ProjectBuilder.

## Overview

The `loadTemplate` method in ProjectBuilder now supports automatic template inheritance through special inheritance files.

## Usage

### Basic Usage

```typescript
const builder = ProjectBuilder.create({
  targetDir: '/path/to/target',
  packageName: 'my-package',
});

// Load template with automatic inheritance processing
builder.loadTemplate(templatePath('react-app-ts'), {
  variables: {
    appName: 'my-app',
    version: '1.0.0',
  },
});
```

### Inheritance Syntax

To make a template inherit from another template, create a file with the naming pattern:

```
<inherit:template-name>
```

For example, to make `template-react-app-ts` inherit from `template-react-common`, create a file named:

```
<inherit:react-common>
```

The content of the inheritance file is ignored - only the filename matters.

## How It Works

1. When `loadTemplate` is called, it scans the template directory for files matching the `<inherit:*>` pattern
2. For each inheritance file found, it extracts the template name and creates a template step for the inherited template
3. Inheritance steps are added first, followed by the main template step
4. Inheritance files are automatically excluded from the main template copying process

## Benefits

- **Automatic inheritance**: No need to manually manage template dependencies
- **Clean separation**: Inheritance is declared within the template itself
- **Variable propagation**: Variables are automatically passed to inherited templates
- **Simplified usage**: Single method call handles complex template hierarchies
- **Multi-level inheritance**: Support for deep inheritance hierarchies (A inherits B, B inherits C, etc.)
- **Circular inheritance protection**: Automatic detection and prevention of circular inheritance loops

## Example

Before (manual approach):
```typescript
builder.addStep({ from: templatePath('react-common') });
builder.addStep({ 
  from: templatePath('react-app-ts'),
  variables: { appName: 'my-app' }
});
```

After (with inheritance):
```typescript
builder.loadTemplate(templatePath('react-app-ts'), {
  variables: { appName: 'my-app' }
});
```

The inheritance is automatically handled by the `<inherit:react-common>` file in the `template-react-app-ts` directory.

### Recursive Inheritance Example

Suppose you have a multi-level inheritance chain:

```
template-specific/
├── <inherit:template-common>  # Inherits from template-common
├── specific-file.js
└── ...

template-common/
├── <inherit:template-base>     # Inherits from template-base
├── common-file.js
└── ...

template-base/
├── base-file.js
└── ...
```

When loading `template-specific`:

1. **First level**: Processes `<inherit:template-common>`
2. **Second level**: Recursively processes `<inherit:template-base>` from template-common
3. **Execution order**: 
   - Loads `template-base` files (base-file.js)
   - Loads `template-common` files (common-file.js)
   - Loads `template-specific` files (specific-file.js)

The final project contains files from all three templates, with deeper inheritance levels loaded first.

### Circular Inheritance Protection

If templates have circular inheritance (A → B → A), the system automatically detects this and prevents infinite loops:

```
template-a/
├── <inherit:template-b>
└── file-a.js

template-b/
├── <inherit:template-a>  # Circular reference!
└── file-b.js
```

The system will log a warning and break the cycle, ensuring both templates are still processed once.