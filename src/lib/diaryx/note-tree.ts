import type { DiaryxNote } from "./types";

export interface DiaryxContentLink {
  raw: string;
  label: string;
  target: string;
}

export interface DiaryxNoteTreeNode {
  note: DiaryxNote;
  children: DiaryxNoteTreeNode[];
  contentLinks: DiaryxContentLink[];
  parentId?: string;
}

export interface DiaryxNoteTree {
  roots: DiaryxNoteTreeNode[];
  nodesById: Map<string, DiaryxNoteTreeNode>;
  parentById: Map<string, string>;
}

const LINK_PATTERN = /^\s*\[([^\]]*)\]\((.+)\)\s*$/;

const normalizeKey = (value: string): string => value.trim().toLowerCase();

const stripAngles = (value: string): string =>
  value.startsWith("<") && value.endsWith(">")
    ? value.slice(1, value.length - 1).trim()
    : value.trim();

const normalizeTargetVariants = (target: string): string[] => {
  const variants = new Set<string>();
  const stripped = stripAngles(target);
  if (!stripped) {
    return [];
  }

  const lowercase = stripped.toLowerCase();
  variants.add(lowercase);

  try {
    const decoded = decodeURI(stripped).toLowerCase();
    variants.add(decoded);
  } catch {
    // ignore URI decoding failures and continue with existing variants
  }

  if (lowercase.endsWith(".md")) {
    variants.add(lowercase.slice(0, -3));
  }

  return Array.from(variants);
};

export const normalizeMetadataList = (
  value: string | string[] | undefined
): string[] => {
  if (Array.isArray(value)) {
    const results: string[] = [];
    for (const raw of value) {
      const entry = String(raw ?? "").trim();
      if (!entry) continue;
      if (entry.includes("\n")) {
        for (const line of entry.split(/\r?\n/)) {
          const normalized = line.trim();
          if (normalized) {
            results.push(normalized);
          }
        }
        continue;
      }
      results.push(entry);
    }
    return results;
  }

  if (typeof value === "string") {
    return value
      .split(/\r?\n/)
      .map((item) => item.trim())
      .filter(Boolean);
  }

  return [];
};

export const parseDiaryxLink = (raw: string): DiaryxContentLink => {
  const trimmed = raw.trim();
  const match = LINK_PATTERN.exec(trimmed);
  if (!match) {
    const target = stripAngles(trimmed);
    return {
      raw,
      label: trimmed,
      target,
    };
  }

  const label = match[1]?.trim() ?? "";
  const target = stripAngles(match[2] ?? "");

  return {
    raw,
    label: label || target,
    target,
  };
};

export const formatDiaryxLink = (label: string, target: string): string => {
  const normalizedLabel = label.trim() || target.trim();
  const normalizedTarget = target.trim();
  const needsAngles = /\s/.test(normalizedTarget);
  const wrappedTarget = needsAngles
    ? `<${normalizedTarget}>`
    : normalizedTarget;
  return `[${normalizedLabel}](${wrappedTarget})`;
};

const matchLinkToNote = (
  link: DiaryxContentLink,
  hrefIndex: Map<string, string>,
  titleIndex: Map<string, string>
): string | undefined => {
  for (const variant of normalizeTargetVariants(link.target)) {
    const found = hrefIndex.get(variant);
    if (found) {
      return found;
    }
  }

  const normalizedLabel = normalizeKey(link.label);
  if (normalizedLabel) {
    const found = titleIndex.get(normalizedLabel);
    if (found) {
      return found;
    }
  }

  return undefined;
};

