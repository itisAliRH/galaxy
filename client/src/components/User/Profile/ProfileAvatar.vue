<script setup lang="ts">
import { computed } from "vue";

interface Props {
    /**
     * Username the identicon is derived from when no seed is set
     */
    username: string;
    /**
     * Optional avatar seed; overrides the username as the identicon source
     * @default undefined
     */
    seed?: string;
    /**
     * Rendered size in CSS pixels
     * @default 96
     */
    size?: number;
}

const props = withDefaults(defineProps<Props>(), {
    seed: undefined,
    size: 96,
});

const GRID = 5;
const CELL = 20;

/** Simple deterministic 32-bit hash (FNV-1a) of the source string. */
function hashString(value: string): number {
    let hash = 0x811c9dc5;
    for (let i = 0; i < value.length; i++) {
        hash ^= value.charCodeAt(i);
        hash = Math.imul(hash, 0x01000193);
    }
    return hash >>> 0;
}

const source = computed(() => props.seed || props.username || "anonymous");

/**
 * Horizontally symmetric 5x5 identicon cells. Column 0..2 are derived from
 * hash bits; columns 3..4 mirror 1..0 — same construction GitHub uses, so
 * the result reads as an avatar rather than noise.
 */
const cells = computed(() => {
    const hash = hashString(source.value);
    const active: { x: number; y: number }[] = [];
    for (let col = 0; col < 3; col++) {
        for (let row = 0; row < GRID; row++) {
            const bit = (hash >>> (col * GRID + row) % 31) & 1;
            if (bit) {
                active.push({ x: col, y: row });
                if (col < 2) {
                    active.push({ x: GRID - 1 - col, y: row });
                }
            }
        }
    }
    return active;
});

/** Pick a stable foreground color from the brand-adjacent palette. */
const color = computed(() => {
    const palette = ["#25537b", "#2c3143", "#387dba", "#2e689a", "#4c5574"];
    return palette[hashString(`${source.value}-color`) % palette.length];
});
</script>

<template>
    <svg
        class="profile-avatar"
        :width="props.size"
        :height="props.size"
        :viewBox="`0 0 ${GRID * CELL} ${GRID * CELL}`"
        role="img"
        :aria-label="`Generated avatar for ${props.username}`">
        <rect :width="GRID * CELL" :height="GRID * CELL" fill="#e8f0f7" />
        <g :fill="color">
            <rect
                v-for="(cell, index) in cells"
                :key="index"
                :x="cell.x * CELL"
                :y="cell.y * CELL"
                :width="CELL"
                :height="CELL" />
        </g>
    </svg>
</template>

<style scoped lang="scss">
.profile-avatar {
    border-radius: 50%;
    border: 1px solid rgba(37, 83, 123, 0.15);
}
</style>
