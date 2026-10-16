import java.util.Properties

plugins {
    id("com.android.application")
    // The Flutter Gradle Plugin must be applied after the Android and Kotlin Gradle plugins.
    id("dev.flutter.flutter-gradle-plugin")
}

// Firebase Cloud Messaging: google-services.json (per machine, git-ignored) from the Firebase console. Without it the
// app builds and runs without push notifications.
if (file("google-services.json").exists()) apply(plugin = "com.google.gms.google-services")

// Google Maps SDK key: MAPS_API_KEY in android/local.properties (git-ignored) or the MAPS_API_KEY
// environment variable. Empty by default so builds work without a key (the app then uses the
// flutter_map fallback as long as GOOGLE_MAPS_API_KEY is not passed to Dart either).
val localProperties = Properties().apply {
    val file = rootProject.file("local.properties")
    if (file.exists()) file.inputStream().use { load(it) }
}
// Also read from the repo's git-ignored .dart-defines.json (Flutter rewrites local.properties on build).
val dartDefinesMapsKey: String? = rootProject.file("../../../.dart-defines.json").takeIf { it.exists() }?.let {
    Regex("\"MAPS_API_KEY\"\\s*:\\s*\"([^\"]*)\"").find(it.readText())?.groupValues?.get(1)
}
val mapsApiKey: String =
    dartDefinesMapsKey?.takeIf { it.isNotBlank() }
        ?: localProperties.getProperty("MAPS_API_KEY")?.takeIf { it.isNotBlank() }
        ?: System.getenv("MAPS_API_KEY")
        ?: ""

// Google Play upload key: android/key.properties (git-ignored, see docs/play-store/README.md). Only app bundles
// (`flutter build appbundle`, what Google Play takes) are signed with it. APKs stay on the debug key, which the Maps
// key restriction and the WhatsApp autofill templates are tied to.
val keyProperties = Properties().apply {
    val file = rootProject.file("key.properties")
    if (file.exists()) file.inputStream().use { load(it) }
}
val hasUploadKey = keyProperties.getProperty("storeFile") != null
val buildingBundle = gradle.startParameter.taskNames.any { it.contains("bundle", ignoreCase = true) }

android {
    namespace = "com.tamiltaxi.passenger"
    compileSdk = flutter.compileSdkVersion
    ndkVersion = flutter.ndkVersion

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
        // flutter_local_notifications uses java.time APIs.
        isCoreLibraryDesugaringEnabled = true
    }

    defaultConfig {
        // TODO: Specify your own unique Application ID (https://developer.android.com/studio/build/application-id.html).
        applicationId = "com.tamiltaxi.passenger"
        // You can update the following values to match your application needs.
        // For more information, see: https://flutter.dev/to/review-gradle-config.
        // google_maps_flutter_android needs API 24+.
        minSdk = maxOf(flutter.minSdkVersion, 24)
        targetSdk = flutter.targetSdkVersion
        // Uses the version code from pubspec.yaml. When using split APKs, 1000 * ABI_VERSION
        // is added automatically by Flutter. (https://developer.android.com/studio/build/configure-apk-splits#configure-APK-versions)
        // You can force using the value of versionCode by specifying the `-P force-version-code-ignoring-abi=true`
        // flag during build.
        versionCode = flutter.versionCode
        versionName = flutter.versionName
        manifestPlaceholders["MAPS_API_KEY"] = mapsApiKey
    }

    signingConfigs {
        if (hasUploadKey) {
            create("upload") {
                storeFile = file(keyProperties.getProperty("storeFile"))
                storePassword = keyProperties.getProperty("storePassword")
                keyAlias = keyProperties.getProperty("keyAlias")
                keyPassword = keyProperties.getProperty("keyPassword")
            }
        }
    }

    buildTypes {
        release {
            // Debug keys for APKs, so `flutter run --release` and scripts/build_apks.sh work as before.
            signingConfig = signingConfigs.getByName(if (buildingBundle && hasUploadKey) "upload" else "debug")
        }
    }
}

kotlin {
    compilerOptions {
        jvmTarget = org.jetbrains.kotlin.gradle.dsl.JvmTarget.JVM_17
    }
}

flutter {
    source = "../.."
}

dependencies {
    coreLibraryDesugaring("com.android.tools:desugar_jdk_libs:2.1.5")
}
