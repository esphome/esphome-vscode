import tseslint from "typescript-eslint";

export default tseslint.config({
  files: ["**/*.ts"],
  languageOptions: {
    parser: tseslint.parser,
  },
  plugins: {
    "@typescript-eslint": tseslint.plugin,
  },
  rules: {
    "@typescript-eslint/no-unused-vars": "warn",
  },
});
