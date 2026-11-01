import { z } from "zod";
import { ResponseFormat } from "../services/format.js";
export type Shape = Record<string, z.ZodTypeAny>;
/** IDs may arrive as numbers or strings; 64-bit order line IDs must stay strings. */
export declare const Id: z.ZodUnion<readonly [z.ZodString, z.ZodNumber]>;
export declare const id: (description: string) => z.ZodUnion<readonly [z.ZodString, z.ZodNumber]>;
/** i18n object, e.g. {"es": "Remera", "pt": "Camiseta"}. */
export declare const i18n: (description: string) => z.ZodRecord<z.ZodString, z.ZodString>;
export declare const obj: (description: string) => z.ZodRecord<z.ZodString, z.ZodUnknown>;
export declare const objArray: (description: string) => z.ZodArray<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
export declare const str: (description: string) => z.ZodString;
export declare const num: (description: string) => z.ZodNumber;
export declare const bool: (description: string) => z.ZodBoolean;
export declare const enumOf: <T extends [string, ...string[]]>(values: T, description: string) => z.ZodEnum<{ [k in T[number]]: k; } extends infer T_1 ? { [k in keyof T_1]: T_1[k]; } : never>;
export declare const responseFormat: z.ZodDefault<z.ZodEnum<typeof ResponseFormat>>;
export declare const paginationShape: Shape;
export declare const fieldsParam: z.ZodOptional<z.ZodString>;
/** Common date-range / cursor filters shared by many list endpoints. */
export declare const sinceId: z.ZodOptional<z.ZodUnion<readonly [z.ZodString, z.ZodNumber]>>;
export declare const created: {
    created_at_min: z.ZodOptional<z.ZodString>;
    created_at_max: z.ZodOptional<z.ZodString>;
};
export declare const updated: {
    updated_at_min: z.ZodOptional<z.ZodString>;
    updated_at_max: z.ZodOptional<z.ZodString>;
};
export declare const timeFilters: Shape;
