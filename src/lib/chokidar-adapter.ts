import { FSWatcher } from 'chokidar';
import * as Path from 'path';
import { NotificationReceiver, Watcher, WatcherProvider } from './adapter';
import * as chokidar from 'chokidar';

export class ChokidarProvider implements WatcherProvider<ChokidarWatcher> {
    async getWatcher(cwd: string, notificationReceiver: NotificationReceiver) {
        const _cwd = Path.resolve(cwd);
        return new ChokidarWatcher(notificationReceiver, _cwd);
    }
}

/** Expose internal details of chokidar's FSWatcher */
interface FSWatcherInternal extends FSWatcher {
    _emitReady(): void;
}

export class ChokidarWatcher implements Watcher {
    /**
     * @param _t
     * @param _cwd must be absolute and platform-normalized
     */
    constructor(private _t: NotificationReceiver, private _cwd: string) {

    }

    async start() {
        // Watch the entire cwd
        const _w = this._w = chokidar.watch('.', {cwd: this._cwd}) as FSWatcherInternal;
        const bind = (evt: string, action: (absNativePath: string) => void) => {
            _w.on(evt, (path) => {
                action(this.normalize(path));
            });
        };
        bind('add', (path) => {
            this._t.onFileAddedOrChanged(path);
        });
        bind('addDir', (path) => {
            this._t.onDirectoryAdded(path);
        });
        bind('change', (path) => {
            this._t.onFileAddedOrChanged(path);
        });
        bind('unlink', (path) => {
            this._t.onFileRemoved(path);
        });
        bind('unlinkDir', (path) => {
            this._t.onDirectoryRemoved(path);
        });
        return new Promise<void>((res) => {
            _w.once('ready', () => res());
        });
    }

    async dispose() {
        this._w!.close();
    }

    /** convert path to native, absolute path */
    private normalize(path: string) {
        return Path.resolve(this._cwd, path);
    }

    private _w: FSWatcherInternal | undefined;
}
