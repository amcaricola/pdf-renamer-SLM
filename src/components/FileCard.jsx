export function FileCard({ filename, index, total, isProcessing, onProcess, disabled }) {
  return (
    <div class={`file-card ${isProcessing ? 'processing' : ''}`}>
      <div class="file-info">
        <span class="file-index">{index + 1}/{total}</span>
        <span class="file-name">{filename}</span>
      </div>
      <button
        class="btn btn-sm"
        onClick={onProcess}
        disabled={disabled || isProcessing}
      >
        {isProcessing ? '...' : '▶'}
      </button>
    </div>
  );
}
