// Public RPC route vocabulary for Cloudflare Agent commands.
// Authority: docs/contracts/cloudflare-agents-turso.md

export type NoteStructureRouteKind = 'note_leave' | 'manual_organize' | 'next_open';
export type NoteLeaveCause =
  | 'note_close'
  | 'tab_switch'
  | 'app_leave'
  | 'note_closed'
  | 'tab_switched'
  | 'app_left';
