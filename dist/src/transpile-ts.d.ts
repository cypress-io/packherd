/// <reference types="node" />
import type { Debugger } from 'debug';
import { TransformOptions } from 'esbuild';
import type { TranspileCache, SourceMapLookup } from './types';
declare type EnhancedModule = NodeModule & {
    _extensions: Record<string, (mod: EnhancedModule, filename: string) => void>;
    _compile: (code: string, filename: string) => unknown;
    _cache: Record<string, NodeModule>;
};
export declare function transpileTs(fullModuleUri: string, cache: TranspileCache, projectBaseDir: string, sourceMapLookup?: SourceMapLookup, tsconfig?: TransformOptions['tsconfigRaw']): string;
export declare function transpileTsCode(fullModuleUri: string, ts: string, cache: TranspileCache, projectBaseDir: string, sourceMapLookup?: SourceMapLookup, tsconfig?: TransformOptions['tsconfigRaw']): string;
export declare function hookTranspileTs(Module: EnhancedModule, projectBaseDir: string, log: Debugger, diagnostics: boolean, cache: TranspileCache, sourceMapLookup?: SourceMapLookup, tsconfig?: TransformOptions['tsconfigRaw']): void;
export {};
