/** A guessed operationId from the method and path, for operations without a clear one. */
const singular = (w: string) => (w.endsWith("ies") ? `${w.slice(0, -3)}y` : w.endsWith("sses") ? w.slice(0, -2) : w.endsWith("s") && !w.endsWith("ss") ? w.slice(0, -1) : w);
const cap = (w: string) => w.charAt(0).toUpperCase() + w.slice(1);
const camel = (words: string[]) => words.map((w, i) => (i === 0 ? w.toLowerCase() : cap(w.toLowerCase()))).join("");

/** A guessed operationId: GET /orders → listOrders, GET /orders/{id} → getOrder, POST /orders → createOrder. */
export function guessOperationId(method: string, path: string): string {
  const segs = path.split("/").filter(Boolean).filter((s) => !/^v\d+$/.test(s) && s !== "api");
  const words = segs.filter((s) => !s.startsWith("{")).flatMap((s) => s.split(/[-_.]/)).filter(Boolean);
  const endsWithParam = segs.length > 0 && segs.at(-1)!.startsWith("{");
  const noun = words.at(-1) ?? "root";
  const parents = words.slice(0, -1).map(singular);
  const m = method.toUpperCase();
  if (m === "GET") return endsWithParam ? camel(["get", ...parents, singular(noun)]) : camel(["list", ...parents, noun]);
  if (m === "POST") return endsWithParam || words.length === 0 ? camel(["post", ...words]) : segs.length >= 2 && segs.at(-2)!.startsWith("{") ? camel([noun, ...parents]) : camel(["create", ...parents, singular(noun)]);
  if (m === "PUT" || m === "PATCH") return camel(["update", ...parents, singular(noun)]);
  if (m === "DELETE") return camel(["delete", ...parents, singular(noun)]);
  return camel([m.toLowerCase(), ...words]);
}
