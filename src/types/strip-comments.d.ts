// Type definitions for strip-comments 3.0  -- shuts up compiler warnings.

declare module "strip-comments" {
    /**
     * Removes JavaScript comments from source text.
     * Returns uncommented code as a string.
     */
    function strip(input: string): string;
    export default strip;
}
