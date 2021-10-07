/// <reference types="node" />
import Module from 'module';
import { ModuleBuiltin as ModuleBuiltin, ModuleDefinition, ModuleLoadResult, ModuleResolveResult, ModuleNeedsReload } from './types';
import { Benchmark } from './benchmark';
export declare type GetModuleKeyOpts = {
    filename: string;
    path: string;
    relFilename?: string;
    relPath?: string;
    fromSnapshot?: boolean;
    isResolve?: boolean;
};
export declare type GetModuleKey = (opts: {
    moduleUri: string;
    baseDir: string;
    opts?: GetModuleKeyOpts;
}) => {
    moduleKey: string | undefined;
    moduleRelativePath: string | undefined;
};
export declare type ModuleLoaderOpts = {
    diagnostics?: boolean;
    moduleExports?: Record<string, Module>;
    moduleDefinitions?: Record<string, ModuleDefinition>;
    getModuleKey?: GetModuleKey;
    moduleNeedsReload?: ModuleNeedsReload;
};
export declare class PackherdModuleLoader {
    private readonly Module;
    private readonly origLoad;
    private readonly projectBaseDir;
    private readonly benchmark;
    exportHits: Set<string>;
    definitionHits: Set<string>;
    misses: Set<string>;
    private readonly diagnostics;
    private _dumpedInfo;
    private readonly getModuleKey;
    private readonly moduleExports;
    private readonly moduleDefinitions;
    private readonly loading;
    private readonly cacheTracker;
    constructor(Module: ModuleBuiltin, origLoad: ModuleBuiltin['_load'], projectBaseDir: string, benchmark: Benchmark, opts: ModuleLoaderOpts);
    shouldBypassCache(mod: NodeModule): boolean;
    registerModuleLoad(mod: NodeModule, loadedFrom: 'exports' | 'definitions' | 'Node.js require' | 'Counted already'): void;
    private _tryCacheDirect;
    private _loadCacheDirect;
    tryResolve(moduleUri: string, opts?: GetModuleKeyOpts): ModuleResolveResult;
    tryLoad(moduleUri: string, parent: NodeModule | undefined, isMain: boolean): ModuleLoadResult;
    private _dumpInfo;
    private _resolvePaths;
    private _createModule;
    private _initModuleFromExport;
    private _initModuleFromDefinition;
    private _createRequire;
    private _interceptedRequire;
    private _tryResolveFilename;
    private _tryResolveFullPath;
    private _ensureFullPathExportsModule;
    private _ensureParentPaths;
}
