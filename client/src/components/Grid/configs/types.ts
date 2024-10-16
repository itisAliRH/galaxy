import { type IconDefinition } from "@fortawesome/fontawesome-svg-core";

import { type GalaxyConfiguration } from "@/stores/configurationStore";
import type Filtering from "@/utils/filtering";

export interface Action {
    title: string;
    icon?: IconDefinition;
    handler: () => void;
}

export type ActionArray = Array<Action>;

export interface ActionButton {
    icon: any;
    title: string;
    disabled: boolean;
    size: string; // TODO "sm" | "md" | "lg";
    variant: string; // TODO "outline-primary" | "primary";
    onClick?: (d: RowData) => void;
    to?: (data: RowData) => string;
    condition?: (data: RowData) => boolean;
}
export interface CardConfig {
    expandable?: boolean;
    gridView?: boolean;
    renameAllowed?: boolean;
    actions?: ActionButton[];
    moreActions: ActionButton[];
    primaryActions: ActionButton[];
    tagsHandler?: (data: string[], itemId: string) => Promise<void>;
}
export interface GridConfig {
    id: string;
    actions?: ActionArray;
    fields: FieldArray;
    label?: string;
    filtering?: Filtering<any>;
    getData: (
        offset: number,
        limit: number,
        search: string,
        sort_by: string,
        sort_desc: boolean,
        extraProps?: Record<string, unknown>
    ) => Promise<any>;
    batch?: BatchOperationArray;
    plural: string;
    sortBy: string;
    sortKeys: string[];
    sortDesc: boolean;
    title: string;
    limit?: number;
    noItemsMessage?: string;
    listFilters?: {
        id: string;
        text: string;
        callback: () => void;
    }[];
    cardConfig?: CardConfig;
    to?: string;
    loginRequired?: boolean;
}

export type FieldArray = Array<FieldEntry>;

export interface FieldEntry {
    key: string;
    title?: string | null;
    condition?: (data: RowData) => boolean;
    disabled?: boolean;
    type: validTypes;
    operations?: Array<Operation>;
    icon?: IconDefinition;
    handler?: FieldHandler;
    converter?: (data: RowData) => string;
    width?: number;
}

export type FieldHandler = (data: RowData) => void;

export interface BatchOperation {
    title: string;
    icon: IconDefinition;
    condition?: (data: Array<RowData>) => boolean;
    handler: (data: Array<RowData>) => OperationHandlerReturn;
}

export type BatchOperationArray = Array<BatchOperation>;

export interface Operation {
    title: string;
    icon: IconDefinition;
    condition?: (data: RowData, config: GalaxyConfiguration) => boolean;
    handler: (data: RowData) => OperationHandlerReturn;
}

interface OperationHandlerMessage {
    message: string;
    status: string;
}

type OperationHandlerReturn = Promise<OperationHandlerMessage | undefined> | void;

export type RowData = Record<string, unknown>;

type validTypes =
    | "boolean"
    | "date"
    | "datasets"
    | "link"
    | "button"
    | "operations"
    | "sharing"
    | "tags"
    | "text"
    | "expand"
    | "history"
    | "helptext";
