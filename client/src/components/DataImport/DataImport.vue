<script setup lang="ts">
import { BNav, BNavItem } from "bootstrap-vue";

interface Props {
    activeTab?: "regular" | "composite" | "collection" | "rule_based";
}

withDefaults(defineProps<Props>(), {
    activeTab: "composite",
});
</script>

<template>
    <div aria-labelledby="data-import" class="data-import-container">
        <BNav pills justified class="mb-2">
            <!-- <BNavItem id="regular" :active="activeTab === 'regular'" to="/data_import"> Regular </BNavItem> -->

            <BNavItem id="composite" :active="activeTab === 'composite'" to="/data_import/composite">
                Composite
            </BNavItem>

            <BNavItem id="collection" :active="activeTab === 'collection'" to="/data_import/collection">
                Collection
            </BNavItem>

            <BNavItem id="rule_based" :active="activeTab === 'rule_based'" to="/data_import/rule_based">
                Rule Based
            </BNavItem>
        </BNav>
    </div>
</template>

<style lang="scss" scoped>
@import "scss/theme/blue.scss";
</style>
