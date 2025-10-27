package com.lepo.nativemoduleprocessor

/**
 * Annotation to mark classes as Lynx Native Modules
 * @param name The name of the native module
 */
@Target(AnnotationTarget.CLASS)
@Retention(AnnotationRetention.SOURCE)
annotation class LynxNativeModule(val name: String)