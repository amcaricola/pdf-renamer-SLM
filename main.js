const { app, BrowserWindow, ipcMain, dialog } = require("electron");
const path = require("path");
const fs = require("fs");
const os = require("os");
const { execSync, exec } = require("child_process");
const logger = require("./logger");

const isDev = !app.isPackaged;

// Find a Python that has PyMuPDF (fitz) installed
function findPython3WithFitz() {
  const candidates = [
    "C:/Users/Windows/AppData/Local/Microsoft/WindowsApps/python3.exe",
    "python3",
    "python",
  ];
  for (const py of candidates) {
    try {
      execSync(`"${py}" -c "import fitz"`, {
        encoding: "utf-8",
        timeout: 5000,
      });
      return py;
    } catch {}
  }
  return null;
}

const PYTHON_FITZ = findPython3WithFitz();

// Lazy-initialized tesseract worker (OCR)
let tesseractWorker = null;
async function getOcrWorker() {
  if (!tesseractWorker) {
    const { createWorker } = require("tesseract.js");
    tesseractWorker = await createWorker("spa");
  }
  return tesseractWorker;
}

const CONFIG_PATH = path.join(app.getPath("userData"), "config.json");

function loadFolders() {
  try {
    if (fs.existsSync(CONFIG_PATH)) {
      const data = JSON.parse(fs.readFileSync(CONFIG_PATH, "utf-8"));
      inputDir = data.inputDir || null;
      outputDir = data.outputDir || null;
    }
  } catch {}
}

function saveFolders() {
  try {
    fs.mkdirSync(path.dirname(CONFIG_PATH), { recursive: true });
    fs.writeFileSync(
      CONFIG_PATH,
      JSON.stringify({ inputDir, outputDir }),
      "utf-8",
    );
  } catch {}
}

let inputDir = null;
let outputDir = null;

function ensureOutputDir() {
  if (outputDir && !fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }
}

function getPdfFiles() {
  if (!inputDir) return [];
  return fs
    .readdirSync(inputDir)
    .filter((f) => path.extname(f).toLowerCase() === ".pdf");
}

function pdftotext(filePath) {
  try {
    return execSync(`pdftotext "${filePath}" -`, {
      encoding: "latin1",
      timeout: 15000,
    });
  } catch {
    return "";
  }
}

function identifyType(text) {
  if (/manifiesto del transportista impreso el:/i.test(text)) {
    return { type: "manifest", subtype: "old" };
  }
  if (/MANIFIESTO DE CARGA/.test(text) && /FECHA:/i.test(text)) {
    return { type: "manifest", subtype: "new" };
  }
  if (/N[°\*]\s*O\s*[\/I]?C:/i.test(text)) {
    const hasGuia = /(?:GUÍA|GUIA)\s*(?:DE\s*)?DESPACHO/i.test(text);
    const isFalabella = /CLIENTE\s+FALABELLA/i.test(text);
    const hasFactura = /N[°\*eE]:\s*\d{5,}/.test(text);
    if (hasGuia) return { type: "copec" };
    if (isFalabella && hasFactura) return { type: "falabella" };
    return { type: "purchaseOrder" };
  }
  if (/GS\s*\d{5}/i.test(text) || /FE\s*\d{5,}/i.test(text)) {
    return { type: "copec" };
  }
  return { type: "unknown" };
}

function extractManifestDate(text, subtype) {
  if (subtype === "old") {
    const m = text.match(/impreso el:\s*(\d{1,2}\s+\w+\s+\d{4})/i);
    if (m) {
      const d = new Date(m[1]);
      if (!isNaN(d.getTime())) {
        const mm = String(d.getMonth() + 1).padStart(2, "0");
        const dd = String(d.getDate()).padStart(2, "0");
        return `${mm}-${dd}`;
      }
    }
  }
  if (subtype === "new") {
    const m = text.match(/FECHA:\s*(\d{2})\/(\d{2})\/(\d{4})/i);
    if (m) return `${m[2]}-${m[1]}`;
  }
  return null;
}

