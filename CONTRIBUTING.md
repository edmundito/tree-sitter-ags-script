# Contributing to tree-sitter-ags-ags-script

## Setup

Currently Node 8.x is required and will not build in a newer version of Node.

## Development

All you have to do is modify the `grammar.js` file to modify definitions.
Additionally, you can add a test for the grammar inside `corpus`.

See the [tree-sitter](https://github.com/tree-sitter/tree-sitter) documentation to learn more about contributing to the grammar and the tests.

## Releasing

To release new version, use `npm version` and push tags to master.

Run `npm publish` to publish the new version.

CI will run a [prebuild](https://www.npmjs.com/package/prebuild) step to build and upload binaries for Linux, Mac, Windows that can be used when the end user installs the published package.
