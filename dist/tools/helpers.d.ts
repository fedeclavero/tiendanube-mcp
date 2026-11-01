import { z } from "zod";
import { EndpointDef } from "./registry.js";
type Extra = Partial<Omit<EndpointDef, "name" | "path" | "scope" | "description" | "method">>;
export declare const GET: (name: string, path: string, scope: string, description: string, extra?: Extra) => EndpointDef;
export declare const POST: (name: string, path: string, scope: string, description: string, extra?: Extra) => EndpointDef;
export declare const PUT: (name: string, path: string, scope: string, description: string, extra?: Extra) => EndpointDef;
export declare const PATCH: (name: string, path: string, scope: string, description: string, extra?: Extra) => EndpointDef;
export declare const DELETE: (name: string, path: string, scope: string, description: string, extra?: Extra) => EndpointDef;
/** GET returning a paginated collection. */
export declare const LIST: (name: string, path: string, scope: string, description: string, extra?: Extra) => EndpointDef;
/** GET returning a single resource (supports `fields`). */
export declare const ONE: (name: string, path: string, scope: string, description: string, extra?: Extra) => EndpointDef;
/** Free-form JSON body (object or array) for endpoints whose payload is documented only in the API reference. */
export declare const payload: (description: string, required?: boolean) => z.ZodOptional<z.ZodUnion<readonly [z.ZodRecord<z.ZodString, z.ZodUnknown>, z.ZodArray<z.ZodUnknown>]>> | z.ZodUnion<readonly [z.ZodRecord<z.ZodString, z.ZodUnknown>, z.ZodArray<z.ZodUnknown>]>;
export {};
