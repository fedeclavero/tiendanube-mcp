import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { TiendanubeClient } from "../services/client.js";
/** Documented general limit for product images (Tiendanube API docs: "less than 10MB"). */
export declare const MAX_IMAGE_BYTES: number;
export interface ImageFile {
    base64: string;
    filename: string;
    mime: string;
    bytes: number;
}
/**
 * Read a local image for upload. Only real images are accepted (checked by magic bytes, not by
 * extension), so a prompt-injected "upload ~/.ssh/id_rsa" can never leave the machine through this tool.
 */
export declare function readImageFile(path: string): ImageFile;
export declare function registerWorkflowTools(server: McpServer, client: TiendanubeClient, options?: {
    readOnly?: boolean;
}): void;
