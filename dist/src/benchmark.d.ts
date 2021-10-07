import { ModuleLoadResult } from './types';
export declare type LoadInfo = {
    duration: number;
    stack: string[];
};
export declare type LoadInfos = Map<string, LoadInfo>;
export declare type PersistedLoadInfos = {
    packherdExports: [string, LoadInfo][];
    packherdDefinitions: [string, LoadInfo][];
    moduleLoads: [string, LoadInfo][];
};
export declare type Benchmark = {
    time(key: string): void;
    timeEnd(key: string, origin: ModuleLoadResult['origin'], stack: string[]): void;
    write(): void;
};
declare class InactiveBenchmark {
    time(_key: string): void;
    timeEnd(_key: string, _origin: ModuleLoadResult['origin'], _stack: string[]): void;
    write(): void;
}
declare class ActiveBenchmark {
    private readonly projectBaseDir;
    private readonly outputPath;
    private readonly pending;
    private readonly packherdExports;
    private readonly packherdDefinitions;
    private readonly moduleLoads;
    constructor(projectBaseDir: string, outputPath: string);
    time(key: string): void;
    timeEnd(key: string, origin: ModuleLoadResult['origin'], stack: string[]): void;
    write(): void;
    private _fullPath;
    private json;
}
/**
 * Depending on the provided outputPath being defined or not, it sets up
 * an inactive benchmark which does nothing or an active one which
 * collects and writes out data.
 */
export declare function setupBenchmark(projectBaseDir: string, outputPath?: string): InactiveBenchmark | ActiveBenchmark;
export {};
