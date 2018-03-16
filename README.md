[![types included](https://img.shields.io/badge/types-included-green.svg)](#typescript-declarations)
[![npm](https://img.shields.io/npm/v/liveglob.svg)](https://npmjs.com/package//liveglob)
[![TravisCI](https://img.shields.io/travis/cspotcode/liveglob.svg)](https://travis-ci.org/cspotcode/liveglob)
[![Appveyor](https://img.shields.io/appveyor/ci/cspotcode/liveglob.svg)](https://ci.appveyor.com/project/cspotcode/liveglob)

A globber that uses FS watching to keep itself up-to-date in realtime.

Emits change events and allows synchronously retrieving the set of matched files at any time.

Useful for writing fast, watch-mode build tools.

Powered by `chokidar` under-the-hood.
