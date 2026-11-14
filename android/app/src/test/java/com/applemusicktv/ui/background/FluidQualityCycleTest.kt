package com.applemusicktv.ui.background

import org.junit.Assert.assertEquals
import org.junit.Test

class FluidQualityCycleTest {
    @Test fun bothDirectionsWrapAndVisitEveryQuality() {
        val all = FluidQuality.entries
        for (i in all.indices) {
            assertEquals(all[(i + 1) % all.size], all[i].step(1))
            assertEquals(all[(i + all.size - 1) % all.size], all[i].step(-1))
        }
        assertEquals(FluidQuality.OFF, all.fold(FluidQuality.OFF) { q, _ -> q.step(1) })
        assertEquals(FluidQuality.OFF, all.fold(FluidQuality.OFF) { q, _ -> q.step(-1) })
    }
}
