//@ts-check

'use strict';

const withDefaults = require('../shared.webpack.config');
const CopyWebpackPlugin = require('copy-webpack-plugin');

const path = require('path');

module.exports = {
    ...withDefaults({
        context: path.join(__dirname),
        entry: {
            extension: './src/server.ts',
        },
        output: {
            filename: 'server.js',
            path: path.join(__dirname, 'out')
        },
        externals: {
            'utf-8-validate': 'utf-8-validate',
            'bufferutil': 'bufferutil',

            'balanced-match': 'balanced-match',
            'brace-expansion': 'brace-expansion',
            'concat-map': 'concat-map',
            'jsonc-parser': 'jsonc-parser',
            'js-yaml': 'js-yaml',
            'minimatch': 'minimatch',
            'prettier': 'prettier',
            'vscode-json-languageservice': 'vscode-json-languageservice',
            'vscode-jsonrpc': 'vscode-jsonrpc',
            'vscode-languageserver': 'vscode-languageserver',
            'vscode-languageserver-textdocument': 'vscode-languageserver-textdocument',
            'vscode-languageserver-types': 'vscode-languageserver-types',
            'vscode-nls': 'vscode-nls',
            'vscode-uri': 'vscode-uri',
            'yaml-language-server': 'yaml-language-server',
            'yaml-language-server-parser': 'yaml-language-server-parser',
        }
    }),
    plugins: [
        new CopyWebpackPlugin({
            patterns: [
                { from: 'src/schema.json' }
            ]
        })
    ]
};