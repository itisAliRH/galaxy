import { defineStore } from "pinia";
import { useHistoryStore } from "@/stores/historyStore";
import {
    addFavoriteToolQuery,
    removeFavoriteToolQuery,
    getCurrentUser,
    setCurrentThemeQuery,
} from "@/stores/users/queries";

interface User {
    id: string;
    email: string;
    tags_used: string[];
}

interface Preferences {
    theme: string;
    favorites: { tools: string[] };
}

interface State {
    currentUser: User | null;
    currentPreferences: Preferences | null;
}

let loadPromise: Promise<void> | null = null;

export const useUserStore = defineStore("userStore", {
    state: (): State => ({
        currentUser: null,
        currentPreferences: null,
    }),
    getters: {
        isAnonymous(state) {
            return !state.currentUser?.email;
        },
        currentTheme(state) {
            return state.currentPreferences?.theme ?? null;
        },
        currentFavorites(state) {
            if (state.currentPreferences?.favorites) {
                return state.currentPreferences.favorites;
            } else {
                return { tools: [] };
            }
        },
    },
    actions: {
        async loadUser() {
            if (!loadPromise) {
                loadPromise = getCurrentUser()
                    .then((user) => {
                        const historyStore = useHistoryStore();
                        this.currentUser = { ...user, isAnonymous: !user.email };
                        this.currentPreferences = user?.preferences ?? null;
                        historyStore.loadCurrentHistory();
                        historyStore.loadHistories();
                    })
                    .catch((e) => {
                        console.error("Failed to load user", e);
                    })
                    .finally(() => {
                        loadPromise = null;
                    });
            }
        },
        async setCurrentTheme(theme: string) {
            const currentTheme = await setCurrentThemeQuery(this.currentUser!.id, theme);
            if (this.currentPreferences) {
                this.currentPreferences.theme = currentTheme;
            }
        },
        async addFavoriteTool(toolId: string) {
            const tools = await addFavoriteToolQuery(this.currentUser!.id, toolId);
            this.setFavoriteTools(tools);
        },
        async removeFavoriteTool(toolId: string) {
            const tools = await removeFavoriteToolQuery(this.currentUser!.id, toolId);
            this.setFavoriteTools(tools);
        },
        setFavoriteTools(tools: string[]) {
            if (this.currentPreferences) {
                this.currentPreferences.favorites.tools = tools ?? { tools: [] };
            }
        },
    },
});
