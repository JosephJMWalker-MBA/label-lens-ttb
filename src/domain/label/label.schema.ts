import { z } from "zod";

import type { ExpectedFields } from "./label.types";

/**
 * Runtime contract for reviewer-entered application data.
 *
 * Trims whitespace and requires the fields an agent must supply before a
 * verification can run. `countryOfOrigin` is optional (imports only) and is
 * normalized to `undefined` when blank so downstream code has one empty shape.
 */
export const expectedFieldsSchema = z.object({
  brandName: z.string().trim().min(1, "Brand name is required"),
  classType: z.string().trim().min(1, "Class/type is required"),
  alcoholContent: z.string().trim().min(1, "Alcohol content is required"),
  netContents: z.string().trim().min(1, "Net contents is required"),
  nameAndAddress: z.string().trim().min(1, "Name and address is required"),
  countryOfOrigin: z
    .string()
    .trim()
    .optional()
    .transform((value) => (value ? value : undefined)),
});

// Compile-time guarantee that the schema output matches the domain type.
type SchemaOutput = z.infer<typeof expectedFieldsSchema>;
const _typeCheck: SchemaOutput extends ExpectedFields ? true : never = true;
void _typeCheck;

/** The required keys a reviewer must fill before analysis can be enabled. */
export const REQUIRED_EXPECTED_FIELDS = [
  "brandName",
  "classType",
  "alcoholContent",
  "netContents",
  "nameAndAddress",
] as const;
