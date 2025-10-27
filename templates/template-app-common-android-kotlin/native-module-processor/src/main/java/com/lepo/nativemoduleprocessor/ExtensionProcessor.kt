package com.lepo.nativemoduleprocessor

import com.google.auto.service.AutoService
import com.squareup.kotlinpoet.*
import com.squareup.kotlinpoet.ParameterizedTypeName.Companion.parameterizedBy
import java.io.File
import javax.annotation.processing.*
import javax.lang.model.SourceVersion
import javax.lang.model.element.TypeElement
import javax.lang.model.type.TypeMirror
import javax.tools.Diagnostic

@AutoService(Processor::class)
@SupportedAnnotationTypes(
    "com.lepo.nativemoduleprocessor.LynxNativeUI",
    "com.lepo.nativemoduleprocessor.LynxNativeUIs",
    "com.lepo.nativemoduleprocessor.LynxNativeModule",
    "com.lepo.nativemoduleprocessor.LynxService"
)
@SupportedSourceVersion(SourceVersion.RELEASE_11)
class ExtensionProcessor : AbstractProcessor() {

    private val uiClasses = mutableMapOf<String, MutableList<UIInfo>>()
    private val moduleClasses = mutableMapOf<String, MutableList<ModuleInfo>>()
    private val serviceClasses = mutableMapOf<String, MutableList<ServiceInfo>>()

    data class UIInfo(
        val className: String,
        val uiName: String,
        val packageName: String
    )

    data class ModuleInfo(
        val className: String,
        val moduleName: String,
        val packageName: String
    )

    data class ServiceInfo(
        val className: String,
        val interfaceType: String,
        val packageName: String
    )

    override fun process(annotations: MutableSet<out TypeElement>?, roundEnv: RoundEnvironment?): Boolean {
        if (roundEnv == null) return false

        // Clear previous round data
        uiClasses.clear()
        moduleClasses.clear()
        serviceClasses.clear()

        // Process @LynxNativeUI annotations
        processLynxNativeUI(roundEnv)

        // Process @LynxNativeModule annotations
        processLynxNativeModule(roundEnv)

        // Process @LynxService annotations
        processLynxService(roundEnv)

        // Generate ExtensionProvider class if we have any extensions
        val allPackages = (uiClasses.keys + moduleClasses.keys + serviceClasses.keys).toSet()
        if (allPackages.isNotEmpty()) {
            allPackages.forEach { packageName ->
                generateExtensionProvider(packageName)
            }
        }

        return true
    }

    private fun processLynxNativeUI(roundEnv: RoundEnvironment) {
        // Process both single annotations and container annotations
        val singleAnnotatedElements = roundEnv.getElementsAnnotatedWith(LynxNativeUI::class.java)
        val containerAnnotatedElements = roundEnv.getElementsAnnotatedWith(LynxNativeUIs::class.java)
        
        val allElements = (singleAnnotatedElements + containerAnnotatedElements).toSet()

        for (element in allElements) {
            if (element !is TypeElement) {
                processingEnv.messager.printMessage(
                    Diagnostic.Kind.ERROR,
                    "@LynxNativeUI can only be applied to classes",
                    element
                )
                continue
            }

            // Check if the class extends LynxUI
            if (!isLynxUI(element)) {
                processingEnv.messager.printMessage(
                    Diagnostic.Kind.ERROR,
                    "@LynxNativeUI can only be applied to classes that extend LynxUI",
                    element
                )
                continue
            }

            val className = element.simpleName.toString()
            val packageName = processingEnv.elementUtils.getPackageOf(element).qualifiedName.toString()
            val uiList = uiClasses.getOrPut(packageName) { mutableListOf() }

            // Get all LynxNativeUI annotations (both single and from container)
            val annotations = mutableListOf<LynxNativeUI>()
            
            // Add single annotation if present
            element.getAnnotation(LynxNativeUI::class.java)?.let { annotations.add(it) }
            
            // Add annotations from container if present
            element.getAnnotation(LynxNativeUIs::class.java)?.let { container ->
                annotations.addAll(container.value)
            }

            // Process each annotation
            for (annotation in annotations) {
                val uiName = annotation.name

                // Check for duplicate UI names
                val existingUI = uiList.find { it.uiName == uiName }
                if (existingUI != null) {
                    processingEnv.messager.printMessage(
                        Diagnostic.Kind.ERROR,
                        "Duplicate UI name '$uiName' found. UI name must be unique. " +
                        "Already used by class ${existingUI.className} in package ${existingUI.packageName}",
                        element
                    )
                    continue
                }

                uiList.add(UIInfo(className, uiName, packageName))

                processingEnv.messager.printMessage(
                    Diagnostic.Kind.NOTE,
                    "Found native UI: $className with name: $uiName"
                )
            }
        }
    }

