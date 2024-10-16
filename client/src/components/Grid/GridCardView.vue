<script setup lang="ts">
import { faExchangeAlt, faEye, faShareAlt, faTrash, faUsers } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/vue-fontawesome";
import { BNavItem } from "bootstrap-vue";
import { computed, onMounted, ref, watch } from "vue";

import { Toast } from "@/composables/toast";
import { useUserStore } from "@/stores/userStore";
import Filtering from "@/utils/filtering";

import type {
    ActionArray,
    BatchOperationArray,
    FieldArray,
    GridConfig as GridCardItemConfig,
    RowData,
} from "./configs/types";

import FilterMenu from "@/components/Common/FilterMenu.vue";
import Heading from "@/components/Common/Heading.vue";
import ListHeader from "@/components/Common/ListHeader.vue";
import LoginRequired from "@/components/Common/LoginRequired.vue";
import GridCard from "@/components/Grid/GridCard.vue";
import LoadingSpan from "@/components/LoadingSpan.vue";

interface NavItem {
    id: string;
    label: string;
    to: string;
    active: boolean;
    loginRequired: boolean;
    title: string;
}

// interface GridCardItemConfig {
//     id: string;
//     actions?: ActionArray;
//     fields: FieldArray;
//     label: string;
//     filtering?: Filtering<any>;
//     getData: (
//         offset: number,
//         limit: number,
//         search: string,
//         sort_by: string,
//         sort_desc: boolean,
//         extraProps?: Record<string, unknown>
//     ) => Promise<any>;
//     batch?: BatchOperationArray;
//     plural: string;
//     sortBy: string;
//     sortKeys: string[];
//     sortDesc: boolean;
//     limit: number;
//     noItemsMessage?: string;
//     listFilters?: {
//         id: string;
//         text: string;
//         callback: () => void;
//     }[];
//     cardConfig: CardConfig;
// }

interface GridCardConfig {
    title: string;
    headerActions: {
        id: string;
        title: string;
        size: "sm" | "md" | "lg";
        variant: "outline-primary" | "primary";
        disabled: boolean;
        onClick: () => void;
        text: string;
        icon: any;
    }[];
    navItems: NavItem[];
}

interface Props {
    activeList: string;
    config: GridCardConfig;
    itemsConfig: GridCardItemConfig[];
    extraProps?: Record<string, unknown>;
}

const props = withDefaults(defineProps<Props>(), {
    limit: 24,
    title: "",
    extraProps: undefined,
});

const showAdvanced = ref(false);

const activeConfig = ref<GridCardItemConfig | undefined>(undefined);

watch(
    () => props.activeList,
    () => {
        const activeListIndex = props.config.navItems.findIndex((item) => item.id === props.activeList);
        activeConfig.value = props.itemsConfig[activeListIndex];
    },
    { immediate: true }
);

const limit = computed(() => activeConfig.value?.limit || 25);

const overlay = ref(false);
const loading = ref(false);
// TODO: Implement noItems
const noItems = computed(() => !loading.value && listData.value.length === 0 && !filterText.value);
const noResults = computed(() => !loading.value && listData.value.length === 0 && filterText.value);

type ListView = "grid" | "list";
const userStore = useUserStore();
const view = computed(() => (userStore.preferredListViewMode as ListView) || "grid");

const currentPage = ref(1);
const totalRows = ref(0);
const listHeader = ref<any>(null);

const sortDesc = computed(() => (listHeader.value && listHeader.value.sortDesc) ?? true);
const sortBy = computed(() => (listHeader.value && listHeader.value.sortBy) || "update_time");

const filterText = ref("");
const searchPlaceHolder = computed(
    () => `Search ${activeConfig.value?.label?.toLowerCase()} by query or use the advanced filtering options`
);

function validatedFilterText() {
    return "";
}

const offset = ref(0);
// const offset = computed(() => props.limit * (currentPage.value - 1));

const noItemsMessage = computed(
    () => activeConfig.value?.noItemsMessage || `No ${activeConfig.value?.plural.toLowerCase()} found`
);

const listData = ref<RowData[]>([]);
async function load(overlayLoading = false, silent = false) {
    const getData = activeConfig.value?.getData;

    if (!getData) {
        return;
    }

    if (!silent) {
        if (overlayLoading) {
            overlay.value = true;
        } else {
            loading.value = true;
        }
    }

    try {
        const [responseData, responseTotal] = await getData(
            offset.value,
            limit.value,
            validatedFilterText(),
            sortBy.value,
            sortDesc.value,
            props.extraProps
        );

        totalRows.value = responseTotal;
        listData.value = responseData;
    } catch (e) {
        Toast.error(`Failed to load ${activeConfig.value?.plural.toLowerCase()}`);
    } finally {
        overlay.value = false;
        loading.value = false;
    }
}

