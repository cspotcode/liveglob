import * as chokidar from 'chokidar';
import { FSWatcher } from 'chokidar';
import anymatch from 'anymatch';
import { Stats } from 'fs';
import { EventEmitter } from 'events';
import { Constructor, ANY } from './misc';
import { memoize } from 'lodash';
import * as Path from 'path';
import { LiveGlobFactory, LiveGlob as _LiveGlob } from './internal';
import {WatchmanProvider} from './watchman-adapter';
import {ChokidarProvider} from './chokidar-adapter';
import { WatcherInterface } from './adapter';

export type LiveGlob = _LiveGlob;

/** Singleton provider, based on platform. */
const provider = process.platform === 'win32' ? new WatchmanProvider() : new ChokidarProvider();

/** Public API option-bag */
export interface Options {
    cwd?: string;
    /**
     * globs are evaluated relative to this directory
     * relative paths are relative to this directory (if `absolute` is false)
     */
    initialStateConsideredDirty?: boolean;
    /**
     * If 'posix', all paths are normalized to use posix-style '/' path delimiter.  If 'native' they will use '\' on Windows and '/' everywhere else.
     */
    delimiter?: 'native' | 'posix',
    /**
     * All paths are absolute rather than being relative to `cwd`
     * Does not affect glob matching
     * Default: false
     */
    absolute?: boolean;
}

export function glob(globs: string | Array<string>, options?: Options): Promise<LiveGlob>;
export async function glob(globs: string | Array<string>, {
    absolute = false,
    cwd = process.cwd(),
    delimiter = 'native',
    initialStateConsideredDirty = true
}: Options = {}) {
    // Normalize args
    const _cwd = Path.resolve(cwd);
    const _globs = Array.isArray(globs) ? globs : [globs];

    // TODO cache native watchers and factories per cwd

    const watcherInterface = new WatcherInterface();

    // Create a native watcher via our chosen provider.
    const watcher = await provider.getWatcher(_cwd, watcherInterface.receiver);

    // Create a factory bound to our native watcher
    const factory = new LiveGlobFactory({
        cwd: _cwd,
        watcherInterface
    });

    // start the watcher *after* binding our factory to it, so the factory receives initial file notifications
    await watcher.start();

    return factory.create(_globs, {
        absolute,
        delimiter,
        initialStateConsideredDirty,
        notificationEmitter: watcherInterface.observables
    });
}

// const internalFactory = memoize((cwd: string, watcherInterface: WatcherInterface) => {
//     return new LiveGlobFactory({
//         cwd,
//         watcherInterface
//     });
// });
