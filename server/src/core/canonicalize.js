// Turns any JSON value into ONE fixed string.
// Why? {"a":1,"b":2} and {"b":2,"a":1} mean the same thing, but as text they
// are different bytes. A signature is made over bytes, so we must always
// produce the same bytes for the same data. We do that by sorting object keys.
// (Same idea as RFC 8785 "JSON Canonicalization Scheme", simplified.)

export function canonicalize(value) {
  if (value === null || typeof value !== "object") {
    if (value === undefined || typeof value === "function") {
      throw new Error("Cannot canonicalize undefined or functions");
    }
    if (typeof value === "number" && !Number.isFinite(value)) {
      throw new Error("Cannot canonicalize NaN or Infinity");
    }
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    // Array order has meaning, so we keep it as it is.
    return "[" + value.map(canonicalize).join(",") + "]";
  }

  const keys = Object.keys(value).sort();
  const parts = keys.map((key) => JSON.stringify(key) + ":" + canonicalize(value[key]));
  return "{" + parts.join(",") + "}";
}
