import * as Path from 'path';
import * as fs from 'fs';
import * as m from '../lib/index';
import { LiveGlob } from '../lib/index';
import { assert} from 'chai';
import { sync as rimrafSync } from 'rimraf';
import { sync as mkdirpSync } from 'mkdirp';
import * as fsExtra from 'fs-extra';
import { describe, before, beforeEach, after, afterEach, it, xit, xdescribe} from 'mocha';

// Directory watching doesn't work reliably on Windows.
const testDirWatching = true;

const pause = 0.1e3;

describe('liveglob', () => {

    const projectRootAbs = toPosix(Path.normalize(process.cwd()));
    const projectRootRel = '.';
    const fixtureRootRel = 'src/test/fixtures';
    const fixtureRootAbs = toPosix(Path.resolve(fixtureRootRel));

    beforeEach(async () => {
        // Prepare 'bar' as a mutable copy of fixtures
        rimrafSync(Path.join(fixtureRootAbs, 'bar'));
        fsExtra.copySync(Path.join(fixtureRootAbs, 'foo'), Path.join(fixtureRootAbs, 'bar'));
        await delay(pause);
    });

    /** Assert that the items of a set match the contents of an array (ignoring ordering) */
    function setMatches(set: Set<string> | ReadonlyArray<Set<string> | false>, items: Array<string>) {
        const sets: ReadonlyArray<Set<string> | false> = Array.isArray(set) ? set : [set];
        const expected = [...items].sort();
        for(const s of sets) {
            if(s !== false) {
                assert.deepEqual(Array.from(s).sort(), expected);
            }
        }
    }

    function ident<A>(a: A) {return a}

    function narrow<T>(a: ReadonlyArray<T>) {return a}

    function toPosix(path: string) {
        return process.platform === 'win32' ? path.replace(/\\/g, '/') : path;
    }
    function toNativeAll(paths: Array<string>) {
        return paths.map(v => {
            assert(v.indexOf('\\') === -1);
            return process.platform === 'win32' ? v.replace(/\//g, '\\') : v;
        });
    }

    function describeEach<T>(m: Array<[string, T]>, cb: (v: T) => void) {
        for(const [d, v] of m) {
            describe(d, async () => {
                return cb(v);
            });
        }
    }

    function itEach<T>(m: Array<[string, T]>, cb: (v: T) => Promise<void>) {
        for(const [d, v] of m) {
            it(d, () => {
                return cb(v);
            });
        }
    }

    function mergeOptions(...opts: Array<Partial<m.Options> | undefined>) {
        return opts.some(v => !!v) ? Object.assign({}, ...opts) : undefined;
    }

    /** Write random contents to a file */
    function touch(path: string) {
        fs.writeFileSync(path, Math.random());
    }

    function delay(ms: number) {
        return new Promise(res => {setTimeout(res, ms)});
    }

    /** Retry assertions several times till they are eventually true */
    async function till(assertions: () => Promise<void>) {
        let err: any;
        for(let i = 0; i < 10; i++) {
            try {
                return await assertions();
            } catch(e) {
                err = e;
            }
            await delay(pause);
        }
        throw err;
    }

    describeEach<[Partial<m.Options> | undefined, boolean]>([
        ['returns relative paths (by default)', [undefined, false]],
        ['returns relative paths (explicit)', [{absolute: false}, false]],
        ['returns absolute paths', [{absolute: true}, true]]
    ], ([absOpts, absolute]) => {
        describeEach<[Partial<m.Options> | undefined, boolean]>([
            ['returns native paths (by default)', [undefined, false]],
            ['returns native paths (explicit)', [{delimiter: 'native'}, false]],
            ['returns posix paths', [{delimiter: 'posix'}, true]]
        ], ([delimOpts, posix]) => {
            describeEach<[Partial<m.Options> | undefined, string, boolean]>([
                ['with explicit relative cwd', [{cwd: fixtureRootRel}, fixtureRootRel, true]],
                ['with explicit absolute cwd', [{cwd: fixtureRootAbs}, fixtureRootAbs, true]],
                ['with default cwd', [undefined, projectRootAbs, false]]
            ], ([cwdOpts, cwd, isFixtureCwd]) => {
                describeEach<[Partial<m.Options> | undefined, boolean]>([
                    ['initial state considered dirty (explicit)', [{initialStateConsideredDirty: true}, true]],
                    ['initial state considered dirty (default)', [undefined, true]],
                    ['initial state not considered dirty', [{initialStateConsideredDirty: false}, false]]
                ], ([initialStateDirtyOpts, initialStateConsideredDirty]) => {

                    const outputRoot = absolute ? `${ fixtureRootAbs }/` : (isFixtureCwd ? '' : `${ fixtureRootRel }/`);
                    const globRoot = isFixtureCwd ? '' : `${ fixtureRootRel }/`;
                    const expectedOutputNormalizer = posix ? ident : toNativeAll;
                    const options = mergeOptions(absOpts, delimOpts, cwdOpts, initialStateDirtyOpts);

                    let liveglob: LiveGlob;

                    describe('array of globs', () => {
                        beforeEach(async () => {
                            liveglob = await m.glob([
                                `${ globRoot }bar/**/*`
                            ], options);
                            await delay(pause);
                        });
                        afterEach(async () => {
                            liveglob.close();
                        });
                        declareTests();
                    });
                    describe('single string glob', () => {
                        beforeEach(async () => {
                            liveglob = await m.glob(`${ globRoot }bar/**/*`, options);
                            await delay(pause);
                        });
                        afterEach(async () => {
                            liveglob.close();
                        });
                        declareTests();
                    });

                    function declareTests() {
                        it('captures initial state', async () => {
                            await till(async () => match(liveglob));

                            function match(lg: LiveGlob) {
                                if(testDirWatching) {
                                    ((e) => {
                                        setMatches(lg.directories, e);
                                        initialStateConsideredDirty && setMatches(lg.addedDirectories, e);
                                    })(expectedOutputNormalizer([
                                        `${ outputRoot }bar/sub`
                                    ]));
                                    if(!initialStateConsideredDirty) {
                                        setMatches(lg.addedDirectories, []);
                                        setMatches(lg.removedDirectories, []);
                                    }
                                }
                                ((e) => {
                                    setMatches(lg.files, e);
                                    initialStateConsideredDirty && setMatches(lg.addedFiles, e);
                                })(expectedOutputNormalizer([
                                    `${ outputRoot }bar/one.txt`,
                                    `${ outputRoot }bar/two.txt`,
                                    `${ outputRoot }bar/sub/three.txt`
                                ]));
                                if(!initialStateConsideredDirty) {
                                    setMatches(lg.addedFiles, []);
                                }
                                setMatches(lg.removedFiles, []);
                                setMatches(lg.changedFiles, []);
                            }
                        });

                        it('captures additions and deletions', async () => {
                            liveglob.clean();

                            touch(`${ fixtureRootAbs }/bar/additional1.txt`);
                            mkdirpSync(`${ fixtureRootAbs }/bar/newsub`);
                            touch(`${ fixtureRootAbs }/bar/sub/additional2.txt`);
                            touch(`${ fixtureRootAbs }/bar/newsub/additional3.txt`);
                            await delay(pause);

                            await till(async () => match(liveglob));

                            function match(lg: LiveGlob) {
                                if(testDirWatching) {
                                    setMatches([
                                        lg.directories,
                                    ], expectedOutputNormalizer([
                                        `${ outputRoot }bar/sub`,
                                        `${ outputRoot }bar/newsub`
                                    ]));
                                    setMatches(lg.addedDirectories, expectedOutputNormalizer([
                                        `${ outputRoot }bar/newsub`
                                    ]));
                                    setMatches(lg.removedDirectories, []);
                                }
                                setMatches(lg.files, expectedOutputNormalizer([
                                    `${ outputRoot }bar/one.txt`,
                                    `${ outputRoot }bar/two.txt`,
                                    `${ outputRoot }bar/sub/three.txt`,
                                    `${ outputRoot }bar/additional1.txt`,
                                    `${ outputRoot }bar/sub/additional2.txt`,
                                    `${ outputRoot }bar/newsub/additional3.txt`
                                ]));
                                setMatches(lg.addedFiles, expectedOutputNormalizer([
                                    `${ outputRoot }bar/additional1.txt`,
                                    `${ outputRoot }bar/sub/additional2.txt`,
                                    `${ outputRoot }bar/newsub/additional3.txt`
                                ]));
                                setMatches(lg.removedFiles, []);
                                setMatches(lg.changedFiles, []);
                            }

                            rimrafSync(`${ fixtureRootAbs }/bar/sub`);
                            touch(`${ fixtureRootAbs }/bar/one.txt`);
                            await delay(pause);

                            await till(async () => match2(liveglob));

                            function match2(lg: LiveGlob) {
                                if(testDirWatching) {
                                    setMatches(lg.directories, expectedOutputNormalizer([
                                        `${ outputRoot }bar/newsub`
                                    ]));
                                    setMatches(lg.addedDirectories, expectedOutputNormalizer([
                                        `${ outputRoot }bar/newsub`
                                    ]));
                                    setMatches(lg.removedDirectories, expectedOutputNormalizer([
                                        `${ outputRoot }bar/sub`,
                                    ]));
                                }
                                setMatches(lg.files, expectedOutputNormalizer([
                                    `${ outputRoot }bar/one.txt`,
                                    `${ outputRoot }bar/two.txt`,
                                    `${ outputRoot }bar/additional1.txt`,
                                    `${ outputRoot }bar/newsub/additional3.txt`
                                ]));
                                setMatches(lg.addedFiles, expectedOutputNormalizer([
                                    `${ outputRoot }bar/additional1.txt`,
                                    `${ outputRoot }bar/newsub/additional3.txt`
                                ]));
                                setMatches(lg.removedFiles, expectedOutputNormalizer([
                                    // additional2 is *not* considered removed because it did not exist at the time of last clean()
                                    `${ outputRoot }bar/sub/three.txt`,
                                ]));
                                setMatches(lg.changedFiles, expectedOutputNormalizer([
                                    `${ outputRoot }bar/one.txt`,
                                ]));
                            }

                            liveglob.clean();

                            await till(async () => match3(liveglob));

                            function match3(lg: LiveGlob) {
                                if(testDirWatching) {
                                    setMatches(lg.addedDirectories, []);
                                    setMatches(lg.removedDirectories, []);
                                }
                                setMatches(lg.addedFiles, []);
                                setMatches(lg.removedFiles, []);
                                setMatches(lg.changedFiles, []);
                            }
                        });
                    }
                });
            });
        });
    });
});
