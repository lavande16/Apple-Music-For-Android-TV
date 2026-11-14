package com.applemusicktv.ui.viewmodel

import com.applemusicktv.data.network.LyricBackground
import com.applemusicktv.data.network.LyricLine
import com.applemusicktv.data.network.LyricWord
import com.squareup.moshi.Moshi
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class SavedLyricsTest {
    @Test fun roundTripPreservesTimedLyricsAndRejectsAnotherSong() {
        val word = LyricWord(120, 240, "hello")
        val lines = listOf(LyricLine(100, 500, "hello", listOf(word), LyricBackground(110, 400, "back", listOf(word))))
        val adapter = Moshi.Builder().build().adapter(SavedLyrics::class.java)
        val restored = adapter.fromJson(adapter.toJson(SavedLyrics("song-a", lines)))
        assertEquals(lines, restored.linesFor("song-a"))
        assertNull(restored.linesFor("song-b"))
        assertNull(SavedLyrics("song-a", emptyList()).linesFor("song-a"))
    }
}
