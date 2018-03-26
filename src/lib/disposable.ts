import { Constructor, MixinConstructorType, MixinType } from "./misc";

export type Disposable = MixinType<typeof Disposable, Constructor>;
export type DisposableConstructor = MixinConstructorType<typeof Disposable>;

const sym = Symbol();
interface DisposableBrand {
    [sym]: typeof sym;
}

/**
 * Like the C# disposable, but also with an ownership mechanism so that disposables
 * can "own" other child disposables and auto-dispose themselves when their last
 * child is disposed.
 */
export function Disposable<C extends Constructor>(Base: C) {
    function asDisposable(d: DisposableBrand) { return d as _Disposable; }
    interface _Disposable extends DisposableBrand {}
    abstract class _Disposable extends Base {
        private _disposed = false;
        private _disposeOnLastChildDisposed = false;
        /*private*/ _parent: DisposableBrand | undefined = undefined;
        /*private*/ _children = new Set<DisposableBrand>();
        private _nondisposedChildren = 0;
        /*private*/ _disposalActions: Array<() => void> = [];
        isDisposed() { return this._disposed; }
        disposeOnLastChildDisposed(v: boolean) {
            this._disposeOnLastChildDisposed = v;
        }
        /** Called by Disposable on parent when a child is disposed */
        protected onChildDisposed(c: _Disposable) {
            this._nondisposedChildren--;
            if(this._disposeOnLastChildDisposed && this._nondisposedChildren <= 0) {
                this.dispose();
            }
        }
        /*private*/ _removeChild(c: _Disposable) {
            if(!this._children.has(c)) return;
            this._children.delete(c);
            c.isDisposed() || this._nondisposedChildren--;
        }
        /*private*/ _addChild(c: _Disposable) {
            if(this._children.has(c)) return;
            this._children.add(c);
            c.isDisposed() || this._nondisposedChildren++;
        }
        setOwner(parent: _Disposable) {
            if(this._parent) asDisposable(this._parent)._removeChild(this);
            this._parent = parent;
            parent._addChild(this);
        }
        /** return true if disposal is performed; false if it was already disposed */
        dispose(): boolean {
            if(!this._disposed) {
                this._disposed = true;
                this.performDisposal();
                this._parent && asDisposable(this._parent).onChildDisposed(this);
                return true;
            } else {
                return false;
            }
        }
        /** default implementation disposes all children and fires disposal callbacks */
        protected performDisposal(): void {
            for(const child of this._children) {
                asDisposable(child).dispose();
            }
            for(const cb of this._disposalActions) {
                cb();
            }
        };
        onDisposal(callback: () => void) {
            this._disposalActions.push(callback);
        }
    }
    return _Disposable;
}

function using(disposable: Disposable, action: () => void) {
    try {
        return action();
    } finally {
        disposable.dispose();
    }
}
