import type { MapAndSourceContent, SourceMapLookup, TranspileCache, UrlAndMap } from './types';
/**
 * Retrieves the sourcemap for the provided bundle uri via the sourcemap support instance.
 *
 * @param projectBaseDir the root of the project for which the bundled code was generated
 * @param bundleUri the path of the generated bundle
 * @param cache when provided will be used to look for sourcemaps from transpiled modules
 * @param sourceMapLookup when provided will be queried to lookup sourcemaps
 */
export declare function getSourceMap(projectBaseDir: string, bundleUri: string, cache?: TranspileCache, sourceMapLookup?: SourceMapLookup): UrlAndMap;
/**
 * Retrieves the sourcemap for the provided bundle uri via the sourcemap support instance
 * and extracts the source of the specified @see fileUri when found.
 *
 * @param projectBaseDir the root of the project for which the bundled code was generated
 * @param bundleUri the path of the generated bundle
 * @param fileUri the path for the original file we want to extract the source content for
 * @param cache when provided will be used to look for sourcemaps from transpiled modules
 * @param sourceMapLookup when provided will be queried to lookup sourcemaps
 */
export declare function getSourceMapAndContent(projectBaseDir: string, bundleUri: string, fileUri: string, cache?: TranspileCache, sourceMapLookup?: SourceMapLookup): MapAndSourceContent | undefined;
/**
 * Creates an instance of @see SourcemapSupport and installs a hook for
 * @see Error.prepareStackTrace in order to map stack traces using the source maps
 * it discovers.
 *
 * @param cache used to look up script content from which to extract source maps
 * @param projectBaseDir directory that is the root of relative source map sources
 * @param sourceMapLookup: when provided is queried for source maps for a particular URI first
 */
export declare function installSourcemapSupport(cache: TranspileCache, projectBaseDir: string, sourceMapLookup?: SourceMapLookup): void;
