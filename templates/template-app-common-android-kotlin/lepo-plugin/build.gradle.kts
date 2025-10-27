plugins {
    `kotlin-dsl`
    `java-gradle-plugin`
    kotlin("plugin.serialization") version "1.9.0"
}

dependencies {
    implementation("org.jetbrains.kotlinx:kotlinx-serialization-json:1.6.3")
    implementation ("com.squareup:kotlinpoet:1.10.2")
}

gradlePlugin {
    plugins {
        create("Lepo") {
            id = "com.lepo"
            implementationClass = "com.lepo.LepoPlugin"
        }
    }
}