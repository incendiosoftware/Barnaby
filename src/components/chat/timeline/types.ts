/**
 * Row types for timeline decomposition.
 */

import type { TimelineUnit } from '../../../chat/timelineTypes'

export type TimelineRow =
  | { type: 'single'; unit: TimelineUnit }
  | { type: 'operationBatch'; units: TimelineUnit[] }
  | { type: 'thinkingBatch'; units: TimelineUnit[] }
