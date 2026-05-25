buildscript {
    repositories {
        google()
        mavenCentral()
    }
    dependencies {
        classpath("org.lynxsdk.lynx:lynx-extension-plugin:4.0.0-nightly.202605250621.39.g48546c5d")
    }
}

// Top-level build file where you can add configuration options common to all sub-projects/modules.
plugins {
    alias(libs.plugins.android.application) apply false
    alias(libs.plugins.jetbrains.kotlin.android) apply false
    alias(libs.plugins.android.library) apply false
    alias(libs.plugins.jetbrains.kotlin.jvm) apply false
}
