import type { BoardItem } from "../shared/types.ts";

export function renderPromptTemplate(template: string, items: BoardItem[]): string {
  const refs = items.map((item) => item.ref);
  const itemsJson = JSON.stringify(items, null, 2);

  return template
    .replaceAll("{{refs}}", refs.join(" "))
    .replaceAll("{{ref}}", refs[0] ?? "")
    .replaceAll("{{count}}", String(items.length))
    .replaceAll("{{itemsJson}}", itemsJson);
}
