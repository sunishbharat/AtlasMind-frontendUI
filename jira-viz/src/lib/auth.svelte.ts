// auth.svelte.ts
// PAT-based auth store. Import authStore wherever the token is needed.
// To remove auth entirely: delete this file, PatPrompt.svelte, and the
// authStore imports in ChatPanel.svelte.

const STORAGE_KEY = "jira_pat";

class AuthStore {
  pat = $state(
    typeof localStorage !== "undefined"
      ? (localStorage.getItem(STORAGE_KEY) ?? "")
      : ""
  );

  get isAuthenticated(): boolean {
    return !!this.pat;
  }

  save(token: string): void {
    const trimmed = token.trim();
    this.pat = trimmed;
    if (trimmed) localStorage.setItem(STORAGE_KEY, trimmed);
    else localStorage.removeItem(STORAGE_KEY);
  }

  clear(): void {
    this.pat = "";
    localStorage.removeItem(STORAGE_KEY);
  }
}

export const authStore = new AuthStore();
