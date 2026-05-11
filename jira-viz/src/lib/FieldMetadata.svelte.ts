import { chartStore } from './charts/index.js';
import type { ApiIssue } from './charts/chartStore.svelte.js';

export interface FieldOption {
  value: string;
  label: string;
}

// Skip these fields from dropdown options
const SKIP_FIELDS = new Set([
  'key', 'summary', 'description', 'id', 'url', 'link'
]);

// Map display field names to dimension keys
const FIELD_TO_DIMENSION: Record<string, string> = {
  'status': 'status',
  'priority': 'priority',
  'assignee': 'assignee',
  'project': 'project',
  'issuetype': 'issuetype',
  'issue type': 'issuetype',
};

class FieldMetadata {
  // - Get all fields - accepts optional display_fields override ---------
  getAllFields(displayFieldsOverride?: string[]): string[] {
    const displayFields = displayFieldsOverride ?? chartStore.data?.display_fields ?? [];
    const issues = chartStore.issues;

    if (displayFields.length > 0) return displayFields;
    if (issues.length > 0) return Object.keys(issues[0]);

    return [];
  }

  // - Get categorical fields by checking cardinality on issues array ----------
  getCategoricalFields(minCard = 2, maxCard = 15, issuesOverride?: ApiIssue[]): string[] {
    const issues = issuesOverride ?? chartStore.issues;
    if (!issues.length) return [];

    const allFields = this.getAllFields();
    const categorical: string[] = [];

    for (const key of allFields) {
      if (SKIP_FIELDS.has(key.toLowerCase())) continue;

      // Skip if value looks numeric
      const sample = issues.find((i: ApiIssue) => i[key] != null)?.[key];
      if (sample != null && !isNaN(Number(sample))) continue;

      // Check cardinality
      const uniqueCount = new Set(
        issues.slice(0, 100).map((i: ApiIssue) => String(i[key] ?? '')).filter(Boolean)
      ).size;

      if (uniqueCount >= minCard && uniqueCount <= maxCard) {
        categorical.push(key);
      }
    }
    return categorical;
  }

  // - Get numeric fields from issues -----------------------------------------
  getNumericFields(issuesOverride?: ApiIssue[]): Set<string> {
    const issues = issuesOverride ?? chartStore.issues;
    const s = new Set<string>();
    if (!issues.length) return s;

    for (const key of Object.keys(issues[0])) {
      const sample = issues.find((i: ApiIssue) => i[key] != null)?.[key];
      if (sample != null && !isNaN(Number(sample))) s.add(key);
    }
    return s;
  }

  // - Get options for dropdown (categorical fields as {value, label}) ---------
  getDropdownOptions(_includeNone = false, issuesOverride?: ApiIssue[]): FieldOption[] {
    const fields = this.getCategoricalFields(2, 15, issuesOverride);
    if (!fields.length) return getDefaultOptions('bar');

    return fields.map(f => ({
      value: f.toLowerCase(),
      label: f
    }));
  }

  // - Get trend breakdown options (mapped to dimension keys) -----------------
  getTrendOptions(displayFieldsOverride?: string[]): FieldOption[] {
    const displayFields = displayFieldsOverride ?? chartStore.data?.display_fields ?? [];

    if (displayFields.length > 0) {
      const options = displayFields
        .filter(f => FIELD_TO_DIMENSION[f.toLowerCase()])
        .map(f => ({ value: FIELD_TO_DIMENSION[f.toLowerCase()], label: f }));
      if (options.length > 0) {
        return [{ value: '', label: 'None' }, ...options];
      }
    }

    return getDefaultOptions('trend');
  }

  // - Get time field options --------------------------------------------------
  getTimeFields(displayFieldsOverride?: string[]): FieldOption[] {
    const allFields = this.getAllFields(displayFieldsOverride);
    const timeFields = ['created', 'resolved', 'updated', 'resolutiondate'];

    const options = allFields
      .filter(f => timeFields.includes(f.toLowerCase()))
      .map(f => ({ value: f.toLowerCase(), label: f }));

    return options.length > 0 ? options : getDefaultOptions('time');
  }

  // - Check if we have field metadata -----------------------------------------
  hasData(displayFieldsOverride?: string[], issuesOverride?: ApiIssue[]): boolean {
    const displayFields = displayFieldsOverride ?? chartStore.data?.display_fields ?? [];
    const hasIssues = (issuesOverride?.length ?? chartStore.issues.length) > 0;

    return displayFields.length > 0 || hasIssues;
  }
}

// Default fallback options when no query data available
const DEFAULT_TREND_BREAKDOWN: FieldOption[] = [
  { value: '', label: 'None' },
  { value: 'status', label: 'Status' },
  { value: 'priority', label: 'Priority' },
  { value: 'assignee', label: 'Assignee' },
  { value: 'issuetype', label: 'Type' },
];

const DEFAULT_BAR_OPTIONS: FieldOption[] = [
  { value: 'assignee', label: 'Assignee' },
  { value: 'project', label: 'Project' },
  { value: 'priority', label: 'Priority' },
  { value: 'status', label: 'Status' },
  { value: 'issuetype', label: 'Type' },
];

const DEFAULT_PIE_OPTIONS: FieldOption[] = [
  { value: 'status', label: 'Status' },
  { value: 'priority', label: 'Priority' },
  { value: 'assignee', label: 'Assignee' },
  { value: 'project', label: 'Project' },
  { value: 'issuetype', label: 'Type' },
];

const DEFAULT_TIME_OPTIONS: FieldOption[] = [
  { value: 'created', label: 'Created' },
  { value: 'resolutiondate', label: 'Resolved' },
  { value: 'updated', label: 'Updated' },
];

function getDefaultOptions(type: 'bar' | 'pie' | 'time' | 'trend' = 'bar'): FieldOption[] {
  switch (type) {
    case 'bar': return DEFAULT_BAR_OPTIONS;
    case 'pie': return DEFAULT_PIE_OPTIONS;
    case 'time': return DEFAULT_TIME_OPTIONS;
    case 'trend': return DEFAULT_TREND_BREAKDOWN;
    default: return DEFAULT_BAR_OPTIONS;
  }
}

// Export singleton instance
export const fieldMetadata = new FieldMetadata();

// Re-export for convenience (use these with optional overrides in Dashboard)
export function getDropdownOptions(includeNone = false, issues?: ApiIssue[]): FieldOption[] {
  return fieldMetadata.getDropdownOptions(includeNone, issues);
}

export function getTrendOptions(displayFields?: string[]): FieldOption[] {
  return fieldMetadata.getTrendOptions(displayFields);
}

export function getTimeFields(displayFields?: string[]): FieldOption[] {
  return fieldMetadata.getTimeFields(displayFields);
}

export function getCategoricalFields(minCard = 2, maxCard = 15, issues?: ApiIssue[]): string[] {
  return fieldMetadata.getCategoricalFields(minCard, maxCard, issues);
}

export function getAllFields(displayFields?: string[]): string[] {
  return fieldMetadata.getAllFields(displayFields);
}

export function getNumericFields(issues?: ApiIssue[]): Set<string> {
  return fieldMetadata.getNumericFields(issues);
}

export function hasFieldData(displayFields?: string[], issues?: ApiIssue[]): boolean {
  return fieldMetadata.hasData(displayFields, issues);
}