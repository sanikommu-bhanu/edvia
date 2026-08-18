// ==========================================================================
// Zod → Gemini function-declaration schema
// --------------------------------------------------------------------------
// Tool inputs are declared ONCE, as Zod schemas on each ToolDefinition.
// This module derives the JSON-Schema-ish `parameters` block Gemini needs
// from those same schemas.
//
// Why this exists: the previous version hand-maintained a parallel list of
// declarations with a comment asking future authors to "keep them in
// lockstep". They drift — and when they drift, the model is told a tool
// accepts an argument the validator will reject, which shows up as an
// assistant that mysteriously "can't do that". Deriving one from the other
// makes the drift impossible.
//
// Only the subset of Zod actually used by EDVIA's tools is supported;
// anything else throws loudly at module load rather than silently emitting
// an untyped parameter.
// ==========================================================================
import { Type, type Schema } from "@google/genai";
import type { ZodTypeAny } from "zod";

interface ZodDefLike {
  typeName: string;
  innerType?: ZodTypeAny;
  schema?: ZodTypeAny;
  type?: ZodTypeAny;
  values?: string[];
  shape?: () => Record<string, ZodTypeAny>;
  description?: string;
}

function def(schema: ZodTypeAny): ZodDefLike {
  return (schema as unknown as { _def: ZodDefLike })._def;
}

/** Unwraps optional/nullable/default/effects wrappers down to the core type. */
function unwrap(schema: ZodTypeAny): { inner: ZodTypeAny; optional: boolean } {
  let current = schema;
  let optional = false;
  for (;;) {
    const d = def(current);
    if (d.typeName === "ZodOptional" || d.typeName === "ZodNullable" || d.typeName === "ZodDefault") {
      optional = true;
      current = (d.innerType ?? d.schema) as ZodTypeAny;
      continue;
    }
    if (d.typeName === "ZodEffects") {
      current = d.schema as ZodTypeAny;
      continue;
    }
    return { inner: current, optional };
  }
}

function toSchema(schema: ZodTypeAny, path: string): Schema {
  const { inner } = unwrap(schema);
  const d = def(inner);
  const description = (inner as unknown as { description?: string }).description;

  switch (d.typeName) {
    case "ZodString":
      return { type: Type.STRING, description };
    case "ZodNumber":
      return { type: Type.NUMBER, description };
    case "ZodBoolean":
      return { type: Type.BOOLEAN, description };
    case "ZodEnum":
      return { type: Type.STRING, enum: d.values ?? [], description };
    case "ZodLiteral":
      return { type: Type.STRING, description };
    case "ZodArray":
      return { type: Type.ARRAY, items: toSchema(d.type as ZodTypeAny, `${path}[]`), description };
    case "ZodObject":
      return { ...objectSchema(inner, path), description };
    default:
      throw new Error(
        `zodToGeminiSchema: unsupported Zod type "${d.typeName}" at ${path}. ` +
          "Add explicit support here rather than letting the model see an untyped parameter."
      );
  }
}

function objectSchema(schema: ZodTypeAny, path: string): Schema {
  const shape = def(schema).shape?.() ?? {};
  const properties: Record<string, Schema> = {};
  const required: string[] = [];

  for (const [key, value] of Object.entries(shape)) {
    properties[key] = toSchema(value, `${path}.${key}`);
    if (!unwrap(value).optional) required.push(key);
  }

  const out: Schema = { type: Type.OBJECT, properties };
  if (required.length) out.required = required;
  return out;
}

/** Converts a tool's Zod input object into Gemini's `parameters` schema. */
export function zodToGeminiSchema(schema: ZodTypeAny, toolName: string): Schema {
  const { inner } = unwrap(schema);
  if (def(inner).typeName !== "ZodObject") {
    throw new Error(`Tool "${toolName}" must declare an object input schema.`);
  }
  return objectSchema(inner, toolName);
}
