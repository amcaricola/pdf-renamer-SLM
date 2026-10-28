const fs = require("fs");
const path = require("path");

function sanitizeName(name) {
  return String(name || "document")
    .replace(/\.[^.]+$/, "")
    .replace(/[^a-zA-Z0-9_-]/g, "_")
    .slice(0, 80);
}

function formatDate(d) {
  const dt = d instanceof Date ? d : new Date(d || Date.now());
  const y = dt.getFullYear();
  const m = String(dt.getMonth() + 1).padStart(2, "0");
  const day = String(dt.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function tryPattern(name, regex, text) {
  const m = text.match(regex);
  return {
    name,
    regex: regex.source,
    matched: !!m,
    capture: m ? (m[1] !== undefined ? m[1] : m[0]) : null,
  };
}

function buildMarkdown({ filename, processingDate, result, reason, ocrText, ocrUsed, patterns, extracted, newName, error }) {
  const lines = [];
  lines.push(`# Log de procesamiento: ${filename}`);
  lines.push("");
  lines.push(`- **Archivo original:** ${filename}`);
  lines.push(`- **Fecha de procesamiento:** ${processingDate}`);
  lines.push(`- **OCR utilizado:** ${ocrUsed ? "Sí" : "No"}`);
  lines.push(`- **Resultado:** ${result || "desconocido"}`);
  if (newName) lines.push(`- **Nuevo nombre:** ${newName}`);
  if (error) lines.push(`- **Error:** ${error}`);
  lines.push("");
  lines.push("## Razón por la cual no funcionó");
  lines.push("");
  lines.push(reason ? reason : "_N/A (procesado correctamente o sin motivo de fallo)_.");
  lines.push("");
  lines.push("## Resultado del OCR");
  lines.push("");
  lines.push("```text");
  lines.push((ocrText || "").trim() || "(sin texto extraído)");
  lines.push("```");
  lines.push("");
  lines.push("## Resultado de cada patrón intentado");
  lines.push("");
  if (patterns && patterns.length) {
    for (const p of patterns) {
      lines.push(`- **${p.name}** — \`${p.regex}\` → ${p.matched ? "MATCH" : "sin match"}${p.capture ? ` (captura: \`${p.capture}\`)` : ""}`);
    }
  } else {
    lines.push("_No se intentaron patrones._");
  }
  lines.push("");
  lines.push("## Datos extraídos");
  lines.push("");
  lines.push("```json");
  lines.push(JSON.stringify(extracted || {}, null, 2));
  lines.push("```");
  lines.push("");
  return lines.join("\n");
}

function writeDocumentLog({ outputDir, filename, reason, ocrText, ocrUsed, patterns, extracted, result, newName, error }) {
  if (!outputDir) return null;
  try {
    if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });
    const base = sanitizeName(filename);
    const date = formatDate(new Date());
    const logName = `LOG_${base}_${date}.md`;
    const logPath = path.join(outputDir, logName);
    const content = buildMarkdown({
      filename,
      processingDate: new Date().toLocaleString(),
      result,
      reason,
      ocrText,
      ocrUsed,
      patterns,
      extracted,
      newName,
      error,
    });
    fs.writeFileSync(logPath, content, "utf-8");
    return logPath;
  } catch (e) {
    return null;
  }
}

module.exports = { writeDocumentLog, tryPattern, buildMarkdown, sanitizeName, formatDate };
