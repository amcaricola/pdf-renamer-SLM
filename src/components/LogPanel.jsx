import { useEffect, useRef } from 'preact/hooks';

export function LogPanel({ logs }) {
  const bottomRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  return (
    <div class="log-panel">
      <h2>Registro</h2>
      <div class="log-list">
        {logs.length === 0 ? (
          <p class="empty">Presiona "Procesar Todos" para comenzar.</p>
        ) : (
          logs.map((log, i) => (
            <div key={i} class={`log-entry log-${log.type}`}>
              <span class="log-time">{log.time}</span>
              <span class="log-msg">{log.msg}</span>
            </div>
          ))
        )}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
