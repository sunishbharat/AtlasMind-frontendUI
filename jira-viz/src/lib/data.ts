// Hardcoded Jira project data - ATLAS Sprint 12

export type IssueStatus = 'Done' | 'In Progress' | 'To Do';

export interface Epic {
  id: string;
  title: string;
  status: IssueStatus;
  points: number;
  assignee: string;
  sprint: string;
}

export interface Story {
  id: string;
  title: string;
  status: IssueStatus;
  points: number;
  assignee: string;
  epicId: string;
}

export interface Subtask {
  id: string;
  title: string;
  status: IssueStatus;
  points: number;
  assignee: string;
  storyId: string;
}

export type AnyIssue = Epic | Story | Subtask;

export interface Connection {
  from: string;
  to: string;
}

export interface StatusStyle {
  color: string;
  bg: string;
}

export const epics: Epic[] = [
  {
    id: 'ATLAS-1',
    title: 'User Authentication',
    status: 'In Progress',
    points: 21,
    assignee: 'Alice Chen',
    sprint: 'Sprint 12',
  },
  {
    id: 'ATLAS-2',
    title: 'Dashboard Analytics',
    status: 'To Do',
    points: 34,
    assignee: 'Bob Smith',
    sprint: 'Sprint 12',
  },
];

export const stories: Story[] = [
  { id: 'ATLAS-10', title: 'Login Page UI',      status: 'Done',        points: 5,  epicId: 'ATLAS-1', assignee: 'Alice Chen' },
  { id: 'ATLAS-11', title: 'OAuth Integration',  status: 'In Progress', points: 8,  epicId: 'ATLAS-1', assignee: 'Dan Park'   },
  { id: 'ATLAS-12', title: 'Session Management', status: 'To Do',       points: 8,  epicId: 'ATLAS-1', assignee: 'Alice Chen' },
  { id: 'ATLAS-20', title: 'Chart Components',   status: 'In Progress', points: 13, epicId: 'ATLAS-2', assignee: 'Eve Wu'     },
  { id: 'ATLAS-21', title: 'Data Pipeline',      status: 'To Do',       points: 21, epicId: 'ATLAS-2', assignee: 'Bob Smith'  },
];

export const subtasks: Subtask[] = [
  { id: 'ATLAS-100', title: 'Design login form',         status: 'Done',        points: 1, storyId: 'ATLAS-10', assignee: 'Alice Chen' },
  { id: 'ATLAS-101', title: 'Implement field validation', status: 'Done',        points: 2, storyId: 'ATLAS-10', assignee: 'Dan Park'   },
  { id: 'ATLAS-102', title: 'Add Google OAuth provider',  status: 'In Progress', points: 3, storyId: 'ATLAS-11', assignee: 'Dan Park'   },
  { id: 'ATLAS-103', title: 'Token refresh logic',        status: 'To Do',       points: 3, storyId: 'ATLAS-11', assignee: 'Dan Park'   },
  { id: 'ATLAS-104', title: 'Redis session store',        status: 'To Do',       points: 5, storyId: 'ATLAS-12', assignee: 'Alice Chen' },
  { id: 'ATLAS-200', title: 'Bar chart component',        status: 'In Progress', points: 5, storyId: 'ATLAS-20', assignee: 'Eve Wu'     },
  { id: 'ATLAS-201', title: 'Line chart component',       status: 'To Do',       points: 5, storyId: 'ATLAS-20', assignee: 'Eve Wu'     },
  { id: 'ATLAS-202', title: 'ETL job configuration',      status: 'To Do',       points: 8, storyId: 'ATLAS-21', assignee: 'Bob Smith'  },
];

export const allIssues: Record<string, AnyIssue> = Object.fromEntries(
  [...epics, ...stories, ...subtasks].map(i => [i.id, i]),
);

export const connections: Connection[] = [
  ...stories.map(s  => ({ from: s.epicId,   to: s.id })),
  ...subtasks.map(st => ({ from: st.storyId, to: st.id })),
];

export const STATUS_STYLE: Record<IssueStatus, StatusStyle> = {
  'Done':        { color: '#22c55e', bg: 'rgba(34,197,94,0.12)'   },
  'In Progress': { color: '#3b82f6', bg: 'rgba(59,130,246,0.12)'  },
  'To Do':       { color: '#94a3b8', bg: 'rgba(148,163,184,0.07)' },
};
