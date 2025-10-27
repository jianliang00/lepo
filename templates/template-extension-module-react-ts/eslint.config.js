import { defineConfig } from "eslint/config";

export default defineConfig([
  {
    rules: {
      "unicorn/filename-case": [
        "error",
        {
          "cases": {
            "kebabCase": true,
            "pascalCase": true
          }
        }
      ]
    },
  },
]);
