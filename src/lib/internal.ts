// Keep internals out of index.ts
// If something must be exported, but it's internal, do it here  (tsc's --declaration emit sometimes requires it because declarations can't reference non-exported stuff)

import * as chokidar from 'chokidar';
import { FSWatcher } from 'chokidar';
import anymatch from 'anymatch';
// import { EventEmitter, E, NodeEventEmitter } from './better-event-emitter';
import { Stats } from 'fs';
import { EventEmitter as EE } from 'single-event-emitter';
import { EventEmitter } from 'events';
import { Constructor, ANY, MixinConstructorType, MixinType } from './misc';
import { memoize } from 'lodash';
import * as Path from 'path';
import { Watcher, NotificationReceiver, NotificationEmitter, WatcherInterface } from './adapter';
import { WatchmanProvider } from './watchman-adapter';
import { ChokidarProvider } from './chokidar-adapter';
import { Disposable, DisposableConstructor } from './disposable';
import { Options } from './index';

type A = EE;

/**
 * Stores an in-memory representation of filesystem state without any glob filtering.
 * LiveGlob instances can be created via a factory and immediately populate their
 * internal state from their parent LiveGlobFactory.
 * 
 * Generally you have one LiveGlobFactory per cwd.
 */
export class LiveGlobFactory extends GlobState(Disposable(EventEmitter)) {
    constructor(opts: LGFOptions) {
        super();
        this._cwd = Path.resolve(opts.cwd);
        this._watcherInterface = opts.watcherInterface;

        this.disposeOnLastChildDisposed(true);

        bindGlobStateToWatcher(this._watcherInterface.observables, this, false);
    }
    /** @internal */
    public _watcherInterface: WatcherInterface;
    /**
     * @internal
     * MUST be absolute and normalized to native path separators
     */
    public _cwd: string;
    /** @internal */
    normalizePath(p: string) { return p; }

    /** Create a new LiveGlob instance, watching a set of glob patterns */
    create(globs: string | Array<string>, options: LGOptions) {
        if(this.isDisposed()) {
            throw new Error('This factory has already been closed.');
        }
        const _globs = Array.isArray(globs) ? globs : [globs];

        const lg = new LiveGlob(_globs, this, {
            absolute: options.absolute,
            delimiter: options.delimiter,
            initialStateConsideredDirty: options.initialStateConsideredDirty,
            notificationEmitter: this._watcherInterface.observables
        });
        // take ownership so that when child is disposed, we auto-dispose as well
        lg.setOwner(this);
        return lg;
    }
    protected performDisposal() {
        // TODO how to dispose the native adapter?
        this._watcherInterface.dispose();
    }
}

/** Options passed to internal LiveGlob constructor */
type LGOptions = Required<Pick<Options, Exclude<keyof Options, 'cwd'>>> & {
    notificationEmitter: NotificationEmitter
};
/** Options passed to internal LiveGlobFactory constructor */
type LGFOptions = Required<Pick<Options, 'cwd'>> & {
    watcherInterface: WatcherInterface;
};