function extractCopecNumber(text) {
  let m = text.match(/GS\s*(\d{5})/i);
  if (m) return m[1];
  m = text.match(/FE\s*(\d{5,})/i);
  if (m) return m[1];
  m = text.match(/(?:GUÍA|GUIA)\s*(?:DE\s*)?DESPACHO[:\s]*(\d{5,})/i);
  if (m) return m[1];
  return null;
}

function extractPONumber(text) {
  const m = text.match(/N[°\*]\s*O\s*[\/I]?C:\s*(\d{5,})/i);
  return m ? m[1] : null;
}

function extractFENumber(text) {
  const m = text.match(/N[°\*eE]:\s*(\d{5,})/);
  return m ? m[1] : null;
}

function convertPdfToImages(filePath) {
  if (!PYTHON_FITZ) {
    throw new Error(
      "Python con PyMuPDF no encontrado. Instala: pip install pymupdf",
    );
  }
  const scriptPath = path.join(os.tmpdir(), "pdf2img.py");
  const script = `import fitz, sys, os, tempfile
doc = fitz.open(sys.argv[1])
tmpdir = tempfile.mkdtemp()
for i, page in enumerate(doc):
    pix = page.get_pixmap(dpi=200)
    pix.save(os.path.join(tmpdir, f"page_{i}.png"))
print(tmpdir)
`;
  fs.writeFileSync(scriptPath, script, "utf-8");
  try {
    return execSync(`"${PYTHON_FITZ}" "${scriptPath}" "${filePath}"`, {
      encoding: "utf-8",
      timeout: 120000,
    }).trim();
  } finally {
    try {
      fs.unlinkSync(scriptPath);
    } catch {}
  }
}

async function ocrPdf(filePath) {
  let tmpDir = null;
  try {
    tmpDir = convertPdfToImages(filePath);
    const files = fs
      .readdirSync(tmpDir)
      .filter((f) => f.endsWith(".png"))
      .sort();
    if (files.length === 0) return "";

    const worker = await getOcrWorker();
    let fullText = "";
    for (const f of files) {
      const {
        data: { text },
      } = await worker.recognize(path.join(tmpDir, f));
      fullText += text + "\n";
    }
    return fullText;
  } finally {
    if (tmpDir && fs.existsSync(tmpDir)) {
      for (const f of fs.readdirSync(tmpDir)) {
        try {
          fs.unlinkSync(path.join(tmpDir, f));
        } catch {}
      }
      try {
        fs.rmdirSync(tmpDir);
      } catch {}
    }
  }
}

