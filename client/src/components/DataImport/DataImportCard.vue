<script setup lang="ts">
import { type IconDefinition } from "@fortawesome/fontawesome-svg-core";
import { FontAwesomeIcon } from "@fortawesome/vue-fontawesome";
import { BButton } from "bootstrap-vue";

interface Props {
    title: string;
    icon: IconDefinition;
    tooltip?: string;
}

const emit = defineEmits<{
    (e: "onClick"): void;
}>();

defineProps<Props>();
</script>

<template>
    <BButton v-b-tooltip.hover :title="tooltip" class="data-import-card card-container" @click="() => emit('onClick')">
        <span> <FontAwesomeIcon :icon="icon" fixed-width size="lg" /> </span>
        {{ title }}
    </BButton>
</template>

<style lang="scss" scoped>
@import "scss/theme/blue.scss";

.data-import-card {
    background-color: $body-bg;
    cursor: pointer;

    &:hover {
        background-color: $brand-secondary;
        color: $brand-primary;
    }

    display: grid;
    grid-template-rows: 1fr 1fr;
    text-align: center;
    align-items: center;
    justify-content: center;
}
</style>
