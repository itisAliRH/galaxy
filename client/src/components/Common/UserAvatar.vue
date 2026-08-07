<script setup lang="ts">
import { computed } from "vue";

interface Props {
    /** md5 hash of the user's email, as served by the API */
    emailHash?: string | null;
    /** Accessible alt text, e.g. the username */
    alt: string;
    /** Rendered size in CSS pixels */
    size?: number;
}

const props = withDefaults(defineProps<Props>(), {
    emailHash: null,
    size: 96,
});

// request 2x pixels for crisp rendering on high-DPI displays; d=identicon
// keeps a deterministic fallback for users without a Gravatar account
const source = computed(
    () => `https://secure.gravatar.com/avatar/${props.emailHash ?? ""}?d=identicon&s=${props.size * 2}`,
);
</script>

<template>
    <img class="user-avatar" :src="source" :alt="alt" :width="size" :height="size" loading="lazy" />
</template>

<style scoped lang="scss">
.user-avatar {
    border-radius: 50%;
    object-fit: cover;
}
</style>
