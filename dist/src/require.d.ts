/// <reference types="node" />
import { GetModuleKeyOpts, ModuleLoaderOpts } from './loader';
import type { ModuleNeedsReload, PackherdTranspileOpts, SourceMapLookup } from './types';
export * from './loader';
export declare type PackherdRequireOpts = ModuleLoaderOpts & {
    requireStatsFile?: string;
    transpileOpts?: Partial<PackherdTranspileOpts>;
    sourceMapLookup?: SourceMapLookup;
    moduleNeedsReload?: ModuleNeedsReload;
};
export declare function packherdRequire(projectBaseDir: string, opts: PackherdRequireOpts): {
    resolve: NodeJS.RequireResolve;
    shouldBypassCache?: undefined;
    registerModuleLoad?: undefined;
    tryLoad?: undefined;
} | {
    resolve(uri: string, opts?: GetModuleKeyOpts | undefined): string;
    shouldBypassCache: (mod: NodeModule) => boolean;
    registerModuleLoad: (mod: NodeModule, loadedFrom: "exports" | "definitions" | "Node.js require" | "Counted already") => void;
    tryLoad: (moduleUri: string, parent: NodeModule | undefined, isMain: boolean) => import("./types").ModuleLoadResult;
};
