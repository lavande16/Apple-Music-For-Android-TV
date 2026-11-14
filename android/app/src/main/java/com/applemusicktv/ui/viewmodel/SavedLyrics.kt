package com.applemusicktv.ui.viewmodel

import com.applemusicktv.data.network.LyricLine
import com.squareup.moshi.JsonClass

@JsonClass(generateAdapter = true)
internal data class SavedLyrics(val songId: String, val lines: List<LyricLine>)

internal fun SavedLyrics?.linesFor(songId: String): List<LyricLine>? =
    this?.takeIf { it.songId == songId && it.lines.isNotEmpty() }?.lines