    private fun processLynxNativeModule(roundEnv: RoundEnvironment) {
        val annotatedElements = roundEnv.getElementsAnnotatedWith(LynxNativeModule::class.java)

        for (element in annotatedElements) {
            if (element !is TypeElement) {
                processingEnv.messager.printMessage(
                    Diagnostic.Kind.ERROR,
                    "@LynxNativeModule can only be applied to classes",
                    element
                )
                continue
            }

            val annotation = element.getAnnotation(LynxNativeModule::class.java)
            val moduleName = annotation.name
            val className = element.simpleName.toString()
            val packageName = processingEnv.elementUtils.getPackageOf(element).qualifiedName.toString()
            val moduleList = moduleClasses.getOrPut(packageName) { mutableListOf() }

            // Check for duplicate module names
            val existingModule = moduleList.find { it.moduleName == moduleName }
            if (existingModule != null) {
                processingEnv.messager.printMessage(
                    Diagnostic.Kind.ERROR,
                    "Duplicate module name '$moduleName' found. Module name must be unique. " +
                    "Already used by class ${existingModule.className} in package ${existingModule.packageName}",
                    element
                )
                continue
            }

            moduleList.add(ModuleInfo(className, moduleName, packageName))

            processingEnv.messager.printMessage(
                Diagnostic.Kind.NOTE,
                "Found native module: $className with name: $moduleName"
            )
        }
    }

    private fun processLynxService(roundEnv: RoundEnvironment) {
        val annotatedElements = roundEnv.getElementsAnnotatedWith(LynxService::class.java)

        for (element in annotatedElements) {
            if (element !is TypeElement) {
                processingEnv.messager.printMessage(
                    Diagnostic.Kind.ERROR,
                    "@LynxService can only be applied to classes",
                    element
                )
                continue
            }

            val className = element.simpleName.toString()
            val packageName = processingEnv.elementUtils.getPackageOf(element).qualifiedName.toString()
            val serviceList = serviceClasses.getOrPut(packageName) { mutableListOf() }

            // Get the first interface that this class implements
            val interfaceType = getFirstInterface(element)
            if (interfaceType == null) {
                processingEnv.messager.printMessage(
                    Diagnostic.Kind.ERROR,
                    "@LynxService annotated class $className must implement at least one interface",
                    element
                )
                continue
            }

            // Check for duplicate interface types
            val existingService = serviceList.find { it.interfaceType == interfaceType }
            if (existingService != null) {
                processingEnv.messager.printMessage(
                    Diagnostic.Kind.ERROR,
                    "Duplicate service for interface '$interfaceType' found. Interface type must be unique. " +
                    "Already used by class ${existingService.className} in package ${existingService.packageName}",
                    element
                )
                continue
            }

            serviceList.add(ServiceInfo(className, interfaceType, packageName))

            processingEnv.messager.printMessage(
                Diagnostic.Kind.NOTE,
                "Found service: $className implementing interface: $interfaceType"
            )
        }
    }

    private fun getFirstInterface(element: TypeElement): String? {
        val interfaces = element.interfaces
        if (interfaces.isNotEmpty()) {
            val interfaceElement = processingEnv.typeUtils.asElement(interfaces[0]) as? TypeElement
            return interfaceElement?.qualifiedName?.toString()
        }
        return null
    }

    private fun isLynxUI(element: TypeElement): Boolean {
        var superClass: TypeMirror? = element.superclass
        while (superClass != null) {
            val superElement = processingEnv.typeUtils.asElement(superClass) as? TypeElement
            if (superElement?.qualifiedName?.toString()?.startsWith("com.lynx.tasm.behavior.ui.LynxUI") == true) {
                return true
            }
            superClass = superElement?.superclass
        }
        return false
    }

