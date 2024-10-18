<script setup lang="ts">
import { type IconDefinition, library } from "@fortawesome/fontawesome-svg-core";
import { faCheckSquare, faMinusSquare, faSquare } from "@fortawesome/free-regular-svg-icons";
import { faCaretLeft, faCheck, faFolder, faSpinner, faTimes } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/vue-fontawesome";
import { BAlert, BButton, BModal, BOverlay, BPagination } from "bootstrap-vue";
import { computed, ref, watch } from "vue";

import {
    type FieldEntry,
    type ItemsProvider,
    type ItemsProviderContext,
    SELECTION_STATES,
    type SelectionItemNew,
    type SelectionState,
} from "@/components/SelectionDialog/selectionTypes";
import type Filtering from "@/utils/filtering";

import SelectionCard from "./SelectionCard.vue";
import FilterMenu from "@/components/Common/FilterMenu.vue";
import Heading from "@/components/Common/Heading.vue";
import ListHeader from "@/components/Common/ListHeader.vue";
import DataDialogSearch from "@/components/SelectionDialog/DataDialogSearch.vue";

library.add(faCaretLeft, faCheck, faCheckSquare, faFolder, faMinusSquare, faSpinner, faSquare, faTimes);

const LABEL_FIELD: FieldEntry = { key: "label", sortable: true };
const SELECT_ICON_FIELD: FieldEntry = { key: "__select_icon__", label: "", sortable: false };

interface Props {
    disableOk?: boolean;
    errorMessage?: string;
    fileMode?: boolean;
    fields?: FieldEntry[];
    isBusy?: boolean;
    isEncoded?: boolean;
    items?: SelectionItemNew[];
    itemsProvider?: ItemsProvider;
    providerUrl?: string;
    totalItems?: number;
    leafIcon?: string;
    folderIcon?: IconDefinition;
    modalShow?: boolean;
    modalStatic?: boolean;
    multiple?: boolean;
    optionsShow?: boolean;
    undoShow?: boolean;
    selectAllVariant?: SelectionState;
    showSelectIcon?: boolean;
    title?: string;
    searchTitle?: string;
    okButtonText?: string;
    filterClass?: Filtering<any>;
}

const props = withDefaults(defineProps<Props>(), {
    disableOk: false,
    errorMessage: "",
    fileMode: true,
    fields: () => [],
    isBusy: false,
    isEncoded: false,
    items: () => [],
    itemsProvider: undefined,
    providerUrl: undefined,
    totalItems: 0,
    leafIcon: "fa fa-file-o",
    folderIcon: () => faFolder,
    modalShow: true,
    modalStatic: false,
    multiple: false,
    optionsShow: false,
    undoShow: false,
    selectAllVariant: SELECTION_STATES.UNSELECTED,
    showSelectIcon: false,
    title: "",
    searchTitle: undefined,
    okButtonText: "Select",
    filterClass: undefined,
});

const emit = defineEmits<{
    (e: "onCancel"): void;
    (e: "onClick", record: SelectionItemNew): void;
    (e: "onOk"): void;
    (e: "onOpen", record?: SelectionItemNew): void;
    (e: "onSelectAll"): void;
    (e: "onUndo"): void;
}>();

const filter = ref("");
const currentPage = ref(1);
const perPage = ref(25);
const showAdvancedSearch = ref(false);
const filteredItems = ref<SelectionItemNew[]>([]);

const okButtonText = computed(() => {
    return props.okButtonText ? props.okButtonText : props.fileMode ? "Select" : "Select this folder";
});

/** Resets pagination when a filter/search word is entered **/
function filtered(items: SelectionItemNew[]) {
    if (props.itemsProvider === undefined) {
        resetPagination();
    }
}

function resetFilter() {
    filter.value = "";
}

function resetPagination() {
    currentPage.value = 1;
}

defineExpose({
    resetFilter,
    resetPagination,
});

async function fetchItems() {
    if (props.itemsProvider) {
        const context: ItemsProviderContext = {
            currentPage: currentPage.value,
            perPage: perPage.value,
            filter: filter.value,
        };
        const is = await props.itemsProvider(context);
        filteredItems.value = is;
    }
}

watch(
    () => props.items,
    () => {
        if (props.itemsProvider !== undefined) {
            resetPagination();
        }
    }
);

