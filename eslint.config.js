import eslint from "@eslint/js";

export default [
  eslint.configs.recommended,
  {
    ignores: ["dist", "node_modules", "coverage"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      globals: {
        console: "readonly",
        process: "readonly",
        Buffer: "readonly",
      },
    },
  },
];
