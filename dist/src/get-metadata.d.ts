import { Metafile } from 'esbuild';
import { CreateBundle } from './types';
export declare function getMetadata(createBundle: CreateBundle, entryFilePath: string, outbase: string): Promise<Metafile>;
