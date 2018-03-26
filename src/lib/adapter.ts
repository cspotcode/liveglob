import * as rxjs from '@reactivex/rxjs';
import { Observable } from '@reactivex/rxjs';
import { EventEmitter as EE } from 'single-event-emitter';
import { Disposable } from './disposable';
import { TODO } from './misc';

export interface WatcherProvider<W extends Watcher> {
    /**
     * @param cwd absolute path with native separators
     * @param notificationReceiver 
     */
    getWatcher(cwd: string, notificationReceiver: NotificationReceiver): Promise<W>;
}

/** Watches the filesystem and calls corresponding methods on a NotificationReceiver */
export interface Watcher {
    /**
     * start watching the entire cwd.  Return a promise that resolves once
     * initial FS state is fully
     * observed and Receiver methods have been called for all file and directories.
     */
    start(): Promise<void>;
    /** stop watching and cleanup everything.  Return a promise that resolves once cleanup is complete. */
    dispose(): Promise<void>;
}

/**
 * A NotificationReceiver is passed to new watchers.
 * They call methods on this object to notify LiveGlob about filesystem changes.
 */
export interface NotificationReceiver {
    /** Implementation is provided by LiveGlob.  Should be called whenever a file is added, including upon initial watch */
    onFileAddedOrChanged(absoluteNativePath: string): void;
    onFileRemoved(absoluteNativePath: string): void;
    onDirectoryAdded(absoluteNativePath: string): void;
    onDirectoryRemoved(absoluteNativePath: string): void;
    /** called exactly once, when the watcher has fully observed initial state of the directory */
    onReady(): void;
    /** When native watchers need to expose diagnostic messages */
    logWarning(message: string): void;
    logInfo(message: string): void;
}

const names: Array<keyof NotificationEmitter> = ['onDirectoryAdded', 'onDirectoryRemoved', 'onFileAddedOrChanged', 'onFileRemoved', 'onReady', 'logInfo', 'logWarning'];

// export type NotificationReceiver = {[K in keyof NotificationEmitter]: NotificationEmitter[K]['emit']}

export class NotificationEmitter {
    onFileAddedOrChanged = new EE<[1, (path: string) => void]>();
    onFileRemoved = new EE<[1, (path: string) => void]>();
    onDirectoryAdded = new EE<[1, (path: string) => void]>();
    onDirectoryRemoved = new EE<[1, (path: string) => void]>();
    onReady = new EE<[0, () => void]>();
    logWarning = new EE<[1, (message: string) => void]>();
    logInfo = new EE<[1, (message: string) => void]>();
}

/** Interface between a native Watcher (from a WatcherProvider) and a LiveGlobFactory or LiveGlob */
export class WatcherInterface extends Disposable(class {}) {
    constructor() {
        super();
        this.receiver = {} as any;
        for(const name of names) {
            this.receiver[name] = (...args: any[]) => (this.observables[name].emit as TODO)(...args);
        }
    }
    // adapter calls methods on this
    receiver: NotificationReceiver;
    // listeners register here
    observables = new NotificationEmitter();
}
