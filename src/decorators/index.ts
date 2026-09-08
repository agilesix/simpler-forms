// One module per TypeSpec namespace, mirroring lib/<name>.tsp. Marshalling helpers
// shared by more than one namespace live in ./shared.ts.
export { blockSchemaRef } from "./shared.js";
export * from "./meta.js";
export * from "./ui.js";
export * from "./validation.js";
