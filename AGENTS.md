# PDF Manager — App de Escritorio

Aplicación Electron + Preact + Vite para renombrar y organizar PDFs según reglas de negocio (manifiestos, guías Copec, órdenes de compra).

## Requisitos

- **Node.js** 18+
- **pdftotext** (parte de [Poppler](https://poppler.freedesktop.org/)) instalado en el sistema y accesible vía `PATH`
- **Python 3** con **PyMuPDF** (`pip install pymupdf`) — necesario solo para OCR de PDFs escaneados
- **Windows** 10/11

## Instalación

```bash
cd pdf-manager-app
npm install
```

## Ejecución en desarrollo

```bash
npm run electron:dev
```

Inicia Vite (hot-reload) + Electron. Ideal para desarrollo.

## Build (unpacked)

```bash
npm run electron:build
```

Genera `release/PDF Manager-win32-x64/` con `PDF Manager.exe` autónomo. Sin instalador, solo copiar la carpeta y ejecutar.

---

## Reglas de Negocio (tipos de documento)

### Manifiesto
Renombrar con la fecha en formato `MM-DD.pdf`.

- **Identificador (formato antiguo):** cadena `"manifiesto del transportista impreso el:"` (Seller Center)
- **Identificador (formato nuevo):** `"MANIFIESTO DE CARGA"` + `"FECHA:"` (Falabella)
- **Extracción fecha antigua:** tras `"impreso el:"`, formato `DD Month YYYY` (ej: `"08 May 2026"` → `05-08`)
- **Extracción fecha nueva:** tras `"FECHA:"`, formato `DD/MM/YYYY` (ej: `"05/05/2026"` → `05-05`)

### Guía Copec (legacy — se mantiene para compatibilidad)
Renombrar con el número de Guía de Despacho (`{num}.pdf`) o Factura Electrónica (`{num}.pdf`), solo el número sin prefijo.

### O/C Paris o Ripley
Renombrar con el número de Orden de Compra: `{PO}.pdf`.

- El PO se encuentra tras el literal `"N° O/C: "` (ej: `N° O/C: 12345678901`)
- Incluso si el PDF tiene también número de factura (`N°:`), se ignora y solo se usa el PO

### O/C Falabella
Renombrar con PO + Factura Electrónica: `{PO}_{FE}.pdf` (solo números, sin prefijos).

- **PO:** tras `"N° O/C: "` (no confundir con `N.VENTA`)
- **FE:** tras `"N°: "` + 5+ dígitos (ej: `N°: 123456`)
- **Identificación:** requiere el literal `CLIENTE FALABELLA` en el texto. Documentos de Paris/Ripley con `N°` + `RUT` no se clasifican como Falabella (no tienen `CLIENTE FALABELLA`).

---

## Uso de la aplicación

1. **Abrir la app** (`npm run electron:dev` o ejecutar el `.exe` portable)
2. **Seleccionar carpeta de entrada** → botón "Seleccionar" junto a "Entrada" (diálogo nativo de Windows)
3. **Seleccionar carpeta de salida** → botón "Seleccionar" junto a "Salida"
4. La app escanea automáticamente los PDFs de la carpeta de entrada y los muestra en la lista
5. Opciones:
   - **"Procesar Todos"** → procesa secuencialmente todos los PDFs
   - **Botón "▶" en cada archivo** → procesa solo ese archivo
   - **"Abrir entrada/salida"** → abre las carpetas en el explorador
   - **"Refrescar"** → reescanea las carpetas
6. El panel derecho muestra un log detallado con cada paso

### Procesamiento interno (por archivo)

1. Extrae texto con `pdftotext` (encoding `latin1` para caracteres españoles)
2. Si `pdftotext` devuelve menos de 50 caracteres (PDF escaneado), aplica OCR:
   - Convierte cada página a imagen con **PyMuPDF** (`fitz`) + Python
   - Reconoce texto con **tesseract.js** (idioma español)
3. Identifica el tipo de documento (Manifiesto, Copec, Paris/Ripley PO, Falabella PO) mediante regex
4. Extrae el dato relevante (fecha, número de guía, PO, FE) según el tipo
5. Renombra el archivo según el formato correspondiente
6. Lo mueve a la carpeta de salida

### OCR: tolerancia a artefactos

tesseract.js suele confundir `°` con `*`, y `N°:` con `Ne:`. Los regex están diseñados para tolerar estas variaciones:
- `N[°\*]` — matchea `N°` o `N*`
- `N[°\*eE]:` — matchea `N°:`, `N*:` o `Ne:`
- `R\.?\s*U\.?\s*T\.?` — matchea `RUT`, `R.U.T`, `Rut`

### Persistencia de carpetas

Las carpetas de entrada y salida se guardan automáticamente en `%APPDATA%/PDF Manager/config.json` al seleccionarlas. Al reiniciar la app, se restauran las últimas carpetas usadas.

---

### Lógica de identificación (regex)

| Tipo | Patrón |
|---|---|
| Manifiesto old | `/manifiesto del transportista impreso el:/i` |
| Manifiesto new | `/MANIFIESTO DE CARGA/` + `/FECHA:/i` |
| Copec | `/GS\s*\d{5}/i` o `/FE\s*\d{5,}/i` o `GUÍA DE DESPACHO` |
| Paris/Ripley PO | `/N[°\*]\s*O\/C:\s*\d{5,}/i` (sin guía de despacho, sin `CLIENTE FALABELLA`) |
| Falabella PO | `/N[°\*]\s*O\/C:\s*\d{5,}/i` + `/N[°\*eE]:\s*\d{5,}/` + `/CLIENTE\s+FALABELLA/i` |

### Conflictos de nombres

Si ya existe un archivo con el mismo nombre en la carpeta de salida, se agrega un sufijo numérico (`_1`, `_2`, etc.).

---

## IMPORTANTE

- NO USAR TODOTOOL / WRITETODO.
- NO modificar archivos dentro de `pdf-manager-app/` manualmente a menos que se requiera un cambio en la lógica de negocio.
