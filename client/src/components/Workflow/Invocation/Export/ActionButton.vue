<script setup lang="ts">
import { FontAwesomeIcon } from "@fortawesome/vue-fontawesome";
import { BButton } from "bootstrap-vue";
import { ref } from "vue";

import { type InvocationExportPluginAction } from "./model";

const modal = ref(null);

interface Props {
    action: InvocationExportPluginAction;
}

const props = defineProps<Props>();
</script>

<template>
    <BButton v-b-tooltip.hover.bottom :title="props.action.title" @click="props.action.run(modal)">
        <FontAwesomeIcon v-if="props.action.icon" :icon="props.action.icon" />
        <div v-else>
            {{ props.action.title }}
        </div>

        <component :is="props.action.modal" v-if="props.action.modal" ref="modal" />
    </BButton>
</template>
