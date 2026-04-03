import type { Epic, Story, Subtask, AnyIssue, Connection } from './data.js';
import {
  epics as defaultEpics,
  stories as defaultStories,
  subtasks as defaultSubtasks,
  allIssues as defaultAllIssues,
  connections as defaultConnections,
} from './data.js';

const REQUIRED_COLUMNS = ['id', 'type', 'title', 'status', 'points', 'assignee'] as const;
const VALID_TYPES      = ['epic', 'story', 'sub-task'] as const;
const VALID_STATUSES   = ['done', 'in progress', 'to do'] as const;

interface ParsedData {
  epics: Epic[];
  stories: Story[];
  subtasks: Subtask[];
}

interface DerivedData {
  allIssues: Record<string, AnyIssue>;
  connections: Connection[];
}

function buildDerived(epics: Epic[], stories: Story[], subtasks: Subtask[]): DerivedData {
  const allIssues = Object.fromEntries(
    [...epics, ...stories, ...subtasks].map(i => [i.id, i]),
  );
  const connections: Connection[] = [
    ...stories.map(s  => ({ from: s.epicId,   to: s.id })),
    ...subtasks.map(st => ({ from: st.storyId, to: st.id })),
  ];
  return { allIssues, connections };
}

function parseCSV(text: string): ParsedData {
  const lines = text.split(/\r?\n/).filter(l => l.trim());
  if (lines.length < 2) throw new Error('CSV must have a header row and at least one data row.');

  const headers = lines[0].split(',').map(h => h.trim().toLowerCase());

  const missing = REQUIRED_COLUMNS.filter(c => !headers.includes(c));
  if (missing.length) throw new Error(`Missing required columns: ${missing.join(', ')}`);

  function getCell(cells: string[], name: string): string {
    const i = headers.indexOf(name);
    return i >= 0 ? (cells[i] ?? '').trim() : '';
  }

  const epics: Epic[]       = [];
  const stories: Story[]    = [];
  const subtasks: Subtask[] = [];

  for (let i = 1; i < lines.length; i++) {
    const cells  = lines[i].split(',');
    const type   = getCell(cells, 'type').toLowerCase();
    const status = getCell(cells, 'status');

    if (!VALID_TYPES.includes(type as typeof VALID_TYPES[number])) {
      throw new Error(`Row ${i + 1}: unknown type "${getCell(cells, 'type')}". Expected Epic, Story, or Sub-task.`);
    }
    if (!VALID_STATUSES.includes(status.toLowerCase() as typeof VALID_STATUSES[number])) {
      throw new Error(`Row ${i + 1}: unknown status "${status}". Expected Done, In Progress, or To Do.`);
    }

    const id       = getCell(cells, 'id');
    const title    = getCell(cells, 'title');
    const points   = Number(getCell(cells, 'points')) || 0;
    const assignee = getCell(cells, 'assignee');
    const parentId = getCell(cells, 'parentid') || getCell(cells, 'parentId');
    const sprint   = getCell(cells, 'sprint');

    if (!id)    throw new Error(`Row ${i + 1}: missing id.`);
    if (!title) throw new Error(`Row ${i + 1}: missing title.`);

    // Normalise status capitalisation
    const normStatus = status === 'done' ? 'Done' : status === 'in progress' ? 'In Progress' : 'To Do';

    if (type === 'epic') {
      epics.push({ id, title, status: normStatus as Epic['status'], points, assignee, sprint });
    } else if (type === 'story') {
      if (!parentId) throw new Error(`Row ${i + 1} (${id}): Stories must have a parentId (epicId).`);
      stories.push({ id, title, status: normStatus as Story['status'], points, assignee, epicId: parentId });
    } else {
      if (!parentId) throw new Error(`Row ${i + 1} (${id}): Sub-tasks must have a parentId (storyId).`);
      subtasks.push({ id, title, status: normStatus as Subtask['status'], points, assignee, storyId: parentId });
    }
  }

  if (epics.length === 0) throw new Error('CSV must contain at least one Epic.');

  // Validate parent references
  const epicIds  = new Set(epics.map(e => e.id));
  const storyIds = new Set(stories.map(s => s.id));

  for (const s of stories) {
    if (!epicIds.has(s.epicId)) throw new Error(`Story "${s.id}" references unknown Epic "${s.epicId}".`);
  }
  for (const st of subtasks) {
    if (!storyIds.has(st.storyId)) throw new Error(`Sub-task "${st.id}" references unknown Story "${st.storyId}".`);
  }

  return { epics, stories, subtasks };
}

class DataStore {
  epics       = $state<Epic[]>([...defaultEpics]);
  stories     = $state<Story[]>([...defaultStories]);
  subtasks    = $state<Subtask[]>([...defaultSubtasks]);
  allIssues   = $state<Record<string, AnyIssue>>({ ...defaultAllIssues });
  connections = $state<Connection[]>([...defaultConnections]);
  csvFilename = $state<string | null>(null);
  csvError    = $state<string | null>(null);

  resetToSample(): void {
    this.epics       = [...defaultEpics];
    this.stories     = [...defaultStories];
    this.subtasks    = [...defaultSubtasks];
    const { allIssues, connections } = buildDerived(defaultEpics, defaultStories, defaultSubtasks);
    this.allIssues   = allIssues;
    this.connections = connections;
    this.csvFilename = null;
    this.csvError    = null;
  }

  loadCSV(file: File): Promise<void> {
    return new Promise(resolve => {
      const reader = new FileReader();
      reader.onload = e => {
        try {
          const { epics, stories, subtasks } = parseCSV(e.target!.result as string);
          const { allIssues, connections }   = buildDerived(epics, stories, subtasks);
          this.epics       = epics;
          this.stories     = stories;
          this.subtasks    = subtasks;
          this.allIssues   = allIssues;
          this.connections = connections;
          this.csvFilename = file.name;
          this.csvError    = null;
        } catch (err) {
          this.csvError = (err as Error).message;
        }
        resolve();
      };
      reader.readAsText(file);
    });
  }
}

export const dataStore = new DataStore();
