// QueryEventClient.ts
// Typed client for the /api/event endpoint.
// Encapsulates all event API calls — no UI logic here.

export type ClientEventType = 'cancel' | 'heartbeat';

export interface ClientEvent {
  event:      ClientEventType;
  request_id: string;
}

export interface EventAck {
  request_id: string;
  accepted:   boolean;
  detail:     string;
}

export class QueryEventClient {
  private readonly endpoint: string;

  constructor(endpoint = '/api/event') {
    this.endpoint = endpoint;
  }

  async send(event: ClientEventType, requestId: string): Promise<EventAck> {
    const body: ClientEvent = { event, request_id: requestId };
    const res = await fetch(this.endpoint, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`Event API responded ${res.status}`);
    return res.json() as Promise<EventAck>;
  }

  cancel(requestId: string): Promise<EventAck> {
    return this.send('cancel', requestId);
  }

  heartbeat(requestId: string): Promise<EventAck> {
    return this.send('heartbeat', requestId);
  }
}

/** Shared singleton — import this in components. */
export const queryEventClient = new QueryEventClient();