async function processFile(filename) {
  if (!inputDir || !outputDir) {
    return {
      filename,
      status: "error",
      reason: "Carpetas de entrada/salida no configuradas",
    };
  }

  const filePath = path.join(inputDir, filename);
  if (!fs.existsSync(filePath)) {
    return { filename, status: "error", reason: "Archivo no encontrado" };
  }

  let ocrUsed = false;
  let text = pdftotext(filePath);
  if (text.length < 50) {
    ocrUsed = true;
    try {
      text = await ocrPdf(filePath);
    } catch (ocrErr) {
      const logPath = logger.writeDocumentLog({
        outputDir: inputDir,
        filename,
        reason: `OCR falló: ${ocrErr.message}`,
        ocrText: text,
        ocrUsed: true,
        patterns: [],
        extracted: {},
        result: "error",
        error: ocrErr.message,
      });
      return {
        filename,
        status: "error",
        reason: `OCR falló: ${ocrErr.message}`,
        logFile: logPath ? path.basename(logPath) : null,
      };
    }
  }

  const info = identifyType(text);
  const patterns = [];
  const extracted = { type: info.type, subtype: info.subtype || null };

  // Patrones de identificación
  patterns.push(logger.tryPattern("manifiesto old", /manifiesto del transportista impreso el:/i, text));
  patterns.push(logger.tryPattern("manifiesto new (MANIFIESTO DE CARGA)", /MANIFIESTO DE CARGA/, text));
  patterns.push(logger.tryPattern("manifiesto new (FECHA:)", /FECHA:/i, text));
  patterns.push(logger.tryPattern("PO (N° O/C u OIC)", /N[°*]\s*O\s*[\/I]?C:/i, text));
  patterns.push(logger.tryPattern("Copec GS", /GS\s*\d{5}/i, text));
  patterns.push(logger.tryPattern("Copec FE", /FE\s*\d{5,}/i, text));
  patterns.push(logger.tryPattern("Guía despacho", /(?:GUÍA|GUIA)\s*(?:DE\s*)?DESPACHO/i, text));
  patterns.push(logger.tryPattern("Falabella (CLIENTE FALABELLA)", /CLIENTE\s+FALABELLA/i, text));
  patterns.push(logger.tryPattern("Factura (N°:)", /N[°*eE]:\s*\d{5,}/, text));

  let newName = null;
  let reason = null;

  if (info.type === "manifest") {
    patterns.push(logger.tryPattern("extract fecha old", /impreso el:\s*(\d{1,2}\s+\w+\s+\d{4})/i, text));
    patterns.push(logger.tryPattern("extract fecha new", /FECHA:\s*(\d{2})\/(\d{2})\/(\d{4})/i, text));
    const date = extractManifestDate(text, info.subtype);
    extracted.date = date;
    if (date) newName = `${date}.pdf`;
    else reason = "No se pudo extraer fecha del manifiesto";
  } else if (info.type === "copec") {
    patterns.push(logger.tryPattern("extract GS", /GS\s*(\d{5})/i, text));
    patterns.push(logger.tryPattern("extract FE copec", /FE\s*(\d{5,})/i, text));
    patterns.push(logger.tryPattern("extract guía despacho", /(?:GUÍA|GUIA)\s*(?:DE\s*)?DESPACHO[:\s]*(\d{5,})/i, text));
    const num = extractCopecNumber(text);
    extracted.number = num;
    if (num) newName = `${num}.pdf`;
    else reason = "No se pudo extraer número de guía/factura";
  } else if (info.type === "purchaseOrder") {
    patterns.push(logger.tryPattern("extract PO", /N[°*]\s*O\s*[\/I]?C:\s*(\d{5,})/i, text));
    const po = extractPONumber(text);
    extracted.po = po;
    if (po) newName = `${po}.pdf`;
    else reason = "No se pudo extraer N° O/C";
  } else if (info.type === "falabella") {
    patterns.push(logger.tryPattern("extract PO", /N[°*]\s*O\s*[\/I]?C:\s*(\d{5,})/i, text));
    patterns.push(logger.tryPattern("extract FE", /N[°*eE]:\s*(\d{5,})/, text));
    const po = extractPONumber(text);
    const fe = extractFENumber(text);
    extracted.po = po;
    extracted.fe = fe;
    if (po && fe) newName = `${po}_${fe}.pdf`;
    else if (po) newName = `${po}.pdf`;
    else reason = "No se pudo extraer O/C ni N° factura";
  } else {
    reason = "Tipo de documento no reconocido";
  }

  if (reason) {
    const logPath = logger.writeDocumentLog({
      outputDir: inputDir,
      filename,
      reason,
      ocrText: text,
      ocrUsed,
      patterns,
      extracted,
      result: "error",
    });
    return {
      filename,
      status: "error",
      reason,
      logFile: logPath ? path.basename(logPath) : null,
    };
  }

  const destPath = path.join(outputDir, newName);

  if (fs.existsSync(destPath)) {
    const base = path.parse(newName).name;
    const ext = path.parse(newName).ext;
    let counter = 1;
    while (fs.existsSync(path.join(outputDir, `${base}_${counter}${ext}`))) {
      counter++;
    }
    newName = `${base}_${counter}${ext}`;
  }

  try {
    fs.renameSync(filePath, path.join(outputDir, newName));
    // Solo se generan logs para casos de error (diagnóstico de OCR/reconocimiento)
    return {
      filename,
      newName,
      status: "ok",
    };
  } catch (err) {
    const logPath = logger.writeDocumentLog({
      outputDir: inputDir,
      filename,
      reason: err.message,
      ocrText: text,
      ocrUsed,
      patterns,
      extracted,
      result: "error",
      error: err.message,
    });
    return {
      filename,
      status: "error",
      reason: err.message,
      logFile: logPath ? path.basename(logPath) : null,
    };
  }
}

