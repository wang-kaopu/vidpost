import js from "@eslint/js";
import pluginVue from "eslint-plugin-vue";
import globals from "globals";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: [".build/**", "app/dist/**", "node_modules/**", "out/**"] },
  { ...js.configs.recommended, files: ["**/*.{js,mjs,cjs}"] },
  ...tseslint.configs.recommended,
  ...pluginVue.configs["flat/recommended"],
  {
    files: ["**/*.{js,mjs,cjs,ts,mts,cts,vue}"],
    languageOptions: { globals: { ...globals.node, ...globals.browser } },
    rules: {
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", caughtErrorsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      "no-console": "error",
      "vue/first-attribute-linebreak": "off",
      "vue/attribute-hyphenation": "off",
      "vue/attributes-order": "off",
      "vue/html-closing-bracket-newline": "off",
      "vue/html-indent": "off",
      "vue/html-self-closing": "off",
      "vue/max-attributes-per-line": "off",
      "vue/multiline-html-element-content-newline": "off",
      "vue/singleline-html-element-content-newline": "off",
    },
  },
  { files: ["app/**/*.vue"], languageOptions: { parserOptions: { parser: tseslint.parser } } },
  {
    files: ["*.ts", "scripts/**/*.ts", "shared/**/*.ts", "src/**/*.ts", "test/**/*.ts", "types/**/*.d.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["./*", "../*"],
              message: "后端项目内模块统一使用 @/ 根路径",
            },
          ],
        },
      ],
    },
  },
  {
    files: ["forge.config.ts"],
    rules: {
      // Electron Forge 的 Jiti 配置加载器不解析 tsconfig paths。
      "no-restricted-imports": "off",
    },
  },
  { files: ["src/utils/logger.ts", "app/src/utils/logger.ts", "test/logger.test.ts"], rules: { "no-console": "off" } },
);
