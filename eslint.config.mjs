import oclif from 'eslint-config-oclif'
import prettier from 'eslint-config-prettier'
import {globalIgnores} from "eslint/config";
import path from 'node:path'
import {fileURLToPath} from 'node:url'

const gitignorePath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '.gitignore')

export default [
    ...oclif, prettier,
    globalIgnores([
        gitignorePath,
        "**/node_modules/**",
        "**/dist/**",
        "templates/**/*"
    ]),
    {
        rules:{
            "@stylistic/curly-newline": "off",
            "@typescript-eslint/no-empty-object-type": "off",
            "complexity": "off",
            "max-depth": "off",
            "no-await-in-loop": "off",
        }
    },
]
