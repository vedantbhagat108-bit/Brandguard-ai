import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import firebaseRulesPlugin from "@firebase/eslint-plugin-security-rules";

export default defineConfig([
  {
    ignores: ["dist/**/*", ".next/**/*", "out/**/*", "build/**/*", "next-env.d.ts"],
  },
  ...nextVitals,
  ...nextTs,
  firebaseRulesPlugin.configs["flat/recommended"],
  globalIgnores([".next/**", "out/**", "build/**", "next-env.d.ts"]),
]);
