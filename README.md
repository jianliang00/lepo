Lepo
=================

Lepo (short for “Lynx Explorer”) is a CLI tool for developing Lynx‑based cross‑platform applications. It is a demo rather than a production‑ready tool, intended to showcase how the autolink framework described in RFC https://github.com/lynx-family/lynx/discussions/2653 works, as well as the workflow for developing cross‑platform applications with the JaveScript stack.

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