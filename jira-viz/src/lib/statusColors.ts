// statusColors.ts - backward-compat re-export shim.
// colorMapping.ts is the source of truth; import from there in new code.
export type { ColorDef as StatusStyle } from './colorMapping.js';
export {
  resolveColor,
  resolveColorByValue,
  seriesColor,
  statusStyle,
  priorityStyle,
  issueTypeStyle,
} from './colorMapping.js';
