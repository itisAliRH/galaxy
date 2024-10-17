<script setup lang="ts">
import { type IconDefinition } from "@fortawesome/fontawesome-svg-core";
import { faStar } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/vue-fontawesome";
import { BButton } from "bootstrap-vue";

interface Props {
    title: string;
    description: string;
    icon: IconDefinition;
}

const emit = defineEmits<{
    (e: "onClick"): void;
}>();

defineProps<Props>();
</script>

<template>
    <BButton class="file-source-card card-container" @click="() => emit('onClick')">
        <div class="file-source-card-name">
            <FontAwesomeIcon :icon="icon" fixed-width size="lg" />
            <span class="font-weight-bold">
                {{ title }}
            </span>
            <FontAwesomeIcon :icon="faStar" fixed-width />
        </div>

        <span> {{ description }} </span>
    </BButton>
</template>

<style lang="scss" scoped>
@import "scss/theme/blue.scss";

.file-source-card {
    background-color: $body-bg;
    cursor: pointer;

    &:hover {
        background-color: $brand-secondary;
        color: $brand-primary;
    }

    .file-source-card-name {
        display: flex;
    }

    display: grid;
    grid-template-rows: 1fr 1fr;
    text-align: center;
    align-items: center;
    justify-content: center;
}
</style>
