import { ClientRecord } from '../types';

/**
 * Normalizes a client or store name by stripping diacritics (accents),
 * removing extra spaces, and converting to lowercase for robust case-insensitive matching.
 */
export function normalizeClientName(name: string): string {
  return (name || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ');
}

/**
 * Finds a client from the registry that matches the given name (case and diacritic insensitive).
 */
export function findClientByName(
  clients: ClientRecord[],
  name: string
): ClientRecord | undefined {
  const normalized = normalizeClientName(name);
  if (!normalized) return undefined;
  return clients.find((c) => normalizeClientName(c.name) === normalized);
}

/**
 * Searches clients matching a partial query string with smart relevance ranking.
 */
export function searchClientsAutocomplete(
  clients: ClientRecord[],
  query: string,
  limit: number = 8
): ClientRecord[] {
  const normalizedQuery = normalizeClientName(query);
  if (!normalizedQuery) return [];

  const queryTokens = normalizedQuery.split(' ').filter(Boolean);

  const matches = clients.filter((c) => {
    const normName = normalizeClientName(c.name);
    const normPiso = normalizeClientName(c.piso || '');
    const normNotes = normalizeClientName(c.notes || '');
    // Every query token should match either name, piso, or notes
    return queryTokens.every(
      (token) =>
        normName.includes(token) ||
        normPiso.includes(token) ||
        normNotes.includes(token)
    );
  });

  return matches
    .sort((a, b) => {
      const aNorm = normalizeClientName(a.name);
      const bNorm = normalizeClientName(b.name);
      const aStarts = aNorm.startsWith(normalizedQuery);
      const bStarts = bNorm.startsWith(normalizedQuery);

      if (aStarts && !bStarts) return -1;
      if (!aStarts && bStarts) return 1;
      return aNorm.localeCompare(bNorm);
    })
    .slice(0, limit);
}
