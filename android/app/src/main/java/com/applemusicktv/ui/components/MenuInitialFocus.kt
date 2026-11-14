package com.applemusicktv.ui.components

import androidx.compose.foundation.focusGroup
import androidx.compose.foundation.gestures.awaitEachGesture
import androidx.compose.foundation.gestures.awaitFirstDown
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.input.InputMode
import androidx.compose.ui.input.key.*
import androidx.compose.ui.input.pointer.PointerEventPass
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.onGloballyPositioned
import androidx.compose.ui.platform.LocalInputModeManager
import androidx.compose.ui.platform.LocalWindowInfo
import androidx.compose.ui.platform.LocalView
import android.view.ViewTreeObserver

internal val LocalMenuOpeningInputMode = compositionLocalOf<InputMode?> { null }

/** One initial focus handoff per open menu; user navigation always wins. */
@Composable
internal fun Modifier.menuInitialFocus(target: FocusRequester?, enabled: Boolean = true,
    targetAvailable: Boolean = true, waitForWindowFocus: Boolean = true,
    useNativePopupFocus: Boolean = false, openingMode: InputMode? = null): Modifier {
    val interactive = LocalMotionInteractive.current
    val mode = openingMode ?: LocalMenuOpeningInputMode.current ?: LocalInputModeManager.current.inputMode
    val windowFocused = LocalWindowInfo.current.isWindowFocused
    val view = LocalView.current
    var nativeWindowFocused by remember(view) { mutableStateOf(view.hasWindowFocus()) }
    DisposableEffect(view, useNativePopupFocus) {
        val listener = ViewTreeObserver.OnWindowFocusChangeListener { focused ->
            nativeWindowFocused = focused
            if (useNativePopupFocus) android.util.Log.i("LyricsFocus", "popup window focus=$focused")
        }
        if (useNativePopupFocus) {
            view.viewTreeObserver.addOnWindowFocusChangeListener(listener)
            nativeWindowFocused = view.hasWindowFocus()
        }
        onDispose {
            if (useNativePopupFocus && view.viewTreeObserver.isAlive) view.viewTreeObserver.removeOnWindowFocusChangeListener(listener)
        }
    }
    val focusReady = if (useNativePopupFocus) nativeWindowFocused else (!waitForWindowFocus || windowFocused)
    var placed by remember { mutableStateOf(false) }
    var stopped by remember { mutableStateOf(false) }
    LaunchedEffect(enabled) { if (!enabled) stopped = false }
    LaunchedEffect(target, enabled, interactive, targetAvailable, mode, focusReady, placed, stopped, useNativePopupFocus) {
        if (useNativePopupFocus && enabled && placed) android.util.Log.i("LyricsFocus", "initial mode=$mode nativeWindow=$nativeWindowFocused stopped=$stopped available=$targetAvailable")
        if (target != null && enabled && interactive && targetAvailable && !stopped && placed && focusReady && mode == InputMode.Keyboard) {
            if (useNativePopupFocus && !view.hasFocus()) view.requestFocus()
            repeat(120) {
                if (stopped) return@LaunchedEffect
                if (runCatching { target.requestFocus() }.getOrDefault(false)) {
                    if (useNativePopupFocus) android.util.Log.i("LyricsFocus", "initial request accepted; nativeWindow=${view.hasWindowFocus()}")
                    stopped = true
                    return@LaunchedEffect
                }
                withFrameNanos { }
            }
            if (!stopped) android.util.Log.w("MenuInitialFocus", "Initial menu focus was not established")
        }
    }
    return this.onPreviewKeyEvent { event ->
        if (event.type == KeyEventType.KeyDown && event.key in setOf(Key.DirectionUp, Key.DirectionDown, Key.DirectionLeft, Key.DirectionRight, Key.Tab)) stopped = true
        false
    }.pointerInput(Unit) {
        awaitEachGesture { awaitFirstDown(requireUnconsumed = false, pass = PointerEventPass.Initial); stopped = true }
    }.onGloballyPositioned { placed = true }
        .onFocusChanged { if (it.hasFocus && !targetAvailable) stopped = true }
        .focusGroup()
}