export const buildDiaryxNoteTree = (notes: DiaryxNote[]): DiaryxNoteTree => {
  const nodesById = new Map<string, DiaryxNoteTreeNode>();
  const parentById = new Map<string, string>();
  const pendingChildren = new Map<string, string[]>();
  const contentOrder = new Map<string, number>();
  const hrefIndex = new Map<string, string>();
  const titleIndex = new Map<string, string>();
  const orderIndex = new Map<string, number>();

  notes.forEach((note, index) => {
    orderIndex.set(note.id, index);
    const contentStrings = normalizeMetadataList(note.metadata.contents as
      | string
      | string[]
      | undefined);
    const contentLinks = contentStrings.map(parseDiaryxLink);
    nodesById.set(note.id, {
      note,
      children: [],
      contentLinks,
    });

    const sourceName = note.sourceName?.trim();
    if (sourceName) {
      for (const variant of normalizeTargetVariants(sourceName)) {
        if (!hrefIndex.has(variant)) {
          hrefIndex.set(variant, note.id);
        }
      }
    }

    const title = note.metadata.title?.trim();
    if (title) {
      const key = normalizeKey(title);
      if (!titleIndex.has(key)) {
        titleIndex.set(key, note.id);
      }
    }

    const aliases = Array.isArray(note.metadata.aliases)
      ? note.metadata.aliases
      : [];
    for (const alias of aliases) {
      const normalized = normalizeKey(String(alias ?? ""));
      if (normalized && !titleIndex.has(normalized)) {
        titleIndex.set(normalized, note.id);
      }
    }
  });

  for (const node of nodesById.values()) {
    if (!node.contentLinks.length) continue;
    node.contentLinks.forEach((link, index) => {
      const childId = matchLinkToNote(link, hrefIndex, titleIndex);
      if (!childId || childId === node.note.id) {
        return;
      }
      if (!pendingChildren.has(node.note.id)) {
        pendingChildren.set(node.note.id, []);
      }
      pendingChildren.get(node.note.id)!.push(childId);
      const key = `${node.note.id}:${childId}`;
      if (!contentOrder.has(key)) {
        contentOrder.set(key, index);
      }
    });
  }

  for (const [parentId, childIds] of pendingChildren.entries()) {
    for (const childId of childIds) {
      if (childId === parentId) continue;
      if (!parentById.has(childId)) {
        parentById.set(childId, parentId);
      }
    }
  }

  for (const node of nodesById.values()) {
    if (parentById.has(node.note.id)) continue;
    const partOfList = normalizeMetadataList(node.note.metadata.part_of as
      | string
      | string[]
      | undefined);
    for (const raw of partOfList) {
      const parentLink = parseDiaryxLink(raw);
      const matchedParent = matchLinkToNote(parentLink, hrefIndex, titleIndex);
      if (matchedParent && matchedParent !== node.note.id) {
        parentById.set(node.note.id, matchedParent);
        break;
      }
    }
  }

  for (const node of nodesById.values()) {
    node.children = [];
    const parentId = parentById.get(node.note.id);
    if (parentId) {
      node.parentId = parentId;
    } else {
      delete node.parentId;
    }
  }

  for (const [parentId, childIds] of pendingChildren.entries()) {
    const parentNode = nodesById.get(parentId);
    if (!parentNode) continue;
    const seen = new Set<string>();
    for (const childId of childIds) {
      if (parentById.get(childId) !== parentId) continue;
      if (seen.has(childId)) continue;
      const childNode = nodesById.get(childId);
      if (!childNode) continue;
      seen.add(childId);
      parentNode.children.push(childNode);
    }
  }

  for (const [childId, parentId] of parentById.entries()) {
    const parentNode = nodesById.get(parentId);
    const childNode = nodesById.get(childId);
    if (!parentNode || !childNode) continue;
    if (!parentNode.children.some((item) => item.note.id === childId)) {
      parentNode.children.push(childNode);
    }
  }

  for (const node of nodesById.values()) {
    if (node.children.length > 1) {
      node.children.sort((a, b) => {
        const orderKeyA = `${node.note.id}:${a.note.id}`;
        const orderKeyB = `${node.note.id}:${b.note.id}`;
        const indexA = contentOrder.has(orderKeyA)
          ? contentOrder.get(orderKeyA)!
          : Number.MAX_SAFE_INTEGER;
        const indexB = contentOrder.has(orderKeyB)
          ? contentOrder.get(orderKeyB)!
          : Number.MAX_SAFE_INTEGER;
        if (indexA !== indexB) {
          return indexA - indexB;
        }
        const globalA = orderIndex.get(a.note.id) ?? Number.MAX_SAFE_INTEGER;
        const globalB = orderIndex.get(b.note.id) ?? Number.MAX_SAFE_INTEGER;
        return globalA - globalB;
      });
    }
  }

  const roots: DiaryxNoteTreeNode[] = [];
  for (const note of notes) {
    const node = nodesById.get(note.id);
    if (!node) continue;
    const parentId = parentById.get(note.id);
    if (!parentId || !nodesById.has(parentId)) {
      roots.push(node);
    }
  }

  roots.sort((a, b) => {
    const orderA = orderIndex.get(a.note.id) ?? Number.MAX_SAFE_INTEGER;
    const orderB = orderIndex.get(b.note.id) ?? Number.MAX_SAFE_INTEGER;
    return orderA - orderB;
  });

  return {
    roots,
    nodesById,
    parentById,
  };
};
