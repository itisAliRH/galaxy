<script setup lang="ts">
import ActivityItem from "@/components/ActivityBar/ActivityItem.vue";

export interface Props {
    id: string;
    title: string;
    icon: string;
    isActive: boolean;
}

defineProps<Props>();

const emit = defineEmits<{
    (e: "click"): void;
}>();

const tooltip = "You have no ongoing upload";
</script>

<template>
    <ActivityItem
        :id="id"
        :icon="icon"
        :is-active="isActive"
        :title="title"
        :tooltip="tooltip"
        @click="emit('click')" />
</template>
