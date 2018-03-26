// Type definitions for fb-watchman 2.0
// Project: https://facebook.github.io/watchman/docs/nodejs.html
// Definitions by: Andrew Bradley <https://github.com/cspotcode>
// Definitions: https://github.com/DefinitelyTyped/DefinitelyTyped
// TypeScript Version: 2.1

declare module "fb-watchman" {
    import { EventEmitter } from 'events';
    import { Command } from 'fb-watchman/commands';

    type TODO = any;

    interface Callback<T> {
        (error: Error | undefined, resp: T | undefined): void;
    }

    export class Client extends EventEmitter {
        /**
         * issues a version command to query the capabilities of the server.
         * 
         * If the server doesn’t support capabilities, capabilityCheck will emulate the capability response for a handful of significant capabilities based on the version reported by the server.
         * 
         * https://facebook.github.io/watchman/docs/nodejs.html#clientcapabilitycheckoptions-done
         */
        capabilityCheck(query: CapabilityCheckOptions, callback: Callback<CapabilityCheckReponse>): void;
        /**
         * https://facebook.github.io/watchman/docs/nodejs.html#clientcommandargs--done
         */
        command(commandAndArgs: Command, callback: Callback<CommandResponse>): void;
        /**
         * Terminates the connection to the watchman service. Does not wait for any queued commands to send.
         * 
         * https://facebook.github.io/watchman/docs/nodejs.html#clientend
         */
        end(): void;

        on(event: 'connect', callback: () => void): this;
        on(event: 'error', callback: (error: TODO) => void): this;
        on(event: 'end', callback: () => void): this;
        on(event: 'log', callback: (info: TODO) => void): this;
        on(event: 'subscription', callback: (resp: SubscriptionResults) => void): this;
        on(event: string | symbol, callback: (...args: any[]) => void): this;
    }

    /**
     * There are a lot of capability names, and enumerating them explicitly here would have little benefit
     * https://facebook.github.io/watchman/docs/capabilities.html
     */
    type CapabilityName = keyof CapabilityNameContributions
        | string; // TODO remove this if/when we manually list all capabilities here
    interface CapabilityNameContributions {
        'relative-root': any;
        'wildmatch': any;
        'suffix-set': any;
    }

    interface CapabilityCheckOptions {
        optional?: ReadonlyArray<CapabilityName>;
        required?: ReadonlyArray<CapabilityName>;
    }

    interface VersionResponse {
        version: string;
    }

    interface CapabilityCheckReponse extends VersionResponse {
        capabilities: {[K in CapabilityName]?: boolean}
    }

    interface CommandResponse {
        warning: TODO;
        [K: string]: TODO;
    }

    type ExpressionTerm = keyof ExpressionTermsContributions;
    interface ExpressionTermsContributions {
        allof: any;
        anyof: any;
        dirname: any;
        idirname: any;
        empty: any;
        exists: any;
        match: any;
        imatch: any;
        name: any;
        iname: any;
        not: any;
        pcre: any;
        ipcre: any;
        since: any;
        size: any;
        suffix: any;
        type: any;
    }

    type FileType = 'f' | 'd' | TODO;

    interface File {
        name: string;
        size: TODO;
        mtime_ms: TODO;
        exists: boolean;
        type: FileType;
    }

    type FieldName = keyof File;

    interface SubscriptionResults {
        root: TODO;
        subscription: string;
        files: ReadonlyArray<Partial<File>>;
    }
}

declare module 'fb-watchman/commands' {
    import {TODO, FieldName} from 'fb-watchman';

    type Command =
        Clock |
        Find |
        FlushSubscriptions |
        GetConfig |
        GetSockname |
        ListCapabilities |
        Log |
        LogLevel |
        Query |
        ShutdownServer |
        Since |
        StateEnter |
        StateLeave |
        Subscribe |
        Trigger |
        TriggerDel |
        TriggerList |
        Unsubscribe |
        Version |
        Watch |
        WatchDel |
        WatchDelAll |
        WatchList |
        WatchProject |
        ReadonlyArray<TODO>;

    type Clock = ['clock', TODO];
    type Find = ['find', TODO];
    type FlushSubscriptions = ['flush-subscriptions', TODO];
    type GetConfig = ['get-config', TODO];
    type GetSockname = ['get-sockname', TODO];
    type ListCapabilities = ['list-capabilities', TODO];
    type Log = ['log', TODO];
    type LogLevel = ['log-level', TODO];
    type Query = ['query', TODO];
    type ShutdownServer = ['shutdown-server', TODO];
    type Since = ['since', TODO];
    type StateEnter = ['state-enter', TODO];
    type StateLeave = ['state-leave', TODO];
    /**
     * tuple of command name, root path of watch, name of subscription, subscription options (filters, fields, etc)
     */
    type Subscribe = ['subscribe', string, string, SubscribeOptions];
    type Trigger = ['trigger', TODO];
    type TriggerDel = ['trigger-del', TODO];
    type TriggerList = ['trigger-list', TODO];
    /**
     * tuple of command name, root path of watch, name of subscription
     */
    type Unsubscribe = ['unsubscribe', string, string];
    type Version = ['version', TODO];
    type Watch = ['watch', TODO];
    type WatchDel = ['watch-del', TODO];
    type WatchDelAll = ['watch-del-all', TODO];
    type WatchList = ['watch-list', TODO];
    type WatchProject = ['watch-project', TODO];

    interface SubscribeOptions {
        expression?: TODO;
        fields?: ReadonlyArray<FieldName>;
        relative_root?: string;
    }

}
