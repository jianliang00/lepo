package com.lepo

import org.gradle.api.GradleException
import org.gradle.api.Plugin
import org.gradle.api.Project
import org.gradle.kotlin.dsl.dependencies
import org.gradle.kotlin.dsl.extra
import org.gradle.kotlin.dsl.findByType
import org.gradle.kotlin.dsl.project
import java.io.File
import com.squareup.kotlinpoet.*
import com.squareup.kotlinpoet.ParameterizedTypeName.Companion.parameterizedBy
import com.android.build.api.dsl.LibraryExtension

open class ProjectPlugin : Plugin<Project> {

    fun getComponentPackageNames(target: Project): List<String> {
        val packageNames = mutableListOf<String>()
        (target.gradle.extra["lepoComponents"] as List<*>).forEach {
            val component = target.project(it as String)
            component.extensions.findByType<com.android.build.api.dsl.LibraryExtension>()?.let { android ->
                val packageName = android.namespace
                if (packageName != null) {
                    packageNames.add(packageName)
                } else {
                    throw GradleException("Could not extract package name for component: $component")
                }
            }
        }
        return packageNames
    }

    fun generateBehaviorBundleFile(packageNames: List<String>, projectDir: File) {
        if (packageNames.isEmpty()) return

        val behaviorClassName = ClassName("com.lynx.tasm.behavior", "Behavior")
        val behaviorBundleClassName = ClassName("com.lynx.tasm.behavior", "BehaviorBundle")
        val listClassName = ClassName("kotlin.collections", "List")
        val arrayListClassName = ClassName("java.util", "ArrayList")

        val classBuilder = TypeSpec.classBuilder("LepoBehaviors")
            .addSuperinterface(behaviorBundleClassName)

        val companionObjectBuilder = TypeSpec.companionObjectBuilder()
            .addProperty(
                PropertySpec.builder("sCacheBehaviors", listClassName.parameterizedBy(behaviorClassName).copy(nullable = true))
                    .addModifiers(KModifier.PRIVATE)
                    .mutable(true)
                    .initializer("null")
                    .addAnnotation(Volatile::class)
                    .build()
            )
        classBuilder.addType(companionObjectBuilder.build())

        val createFunBuilder = FunSpec.builder("create")
            .addModifiers(KModifier.OVERRIDE)
            .returns(listClassName.parameterizedBy(behaviorClassName))
            .beginControlFlow("synchronized(LepoBehaviors::class.java)")
            .beginControlFlow("if (sCacheBehaviors != null && sCacheBehaviors!!.isNotEmpty())")
            .addStatement("return ArrayList(sCacheBehaviors!!)")
            .endControlFlow()
            .addStatement("val list: MutableList<%T> = ArrayList()", behaviorClassName)

        packageNames.forEachIndexed { index, packageName ->
            val generatorAlias = "BehaviorGenerator${index + 1}"
            val validPackageName = packageName.substringBeforeLast('.', "")
            val simpleName = packageName.substringAfterLast('.', packageName)
            if (validPackageName.isNotEmpty() && simpleName.isNotEmpty()) {
                try {
                    // val behaviorGeneratorClassName = ClassName(validPackageName, "${simpleName}.BehaviorGenerator")
                    createFunBuilder.addStatement("list.addAll(%L.getBehaviors())", generatorAlias)
                } catch (e: IllegalArgumentException) {
                    println("ERROR: Invalid package name for ClassName: $packageName.BehaviorGenerator. Error: ${e.message}")
                }
            }
        }

        createFunBuilder
            .addStatement("sCacheBehaviors = list")
            .addStatement("return ArrayList(list)")
            .endControlFlow() // end synchronized

        classBuilder.addFunction(createFunBuilder.build())

        val generatedFilePackage = "com.example.generated.behaviors"
        // Output directory: behavior-processor/src/main/kotlin/com/example/generated/behaviors
        val outputDir = File(projectDir, "src/main/kotlin")

        val fileBuilder = FileSpec.builder(generatedFilePackage, "LepoBehaviors")
            .addType(classBuilder.build())
            .addImport(behaviorClassName, "")
            .addImport(behaviorBundleClassName, "")
            .addImport(arrayListClassName, "")

        packageNames.forEachIndexed { index, packageName ->
            val generatorAlias = "BehaviorGenerator${index + 1}"
            val validPackageName = packageName.substringBeforeLast('.', "")
            val simpleName = packageName.substringAfterLast('.', packageName)
            if (validPackageName.isNotEmpty() && simpleName.isNotEmpty()) {
                try {
                    fileBuilder.addAliasedImport(ClassName(packageName, "BehaviorGenerator"), generatorAlias)
                } catch (e: IllegalArgumentException) {
                    // Already logged
                }
            }
        }

        try {
            val fileSpec = fileBuilder.build()
            fileSpec.writeTo(outputDir)
            println("INFO: Generated LepoBehaviors.kt in ${File(outputDir, fileSpec.packageName.replace('.', '/') + "/" + fileSpec.name + ".kt").absolutePath}")
        } catch (e: Exception) {
            println("ERROR: Failed to write generated file: ${e.message}\n${e.stackTraceToString()}")
        }
    }

    override fun apply(target: Project) {
        target.dependencies {
            (target.gradle.extra["lepoComponents"] as? List<*>)?.forEach {
                add("implementation", project(it as String))
            }
        }

        target.tasks.register("generateBehaviorBundle") {
            group = "generation"
            description = "Generates LepoBehaviors.kt based on lepo components in node_modules."

            doLast {
                val componentPackageNames = getComponentPackageNames(project)
                if (componentPackageNames.isNotEmpty()) {
                    generateBehaviorBundleFile(componentPackageNames, project.projectDir)
                }
            }
        }

        target.tasks.named("preBuild") {
            dependsOn(target.tasks.named("generateBehaviorBundle"))
        }
    }
}