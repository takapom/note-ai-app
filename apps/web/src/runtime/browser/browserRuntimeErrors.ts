export function toBoundaryErrors(error: unknown): readonly string[] {
  if (error instanceof Error) {
    const structuredErrors = readStructuredErrors(error);
    return structuredErrors.length > 0 ? structuredErrors : [error.message];
  }

  return [String(error)];
}

export function readStructuredErrors(error: Error): readonly string[] {
  const errors = (error as { errors?: unknown }).errors;
  if (!Array.isArray(errors)) {
    return [];
  }

  return errors.filter((entry): entry is string => typeof entry === 'string');
}