    private fun generateExtensionProvider(packageName: String) {
        try {
            val uiList = uiClasses[packageName] ?: emptyList()
            val moduleList = moduleClasses[packageName] ?: emptyList()
            val serviceList = serviceClasses[packageName] ?: emptyList()
            val className = "ExtensionProvider"

            // Create the getBehaviors function
            val getBehaviorsFunction = FunSpec.builder("getBehaviors")
                .addAnnotation(JvmStatic::class)
                .returns(ClassName("kotlin.collections", "List").parameterizedBy(
                    ClassName("com.lynx.tasm.behavior", "Behavior")
                ))
                .addCode(buildCodeBlock {
                    add("val result = mutableListOf<%T>()\n", ClassName("com.lynx.tasm.behavior", "Behavior"))
                    uiList.forEach { uiInfo ->
                        add("result.add(object : %T(\"%L\", false, false) {\n", ClassName("com.lynx.tasm.behavior", "Behavior"), uiInfo.uiName)
                        indent()
                        add("override fun createUI(context: %T): %T {\n", ClassName("com.lynx.tasm.behavior", "LynxContext"), ClassName("com.lynx.tasm.behavior.ui", "LynxUI").parameterizedBy(STAR))
                        indent()
                        add("return %T(context)\n", ClassName(uiInfo.packageName, uiInfo.className))
                        unindent()
                        add("}\n")
                        unindent()
                        add("})\n")
                    }
                    add("return result\n")
                })
                .build()

            // Create the getModules function
            val getModulesFunction = FunSpec.builder("getModules")
                .addAnnotation(JvmStatic::class)
                .returns(ClassName("kotlin.collections", "Map").parameterizedBy(
                    ClassName("kotlin", "String"),
                    ClassName("java.lang", "Class").parameterizedBy(
                        WildcardTypeName.producerOf(ClassName("com.lynx.jsbridge", "LynxModule"))
                    )
                ))
                .addCode(buildCodeBlock {
                    add("return mapOf(\n")
                    indent()
                    moduleList.forEachIndexed { index, moduleInfo ->
                        add("\"%L\" to %T::class.java", moduleInfo.moduleName, ClassName(moduleInfo.packageName, moduleInfo.className))
                        if (index < moduleList.size - 1) {
                            add(",\n")
                        } else {
                            add("\n")
                        }
                    }
                    unindent()
                    add(")")
                })
                .build()

            // Create the getServices function
            val getServicesFunction = FunSpec.builder("getServices")
                .addAnnotation(JvmStatic::class)
                .returns(ClassName("kotlin.collections", "Map").parameterizedBy(
                    ClassName("java.lang", "Class").parameterizedBy(STAR),
                    ClassName("kotlin", "Any")
                ))
                .addCode(buildCodeBlock {
                    add("return mapOf(\n")
                    indent()
                    serviceList.forEachIndexed { index, serviceInfo ->
                        add("%T::class.java to %T", 
                            ClassName.bestGuess(serviceInfo.interfaceType), 
                            ClassName(serviceInfo.packageName, serviceInfo.className))
                        if (index < serviceList.size - 1) {
                            add(",\n")
                        } else {
                            add("\n")
                        }
                    }
                    unindent()
                    add(")")
                })
                .build()

            // Create the object
            val extensionProviderObject = TypeSpec.objectBuilder(className)
                .addFunction(getBehaviorsFunction)
                .addFunction(getModulesFunction)
                .addFunction(getServicesFunction)
                .build()

            // Create the file
            val fileBuilder = FileSpec.builder(packageName, className)
                .addType(extensionProviderObject)
                .addFileComment("Generated by ExtensionProcessor")
                .addImport("com.lynx.tasm.behavior", "Behavior")
                .addImport("com.lynx.tasm.behavior", "LynxContext")
                .addImport("com.lynx.tasm.behavior.ui", "LynxUI")
            
            // Add imports for service classes
            serviceList.forEach { serviceInfo ->
                fileBuilder.addImport(serviceInfo.packageName, serviceInfo.className)
            }
            
            val file = fileBuilder.build()

            // Write to file
            val kaptKotlinGeneratedDir = processingEnv.options["kapt.kotlin.generated"]
            if (kaptKotlinGeneratedDir != null) {
                file.writeTo(File(kaptKotlinGeneratedDir))
            } else {
                file.writeTo(processingEnv.filer)
            }

            processingEnv.messager.printMessage(
                Diagnostic.Kind.NOTE,
                "Generated ExtensionProvider with ${uiList.size} UIs, ${moduleList.size} modules and ${serviceList.size} services"
            )

        } catch (e: Exception) {
            processingEnv.messager.printMessage(
                Diagnostic.Kind.ERROR,
                "Failed to generate ExtensionProvider: ${e.message}"
            )
        }
    }
}