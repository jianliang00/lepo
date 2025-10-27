# Native Module Processor

This is an annotation processor for handling Lynx Native Module annotations.

## Features

1. Parse all classes annotated with `@LynxNativeModule(name="xxx")`
2. Generate a `ModuleGenerator` class containing a `getModules()` method that returns an array of all native module classes

## Usage

### 1. Add Annotation

Add the `@LynxNativeModule` annotation to your Native Module class:

```kotlin
@LynxNativeModule(name = "MyModule")
class MyModule : LynxModule() {
    override fun getName(): String {
        return "MyModule"
    }
    
    // Your module methods
}
```

### 2. Extend LynxModule

Ensure your class extends `com.lynx.jsbridge.LynxModule`:

```kotlin
import com.lynx.jsbridge.LynxModule

@LynxNativeModule(name = "MyModule")
class MyModule : LynxModule() {
    // Implementation
}
```

### 3. Build Project

After building the project, the annotation processor will automatically generate the `ModuleGenerator` class:

```kotlin
// Generated code is located in the com.example.generated package
class ModuleGenerator {
    fun getModules(): Array<Class<*>> {
        return arrayOf(
            MyModule::class.java,
            // Other modules...
        )
    }
}
```

### 4. Use Generated Code

```kotlin
val generator = ModuleGenerator()
val modules = generator.getModules()
// Use module array
```

## Project Structure

```
src/main/java/com/example/nativemoduleprocessor/
├── LynxNativeModule.kt          # Annotation definition
├── NativeModuleProcessor.kt     # Annotation processor implementation
├── ExampleModule.kt             # Example module
└── LynxModule.kt                # Base class (example)

src/main/resources/META-INF/services/
└── javax.annotation.processing.Processor  # Service configuration
```

## Dependencies

- `com.google.auto.service:auto-service:1.0.1` - Automatic service registration
- `com.squareup:kotlinpoet:1.14.2` - Kotlin code generation

## Notes

1. Annotated classes must extend `com.lynx.jsbridge.LynxModule`
2. The annotation processor will validate class inheritance at compile time
3. The generated `ModuleGenerator` class is located in the `com.example.generated` package
4. If no annotated classes are found, the `ModuleGenerator` class will not be generated