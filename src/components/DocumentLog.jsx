import { useState, useEffect } from 'preact/hooks';

export function DocumentLog({ refreshKey }) {
  const [files, setFiles] = useState([]);
  const [selected, setSelected] = useState(null);
  const [content, setContent] = useState('');

  const loadFiles = async () => {
    try {
      const list = await window.electronAPI.getLogFiles();
      setFiles(list || []);
    } catch (e) {
      setFiles([]);
    }
  };

  useEffect(() => {
    loadFiles();
  }, [refreshKey]);

  const openFile = async (name) => {
    setSelected(name);
    try {
      const c = await window.electronAPI.readLogFile(name);
      setContent(c || '(sin contenido)');
    } catch (e) {
      setContent(`Error: ${e.message}`);
    }
  };

  return (
    <div class="log-viewer">
      <h2>Logs de documentos</h2>
      {files.length === 0 ? (
        <p class="empty">No hay archivos de log generados aún.</p>
      ) : (
        <div class="log-viewer-body">
          <div class="log-file-list">
            {files.map((f) => (
              <button
                key={f}
                class={`log-file-btn ${selected === f ? 'active' : ''}`}
                onClick={() => openFile(f)}
              >
                {f}
              </button>
            ))}
          </div>
          <pre class="log-file-content">{content || 'Selecciona un log para ver su contenido.'}</pre>
        </div>
      )}
    </div>
  );
}