<script setup lang="ts">
import { faFile } from "@fortawesome/free-regular-svg-icons";
import { faDatabase, faFolder } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/vue-fontawesome";
import { BBadge, BFormCheckbox } from "bootstrap-vue";

import { bytesToString } from "@/utils/utils";

import type { SelectionItemNew } from "./selectionTypes";

interface Props {
    item: SelectionItemNew;
}

const props = defineProps<Props>();

const emit = defineEmits<{
    (e: "open", item: SelectionItemNew): void;
    (e: "select", item: SelectionItemNew): void;
    (e: "update-filter", key: string, value: any): void;
}>();

function onSelect(item: SelectionItemNew) {
    emit("select", item);
}

function onOpen(item: SelectionItemNew) {
    if (!item.isLeaf) {
        emit("open", item);
    }
}

console.log("SelectionCard", props.item);

function formatTime(value: Date | string) {
    if (value) {
        const date = new Date(value);

        return date.toLocaleString("default", {
            day: "numeric",
            month: "short",
            year: "numeric",
            minute: "numeric",
            hour: "numeric",
        });
    } else {
        return "-";
    }
}
</script>

<template>
    <div :id="`selection-card-item-${props.item.id}`" class="selection-card-item">
        <div
            class="selection-card-container"
            :class="{
                'selection-card-selected': props.item._rowVariant === 'success',
            }">
            <div class="d-flex">
                <div class="selection-card-control">
                    <BFormCheckbox
                        class="cursor-pointer align-self-end"
                        :checked="props.item._rowVariant === 'success'"
                        data-description="grid selected"
                        @change="onSelect(props.item)" />
                </div>

                <div class="selection-card-data" @click="onSelect(props.item)">
                    <div class="selection-card-body">
                        <span class="selection-card-name">
                            <FontAwesomeIcon v-if="props.item.isLeaf" :icon="faFile" fixed-width size="sm" />
                            <FontAwesomeIcon v-else :icon="faFolder" fixed-width size="sm" />

                            <span :class="{ 'parent-title': !props.item.isLeaf }" @click="onOpen(props.item)">
                                {{ props.item.label }}
                            </span>
                        </span>

                        <span v-if="props.item.updated" class="selection-card-header-right">
                            {{ formatTime(props.item.updated) }}
                        </span>
                    </div>

                    <div class="selection-card-footer">
                        <div class="selection-card-description">
                            {{ props.item.description }}
                        </div>
                        <BBadge
                            v-if="props.item.isLeaf"
                            v-b-tooltip.hover.noninteractive
                            class="outline-badge cursor-pointer">
                            <FontAwesomeIcon :icon="faDatabase" fixed-width />
                            {{ bytesToString(props.item.size || 0) }}
                        </BBadge>
                    </div>
                </div>
            </div>
        </div>
    </div>
</template>

<style scoped lang="scss">
@import "theme/blue.scss";
@import "breakpoints.scss";

.selection-card-selected {
    background-color: #abe3ab;
}

.selection-card-item {
    container: selection-card-item / inline-size;
    padding: 0;

    @container (max-width: #{$breakpoint-md}) {
        & {
            padding: 0 0.25rem 0.5rem 0.25rem;
        }
    }

    &.selection-card-selected {
        background-color: $brand-success;
        color: red;
    }

    &:hover {
        cursor: pointer;
        background-color: $brand-secondary;
    }

    .selection-card-container {
        height: 100%;
        display: flex;
        flex-direction: column;
        padding: 0.5rem;
        border-bottom: 0.1rem solid $brand-secondary;

        .selection-card-control {
            display: flex;
            gap: 0.4rem;
            flex-direction: column;
        }

        .selection-card-data {
            width: 100%;
            display: flex;
            flex-direction: column;
            justify-content: space-between;

            .selection-card-header {
                display: flex;
                justify-content: space-between;
            }

            .selection-card-body {
                display: flex;
                justify-content: space-between;

                .parent-title {
                    color: $brand-primary;

                    &:hover {
                        text-decoration: underline;
                    }
                }

                .selection-card-header-right {
                    display: flex;
                    gap: 0.25rem;
                    align-items: center;
                }
            }

            .selection-card-footer {
                display: flex;
                justify-content: space-between;
                align-items: end;
                padding-top: 0.25rem;

                .selection-card-actions {
                    display: flex;
                    gap: 0.25rem;

                    @container (max-width: #{$breakpoint-md}) {
                        .compact-view {
                            display: none;
                        }
                    }
                }
            }
        }
    }
}
</style>
