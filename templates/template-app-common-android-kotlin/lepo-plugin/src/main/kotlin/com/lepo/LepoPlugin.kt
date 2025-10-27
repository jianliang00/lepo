package com.lepo

import org.gradle.api.Plugin
import org.gradle.api.initialization.Settings
import org.gradle.api.Project


open class LepoPlugin : Plugin<Any> {

    override fun apply(target: Any) {
        when (target) {
            is Settings -> SettingsPlugin().apply(target)
            else -> throw IllegalArgumentException("Plugin can only be applied to Settings or Project")
        }
    }
}