export class LiveGlob extends GlobDiffState(GlobState(Disposable(EventEmitter))) {
    constructor(public readonly globs: ReadonlyArray<string>, private readonly _factory: LiveGlobFactory, {
        initialStateConsideredDirty,
        delimiter,
        absolute,
        notificationEmitter
    }: LGOptions) {
        super();
        bindGlobStateToWatcher(notificationEmitter, this, true);
        this._matcher = anymatch(globs as string[]);
        this._forceForwardSlash = delimiter === 'posix';
        this._absolutePaths = absolute;
        const populate = (from: Set<string>, to: Set<string>, deltaTo: Set<string>) => {
            for(const rawPath of from) {
                const normalizedPath = this.normalizePath(rawPath);
                if(this.matches(rawPath)) {
                    to.add(normalizedPath);
                    if(initialStateConsideredDirty) {
                        deltaTo.add(normalizedPath);
                    }
                }
            }
        }
        populate(this._factory.files, this.files, this.addedFiles);
        populate(this._factory.directories, this.directories, this.addedDirectories);
    }
    private readonly _matcher: (p: string) => boolean;
    private readonly _forceForwardSlash: boolean;
    private readonly _absolutePaths: boolean;
    /** @internal */
    matches(rawPath: string) {
        return this._matcher(this.cwdRelativePath(rawPath));
    }
    cwdRelativePath(absolutePath: string) {
        return Path.relative(this._factory._cwd, absolutePath);
    }
    /** @internal */
    normalizePath(rawPath: string) {
        // rawPath comes straight from the native watcher, so it's absolute with native separators
        const path = this._absolutePaths ? rawPath : this.cwdRelativePath(rawPath);
        return this._forceForwardSlash ? posixDelim(path) : path;
    }

    on(event: 'add', callback: (filePath: string, stats: Stats | undefined) => void): this;
    on(event: 'addDir', callback: (directoryPath: string, stats: Stats | undefined) => void): this;
    on(event: 'change', callback: (filePath: string, stats: Stats | undefined) => void): this;
    on(event: 'unlink', callback: (filePath: string) => void): this;
    on(event: 'unlinkDir', callback: (directoryPath: string) => void): this;
    on(event: string, cb: any) { return super.on(event, cb); }
    once(event: 'add', callback: (filePath: string, stats: Stats | undefined) => void): this;
    once(event: 'addDir', callback: (directoryPath: string, stats: Stats | undefined) => void): this;
    once(event: 'change', callback: (filePath: string, stats: Stats | undefined) => void): this;
    once(event: 'unlink', callback: (filePath: string) => void): this;
    once(event: 'unlinkDir', callback: (directoryPath: string) => void): this;
    once(event: string, cb: any) { return super.on(event, cb); }
    // emit(event: 'add', filePath: string, stats?: Stats): boolean;
    // emit(event: 'addDir', directoryPath: string, stats?: Stats): boolean;
    // emit(event: 'change', filePath: string, stats?: Stats): boolean;
    // emit(event: 'unlink', filePath: string): boolean;
    // emit(event: 'unlinkDir', directoryPath: string): boolean;
    // emit(event: string, ...args: any[]) { return super.emit(event, ...args); }
}

export type GlobStateConstructor = typeof GlobState extends (c: Constructor<Disposable>) => infer C ? C : never;
export type GlobState = InstanceType<GlobStateConstructor>;

export function GlobState<C extends Constructor<Disposable>>(Base: C) {

    abstract class _GlobState extends Base {
        /** Set of all matching files on the filesystem, kept up-to-date via watchers */
        readonly files = new Set<string>();
        /** Set of all matching directories on the filesystem, kept up-to-date via watchers */
        readonly directories = new Set<string>();
        /** Should a given path be included in this state? */
        matches(rawPath: string) {return true}
        abstract normalizePath(rawPath: string): string;
        close() {
            this.dispose();
        }
    }

    return _GlobState;
}

export type GlobDiffStateConstructor = typeof GlobDiffState extends (c: GlobStateConstructor) => infer C ? C : never;
export type GlobDiffState = InstanceType<GlobDiffStateConstructor>;

export function GlobDiffState<C extends GlobStateConstructor>(Base: C) {
    abstract class _GlobDiffState extends Base {
        /** Files that did not exist at the time of last clean() */
        readonly addedFiles = new Set<string>();
        /** Directories that did not exist at the time of last clean() */
        readonly addedDirectories = new Set<string>();
        /** Files that no longer exist but did at the time of last clean() */
        readonly removedFiles = new Set<string>();
        /** Directories that no longer exist but did at the time of last clean() */
        readonly removedDirectories = new Set<string>();
        /** files that were either modified or deleted and recreated since the last clean() */
        readonly changedFiles = new Set<string>();
        /** Clear sets of all changes, deletions, and additions.  Does not clear the sets of extant files and directories;
         * those are always preserved and kept up-to-date with the filesystem */
        clean() {
            this.addedFiles.clear();
            this.removedFiles.clear();
            this.changedFiles.clear();
            this.addedDirectories.clear();
            this.removedDirectories.clear();
        }
    }

    return _GlobDiffState;
}

