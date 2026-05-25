Lepo
=================

Lepo (short for “Lynx Explorer”) is a CLI tool for developing Lynx-based cross-platform applications and native extension packages. Generated native app templates use Lynx Native Autolink so Android and iOS extension packages can be discovered from `node_modules` through `lynx.ext.json`.

## Usage
### Install CLI
```
npm install -g @lepojs/lepo-cli
```

### Application Development
#### Create a New Application Project
```
lepo create app my-app
```

#### Build and Run the Application
```
cd my-app
lepo run <android | ios> # e.g. lepo run android
```

### Extension Development

#### Create a New Extension Project
```
lepo create extension my-extension
```

#### Codegen

Run codegen to generate native module specification.
```
lepo codegen
```

Extension package templates use `@lynx-js/autolink-codegen@0.1.0`. The standalone Lynx extension scaffold is available as `create-lynx-extension@0.1.0`.

## Development
Run the CLI in development mode.
```
./bin/dev.js
```

Build the CLI.
```
npm run build
```

## License
Lepo is Apache licensed, as found in the [LICENSE](LICENSE) file.
