type EventListener = (event: {
  type: string;
  payload: unknown;
}) => void;

export interface EventBus {
  emit(type: string, payload: unknown): void;
  subscribe(listener: EventListener): () => void;
}

export function createEventBus(): EventBus {
  const listeners = new Set<EventListener>();

  return {
    emit(type, payload) {
      for (const listener of listeners) {
        listener({ type, payload });
      }
    },
    subscribe(listener) {
      listeners.add(listener);

      return () => {
        listeners.delete(listener);
      };
    }
  };
}
