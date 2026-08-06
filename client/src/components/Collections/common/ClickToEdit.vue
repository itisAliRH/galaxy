<script setup lang="ts">
import { faLevelDownAlt } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/vue-fontawesome";
import { BFormInput, BFormTextarea } from "bootstrap-vue";
import { computed, ref, watch } from "vue";

import { useUid } from "@/composables/utils/uid";

interface Props {
    value: string;
    title?: string;
    component?: string;
    multiline?: boolean;
    noSaveOnBlur?: boolean;
}

const props = defineProps<Props>();

const emit = defineEmits<{
    (e: "input", value: string): void;
}>();

const inputId = useUid("click-to-edit-");
const clickToEditInput = ref<HTMLInputElement | null>(null);
const editable = ref(false);
const localValue = ref(props.value);

const computedValue = computed(() => props.value);

watch(
    () => editable.value,
    (value) => {
        if (!value) {
            // an unchanged value (e.g. escape-revert or blur without edits)
            // is not an input
            if (localValue.value !== props.value) {
                emit("input", localValue.value);
            }
        } else {
            setTimeout(() => {
                clickToEditInput.value?.focus();
            });
        }
    },
);

watch(
    () => props.value,
    (value) => {
        if (!editable.value) {
            localValue.value = value;
        }
    },
);

function onBlur() {
    if (props.noSaveOnBlur) {
        revertToOriginal();
    } else {
        editable.value = false;
    }
}

function revertToOriginal() {
    localValue.value = props.value;
    editable.value = false;
}
</script>

<template>
    <div v-if="editable" class="d-flex flex-gapx-1 input-icon-wrapper">
        <BFormTextarea
            v-if="props.multiline"
            :id="inputId"
            ref="clickToEditInput"
            v-model="localValue"
            class="w-100"
            data-description="click to edit input"
            tabindex="0"
            title="Click outside to save, esc to revert changes"
            rows="3"
            max-rows="8"
            aria-label="Click outside to save, esc to revert changes"
            @blur.prevent.stop="onBlur"
            @keyup.stop.escape="revertToOriginal"
            @click.prevent.stop />

        <template v-else>
            <BFormInput
                :id="inputId"
                ref="clickToEditInput"
                v-model="localValue"
                class="w-100 input-with-icon"
                data-description="click to edit input"
                tabindex="0"
                title="Press enter/return to save, esc to revert changes"
                contenteditable
                max-rows="4"
                aria-label="Press enter/return to save, esc to revert changes"
                @blur.prevent.stop="onBlur"
                @keyup.prevent.stop.enter="editable = false"
                @keyup.prevent.stop.escape="revertToOriginal"
                @click.prevent.stop />
            <div class="input-icon">
                <FontAwesomeIcon :icon="faLevelDownAlt" class="enter-icon" />
            </div>
        </template>
    </div>

    <!-- the role=button span nests inside the host tag so a heading host
         (e.g. component="h1") keeps its semantics in the accessibility tree -->
    <component
        :is="props.component || 'label'"
        v-else
        v-g-tooltip.onoverflow
        class="click-to-edit-label text-break"
        :title="computedValue || title"
        @click.stop="editable = true">
        <span role="button" tabindex="0" @keyup.enter="editable = true">
            <span v-if="computedValue">{{ computedValue }}</span>
            <i v-else>{{ title }}</i>
        </span>
    </component>
</template>

<style scoped lang="scss">
.click-to-edit-label {
    cursor: text;
    &:hover > * {
        text-decoration: underline;
    }
}

.input-icon-wrapper {
    position: relative;
}

.input-with-icon {
    padding-right: 15px;
}

.input-icon {
    position: absolute;
    right: 10px;
    top: 50%;
    transform: translateY(-50%);
    pointer-events: none;
}

.enter-icon {
    transform: rotate(90deg); // Rotates the arrow to look like the enter/return key
    opacity: 0.7;
}
</style>
