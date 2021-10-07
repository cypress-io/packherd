import { CreateBundle } from './types';
export declare type PathsMapper = (s: string) => string;
export declare const identityMapper: PathsMapper;
export declare class EntryGenerator {
    private readonly createBundle;
    private readonly entryFile;
    private readonly nodeModulesOnly;
    private readonly pathsMapper;
    private readonly entryDirectory;
    constructor(createBundle: CreateBundle, entryFile: string, nodeModulesOnly?: boolean, pathsMapper?: PathsMapper);
    createEntryScript(): Promise<{
        paths: string[];
        entry: string;
    }>;
    private _getMetadata;
    private _resolveRelativePaths;
}
