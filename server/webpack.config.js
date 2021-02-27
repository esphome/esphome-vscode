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
            'prettier': 'prettier',
            'bufferutil': 'bufferutil',
            'utf-8-validate': 'utf-8-validate',
            'yaml-language-server': 'yaml-language-server/lib/umd',
            'yaml-language-server-parser': 'yaml-language-server-parser',
            'vscode-json-languageservice': 'vscode-json-languageservice',
            'jsonc-parser': 'jsonc-parser',
            'vscode-uri': 'vscode-uri',
            'vscode-languageserver-textdocument': 'vscode-languageserver-textdocument',
            'vscode-languageserver-types': 'vscode-languageserver-types',
            'js-yaml': 'js-yaml',
            'vscode-nls': 'vscode-nls',
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