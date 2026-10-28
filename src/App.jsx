import { useState, useEffect } from 'preact/hooks';
import { FileCard } from './components/FileCard.jsx';
import { LogPanel } from './components/LogPanel.jsx';
import { DocumentLog } from './components/DocumentLog.jsx';

export function App() {
  const [inputDir, setInputDir] = useState(null);
  const [outputDir, setOutputDir] = useState(null);
  const [files, setFiles] = useState([]);
  const [doneCount, setDoneCount] = useState(0);
  const [logs, setLogs] = useState([]);
  const [processing, setProcessing] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(null);
  const [showLogs, setShowLogs] = useState(false);
  const [logRefresh, setLogRefresh] = useState(0);
  const [logModal, setLogModal] = useState(null);
  const [filesWithLog, setFilesWithLog] = useState(new Set());

  const addLog = (msg, type = 'info') => {
    setLogs(prev => [...prev, { msg, type, time: new Date().toLocaleTimeString() }]);
  };

  useEffect(() => {
    if (!window.electronAPI) {
      addLog('ERROR: API de Electron no disponible (preload no cargó)', 'error');
    } else {
      addLog('API de Electron disponible', 'success');
    }
  }, []);

  const refreshFiles = async () => {
    const list = await window.electronAPI.getFiles();
    const sorted = list.sort();
    setFiles(sorted);
    // detectar qué archivos tienen log asociado
    try {
      const checks = await Promise.all(sorted.map(async (f) => {
        const r = await window.electronAPI.getFileLog(f);
        return r ? f : null;
      }));
      setFilesWithLog(new Set(checks.filter(Boolean)));
    } catch {
      setFilesWithLog(new Set());
    }
  };

  const refreshDone = async () => {
    const done = await window.electronAPI.getDoneFiles();
    setDoneCount(done.length);
  };

  const loadFolders = async () => {
    const folders = await window.electronAPI.getFolders();
    setInputDir(folders.input);
    setOutputDir(folders.output);
  };

  useEffect(() => {
    loadFolders();
  }, []);

  useEffect(() => {
    if (inputDir && outputDir) {
      refreshFiles();
      refreshDone();
    }
  }, [inputDir, outputDir]);

  const handleSetInput = async () => {
    try {
      const result = await window.electronAPI.setInputFolder();
      if (result && result.success) {
        setInputDir(result.path);
        addLog(`Carpeta de entrada: ${result.path}`, 'success');
      }
    } catch (err) {
      addLog(`Error al seleccionar entrada: ${err.message}`, 'error');
    }
  };

  const handleSetOutput = async () => {
    try {
      const result = await window.electronAPI.setOutputFolder();
      if (result && result.success) {
        setOutputDir(result.path);
        addLog(`Carpeta de salida: ${result.path}`, 'success');
      }
    } catch (err) {
      addLog(`Error al seleccionar salida: ${err.message}`, 'error');
    }
  };

  const processAll = async () => {
    setProcessing(true);
    setLogs([]);
    addLog('=== Iniciando procesamiento ===', 'header');
    addLog(`Archivos por procesar: ${files.length}`, 'info');

    let processed = 0;
    let errors = 0;

    for (let i = 0; i < files.length; i++) {
      const f = files[i];
      setCurrentIndex(i);
      addLog(`[${i + 1}/${files.length}] Procesando: ${f}`, 'processing');

      const result = await window.electronAPI.processFile(f);

      if (result.status === 'ok') {
        addLog(`  ✓ Renombrado a: ${result.newName}`, 'success');
        if (result.logFile) addLog(`  📝 Log: ${result.logFile}`, 'info');
        processed++;
      } else {
        addLog(`  ✗ Error: ${result.reason}`, 'error');
        if (result.logFile) addLog(`  📝 Log: ${result.logFile}`, 'info');
        errors++;
      }
    }

    addLog('=== Procesamiento completado ===', 'header');
    addLog(`✓ ${processed} archivos procesados correctamente`, 'success');
    if (errors > 0) addLog(`✗ ${errors} archivos con errores`, 'error');

    setCurrentIndex(null);
    setProcessing(false);
    await refreshFiles();
    await refreshDone();
    setLogRefresh((k) => k + 1);
  };

  const processOne = async (filename) => {
    addLog(`Procesando: ${filename}`, 'processing');
    const result = await window.electronAPI.processFile(filename);

    if (result.status === 'ok') {
      addLog(`  ✓ Renombrado a: ${result.newName}`, 'success');
      if (result.logFile) addLog(`  📝 Log: ${result.logFile}`, 'info');
    } else {
      addLog(`  ✗ Error: ${result.reason}`, 'error');
      if (result.logFile) addLog(`  📝 Log: ${result.logFile}`, 'info');
    }

    await refreshFiles();
    await refreshDone();
    setLogRefresh((k) => k + 1);
  };

  const viewFileLog = async (filename) => {
    try {
      const res = await window.electronAPI.getFileLog(filename);
      if (res && res.content) {
        setLogModal({ name: res.name, content: res.content });
      } else {
        addLog(`No hay log asociado a: ${filename}`, 'info');
      }
    } catch (err) {
      addLog(`Error al leer log: ${err.message}`, 'error');
    }
  };

  const foldersReady = inputDir && outputDir;

  return (
    <div class="app">
      <header class="app-header">
        <h1>📄 PDF Manager</h1>
      </header>

      <div class="folders-bar">
        <div class="folder-row">
          <span class="folder-label">Entrada:</span>
          <span class="folder-path" title={inputDir}>{inputDir || '(no seleccionada)'}</span>
          <button class="btn btn-sm" onClick={handleSetInput}>📂 Seleccionar</button>
        </div>
        <div class="folder-row">
          <span class="folder-label">Salida:</span>
          <span class="folder-path" title={outputDir}>{outputDir || '(no seleccionada)'}</span>
          <button class="btn btn-sm" onClick={handleSetOutput}>📂 Seleccionar</button>
        </div>
      </div>

      <div class="toolbar">
        <button class="btn btn-primary" onClick={processAll} disabled={processing || !foldersReady || files.length === 0}>
          {processing ? 'Procesando...' : 'Procesar Todos'}
        </button>
        <button class="btn" onClick={() => window.electronAPI.openFolder(inputDir)} disabled={!inputDir || processing}>
          📂 Abrir entrada
        </button>
        <button class="btn" onClick={() => window.electronAPI.openFolder(outputDir)} disabled={!outputDir || processing}>
          📂 Abrir salida
        </button>
        <button class="btn btn-secondary" onClick={() => { refreshFiles(); refreshDone(); }} disabled={processing || !foldersReady}>
          🔄 Refrescar
        </button>
        <button class="btn btn-secondary" onClick={() => setShowLogs((v) => !v)}>
          {showLogs ? 'Ocultar logs' : 'Ver logs'}
        </button>
        {foldersReady && (
          <span class="badge pending">{files.length} pendientes</span>
        )}
        {foldersReady && (
          <span class="badge done">{doneCount} procesados</span>
        )}
      </div>

      <div class="main-content">
        <div class="files-panel">
          <h2>Archivos PDF</h2>
          {!foldersReady ? (
            <p class="empty">Selecciona las carpetas de entrada y salida para comenzar.</p>
          ) : files.length === 0 ? (
            <p class="empty">No hay archivos PDF pendientes en la carpeta de entrada.</p>
          ) : (
            <div class="file-list">
              {files.map((f, i) => (
                <FileCard
                  filename={f}
                  index={i}
                  total={files.length}
                  isProcessing={processing && currentIndex === i}
                  onProcess={() => processOne(f)}
                  onViewLog={viewFileLog}
                  hasLog={filesWithLog.has(f)}
                  disabled={processing}
                />
              ))}
            </div>
          )}
        </div>
        <LogPanel logs={logs} />
      </div>
      {showLogs && (
        <div class="logs-section">
          <DocumentLog refreshKey={logRefresh} />
        </div>
      )}
      {logModal && (
        <div class="modal-overlay" onClick={() => setLogModal(null)}>
          <div class="modal" onClick={(e) => e.stopPropagation()}>
            <div class="modal-header">
              <span>{logModal.name}</span>
              <button class="btn btn-sm" onClick={() => setLogModal(null)}>✕</button>
            </div>
            <pre class="modal-content">{logModal.content}</pre>
          </div>
        </div>
      )}
    </div>
  );
}
