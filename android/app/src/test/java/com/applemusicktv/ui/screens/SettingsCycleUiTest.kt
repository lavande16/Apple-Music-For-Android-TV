package com.applemusicktv.ui.screens

import android.app.Application
import androidx.activity.ComponentActivity
import androidx.compose.ui.test.*
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import com.applemusicktv.i18n.AppLanguage
import com.applemusicktv.i18n.LanguageChoice
import com.applemusicktv.ui.theme.AppPalette
import org.junit.After
import org.junit.Assert.*
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode

@RunWith(RobolectricTestRunner::class)
@Config(sdk=[28], application=Application::class, qualifiers="w960dp-h540dp-land-mdpi")
@GraphicsMode(GraphicsMode.Mode.NATIVE)
class SettingsCycleUiTest {
    @get:Rule val compose = createAndroidComposeRule<ComponentActivity>()
    @Before fun setup() { AppLanguage.initialize(compose.activity); AppLanguage.select(LanguageChoice.Chinese); AppPalette.setDark(compose.activity, false) }
    @After fun cleanup() { AppLanguage.select(LanguageChoice.System); AppPalette.setDark(compose.activity, false) }
    @Test fun appearanceBothButtonsAlwaysToggle() {
        compose.setContent { AppearanceSettingsSection() }
        for (button in listOf("+", "+", "−", "−")) {
            val before = AppPalette.isDark
            compose.onNodeWithText(button).assertIsEnabled().performClick()
            compose.runOnIdle { assertEquals(!before, AppPalette.isDark) }
        }
    }
    @Test fun languageWrapsInBothDirections() {
        compose.setContent { LanguageSettingsSection() }
        compose.onNodeWithText("+").performClick()
        assertEquals(LanguageChoice.English, AppLanguage.choice)
        compose.onNodeWithText("+").performClick()
        assertEquals(LanguageChoice.System, AppLanguage.choice)
        compose.onNodeWithText("−").performClick()
        assertEquals(LanguageChoice.English, AppLanguage.choice)
        compose.onNodeWithText("−").performClick()
        assertEquals(LanguageChoice.Chinese, AppLanguage.choice)
        compose.onNodeWithText("−").performClick()
        assertEquals(LanguageChoice.System, AppLanguage.choice)
    }
}
