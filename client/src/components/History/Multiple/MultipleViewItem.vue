<script setup lang="ts">
import { storeToRefs } from "pinia";
import { defineProps, ref, computed } from "vue";
import { useHistoryStore } from "@/stores/historyStore";
import HistoryPanel from "@/components/History/CurrentHistory/HistoryPanel.vue";
import CollectionPanel from "@/components/History/CurrentCollection/CollectionPanel.vue";

const props = defineProps({
    source: {
        type: Object,
        required: true,
    },
    filter: {
        type: String,
        default: null,
    },
});

const selectedCollections = ref<object[]>([]);

const { currentHistory } = storeToRefs(useHistoryStore());
const { getHistoryById, setCurrentHistory, unpinHistory } = useHistoryStore();

const getHistory = computed(() => getHistoryById(props.source.id));
const sameToCurrent = computed(() => currentHistory.value?.id === props.source.id);

function onViewCollection(collection: object) {
    selectedCollections.value = [...selectedCollections.value, collection];
}
</script>

<template>
    <div id="list-item" class="d-flex flex-column align-items-center w-100">
        <CollectionPanel
            v-if="selectedCollections.length && selectedCollections[0].history_id === source.id"
            :history="getHistory"
            :selected-collections.sync="selectedCollections"
            :show-controls="false"
            @view-collection="onViewCollection" />
        <HistoryPanel
            v-else
            :history="getHistory"
            :filter="filter"
            :show-controls="false"
            @view-collection="onViewCollection" />
        <hr class="w-100 m-2" />
        <div class="flex-row flex-grow-0">
            <b-button
                size="sm"
                class="my-1"
                :disabled="sameToCurrent"
                :variant="sameToCurrent ? 'disabled' : 'outline-info'"
                :title="sameToCurrent ? 'Current History' : 'Switch to this history'"
                @click="setCurrentHistory(source.id)">
                {{ sameToCurrent ? "Current History" : "Switch to" }}
            </b-button>
            <b-button
                size="sm"
                class="my-1"
                variant="outline-danger"
                title="Hide this history from the list"
                @click="unpinHistory(source.id)">
                Hide
            </b-button>
        </div>
    </div>
</template>
