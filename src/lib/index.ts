import * as chokidar from 'chokidar';
import { FSWatcher } from 'chokidar';
import anymatch from 'anymatch';
import { Stats } from 'fs';
import { EventEmitter } from 'events';
import { Constructor, ANY } from './misc';
import { memoize } from 'lodash';
import * as Path from 'path';
import { LiveGlobFactory, Options, LiveGlob as _LiveGlob } from './internal';

export type LiveGlob = _LiveGlob;
export {Options} from './internal';

export function glob(globs: string | Array<string>, options?: Options): Promise<LiveGlob>;
export function glob(globs: string | Array<string>, {
    absolute = false,
    cwd = process.cwd(),
    delimiter = 'native',
    initialStateConsideredDirty = false
}: Options = {}) {
    // const factory = internalFactory(cwd);
    const factory = new LiveGlobFactory({
        cwd
    });
    return factory.create(globs, {absolute, delimiter, initialStateConsideredDirty});
}

const internalFactory = memoize((cwd: string) => {
    return new LiveGlobFactory({
        cwd
    });
});