function listDoneFiles() {
  if (!outputDir || !fs.existsSync(outputDir)) return [];
  return fs.readdirSync(outputDir).filter((f) => f.endsWith(".pdf"));
}

function listLogFiles() {
  if (!inputDir || !fs.existsSync(inputDir)) return [];
  return fs
    .readdirSync(inputDir)
    .filter((f) => /^LOG_.*\.md$/i.test(f))
    .sort();
}

function readLogFile(name) {
  if (!inputDir) return null;
  const safe = path.basename(name);
  const p = path.join(inputDir, safe);
  if (!fs.existsSync(p)) return null;
  try {
    return fs.readFileSync(p, "utf-8");
  } catch {
    return null;
  }
}

function findLogFileFor(filename) {
  if (!inputDir || !fs.existsSync(inputDir)) return null;
  const base = path.basename(filename, path.extname(filename));
  const safe = base.replace(/[^a-zA-Z0-9_-]/g, "_");
  const files = fs
    .readdirSync(inputDir)
    .filter((f) => new RegExp(`^LOG_${safe}_.*\\.md$`, "i").test(f))
    .sort();
  if (files.length === 0) return null;
  const name = files[files.length - 1];
  try {
    return { name, content: fs.readFileSync(path.join(inputDir, name), "utf-8") };
  } catch {
    return null;
  }
}

async function selectFolder() {
  try {
    const win = BrowserWindow.getFocusedWindow() || mainWindow;
    const result = await dialog.showOpenDialog(win, {
      properties: ["openDirectory"],
    });
    if (!result.canceled && result.filePaths.length > 0) {
      return result.filePaths[0];
    }
    return null;
  } catch (err) {
    console.error("selectFolder error:", err);
    return null;
  }
}

function openFolder(folderPath) {
  if (fs.existsSync(folderPath)) {
    exec(`explorer "${folderPath}"`);
  }
}

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1100,
    height: 750,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  if (isDev) {
    mainWindow.loadURL("http://localhost:5173");
  } else {
    mainWindow.loadFile(path.join(__dirname, "dist", "index.html"));
  }
}

app.whenReady().then(() => {
  loadFolders();
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

ipcMain.handle("get-files", () => getPdfFiles());
ipcMain.handle("get-done-files", () => listDoneFiles());
ipcMain.handle("get-log-files", () => listLogFiles());
ipcMain.handle("read-log-file", (_e, name) => readLogFile(name));
ipcMain.handle("get-file-log", (_e, filename) => findLogFileFor(filename));
ipcMain.handle(
  "process-file",
  async (_e, filename) => await processFile(filename),
);
ipcMain.handle("open-folder", (_e, folder) => openFolder(folder));
ipcMain.handle("get-folders", () => ({ input: inputDir, output: outputDir }));

ipcMain.handle("set-input-folder", async () => {
  const folder = await selectFolder();
  if (folder) {
    inputDir = folder;
    saveFolders();
    return { success: true, path: folder };
  }
  return { success: false, path: null };
});

ipcMain.handle("set-output-folder", async () => {
  const folder = await selectFolder();
  if (folder) {
    outputDir = folder;
    ensureOutputDir();
    saveFolders();
    return { success: true, path: folder };
  }
  return { success: false, path: null };
});
