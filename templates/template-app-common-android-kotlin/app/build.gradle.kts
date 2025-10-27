import com.squareup.kotlinpoet.*
import com.squareup.kotlinpoet.ParameterizedTypeName.Companion.parameterizedBy
import com.squareup.kotlinpoet.WildcardTypeName
import java.io.File
import java.security.MessageDigest

fun generateExtensionRegistryFile(projects: List<Project>, projectDir: File) {
    if (projects.isEmpty()) return
    
    // Extract package names from all projects
    val projectInfos = projects.map { proj ->
        val packageName = proj.extensions.findByType<com.android.build.api.dsl.LibraryExtension>()?.namespace
            ?: throw GradleException("Could not extract package name for project: $proj")
        ProjectInfo(proj, packageName)
    }
    
    // All projects have ExtensionRegistry by default

    val behaviorClassName = ClassName("com.lynx.tasm.behavior", "Behavior")
    val lynxViewBuilderClassName = ClassName("com.lynx.tasm", "LynxViewBuilder")
    val listClassName = ClassName("kotlin.collections", "List")
    val arrayListClassName = ClassName("java.util", "ArrayList")
    val iServiceProviderClassName = ClassName("com.lynx.tasm.service", "IServiceProvider")
    val lynxServiceCenterClassName = ClassName("com.lynx.tasm.service", "LynxServiceCenter")
    val booleanClassName = ClassName("kotlin", "Boolean")

    val objectBuilder = TypeSpec.objectBuilder("ExtensionRegistry")

    val mapClassName = ClassName("kotlin.collections", "Map")
    val stringClassName = ClassName("kotlin", "String")
    val classClassName = ClassName("java.lang", "Class")
    val lynxModuleClassName = ClassName("com.lynx.jsbridge", "LynxModule")
    
    // Add properties directly to the object
    objectBuilder
        .addProperty(
            PropertySpec.builder("sCacheBehaviors", listClassName.parameterizedBy(behaviorClassName).copy(nullable = true))
                .addModifiers(KModifier.PRIVATE)
                .mutable(true)
                .initializer("null")
                .addAnnotation(Volatile::class)
                .build()
        )
        .addProperty(
            PropertySpec.builder("sCacheModules", mapClassName.parameterizedBy(stringClassName, classClassName.parameterizedBy(WildcardTypeName.producerOf(lynxModuleClassName))).copy(nullable = true))
                .addModifiers(KModifier.PRIVATE)
                .mutable(true)
                .initializer("null")
                .addAnnotation(Volatile::class)
                .build()
        )
        .addProperty(
            PropertySpec.builder("servicesRegistered", booleanClassName)
                .addModifiers(KModifier.PRIVATE)
                .mutable(true)
                .initializer("false")
                .addAnnotation(Volatile::class)
                .build()
        )

    // Create registerServicesIfNeeded method
    val registerServicesIfNeededFunBuilder = FunSpec.builder("registerServicesIfNeeded")
        .beginControlFlow("if (!servicesRegistered)")
        .addStatement("registerServices()")
        .addStatement("servicesRegistered = true")
        .endControlFlow()
    
    objectBuilder.addFunction(registerServicesIfNeededFunBuilder.build())
    
    // Create registerServices method
    val registerServicesFunBuilder = FunSpec.builder("registerServices")
        .addModifiers(KModifier.PRIVATE)
    
    if (projectInfos.isNotEmpty()) {
        projectInfos.forEachIndexed { index, projectInfo ->
            val registryAlias = "ExtensionProvider${index + 1}"
            registerServicesFunBuilder.addStatement("var services = %L.getServices()", registryAlias)
            registerServicesFunBuilder.beginControlFlow("services.forEach { (clazz, instance) ->")
            registerServicesFunBuilder.beginControlFlow("if (instance is %T)", iServiceProviderClassName)
            registerServicesFunBuilder.addStatement("%T.inst().registerService(instance)", lynxServiceCenterClassName)
            registerServicesFunBuilder.endControlFlow()
            registerServicesFunBuilder.endControlFlow()
        }
    }
    
    objectBuilder.addFunction(registerServicesFunBuilder.build())

    // Create applyTo method
    val applyToFunBuilder = FunSpec.builder("applyTo")
        .addParameter("viewBuilder", lynxViewBuilderClassName)
        .returns(lynxViewBuilderClassName)
        .addStatement("registerServicesIfNeeded()")
        .addComment("Register all behaviors")
        .beginControlFlow("synchronized(this)")
        .beginControlFlow("if (sCacheBehaviors == null || sCacheBehaviors!!.isEmpty())")
        .addStatement("val behaviorList: MutableList<%T> = ArrayList()", behaviorClassName)

    // Process ExtensionRegistry projects
    if (projectInfos.isNotEmpty()) {
        projectInfos.forEachIndexed { index, projectInfo ->
            val registryAlias = "ExtensionProvider${index + 1}"
            val packageName = projectInfo.packageName
            val validPackageName = packageName.substringBeforeLast('.', "")
            val simpleName = packageName.substringAfterLast('.', packageName)
            if (validPackageName.isNotEmpty() && simpleName.isNotEmpty()) {
                try {
                    // Add behaviors from this project
                    applyToFunBuilder.addStatement("behaviorList.addAll(%L.getBehaviors())", registryAlias)
                } catch (e: IllegalArgumentException) {
                    println("ERROR: Invalid package name for ClassName: $packageName.ExtensionRegistry. Error: ${e.message}")
                }
            }
        }
    } else {
        applyToFunBuilder.addComment("No extension registry projects found")
    }

    applyToFunBuilder
        .addStatement("sCacheBehaviors = behaviorList")
        .endControlFlow()
        .addComment("Register behaviors to viewBuilder")
        .addStatement("viewBuilder.addBehaviors(sCacheBehaviors ?: emptyList())")
        .endControlFlow() // end synchronized
        .addComment("Register all modules")
        .beginControlFlow("synchronized(this)")
        .beginControlFlow("if (sCacheModules == null || sCacheModules!!.isEmpty())")
        .addStatement("val moduleMap: MutableMap<String, Class<out %T>> = mutableMapOf()", lynxModuleClassName)

    // Process modules from ExtensionRegistry projects
    if (projectInfos.isNotEmpty()) {
        projectInfos.forEachIndexed { index, projectInfo ->
            val registryAlias = "ExtensionProvider${index + 1}"
            val packageName = projectInfo.packageName
            val validPackageName = packageName.substringBeforeLast('.', "")
            if (validPackageName.isNotEmpty()) {
                try {
                    val projectHash = generateProjectHash(projectInfo.project.name)
                    applyToFunBuilder.addStatement("val modules${index + 1} = %L.getModules()", registryAlias)
                    applyToFunBuilder.beginControlFlow("modules${index + 1}.forEach { (key, value) ->")
                    applyToFunBuilder.addStatement("moduleMap[key + \"_${projectHash}\"] = value")
                    applyToFunBuilder.endControlFlow()
                } catch (e: IllegalArgumentException) {
                    println("ERROR: Invalid package name for ClassName: $packageName.ExtensionRegistry. Error: ${e.message}")
                }
            }
        }
    } else {
        applyToFunBuilder.addComment("No extension registry projects found for modules")
    }
    
    applyToFunBuilder
        .addStatement("sCacheModules = moduleMap")
        .endControlFlow()
        .addComment("Register modules to viewBuilder")
        .beginControlFlow("sCacheModules?.forEach { (key, value) ->")
        .addStatement("viewBuilder.registerModule(key, value)")
        .endControlFlow()
        .endControlFlow() // end synchronized

    applyToFunBuilder.addStatement("return viewBuilder")
    objectBuilder.addFunction(applyToFunBuilder.build())

    val generatedFilePackage = project.android.namespace + ".generated.extensions"
    val outputDir = File(projectDir, "src/main/kotlin")

    val fileBuilder = FileSpec.builder(generatedFilePackage, "ExtensionRegistry")
        .addType(objectBuilder.build())
        .addImport(behaviorClassName, "")
        .addImport(lynxViewBuilderClassName, "")
        .addImport(arrayListClassName, "")
        .addImport(iServiceProviderClassName, "")
        .addImport(lynxServiceCenterClassName, "")

    // Import statements for ExtensionRegistry classes
    projectInfos.forEachIndexed { index, projectInfo ->
        val registryAlias = "ExtensionProvider${index + 1}"
        val packageName = projectInfo.packageName
        val validPackageName = packageName.substringBeforeLast('.', "")
        val simpleName = packageName.substringAfterLast('.', packageName)
        if (validPackageName.isNotEmpty() && simpleName.isNotEmpty()) {
            try {
                val className = ClassName(validPackageName, "${simpleName}.ExtensionProvider")
                fileBuilder.addImport(className.packageName, className.simpleName)
                fileBuilder.addAliasedImport(className, registryAlias)
            } catch (e: IllegalArgumentException) {
                println("ERROR: Invalid package name for ClassName: $packageName.ExtensionRegistry. Error: ${e.message}")
            }
        }
    }

    try {
        val fileSpec = fileBuilder.build()
        fileSpec.writeTo(outputDir)
        val extensionRegistryProjectNames = projectInfos.map { it.project.name }.joinToString(", ")
        println("INFO: Generated ExtensionRegistry.kt for extension registry projects [$extensionRegistryProjectNames] in ${File(outputDir, fileSpec.packageName.replace('.', '/') + "/" + fileSpec.name + ".kt").absolutePath}")
    } catch (e: Exception) {
        println("ERROR: Failed to write generated file: ${e.message}\n${e.stackTraceToString()}")
    }
}

