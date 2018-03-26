import { memoize } from 'lodash';

export type Constructor<T = {}> = new (...args: any[]) => T;
export const ANY = undefined as any;
export type TODO = any;

/**
 * Extract constructor type of a mixin.
 * Usage: type FooConstructor = MixinConstructorType<typeof Foo, Constructor>;
 */
export type MixinConstructorType<MixinFunction, BaseClass = 'auto'> = BaseClass extends 'auto' ? (
    MixinFunction extends (Base: infer B) => infer C ? C : never
) : (
    MixinFunction extends (Base: BaseClass) => infer C ? C : never
);

/**
 * Extract instance type of a mixin
 * Usage: type Foo = MixinType<typeof Foo, Constructor>;
 */
export type MixinType<MixinFunction, BaseClass = 'auto'> =
    MixinConstructorType<MixinFunction, BaseClass> extends infer R
    ? R extends Constructor
    ? InstanceType<R>
    : never : never;

export function weakMapMemoize<Fn extends (...args: any[]) => any>(fn: Fn) {
    const ret = memoize(fn);
    ret.cache = new WeakMap() as any;
    return ret;
}