function bindGlobStateToWatcher(emitter: NotificationEmitter, self: GlobDiffState & EventEmitter, registerDiffLogic: true): void;
function bindGlobStateToWatcher(emitter: NotificationEmitter, self: GlobState & EventEmitter, registerDiffLogic: false): void;
function bindGlobStateToWatcher(emitter: NotificationEmitter, self: (GlobState | GlobDiffState) & EventEmitter, registerDiffLogic: boolean) {
    type EmitName = 'add' | 'addDir' | 'change' | 'unlink' | 'unlinkDir' | 'ready';
    function filteredEvent(name: keyof NotificationEmitter, action: (rawPath: string, normalizedPath: string) => EmitName | void) {
        (emitter[name] as EE<[1, (s: string) => void]>).on((rawPath) => {
            if(self.isDisposed()) return;
            if(self.matches(rawPath)) {
                const normalizedPath = self.normalizePath(rawPath);
                const emitName = action(rawPath, normalizedPath);
                if(emitName) {
                    self.emit(emitName, normalizedPath);
                }
            }
        });
    }
    function doDiff(i: any): i is GlobDiffState {
        return registerDiffLogic;
    }
    filteredEvent('onFileAddedOrChanged', (rawPath, normalizedPath) => {
        if(self.files.has(normalizedPath)) {
            // process as change event
            self.files.add(normalizedPath); // TODO I'm pretty sure adding the path here isn't necessary
            if(doDiff(self)) {
                self.changedFiles.add(normalizedPath);
            }
            return 'change';
        } else {
            self.files.add(normalizedPath);
            if(doDiff(self)) {
                // If file was previously removed, un-remove it
                if(self.removedFiles.delete(normalizedPath)) {
                    // Removing and re-adding a file marks it changed
                    self.changedFiles.add(normalizedPath);
                } else {
                    self.addedFiles.add(normalizedPath);
                }
            }
            return 'add';
        }
    });
    filteredEvent('onDirectoryAdded', (rawPath, normalizedPath) => {
        if(!self.directories.has(normalizedPath)) {
            self.directories.add(normalizedPath);
            if(doDiff(self)) {
                if(!self.removedDirectories.delete(normalizedPath)) {
                    self.addedDirectories.add(normalizedPath);
                }
            }
            return 'addDir';
        }
    });
    filteredEvent('onFileRemoved', (rawPath, normalizedPath) => {
        if(self.files.has(normalizedPath)) {
            self.files.delete(normalizedPath);
            if(doDiff(self)) {
                // If file was already added, it's now gone, as if nothing happened.
                if(!self.addedFiles.delete(normalizedPath)) {
                    // Otherwise add it to list of deletions
                    self.removedFiles.add(normalizedPath);
                }
            }
            return 'unlink';
        }
    });
    filteredEvent('onDirectoryRemoved', (rawPath, normalizedPath) => {
        if(self.directories.has(normalizedPath)) {
            self.directories.delete(normalizedPath);
            if(doDiff(self)) {
                if(!self.addedDirectories.delete(normalizedPath)) {
                    self.removedDirectories.add(normalizedPath);
                }
            }
            return 'unlinkDir';
        }
    });
}

/** On Windows, replaces all '\' with '/'.  On posix systems does nothing */
const posixDelim =
    process.platform === 'win32'
    ? (path: string) => path.replace(/\\/g, '/')
    : (path: string) => path;

function makeAbsolute(cwd: string, path: string) {
    return Path.resolve(cwd, path);
}
