<script setup lang="ts">
import { faArrowLeft, faCheck, faSpinner } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/vue-fontawesome";
import { faArrowRight } from "font-awesome-6";
import { computed } from "vue";

import { useMarkdown } from "@/composables/markdown";

import type { WizardReturnType, WizardStep } from "./useWizard";

import GButton from "@/components/BaseComponents/GButton.vue";
import Heading from "@/components/Common/Heading.vue";

interface Props {
    /**
     * The wizard stepper object.
     *
     * **Must be created using the `useWizard` composable.**
     */
    use?: WizardReturnType;

    /**
     * The title of the wizard.
     *
     * This is displayed at the top of the wizard.
     *
     * The default component can be replaced by a slot named `header` or it can be excluded
     * as a property to skip the wizard all together.
     *
     * @default ""
     */
    title?: string;

    /**
     * Optional description of the wizard.
     *
     * This is displayed below the title. It supports Markdown.
     *
     * The default description behavior can be replaced by a slot named `description`.
     */
    description?: string;

    /**
     * The label for the submit button.
     *
     * @default "Submit"
     */
    submitButtonLabel?: string;

    /**
     * Whether the wizard is busy.
     *
     * When the wizard is busy, the navigation buttons are disabled and
     * a spinner is shown on the current step.
     *
     * @default false
     */
    isBusy?: boolean;

    /**
     * The component to use as the container for the wizard.
     *
     * Can be either a BootstrapVue card or a div.
     *
     * @default "BCard"
     */
    containerComponent?: "BCard" | "div";
}

const props = withDefaults(defineProps<Props>(), {
    use: undefined,
    title: undefined,
    description: undefined,
    submitButtonLabel: "Submit",
    isBusy: false,
    containerComponent: "BCard",
});

const { renderMarkdown } = useMarkdown({ openLinksInNewPage: true });

function dynamicIsLast() {
    if (props.use.isLast.value) {
        return true;
    }

    let nextStepIndex = props.use.index.value + 1;
    let nextStepName = props.use.stepNames.value.at(nextStepIndex);

    while (nextStepName && props.use.steps.value[nextStepName]?.isSkippable()) {
        nextStepIndex++;
        nextStepName = props.use.stepNames.value.at(nextStepIndex);
    }

    return !nextStepName;
}

const emit = defineEmits(["submit"]);

function goNext() {
    if (props.use.current.value.isValid()) {
        if (dynamicIsLast()) {
            emit("submit");
        }

        let nextStepIndex = props.use.index.value + 1;
        let nextStepName = props.use.stepNames.value.at(nextStepIndex);

        while (nextStepName && props.use.steps.value[nextStepName]?.isSkippable()) {
            nextStepIndex++;
            nextStepName = props.use.stepNames.value.at(nextStepIndex);
        }

        if (nextStepName) {
            props.use.goTo(nextStepName);
        }
    }
}

function goBack() {
    let previousStepIndex = props.use.index.value - 1;
    let previousStepName = props.use.stepNames.value.at(previousStepIndex);

    while (previousStepName && props.use.steps.value[previousStepName]?.isSkippable()) {
        previousStepIndex--;
        previousStepName = props.use.stepNames.value.at(previousStepIndex);
    }

    if (previousStepName) {
        props.use.goTo(previousStepName);
    }
}

function determineDisplayStepIndex(index: number): number {
    const steps = Array.from(Object.values(props.use.steps.value));
    return steps.slice(0, index).filter((step) => !(step as WizardStep).isSkippable()).length + 1;
}

function allStepsBeforeAreValid(index: number): boolean {
    const steps = Array.from(Object.values(props.use.steps.value));
    return steps.slice(0, index).every((step) => (step as WizardStep).isValid() || (step as WizardStep).isSkippable());
}

function isStepDone(currentIndex: number): boolean {
    return currentIndex < props.use.index.value;
}

const steps = computed<[string, WizardStep][]>(() => {
    return Object.entries(props.use.steps.value);
});

const bodyStyle = computed(() => {
    const width = props.use.current.value.width;
    if (width) {
        return { width: width };
    } else {
        return {};
    }
});
</script>

<template>
    <div class="h-100 d-flex flex-column">
        <slot name="header">
            <Heading v-if="title" h2 separator>
                {{ title }}
            </Heading>
        </slot>

        <slot name="description">
            <div v-if="props.description" v-html="renderMarkdown(props.description)" />
        </slot>

        <div v-if="props.use?.steps?.value" class="h-100 d-flex flex-column">
            <div class="d-flex mb-4">
                <div
                    v-for="([id, step], i) in steps"
                    :key="id"
                    class="w-100"
                    :class="step.isSkippable() ? 'd-none' : ''">
                    <div class="position-relative d-flex flex-column justify-content-center align-items-center">
                        <GButton
                            :color="isStepDone(i) ? 'green' : 'blue'"
                            :outline="!props.use.isCurrent(id) && !isStepDone(i)"
                            size="large"
                            class="rounded-pill"
                            :disabled="(!allStepsBeforeAreValid(i) && props.use.isBefore(id)) || isBusy"
                            @click="props.use.goTo(id)">
                            <FontAwesomeIcon v-if="isStepDone(i)" :icon="faCheck" color="white" />
                            <FontAwesomeIcon v-else-if="dynamicIsLast() && isBusy" :icon="faSpinner" spin />
                            <span v-else>{{ determineDisplayStepIndex(i) }}</span>
                        </GButton>

                        <div
                            v-if="i < steps.length - 1"
                            class="step-line position-absolute bg-secondary"
                            :class="{ 'bg-success': props.use.isAfter(id) }" />
                    </div>

                    <div class="text-center" v-text="step.label" />
                </div>
            </div>

            <div class="d-flex flex-column align-items-center p-2 h-100">
                <span class="h-md mt-0 mb-1" v-text="props.use.current.value.instructions" />

                <div class="d-flex flex-column align-items-center w-100" :style="bodyStyle">
                    <slot>
                        <p>
                            Missing body for step <b>{{ props.use.current.value.label }}</b>
                        </p>
                    </slot>
                </div>
            </div>

            <div class="d-flex justify-content-between mt-2 p-2">
                <GButton :disabled="props.use.isFirst.value || isBusy" outline size="large" @click="goBack">
                    <FontAwesomeIcon :icon="faArrowLeft" />
                    Back
                </GButton>

                <GButton
                    color="blue"
                    size="large"
                    :disabled="!props.use.current.value.isValid() || isBusy"
                    :class="dynamicIsLast() ? 'btn-primary' : ''"
                    @click="goNext">
                    {{ dynamicIsLast() ? submitButtonLabel : "Next" }}
                    <FontAwesomeIcon
                        :icon="dynamicIsLast() ? (isBusy ? faSpinner : faCheck) : faArrowRight"
                        :spin="isBusy" />
                </GButton>
            </div>
        </div>
    </div>
</template>

<style scoped>
.step-line {
    height: 0.25rem;
    inset-inline-start: calc(50% + 1.5rem);
    inset-inline-end: calc(1.5rem - 50%);
}
</style>
