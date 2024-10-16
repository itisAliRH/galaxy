import {
    faExchangeAlt,
    faEye,
    faPlus,
    faShareAlt,
    faSignature,
    faTrash,
    faTrashRestore,
    faUsers,
} from "@fortawesome/free-solid-svg-icons";
import { storeToRefs } from "pinia";

import { isRegisteredUser } from "@/api";
import { useHistoryStore } from "@/stores/historyStore";
import { useUserStore } from "@/stores/userStore";

type HistoryEntry = Record<string, unknown>;

export function isOwner(itemOwner?: string) {
    const { currentUser } = storeToRefs(useUserStore());

    if (isRegisteredUser(currentUser.value)) {
        return currentUser.value.username === (itemOwner || currentUser.value.username);
    }

    return false;
}

export const commonMoreActions = [
    {
        condition: (data: HistoryEntry) => !data.deleted && isOwner(),
        icon: faTrash,
        title: "Delete Permanently",
        disabled: false,
        size: "sm",
        variant: "outline-primary",
        onClick: () => console.log("Delete permanently"),
    },
    {
        condition: (data: HistoryEntry) => !data.deleted && isOwner(),
        icon: faTrash,
        title: "Delete",
        disabled: false,
        size: "sm",
        variant: "outline-primary",
        onClick: () => console.log("Delete history"),
    },
    {
        condition: (data: HistoryEntry) => !data.deleted && isOwner(),
        icon: faTrashRestore,
        title: "Restore",
        disabled: false,
        size: "sm",
        variant: "outline-primary",
        onClick: () => console.log("Restore history"),
    },
    {
        condition: (data: HistoryEntry) => !data.deleted && isOwner(),
        icon: faUsers,
        title: "Change permissions",
        disabled: false,
        size: "sm",
        variant: "outline-primary",
        to: (data: HistoryEntry) => `/histories/permissions?id=${data.id}`,
    },
];

export const commonPrimaryActions = [
    {
        condition: () => true,
        icon: faEye,
        title: "View",
        disabled: false,
        size: "sm",
        variant: "outline-primary",
        to: (data: HistoryEntry) => `/histories/view?id=${data.id}`,
    },
    {
        condition: () => isOwner(),
        icon: faExchangeAlt,
        title: "Switch",
        disabled: false,
        size: "sm",
        variant: "primary",
        onClick: (data: HistoryEntry) => {
            const historyStore = useHistoryStore();
            historyStore.setCurrentHistory(String(data.id));
        },
    },
];

export const commonActions = [
    {
        condition: () => isOwner(),
        icon: faShareAlt,
        title: "Share",
        disabled: false,
        size: "sm",
        variant: "outline-primary",
        to: (data: HistoryEntry) => `/histories/sharing?id=${data.id}`,
    },
];
