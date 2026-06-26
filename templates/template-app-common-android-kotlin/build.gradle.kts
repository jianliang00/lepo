buildscript {
    repositories {
        google()
        mavenCentral()
    }
    dependencies {
        classpath("org.lynxsdk.lynx:lynx-library-plugin:4.0.0-nightly.202605290633.50.g83209393")
    }
}

// Top-level build file where you can add configuration options common to all sub-projects/modules.
plugins {
    alias(libs.plugins.android.application) apply false
    alias(libs.plugins.jetbrains.kotlin.android) apply false
    alias(libs.plugins.android.library) apply false
    alias(libs.plugins.jetbrains.kotlin.jvm) apply false
}
