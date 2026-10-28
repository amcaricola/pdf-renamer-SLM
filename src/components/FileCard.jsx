export function FileCard({ filename, index, total, isProcessing, onProcess, onViewLog, hasLog, disabled }) {
  return (
    <div class={`file-card ${isProcessing ? 'processing' : ''}`}>
      <div class="file-info">
        <span class="file-index">{index + 1}/{total}</span>
        <span class="file-name">{filename}</span>
      </div>
      <div class="file-actions">
        {hasLog && (
          <button
            class="btn btn-sm"
            onClick={() => onViewLog && onViewLog(filename)}
            disabled={disabled || isProcessing}
            title="Ver log del archivo"
          >
            📝
          </button>
        )}
        <button
          class="btn btn-sm"
          onClick={onProcess}
          disabled={disabled || isProcessing}
        >
          {isProcessing ? '...' : '▶'}
        </button>
      </div>
    </div>
  );
}