plugins {
    id("com.android.application") version "9.1.0"
}

android {
    namespace = "ec.edu.campus.tareas.docker"
    compileSdk = 35

    defaultConfig {
        applicationId = "ec.edu.campus.tareas.docker"
        minSdk = 26
        targetSdk = 34
    }

    buildFeatures {
        buildConfig = true
    }

    buildTypes {
        debug {
            buildConfigField("String", "API_URL", "\"http://10.0.2.2:8080/v1/\"")
        }
    }
}

dependencies {
    debugImplementation("com.squareup.retrofit2:retrofit:2.11.0")
    debugImplementation("com.squareup.retrofit2:converter-gson:2.11.0")
    debugImplementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.8.1")
}
