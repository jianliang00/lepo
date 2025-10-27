package com.lepo.nativemoduleprocessor

/**
 * Container annotation for repeatable LynxNativeUI annotations
 */
@Target(AnnotationTarget.CLASS)
@Retention(AnnotationRetention.SOURCE)
annotation class LynxNativeUIs(val value: Array<LynxNativeUI>)

/**
 * Annotation to mark classes as Lynx Native UIs
 * @param name The name of the native module
 */
@Target(AnnotationTarget.CLASS)
@Retention(AnnotationRetention.SOURCE)
@JvmRepeatable(LynxNativeUIs::class)
annotation class LynxNativeUI(val name: String)