if (props.itemsProvider !== undefined) {
    fetchItems();
}

watch(
    () => props.providerUrl,
    () => {
        // We need to reset the current page when drilling down sub-folders
        if (props.itemsProvider !== undefined) {
            resetPagination();
        }
    }
);
</script>

<template>
    <BModal
        v-if="modalShow"
        size="xl"
        centered
        modal-class="selection-dialog-modal"
        header-class="selection-dialog-header"
        visible
        :static="modalStatic"
        :title="title"
        @hide="emit('onCancel')">
        <template v-slot:modal-header>
            <div id="selection-dialog-header" class="selection-dialog-header">
                <slot name="header">
                    <Heading v-if="props.title" h2>
                        {{ props.title }}
                    </Heading>

                    <FilterMenu
                        v-if="props.filterClass"
                        :name="props.title"
                        class="w-100 mb-2"
                        :placeholder="props.searchTitle || props.title"
                        :filter-class="props.filterClass"
                        :filter-text.sync="filter"
                        :loading="props.isBusy"
                        :show-advanced.sync="showAdvancedSearch" />

                    <DataDialogSearch
                        v-else
                        v-model="filter"
                        class="w-100 mb-2"
                        :title="props.searchTitle || props.title" />

                    <div class="selection-dialog-filter-selection">
                        <ListHeader
                            ref="listHeader"
                            show-view-toggle
                            :intermediate-selected="selectAllVariant === SELECTION_STATES.MIXED"
                            :all-selected="selectAllVariant === SELECTION_STATES.SELECTED"
                            :show-select-all="props.showSelectIcon && props.multiple"
                            @select-all="emit('onSelectAll')" />
                    </div>
                </slot>
            </div>
        </template>

        <slot name="helper" />

        <div v-if="optionsShow">
            <BAlert v-if="errorMessage" variant="danger" show>
                {{ errorMessage }}
            </BAlert>

            <div v-if="totalItems === 0">
                <BAlert v-if="filter" variant="info" show>
                    No search results found for:
                    <b>{{ filter }}</b
                    >.
                </BAlert>

                <BAlert v-else variant="info" show> No entries. </BAlert>
            </div>

            <BOverlay :show="!optionsShow || isBusy">
                <div v-for="item in items" :key="item.id">
                    <SelectionCard
                        :id="`selection-card-item-${item.id}`"
                        :show-select-icon="props.showSelectIcon"
                        :item="item"
                        @select="emit('onClick', $event)"
                        @open="emit('onOpen')" />
                </div>
            </BOverlay>
        </div>

        <template v-slot:modal-footer>
            <div class="d-flex justify-content-between w-100">
                <div>
                    <BButton
                        v-if="undoShow"
                        data-description="selection dialog undo"
                        variant="outline-primary"
                        size="sm"
                        @click="emit('onUndo')">
                        <FontAwesomeIcon :icon="faCaretLeft" />
                        Back
                    </BButton>

                    <slot v-if="!errorMessage" name="buttons" />
                </div>

                <BPagination
                    v-if="totalItems > perPage"
                    v-model="currentPage"
                    class="justify-content-md-center m-0"
                    size="sm"
                    :per-page="perPage"
                    :total-rows="totalItems" />

                <div>
                    <BButton
                        data-description="selection dialog cancel"
                        size="sm"
                        variant="outline-danger"
                        @click="emit('onCancel')">
                        <FontAwesomeIcon :icon="faTimes" />
                        Cancel
                    </BButton>

                    <BButton
                        v-if="multiple || !fileMode"
                        data-description="selection dialog ok"
                        size="sm"
                        variant="primary"
                        :disabled="disableOk"
                        @click="emit('onOk')">
                        <FontAwesomeIcon :icon="faCheck" />
                        {{ okButtonText }}
                    </BButton>
                </div>
            </div>
        </template>
    </BModal>
</template>

<style>
.selection-dialog-modal .modal-body {
    max-height: 70vh;
    min-height: 70vh;
    overflow-y: auto;
}

.selection-dialog-header {
    position: sticky;
    flex-direction: column;
    padding-bottom: 0 !important;
    width: 100%;
}
</style>

<style scoped lang="scss">
@import "theme/blue.scss";

.selection-dialog-filter-selection {
    display: flex;
    margin-bottom: 0.25rem;
    align-items: center;
    justify-content: space-between;
}
</style>
