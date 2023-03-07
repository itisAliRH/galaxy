<script setup lang="ts">
import { ref } from "vue";
import { storeToRefs } from "pinia";
import { useUserStore } from "@/stores/userStore";
import CurrentHistory from "./CurrentHistory/HistoryPanel.vue";
import { useHistoryStore, type History } from "@/stores/historyStore";
import HistoryNavigation from "./CurrentHistory/HistoryNavigation.vue";
import CurrentCollection from "./CurrentCollection/CollectionPanel.vue";

const breadcrumbs = ref<object[]>([]);
const listOffset = ref(0);

const historyStore = useHistoryStore();
const { currentUser } = storeToRefs(useUserStore());
const { currentHistory, histories, historiesLoading } = storeToRefs(useHistoryStore());

function updateHistory(history: History) {
    historyStore.updateHistory(history);
}

function onViewCollection(collection: object, currentOffset: number) {
    listOffset.value = currentOffset;
    breadcrumbs.value = [...breadcrumbs.value, collection];
}
</script>

<template>
    <div v-if="currentUser?.id && currentHistory" id="current-history-panel" class="history-index d-flex flex-column">
        <CurrentHistory
            v-if="!breadcrumbs.length"
            :list-offset="listOffset"
            :history="currentHistory"
            :filterable="true"
            v-on="{ updateHistory }"
            @view-collection="onViewCollection">
            <template v-slot:navigation>
                <HistoryNavigation
                    :history="currentHistory"
                    :histories="histories"
                    :histories-loading="historiesLoading"
                    title="Histories"
                    v-on="{ updateHistory }" />
            </template>
        </CurrentHistory>
        <CurrentCollection
            v-else-if="breadcrumbs.length"
            :history="currentHistory"
            :selected-collections.sync="breadcrumbs"
            @view-collection="onViewCollection" />
        <div v-else>
            <span class="sr-only">Loading...</span>
        </div>
    </div>
    <div v-else class="flex-grow-1 loadingBackground h-100">
        <span v-localize class="sr-only">Loading History...</span>
    </div>
</template>
