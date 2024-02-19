<script setup lang="ts">
import { library } from "@fortawesome/fontawesome-svg-core";
import { faCheckCircle, faCloudUploadAlt, faExclamationCircle, faSpinner } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/vue-fontawesome";
import { BButton } from "bootstrap-vue";
import { watch } from "vue";

import { useTaskMonitor } from "@/composables/taskMonitor";

library.add(faCheckCircle, faCloudUploadAlt, faExclamationCircle, faSpinner);

const { isRunning, isCompleted, hasFailed, requestHasFailed, waitForTask } = useTaskMonitor();

const props = defineProps({
    title: { type: String, required: true },
    taskId: { type: String, default: null },
});

const emit = defineEmits(["onClick", "onSuccess", "onFailure"]);

watch(
    () => props.taskId,
    (newTaskId, oldTaskId) => {
        if (newTaskId !== oldTaskId) {
            waitForTask(newTaskId);
        }
    }
);

watch([isCompleted, hasFailed, requestHasFailed], ([newIsCompleted, newHasFailed, newRequestHasFailed]) => {
    if (newIsCompleted) {
        emit("onSuccess");
    }
    if (newHasFailed || newRequestHasFailed) {
        emit("onFailure");
    }
});
</script>

<template>
    <BButton v-b-tooltip.hover.bottom :title="props.title" @click="() => emit('onClick')">
        <FontAwesomeIcon v-if="isRunning" :icon="faSpinner" spin />
        <FontAwesomeIcon v-else-if="hasFailed || requestHasFailed" :icon="faExclamationCircle" />
        <FontAwesomeIcon v-else-if="isCompleted" :icon="faCheckCircle" />
        <FontAwesomeIcon v-else :icon="faCloudUploadAlt" />
    </BButton>
</template>
