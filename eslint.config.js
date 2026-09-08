import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["dist/**", "node_modules/**", "tsp-output/**", "coverage/**"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      parserOptions: {
        project: ["./tsconfig.eslint.json"],
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      // Decorator implementations receive TypeSpec Values, whose runtime shape the
      // compiler's public types do not fully describe, so the marshalling helpers in
      // src/decorators legitimately reach through `any` at that boundary.
      "@typescript-eslint/no-explicit-any": "off",
      // `const { $schema, $id, ...body } = target` is how the emitter drops keys it
      // must not forward. The omitted names are the point, so they are not "unused".
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", ignoreRestSiblings: true },
      ],
    },
  },
  {
    // This config file is itself JavaScript, so it cannot belong to the TypeScript
    // project that type-aware rules require.
    files: ["**/*.js"],
    ...tseslint.configs.disableTypeChecked,
  },
  {
    // Tests compile TypeSpec source strings and assert on emitted JSON, so they
    // routinely index into untyped structures.
    files: ["test/**/*.ts"],
    rules: { "@typescript-eslint/no-unsafe-member-access": "off" },
  },
);
