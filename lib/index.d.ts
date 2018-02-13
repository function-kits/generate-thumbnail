export interface KitOptions {
    maxHeight: number;
    maxWidth: number;
    prefix: string;
    bucket: string;
    filter?: (ObjectMetadata) => boolean;
    postProcess?: (bucket: string, original: string, thumbnail: string) => Promise<void> | void;
}
export declare const defaultOptions: KitOptions;
export interface GenerateThumbnailOptions {
    bucket: string;
    name: string;
    contentType: string;
    maxHeight: number;
    maxWidth: number;
    prefix: string;
}
/**
 * @returns {Promise<void>}
 */
export declare function generateThumbnail(options: GenerateThumbnailOptions): Promise<string>;
/**
 * When an image is uploaded in the Storage bucket We generate a thumbnail automatically using
 * ImageMagick.
 * After the thumbnail has been generated and uploaded to Cloud Storage,
 * we write the public URL to the Firebase Realtime Database.
 * TODO(inlined): Find a way to compile cleanly & easily with a more accurate type definition.
 */
export declare function autoThumbnailer(options: KitOptions): Function;
declare const _default: Function;
export default _default;