data class ProjectInfo(
    val project: Project,
    val packageName: String
)

fun generateProjectHash(projectName: String): String {
    println("Generate unique hash for the project name $projectName")
    val md5Bytes = MessageDigest.getInstance("MD5").digest(projectName.toByteArray())
    val hash = md5Bytes.joinToString("") { "%02x".format(it) }.substring(0, 8)
    return hash
}



plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.jetbrains.kotlin.android)
    kotlin("kapt")
}

android {
    namespace = "{{packageName}}"
    compileSdk = 34

    defaultConfig {
        applicationId = "{{packageName}}"
        minSdk = 24
        targetSdk = 34
        versionCode = 1
        versionName = "1.0"

        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
        vectorDrawables {
            useSupportLibrary = true
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro"
            )
        }
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_1_8
        targetCompatibility = JavaVersion.VERSION_1_8
    }
    kotlinOptions {
        jvmTarget = "1.8"
    }
    buildFeatures {
        compose = true
    }
    composeOptions {
        kotlinCompilerExtensionVersion = "1.5.13"
    }
    packaging {
        resources {
            excludes += "/META-INF/{AL2.0,LGPL2.1}"
        }
    }
    sourceSets {
        getByName("debug").java.srcDirs("src/debug/kotlin")
        getByName("release").java.srcDirs("src/release/kotlin")
    }
}

