/**
 * Lightweight mock for pg.Pool used in adapter/OAuth tests.
 * Records queries and returns configurable results.
 */

export interface MockQueryResult {
  rows: Record<string, unknown>[];
  rowCount?: number;
}

export interface RecordedQuery {
  text: string;
  values?: unknown[];
}

export function createMockPool(defaultRows: Record<string, unknown>[] = []) {
  const queries: RecordedQuery[] = [];
  const responseMap = new Map<string, MockQueryResult>();

  const pool = {
    query: async (text: string, values?: unknown[]): Promise<MockQueryResult> => {
      queries.push({ text, values });
      // Check for exact match first, then substring match
      for (const [pattern, result] of responseMap) {
        if (text.includes(pattern)) return result;
      }
      return { rows: defaultRows, rowCount: defaultRows.length };
    },
  };

  return {
    pool: pool as unknown as import('pg').Pool,
    queries,
    /** Configure a response for queries containing the given SQL substring */
    onQuery: (sqlSubstring: string, result: MockQueryResult) => {
      responseMap.set(sqlSubstring, result);
    },
    /** Get all queries containing the given SQL substring */
    queriesMatching: (sqlSubstring: string) =>
      queries.filter((q) => q.text.includes(sqlSubstring)),
  };
}
