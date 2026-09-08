/** The bounded, target-neutral condition shape supported by @UI.overrides.enabledWhen. */
export type NormalizedOverrideCondition =
  | {
      sourcePath: string[];
      operator: "equals";
      value: string | number | boolean | null;
    }
  | {
      sourcePath: string[];
      operator: "in";
      values: (string | number | boolean | null)[];
    };

const primitive = (value: unknown): value is string | number | boolean | null =>
  value === null ||
  typeof value === "string" ||
  typeof value === "number" ||
  typeof value === "boolean";

/** Parse enabledWhen once so canonical and target-specific UI emitters cannot drift. */
export function normalizedOverrideEnabledWhen(
  override: Record<string, unknown>,
): NormalizedOverrideCondition | undefined {
  const raw = override.enabledWhen;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return undefined;
  const condition = raw as Record<string, unknown>;
  const path = condition.path;
  if (typeof path !== "string" || !path) return undefined;
  const sourcePath = path.split(".").filter(Boolean);
  if (!sourcePath.length) return undefined;
  const values = condition.in;
  if (Array.isArray(values) && values.length > 0 && values.every(primitive)) {
    return { sourcePath, operator: "in", values };
  }
  if (!primitive(condition.equals)) return undefined;
  return { sourcePath, operator: "equals", value: condition.equals };
}
