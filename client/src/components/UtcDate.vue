<script setup lang="ts">
import { format, formatDistanceToNow, parseISO } from "date-fns";
import { computed } from "vue";

interface UtcDateProps {
    date: string | Date;
    mode?: "date" | "elapsed" | "pretty";
}

const props = withDefaults(defineProps<UtcDateProps>(), {
    mode: "date",
});

// check if the date is a valid date format
const isValidDate = computed(() => {
    // return !isNaN(Date.parse(props.date));
    if (typeof props.date === "string") {
        return !isNaN(Date.parse(`${props.date}Z`));
    } else {
        return true;
    }
});

const parsedDate = computed(() => isValidDate.value && parseISO(`${props.date}Z`));
const elapsedTime = computed(() => parsedDate.value && formatDistanceToNow(parsedDate.value, { addSuffix: true }));
const fullISO = computed(() => parsedDate.value && parsedDate.value.toISOString());
const pretty = computed(() => parsedDate.value && format(parsedDate.value, "eeee MMM do H:mm:ss yyyy zz"));
</script>

<template>
    <span v-if="isValidDate" class="utc-time" :title="date.toString() || ''">
        {{ date }}
    </span>
    <span v-else-if="mode == 'date'" class="utc-time" :title="elapsedTime || ''">
        {{ fullISO }}
    </span>
    <span v-else-if="mode === 'elapsed'" class="utc-time utc-time-elapsed" :title="fullISO || ''">
        {{ elapsedTime }}
    </span>
    <span v-else class="utc-time" :title="elapsedTime || ''">
        {{ pretty }}
    </span>
</template>
