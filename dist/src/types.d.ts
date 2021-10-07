/// <reference types="node" />
import { BuildOptions, BuildResult, Metafile, OutputFile, TransformOptions } from 'esbuild';
import type { RawSourceMap, SourceMapConsumer } from 'source-map-js';
declare type NodeRequireFunction = (id: string) => any;
export declare type ModuleDefinition = (exports: NodeModule['exports'], module: {
    exports: NodeModule['exports'];
}, __filename: string, __dirname: string, require: NodeRequireFunction) => NodeModule;
export declare type ModuleResolveResult = {
    resolved: 'module:node' | 'module-uri:node' | 'module-fullpath:node' | 'module-key:node' | 'module:tsc' | 'path' | 'cache:direct' | 'cache:node';
    fullPath: string;
};
export declare type ModuleLoadResult = ModuleResolveResult & {
    exports: NodeModule['exports'];
    origin: 'packherd:export' | 'packherd:definition' | 'packherd:loading' | 'Module._cache' | 'Module._load';
};
export declare type ModuleMapper = (parent: NodeModule, moduleUri: string, projectBasedir: string) => string;
export declare type ModuleBuiltin = typeof import('module') & {
    _resolveFilename(moduleUri: string, parent: NodeModule | undefined, isMain: boolean): string;
    _load(request: string, parent: NodeModule | undefined, isMain: boolean): NodeModule;
    _cache: Record<string, NodeModule>;
};
export declare type CreateBundleOpts = BuildOptions & {
    entryFilePath: string;
};
export declare type CreateBundleOutputFile = {
    contents: OutputFile['contents'];
};
export declare type CreateBundleSourcemap = {
    contents: OutputFile['contents'];
};
export declare type CreateBundleResult = {
    warnings: BuildResult['warnings'];
    outputFiles: CreateBundleOutputFile[];
    sourceMap?: CreateBundleSourcemap;
    metafile?: Metafile;
};
export declare type CreateBundle = (args: CreateBundleOpts) => Promise<CreateBundleResult>;
export interface TranspileCache {
    get(fullPath: string, skipStaleCheck?: boolean): string | undefined;
    addAsync(origFullPath: string, convertedContent: string): Promise<void>;
    add(origFullPath: string, convertedContent: string): void;
    clearSync(): void;
}
export declare type TranspileCacheOpts = {
    cacheDir: string;
    keepInMemoryCache: boolean;
};
export declare type InitTranspileCache = (projectBasedir: string, opts?: Partial<TranspileCacheOpts>) => TranspileCache | undefined;
export declare type PackherdTranspileOpts = {
    tsconfig?: TransformOptions['tsconfigRaw'];
    supportTS?: boolean;
    initTranspileCache?: InitTranspileCache;
};
export declare type SourceMapLookup = (uri: string) => RawSourceMap | undefined;
export declare type UrlAndMap = {
    url: string | null;
    map: SourceMapConsumer | null;
};
export declare type MapAndSourceContent = {
    url: string;
    map: SourceMapConsumer;
    sourceContent: string;
};
export declare type ModuleNeedsReload = (moduleId: string, loadedModules: Set<string>, moduleCache: Record<string, NodeModule>) => boolean;
export {};
