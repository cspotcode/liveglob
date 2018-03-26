import watchman from 'fb-watchman';
import * as Path from 'path';
import { once } from 'lodash';
import { TODO } from './misc';
import { WatcherProvider, NotificationReceiver, Watcher } from './adapter';

/// <reference path="../types/fb-watchman" />


export class WatchmanProvider implements WatcherProvider<WatchmanWatcher> {
    getClient = once(() => new Promise<watchman.Client>((res, rej) => {
        const client = new watchman.Client();
        client.capabilityCheck({optional: [], required: ['relative_root']}, (error, resp) => {
            if(error) {
                client.end();
                rej(new WatchmanError('Error checking capabilities', error));
            }
            res(client);
        });
    }));

    async getWatcher(cwd: string, notificationReceiver: NotificationReceiver) {
        const client = await this.getClient();
        return new WatchmanWatcher(notificationReceiver, cwd, client);
    }
}

interface OurFields {
    name: string;
    exists: boolean;
    type: 'f' | 'd';
}

let id = 1;

export class WatchmanWatcher implements Watcher {
    constructor(private _t: NotificationReceiver, private _cwd: string, private _client: watchman.Client) {

    }

    // Subscriptions are scoped per-connection, so we only need to avoid namespace collisions with ourself
    private _subscription: string = `${ ++id }`;
    // path to project root.  This is something watchman does; we ask to watch a directory and it figures out
    // what "project" directory contains the directory we want to watch.
    private _projectRoot: string | undefined;
    private _projectRelativePath: string | undefined;


    private onChangeReceived(fields: OurFields) {
        const {exists, type, name} = fields;
        const absNative = this.normalize(name);
        if(exists) {
            if(type === 'f') {
                this._t.onFileAddedOrChanged(absNative);
            } else {
                this._t.onDirectoryAdded(absNative);
            }
        } else {
            if(type === 'f') {
                this._t.onFileRemoved(absNative);
            } else {
                this._t.onDirectoryRemoved(absNative);
            }
        }
    }

    start(): Promise<void> {
        return new Promise((res, rej) => {
            // Initiate a project watch
            this._client.command(['watch-project', this._cwd], (error, _resp) => {
                if(error) {
                    rej(new WatchmanError('Error initiating watch', error));
                    return;
                }
                const resp = _resp!;

                if('warning' in resp) {
                    this._t.logWarning(resp.warning);
                }

                this._projectRoot = resp.watch;
                this._projectRelativePath = resp.relative_path;

                this._t.logInfo(`watch established on ${ this._projectRoot } relative_path ${ this._projectRelativePath }`);

                this._client.on('subscription', (resp) => {
                    if(resp.subscription === this._subscription) {
                        for(const file of resp.files) {
                            this.onChangeReceived(file as OurFields);
                        }
                    }
                });
                this._client.once('subscription', resp => {
                    res();
                });
                this._client.command(['subscribe', this._projectRoot, this._subscription, {
                    fields: ['exists', 'name', 'type']
                }], (err, resp) => {
                    if(err) rej(new WatchmanError('Error starting subscription', err));
                });
            });
        });
    }

    dispose() {
        return new Promise<void>((res, rej) => {
            this._client.command(['unsubscribe', this._cwd], (error, resp) => {
                if(error) {
                    rej(new WatchmanError('Error stopping watch', error));
                    return;
                }
                res();
            });
        });
    }

    /**
     * convert a path coming from watchman into native, absolute path
     * Watchman gives us paths relative to the *project* root
     */
    private normalize(path: string) {
        return Path.resolve(this._projectRoot!, path);
    }
}

class WatchmanError extends Error {
    constructor(message: string, public watchmanError: any) {
        super(`Watchman: ${ message }: ${ watchmanError }`);
    }
}
