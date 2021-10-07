import type { TranspileCache } from './types';
export declare class DefaultTranspileCache implements TranspileCache {
    private readonly _cache;
    get(fullPath: string, _skipStaleCheck?: boolean): string | undefined;
    addAsync(origFullPath: string, convertedContent: string): Promise<void>;
    add(origFullPath: string, convertedContent: string): void;
    clearSync(): void;
}
