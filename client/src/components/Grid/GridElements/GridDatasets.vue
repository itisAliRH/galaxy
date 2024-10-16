<script setup lang="ts">
import { faDatabase } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/vue-fontawesome";
import axios from "axios";
import { BBadge } from "bootstrap-vue";
import { onMounted, type Ref, ref, watch } from "vue";

import { withPrefix } from "@/utils/redirect";
import { rethrowSimple } from "@/utils/simple-error";

interface Props {
    historyId?: string;
}
const props = defineProps<Props>();

interface HistoryStats {
    nice_size: string;
    contents_active: {
        deleted?: number;
        hidden?: number;
        active?: number;
    };
    contents_states: {
        error?: number;
        ok?: number;
        new?: number;
        running?: number;
        queued?: number;
    };
}
const historyStats: Ref<HistoryStats | null> = ref(null);

async function getCounts() {
    historyStats.value = null;
    if (props.historyId) {
        try {
            const { data } = await axios.get(
                withPrefix(`/api/histories/${props.historyId}?keys=nice_size,contents_active,contents_states`)
            );
            historyStats.value = data;
        } catch (e) {
            rethrowSimple(e);
        }
    }
}

onMounted(() => {
    getCounts();
});

watch(
    () => props.historyId,
    () => getCounts()
);
</script>

<template>
    <BBadge
        v-if="historyStats"
        v-b-tooltip.hover.noninteractive
        class="outline-badge cursor-pointer grid-datasets"
        :title="`View history storage overview`"
        variant="light"
        :to="`/storage/history/${props.historyId}`">
        <small v-if="historyStats.nice_size" class="mr-2">
            <FontAwesomeIcon :icon="faDatabase" fixed-width />
            {{ historyStats.nice_size }}
        </small>

        <span
            v-for="(stateCount, state) of historyStats.contents_states"
            :key="state"
            :class="`stats state-color-${state}`">
            {{ stateCount }}
        </span>

        <span v-if="historyStats.contents_active.deleted" class="stats state-color-deleted">
            {{ historyStats.contents_active.deleted }}
        </span>

        <span v-if="historyStats.contents_active.hidden" class="stats state-color-hidden">
            {{ historyStats.contents_active.hidden }}
        </span>
    </BBadge>
</template>

<style lang="scss" scoped>
@import "~bootstrap/scss/bootstrap.scss";

.grid-datasets {
    display: flex;
    gap: 0.2rem;
    font-size: small;

    .stats {
        @extend .rounded;
        @extend .px-1;
        @extend .mr-1;
        border-width: 1px;
        border-style: solid;
    }

    .state-color-deleted {
        border-style: none;
    }

    align-items: center;
}
</style>
