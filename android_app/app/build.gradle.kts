plugins {
    alias(libs.plugins.android.application)
}

android {
    namespace = "com.dairygoat.ration"
    compileSdk = 36

    defaultConfig {
        applicationId = "com.dairygoat.ration"
        minSdk = 24
        targetSdk = 36
        versionCode = 1
        versionName = "1.0.0"
    }

    signingConfigs {
        create("release") {
            storeFile = file("release-key.jks")
            storePassword = "dairygoatration"
            keyAlias = "dairygoat"
            keyPassword = "dairygoatration"
            enableV1Signing = true
            enableV2Signing = true
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            signingConfig = signingConfigs.getByName("release")
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
        }
        debug {
            signingConfig = signingConfigs.getByName("release")
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    buildFeatures {
        compose = false
    }

    packaging {
        resources {
            excludes += "/META-INF/{AL2.0,LGPL2.1}"
        }
    }
}

dependencies {
    implementation(libs.androidx.core.ktx)
    implementation("androidx.webkit:webkit:1.12.1")
    implementation("androidx.activity:activity:1.9.2")
}
