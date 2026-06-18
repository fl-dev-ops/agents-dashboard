/**
 * Validates a JSON Schema against OpenAI Structured Outputs strict-mode constraints.
 *
 * OpenAI strict mode requires:
 * 1. Every `object` must set `additionalProperties: false`
 * 2. Every `object` must list ALL properties in `required`
 * 3. No unsupported types (only: string, number, integer, boolean, object, array, enum/const)
 * 4. Max nesting depth ≤ 10
 * 5. Root must be an object type
 */

const MAX_DEPTH = 10;

export class SchemaValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SchemaValidationError";
  }
}

/**
 * Validate a JSON Schema for OpenAI structured output strict mode.
 * Throws SchemaValidationError on violation.
 */
export function validateSchemaForStrictMode(schema: unknown): void {
  if (!schema || typeof schema !== "object" || Array.isArray(schema)) {
    throw new SchemaValidationError("Schema must be a JSON object.");
  }

  const s = schema as Record<string, unknown>;

  if (s.type !== "object") {
    throw new SchemaValidationError('Root schema must have "type": "object".');
  }

  if (!s.properties || typeof s.properties !== "object") {
    throw new SchemaValidationError('Root schema must have a "properties" object.');
  }

  walkSchema(s, 0, "root");
}

function walkSchema(schema: Record<string, unknown>, depth: number, path: string): void {
  if (depth > MAX_DEPTH) {
    throw new SchemaValidationError(`Schema exceeds max nesting depth of ${MAX_DEPTH} at ${path}.`);
  }

  const type = schema.type as string | undefined;

  if (type === "object") {
    // Must have additionalProperties: false
    if (schema.additionalProperties !== false) {
      throw new SchemaValidationError(
        `"additionalProperties" must be false at ${path}. OpenAI strict mode requires it.`,
      );
    }

    // Must have properties
    if (!schema.properties || typeof schema.properties !== "object") {
      throw new SchemaValidationError(`Object at ${path} must have "properties".`);
    }

    const propKeys = Object.keys(schema.properties as Record<string, unknown>);
    const required = schema.required as string[] | undefined;

    // All properties must be in required
    if (!required || !Array.isArray(required)) {
      throw new SchemaValidationError(
        `Object at ${path} must have "required" listing all properties: [${propKeys.join(", ")}].`,
      );
    }

    const requiredSet = new Set(required);
    for (const key of propKeys) {
      if (!requiredSet.has(key)) {
        throw new SchemaValidationError(
          `Property "${key}" at ${path} must be listed in "required". OpenAI strict mode requires all properties.`,
        );
      }
    }

    // Recurse into properties
    const props = schema.properties as Record<string, unknown>;
    for (const [key, val] of Object.entries(props)) {
      if (val && typeof val === "object" && !Array.isArray(val)) {
        walkSchema(val as Record<string, unknown>, depth + 1, `${path}.${key}`);
      }
    }
  } else if (type === "array") {
    if (schema.items && typeof schema.items === "object" && !Array.isArray(schema.items)) {
      walkSchema(schema.items as Record<string, unknown>, depth + 1, `${path}[]`);
    }
  }

  // Handle anyOf (union types)
  if (schema.anyOf && Array.isArray(schema.anyOf)) {
    for (let i = 0; i < schema.anyOf.length; i++) {
      const variant = schema.anyOf[i];
      if (variant && typeof variant === "object" && !Array.isArray(variant)) {
        walkSchema(variant as Record<string, unknown>, depth + 1, `${path}.anyOf[${i}]`);
      }
    }
  }

  // Handle $ref (not supported in strict mode, flag it)
  if (schema.$ref) {
    throw new SchemaValidationError(
      `"$ref" is not supported in OpenAI strict mode at ${path}. Inline the schema instead.`,
    );
  }
}

/**
 * Attempt to convert a "lenient" user-written schema to strict mode by
 * automatically adding additionalProperties: false and making all properties required.
 * Returns a new schema object. Does NOT mutate the input.
 */
export function coerceToStrictMode(schema: unknown): Record<string, unknown> {
  if (!schema || typeof schema !== "object" || Array.isArray(schema)) {
    return schema as Record<string, unknown>;
  }

  const s = { ...(schema as Record<string, unknown>) };

  if (s.type === "object" && s.properties && typeof s.properties === "object") {
    s.additionalProperties = false;

    const propKeys = Object.keys(s.properties as Record<string, unknown>);
    const existingRequired = Array.isArray(s.required) ? new Set(s.required as string[]) : new Set<string>();
    for (const key of propKeys) {
      existingRequired.add(key);
    }
    s.required = [...existingRequired];

    // Recurse into properties
    const newProps: Record<string, unknown> = {};
    const props = s.properties as Record<string, unknown>;
    for (const [key, val] of Object.entries(props)) {
      newProps[key] = coerceToStrictMode(val);
    }
    s.properties = newProps;
  }

  if (s.type === "array" && s.items && typeof s.items === "object" && !Array.isArray(s.items)) {
    s.items = coerceToStrictMode(s.items);
  }

  if (s.anyOf && Array.isArray(s.anyOf)) {
    s.anyOf = s.anyOf.map((v: unknown) => coerceToStrictMode(v));
  }

  return s;
}
