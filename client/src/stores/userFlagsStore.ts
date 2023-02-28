import { defineStore } from "pinia";

export const useUserFlagsStore = defineStore("userFlagsStore", {
    state: () => ({
        showSelectionQueryBreakWarning: true,
    }),
    actions: {
        ignoreSelectionQueryBreakWarning() {
            this.showSelectionQueryBreakWarning = false;
        },
    },
});