dependencies {

    implementation(libs.androidx.core.ktx)
    implementation(libs.androidx.lifecycle.runtime.ktx)
    implementation(libs.androidx.activity.compose)
    implementation(platform(libs.androidx.compose.bom))
    implementation(libs.androidx.ui)
    implementation(libs.androidx.ui.graphics)
    implementation(libs.androidx.ui.tooling.preview)
    implementation(libs.androidx.material3)
    testImplementation(libs.junit)
    androidTestImplementation(libs.androidx.junit)
    androidTestImplementation(libs.androidx.espresso.core)
    androidTestImplementation(platform(libs.androidx.compose.bom))
    androidTestImplementation(libs.androidx.ui.test.junit4)
    debugImplementation(libs.androidx.ui.tooling)
    debugImplementation(libs.androidx.ui.test.manifest)

    // lynx dependencies
    implementation("org.lynxsdk.lynx:lynx:3.2.0")
    implementation("org.lynxsdk.lynx:lynx-jssdk:3.2.0")
    implementation("org.lynxsdk.lynx:lynx-trace:3.2.0")
    implementation("org.lynxsdk.lynx:primjs:2.12.0")

    // integrating image-service
    implementation("org.lynxsdk.lynx:lynx-service-image:3.2.0")

    // image-service dependencies, if not added, images cannot be loaded; if the host APP needs to use other image libraries, you can customize the image-service and remove this dependency
    implementation("com.facebook.fresco:fresco:2.3.0")
    implementation("com.facebook.fresco:animated-gif:2.3.0")
    implementation("com.facebook.fresco:animated-webp:2.3.0")
    implementation("com.facebook.fresco:webpsupport:2.3.0")
    implementation("com.facebook.fresco:animated-base:2.3.0")

    // integrating log-service
    implementation("org.lynxsdk.lynx:lynx-service-log:3.2.0")

    // integrating http-service
    implementation("org.lynxsdk.lynx:lynx-service-http:3.2.0")

    implementation("com.squareup.okhttp3:okhttp:4.9.0")

    // add devtool's dependencies
    debugImplementation ("org.lynxsdk.lynx:lynx-devtool:3.2.0")
    debugImplementation ("org.lynxsdk.lynx:lynx-service-devtool:3.2.0")

    // third-party dependencies
    debugImplementation("com.squareup.retrofit2:retrofit:2.7.0")

    // Native Module Processor
    kapt(project(":native-module-processor"))
    implementation(project(":native-module-processor"))

    (gradle.extra["lynxPackages"] as List<*>).forEach { pkg ->
        implementation(project(pkg as String))
    }
}

tasks.register("generateExtensionRegistry") {
    group = "generation"
    description = "Generates ExtensionRegistry.kt based on lepo projects in node_modules."

    doLast {
        val projects = (gradle.extra["lynxPackages"] as List<*>).map { pkg ->
            project(pkg as String)
        }
        if (projects.isNotEmpty()) {
            generateExtensionRegistryFile(projects, project.projectDir)
        }
    }
}

tasks.named("preBuild") {
    dependsOn(tasks.named("generateExtensionRegistry"))
}