async function onPageChange(page: number) {
    offset.value = limit.value * (currentPage.value - 1);
    await load(true);
}

watch([currentPage, filterText, sortDesc, sortBy], () => load(true));

onMounted(async () => {
    await load();
});
</script>

<template>
    <div id="grid-cards-view" class="grid-cards-view">
        <div id="grid-cards-header" class="grid-cards-header mb-2">
            <div class="d-flex flex-gapx-1">
                <Heading h1 separator inline size="xl" class="flex-grow-1 mb-2">{{ props.config.title }}</Heading>

                <div v-for="ha in props.config.headerActions" :key="ha.id" :idkey="ha.id">
                    <BButton
                        :id="`grid-card-header-action-${ha.id}`"
                        v-b-tooltip.hover.noninteractive
                        :size="ha.size"
                        :title="ha.title"
                        :variant="ha.variant"
                        :disabled="ha.disabled"
                        @click="ha.onClick">
                        <FontAwesomeIcon :icon="ha.icon" />
                        {{ ha.text }}
                    </BButton>
                </div>
            </div>

            <BNav pills justified class="mb-2">
                <BNavItem
                    v-for="navItem in props.config.navItems"
                    :id="navItem.id"
                    :key="navItem.id"
                    :active="props.activeList === navItem.id"
                    :to="navItem.to">
                    {{ navItem.label }}

                    <LoginRequired v-if="navItem.loginRequired" :target="navItem.id" :title="navItem.title" />
                </BNavItem>
            </BNav>

            <FilterMenu
                v-if="activeConfig?.filtering"
                id="grid-cards-filter"
                class="mb-2"
                :name="activeConfig?.plural"
                :filter-class="activeConfig?.filtering"
                :filter-text.sync="filterText"
                :loading="loading || overlay"
                :placeholder="searchPlaceHolder"
                :show-advanced.sync="showAdvanced"
                view="compact"
                has-help />

            <ListHeader ref="listHeader" show-view-toggle :sort-keys="activeConfig?.sortKeys">
                <template v-if="activeConfig?.listFilters" v-slot:extra-filter>
                    <div>
                        Filter:
                        <BButton
                            v-for="filter in activeConfig.listFilters"
                            :key="filter.id"
                            size="sm"
                            @click="filter.callback">
                            {{ filter.text }}
                        </BButton>
                    </div>
                </template>
            </ListHeader>
        </div>

        <BAlert v-if="loading" variant="info" show>
            <LoadingSpan :message="`Loading ${activeConfig?.label.toLocaleLowerCase()}...`" />
        </BAlert>

        <BAlert v-if="!loading && !overlay && noItems" id="grid-cards-list-empty" variant="info" show>
            {{ noItemsMessage }}
        </BAlert>

        <BOverlay
            v-else
            id="grid-cards-list"
            :show="overlay"
            rounded="sm"
            class="grid-cards-list mt-2"
            :class="view === 'grid' ? 'd-flex flex-wrap' : ''">
            <GridCard
                v-for="row in listData"
                :key="row.id"
                :class="view === 'grid' ? 'grid-view' : 'list-view'"
                :item="row"
                :card-config="activeConfig?.cardConfig" />

            <BPagination
                v-if="!loading && totalRows > limit"
                class="mt-2 w-100"
                :value="currentPage"
                :total-rows="totalRows"
                :per-page="limit"
                align="center"
                first-number
                last-number
                @change="onPageChange" />
        </BOverlay>
    </div>
</template>

<style scoped lang="scss">
@import "breakpoints.scss";

.grid-cards-view {
    overflow: auto;
    display: flex;
    flex-direction: column;

    .grid-cards-list {
        container: grid-card-list / inline-size;
        scroll-behavior: smooth;
        min-height: 150px;

        overflow-y: auto;
        overflow-x: hidden;

        .list-view {
            width: 100%;
        }

        .grid-view {
            width: calc(100% / 3);
        }

        @container grid-card-list (max-width: #{$breakpoint-xl}) {
            .grid-view {
                width: calc(100% / 2);
            }
        }

        @container grid-card-list (max-width: #{$breakpoint-sm}) {
            .grid-view {
                width: 100%;
            }
        }
    }
}
</style>
