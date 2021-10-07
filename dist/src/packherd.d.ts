/// <reference types="node" />
import { PathsMapper } from './generate-entry';
import { CreateBundle } from './types';
export { packherdRequire, PackherdRequireOpts, GetModuleKey } from './require';
export * from './types';
export { getSourceMap, getSourceMapAndContent } from './sourcemap-support';
export declare type PackherdOpts = {
    entryFile: string;
    nodeModulesOnly?: boolean;
    pathsMapper?: PathsMapper;
    createBundle?: CreateBundle;
};
export declare function packherd(opts: PackherdOpts): Promise<{
    bundle: Buffer;
    sourceMap: Buffer | undefined;
    meta: import("esbuild").Metafile;
    warnings: import("esbuild").Message[];
}>;
