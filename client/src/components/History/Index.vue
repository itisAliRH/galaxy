<template>
    <div class="d-flex flex-column">
        <div v-if="currentUser">
            <div v-if="currentHistory" id="current-history-panel" class="history-index">
                <CurrentHistory
                    v-if="!breadcrumbs.length"
                    :list-offset="listOffset"
                    :history="currentHistory"
                    :filterable="true"
                    v-on="{ updateHistory: updateHistory }"
                    @view-collection="onViewCollection">
                    <template v-slot:navigation>
                        <HistoryNavigation
                            :history="currentHistory"
                            :histories="histories"
                            :histories-loading="historiesLoading"
                            title="Histories"
                            v-on="{ updateHistory: updateHistory }" />
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
        </div>
    </div>
</template>

<script>
import { mapAction, mapState } from "pinia";
import { useUserStore } from "@/stores/userStore";
import { useHistoryStore } from "@/stores/historyStore";
import HistoryNavigation from "./CurrentHistory/HistoryNavigation";
import CurrentHistory from "./CurrentHistory/HistoryPanel";
import CurrentCollection from "./CurrentCollection/CollectionPanel";

export default {
    components: {
        CurrentHistory,
        CurrentCollection,
        HistoryNavigation,
    },
    data() {
        return {
            // list of collections we have drilled down into
            breadcrumbs: [],
            listOffset: 0,
        };
    },
    computed: {
        ...mapState(useUserStore, ["currentUser"]),
        ...mapState(useHistoryStore, ["currentHistory", "histories", "historiesLoading"]),
    },
    methods: {
        ...mapAction(useHistoryStore, ["updateHistory"]),
        onViewCollection(collection, currentOffset) {
            this.listOffset = currentOffset;
            this.breadcrumbs = [...this.breadcrumbs, collection];
        },
    },
};
</script>
