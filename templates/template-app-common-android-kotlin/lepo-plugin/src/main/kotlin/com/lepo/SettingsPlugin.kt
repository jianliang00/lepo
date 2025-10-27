package com.lepo

import org.gradle.api.Plugin
import org.gradle.api.initialization.Settings
import java.io.File
import kotlinx.serialization.Contextual
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.gradle.kotlin.dsl.extra

const val DEFAULT_CONFIG_FILE = "lynx.ext.json"

@Serializable
data class PlatformConfig(val android: Map<String, @Contextual Any> = emptyMap())

@Serializable
data class LepoConfig(
    val platforms: PlatformConfig,
    val precommands: List<String> = emptyList()
)


open class SettingsPlugin : Plugin<Settings> {
    private val json = Json { ignoreUnknownKeys = true }

    private fun tryLoadConfig(moduleDir: File): LepoConfig? {
        if (!moduleDir.isDirectory) return null

        val hasAndroidDir = File(moduleDir, "android").isDirectory
        if (!hasAndroidDir) {
            return null
        }

        val configFile = File(moduleDir, DEFAULT_CONFIG_FILE)
        if (!configFile.exists()) {
            return null
        }
        println("Configure file found in path $configFile")

        return try {
            val config = json.decodeFromString<LepoConfig>(configFile.readText())
            // Check if android platform is configured
            if (config.platforms.android.isNotEmpty() || hasAndroidDir) {
                config
            } else {
                null
            }
        } catch (e: Exception) {
            println("Error parsing config file: $e")
            null
        }
    }

    private fun getPackageName(packageJsonFile: File): String? {
        return try {
            val packageJson = json.parseToJsonElement(packageJsonFile.readText()).jsonObject
            packageJson["name"]?.jsonPrimitive?.content
        } catch (e: Exception) {
            println("Error parsing package.json: $e")
            null
        }
    }

    private fun searchModulesRecursively(dir: File, autoLinkedModules: MutableList<String>, settings: Settings) {
        if (!dir.isDirectory) return

        val packageJsonFile = File(dir, "package.json")
        if (packageJsonFile.exists()) {
            // If current directory has package.json, try to load config
            val moduleConfig = tryLoadConfig(dir)
            if (moduleConfig != null) {
                // Get module name from package.json
                val packageName = getPackageName(packageJsonFile)
                if (packageName != null) {
                    val sanitizedName = packageName.replace(Regex("[/\\\\:<>\"?*|]"), "-")
                    val moduleName = ":$sanitizedName"
                    settings.include(moduleName)
                    settings.project(moduleName).projectDir = File(dir, "android")
                    autoLinkedModules.add(moduleName)
                }
            }
        } else {
            // If no package.json, traverse subdirectories to continue searching
            dir.listFiles()?.forEach { subDir ->
                if (subDir.isDirectory) {
                    searchModulesRecursively(subDir, autoLinkedModules, settings)
                }
            }
        }
    }

    override fun apply(settings: Settings) {
        val autoLinkedModules = mutableListOf<String>()
        val modulesDir = settings.rootProject.projectDir.resolve("..").resolve("node_modules")
        println("Searching modules in directory $modulesDir")


        modulesDir.listFiles()?.forEach { file ->
            searchModulesRecursively(file, autoLinkedModules, settings)
        }
        settings.gradle.extra.set("lynxPackages", autoLinkedModules)

        println("Auto linked modules: $autoLinkedModules")
    }
}