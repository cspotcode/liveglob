// Keep internals out of index.ts
// If something must be exported, but it's internal, do it here  (tsc's --declaration emit sometimes requires it because declarations can't reference non-exported stuff)

import * as chokidar from 'chokidar';
import { FSWatcher } from 'chokidar';
import anymatch from 'anymatch';
// import { EventEmitter, E, NodeEventEmitter } from './better-event-emitter';
import { Stats } from 'fs';
import { EventEmitter } from 'events';
import { Constructor, ANY } from './misc';
import { memoize } from 'lodash';
import * as Path from 'path';

/** Expose internal details of chokidar's FSWatcher */
interface FSWatcherInternal extends FSWatcher {
    _emitReady(): void;
}

export class LiveGlobFactory extends AbstractGlobState(EventEmitter) {
    constructor(opts: {
        cwd: string;
    }) {
        super();
        this._cwd = Path.resolve(opts.cwd);
        // HACK each time ready is fired, allow it to be fired again
        this._watcher.on('ready', () => {
            (this._watcher as FSWatcherInternal)._emitReady = this._emitReady;
        });
        register(this._watcher, this, false);
    }
    /** @internal */
    public _watcher = chokidar.watch([]);
    /**
     * @internal
     * MUST be absolute and normalized to native path separators
     */
    public _cwd: string;
    private _emitReady = (this._watcher as FSWatcherInternal)._emitReady;
    private _lastCreatePromise: Promise<LiveGlob> | undefined;
    /** @internal */
    matches() { return true; }
    /** @internal */
    normalizePath(p: string) { return p; }

    /** Create a new LiveGlob instance, watching a set of glob patterns */
    async create(globs: string | Array<string>, {
        initialStateConsideredDirty = true
    }: Options) {
        const _globs = Array.isArray(globs) ? globs : [globs];
        // atomically ensure that anyone else trying to create()
        // will wait until we're done
        return this._lastCreatePromise = (async () => {
            await this._lastCreatePromise;
            this._watcher.add(globs);
            await new Promise((res, rej) => {
                this._watcher.once('ready', () => res());
                this._watcher.once('error', rej);
            });
            return new LiveGlob(_globs, this, {initialStateConsideredDirty});
        })();
    }
}

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

export class LiveGlob extends AbstractGlobWithDiffState(AbstractGlobState(EventEmitter)) {
    constructor(public readonly globs: ReadonlyArray<string>, private readonly _factory: LiveGlobFactory, {
        initialStateConsideredDirty = false,
        delimiter = 'native',
        absolute = false
    }: Options) {
        super();
        register(_factory._watcher, this, true);
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
        populate(_factory.files, this.files, this.addedFiles);
        populate(_factory.directories, this.directories, this.addedDirectories);
    }
    private readonly _matcher: (p: string) => boolean;
    private readonly _forceForwardSlash: boolean;
    private readonly _absolutePaths: boolean;
    /** @internal */
    matches(rawPath: string) {
        return this._matcher(rawPath);
    }
    /** @internal */
    normalizePath(rawPath: string) {
        const path = this._absolutePaths ? Path.join(this._factory._cwd, rawPath) : rawPath;
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
    emit(event: 'add', filePath: string, stats?: Stats): boolean;
    emit(event: 'addDir', directoryPath: string, stats?: Stats): boolean;
    emit(event: 'change', filePath: string, stats?: Stats): boolean;
    emit(event: 'unlink', filePath: string): boolean;
    emit(event: 'unlinkDir', directoryPath: string): boolean;
    emit(event: string, ...args: any[]) { return super.emit(event, ...args); }
}

declare abstract class ___temp1 extends AbstractGlobState(class {}) {}
export type AbstractGlobState = ___temp1;

export function AbstractGlobState<C extends Constructor<any>>(Base: C) {

    abstract class _AbstractGlobState extends Base {
        /** Set of all matching files on the filesystem, kept up-to-date via watchers */
        readonly files = new Set<string>();
        /** Set of all matching directories on the filesystem, kept up-to-date via watchers */
        readonly directories = new Set<string>();
        /** Should a given path be included in this state? */
        abstract matches(rawPath: string): boolean;
        abstract normalizePath(rawPath: string): string;
    }

    return _AbstractGlobState;
}

declare abstract class ___temp2 extends AbstractGlobWithDiffState(AbstractGlobState(class {})) {}
export type AbstractGlobWithDiffState = ___temp2;

export function AbstractGlobWithDiffState<C extends Constructor<AbstractGlobState>>(Base: C) {
    abstract class _AbstractGlobWithDiffState extends Base {
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

    return _AbstractGlobWithDiffState;
}

function register(w: chokidar.FSWatcher, i: AbstractGlobWithDiffState & EventEmitter, registerDiffLogic: true): void;
function register(w: chokidar.FSWatcher, i: AbstractGlobState & EventEmitter, registerDiffLogic: false): void;
function register(w: chokidar.FSWatcher, i: (AbstractGlobState | AbstractGlobWithDiffState) & EventEmitter, registerDiffLogic: boolean) {
    function filteredEvent(name: string, action: (rawPath: string, normalizedPath: string) => void) {
        w.on(name, (rawPath, stats) => {
            if(i.matches(rawPath)) {
                const normalizedPath = i.normalizePath(rawPath);
                action(rawPath, normalizedPath);
                i.emit(name, normalizedPath, stats);
            }
        });
    }
    function doDiff(i: any): i is AbstractGlobWithDiffState {
        return registerDiffLogic;
    }
    filteredEvent('add', (rawPath, normalizedPath) => {
        i.files.add(normalizedPath);
        if(doDiff(i)) {
            // If file was previously removed, un-remove it
            if(i.removedFiles.delete(normalizedPath)) {
                // Removing and re-adding a file marks it changed
                i.changedFiles.add(normalizedPath);
            } else {
                i.addedFiles.add(normalizedPath);
            }
        }
    });
    filteredEvent('addDir', (rawPath, normalizedPath) => {
        i.directories.add(normalizedPath);
        if(doDiff(i)) {
            if(!i.removedDirectories.delete(normalizedPath)) {
                i.addedDirectories.add(normalizedPath);
            }
        }
    });
    filteredEvent('change', (rawPath, normalizedPath) => {
        i.files.add(normalizedPath); // TODO I'm pretty sure add the path here should be removed.
        if(doDiff(i)) {
            i.changedFiles.add(normalizedPath);
        }
    });
    filteredEvent('unlink', (rawPath, normalizedPath) => {
        i.files.delete(normalizedPath);
        if(doDiff(i)) {
            // If file was already added, it's now gone, as if nothing happened.
            if(!i.addedFiles.delete(normalizedPath)) {
                // Otherwise add it to list of deletions
                i.removedFiles.add(normalizedPath);
            }
        }
    });
    filteredEvent('unlinkDir', (rawPath, normalizedPath) => {
        i.directories.delete(normalizedPath);
        if(doDiff(i)) {
            if(!i.addedDirectories.delete(normalizedPath)) {
                i.removedDirectories.add(normalizedPath);
            }
        }
    });
}

/** On Windows, replaces all '\' with '/'.  On posix systems does nothing */
const posixDelim =
    process.platform === 'win32'
    ? (path: string) => path.replace(/\\/g, '/')
    : (path: string) => path;
