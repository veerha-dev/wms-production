import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";

export default tseslint.config(
  // `public/` ships browser debug scripts that are not part of the build and
  // are not written as modules — linting them only produces parse errors.
  { ignores: ["dist", "public", "dev-dist"] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "react-refresh/only-export-components": ["warn", { allowConstantExport: true }],
      "@typescript-eslint/no-unused-vars": "off",
      // `any` appears ~750 times across this codebase and predates the lint
      // gate. Erroring on it would mean CI can never pass, so it is a warning:
      // still reported for anyone cleaning up, but not a merge blocker.
      // Tighten to "error" once the count is driven down.
      "@typescript-eslint/no-explicit-any": "warn",
    },
  },
);
