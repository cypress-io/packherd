import { Metafile } from 'esbuild';
import { LoadInfo } from '../src/benchmark';
declare type AnalyzedInfo = {
    package: string;
    path: string;
    duration: number;
    size: string;
    children: {
        path: string;
        duration: number;
        size: string;
    }[];
};
export declare class Analyzer {
    readonly metaData: Metafile & {
        projectBaseDir: string;
    };
    private readonly all;
    constructor(allSorted: [key: string, val: LoadInfo][], metaData: Metafile & {
        projectBaseDir: string;
    });
    private importsByParent;
    analyze(): Promise<AnalyzedInfo[]>;
    private _produceParent;
}
export {};
