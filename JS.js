pdfjsLib.GlobalWorkerOptions.workerSrc =
  "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";

const { PDFDocument, StandardFonts, rgb } = PDFLib;

// ======================================================
// RED HAT DISPLAY
// ======================================================

const RED_HAT_REGULAR_URL =
  "https://cdn.jsdelivr.net/fontsource/fonts/red-hat-display@5.2.6/latin-400-normal.woff2";

const RED_HAT_BOLD_URL =
  "https://cdn.jsdelivr.net/fontsource/fonts/red-hat-display@5.2.6/latin-800-normal.woff2";

let redHatFontBytesPromise = null;


// ======================================================
// IMPORTANTE:
// AQUÍ DEJA EXACTAMENTE EL MISMO DEFAULT_PDF_BASE64
// QUE YA TIENES EN TU JS ORIGINAL.
// ======================================================

const DEFAULT_PDF_BASE64 = "PEGA_AQUI_TU_DEFAULT_PDF_BASE64_ACTUAL";


const $ = id => document.getElementById(id);

const canvas = $("pdfCanvas");
const ctx = canvas.getContext("2d");
const stage = $("pdfStage");
const nameOverlay = $("nameOverlay");
const bodyOverlay = $("bodyOverlay");

let templateBytes = null;
let pdfMeta = null;
let participants = [];
let currentIndex = 0;
let participantSource = "paste";
let busy = false;

const CONFIG_KEY = "constancias_masivas_final_v1";


// ======================================================
// UTILIDADES
// ======================================================

function b64ToUint8(b64) {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);

  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }

  return bytes;
}


function normalizeKey(s) {
  return String(s ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_");
}


function toast(msg) {
  const el = $("toast");

  el.textContent = msg;
  el.classList.add("show");

  clearTimeout(toast.timer);

  toast.timer = setTimeout(() => {
    el.classList.remove("show");
  }, 2300);
}


function cleanName(line) {
  return String(line ?? "")
    .replace(/^\s*(?:[-•*]|\d+\s*[\.\)\-])\s*/, "")
    .replace(/\s+/g, " ")
    .trim();
}


// ======================================================
// PARTICIPANTES
// ======================================================

function uniqueParticipants(list) {
  const seen = new Set();
  const out = [];

  for (const item of list) {
    const name = cleanName(item.nombre);

    if (!name) continue;

    const key = name.toLocaleLowerCase("es");

    if (seen.has(key)) continue;

    seen.add(key);

    out.push({
      ...item,
      nombre: name
    });
  }

  return out;
}


function setParticipants(list, source = participantSource) {
  participants = uniqueParticipants(list);
  participantSource = source;

  if (currentIndex >= participants.length) {
    currentIndex = Math.max(0, participants.length - 1);
  }

  updateParticipantUI();
  updatePreviewText();
}


function parsePastedNames() {
  const names = $("namesInput").value
    .split(/\r?\n/)
    .map(cleanName)
    .filter(Boolean)
    .map(nombre => ({
      nombre
    }));

  setParticipants(names, "paste");
}


// ======================================================
// DATOS
// ======================================================

function globalData() {
  return {
    talleres: $("talleres").value.trim(),
    evento: $("evento").value.trim(),
    fecha: $("fecha").value.trim(),
    ciudad: $("ciudad").value.trim()
  };
}


function rowData(row = {}) {
  const g = globalData();

  return {

    // NOMBRE SIEMPRE EN MAYÚSCULAS
    nombre: String(
      row.nombre || "NOMBRE DEL ALUMNO"
    )
      .trim()
      .toLocaleUpperCase("es-MX"),

    talleres: String(
      row.talleres ||
      row.taller ||
      g.talleres ||
      ""
    ).trim(),

    evento: String(
      row.evento ||
      g.evento ||
      ""
    ).trim(),

    fecha: String(
      row.fecha ||
      g.fecha ||
      ""
    ).trim(),

    ciudad: String(
      row.ciudad ||
      g.ciudad ||
      ""
    ).trim()
  };
}


// ======================================================
// EVENTO ENTRE COMILLAS
// ======================================================

function quoteEvent(value) {

  const clean = String(value ?? "")
    .trim()

    // elimina comillas anteriores para evitar:
    // ““Evento””
    .replace(
      /^[\s\"'“”‘’]+|[\s\"'“”‘’]+$/g,
      ""
    )

    .trim();

  return clean
    ? `“${clean}”`
    : "";
}


// ======================================================
// CONSTRUIR TEXTO CON EVENTO RESALTADO
// ======================================================

function buildBodyRuns(template, data) {

  const source = String(template);

  const regex = /\{\{(\w+)\}\}/g;

  const runs = [];

  let lastIndex = 0;
  let match;


  while ((match = regex.exec(source))) {

    if (match.index > lastIndex) {

      runs.push({
        text: source.slice(
          lastIndex,
          match.index
        ),
        bold: false
      });

    }


    const key = match[1];


    const text =
      key === "evento"

        ? quoteEvent(data.evento)

        : String(
            data[key] ?? ""
          );


    if (text) {

      runs.push({

        text,

        // SOLO EVENTO EN NEGRITA
        bold: key === "evento"

      });

    }


    lastIndex = regex.lastIndex;
  }


  if (lastIndex < source.length) {

    runs.push({

      text: source.slice(lastIndex),

      bold: false

    });

  }


  return runs;
}


// ======================================================
// TEXTO NORMAL
// ======================================================

function fillTemplate(template, data) {

  return buildBodyRuns(
    template,
    data
  )
    .map(run => run.text)
    .join("");
}


// ======================================================
// ESCAPAR HTML
// ======================================================

function escapeHtml(value) {

  return String(value)

    .replace(/&/g, "&amp;")

    .replace(/</g, "&lt;")

    .replace(/>/g, "&gt;")

    .replace(/"/g, "&quot;")

    .replace(/'/g, "&#039;");
}


// ======================================================
// TEXTO PARA PREVIEW
// EVENTO EN NEGRITAS
// ======================================================

function fillTemplateHtml(template, data) {

  return buildBodyRuns(
    template,
    data
  )

    .map(run => {

      const safe =
        escapeHtml(run.text)
          .replace(/\n/g, "<br>");


      return run.bold

        ? `<strong class="event-highlight">${safe}</strong>`

        : safe;

    })

    .join("");
}


// ======================================================
// UI PARTICIPANTES
// ======================================================

function updateParticipantUI() {

  const n = participants.length;


  $("participantCount").textContent =
    n.toLocaleString("es-MX");


  $("pageCount").textContent =
    n
      ? `${currentIndex + 1} / ${n}`
      : "0 / 0";


  $("prevParticipant").disabled =
    !n ||
    currentIndex <= 0;


  $("nextParticipant").disabled =
    !n ||
    currentIndex >= n - 1;


  const ready =
    n > 0 &&
    !!templateBytes &&
    !busy;


  $("generateCombined").disabled =
    !ready;


  $("generateZip").disabled =
    !ready;


  $("readyText").textContent =
    n

      ? `${n.toLocaleString("es-MX")} constancia${
          n === 1 ? "" : "s"
        } lista${
          n === 1 ? "" : "s"
        }`

      : "Agrega participantes";


  if (n) {

    $("previewNameMeta").textContent =
      participants[currentIndex].nombre;

  } else {

    $("previewNameMeta").textContent =
      "Agrega nombres para comenzar";

  }

}


// ======================================================
// PREVIEW
// ======================================================

function updatePreviewText() {

  if (!pdfMeta) return;


  const current =
    participants.length

      ? participants[currentIndex]

      : {
          nombre: "NOMBRE DEL ALUMNO"
        };


  const data =
    rowData(current);


  nameOverlay.textContent =
    data.nombre;


  // HTML PARA PODER PONER EVENTO EN NEGRITA
  bodyOverlay.innerHTML =
    fillTemplateHtml(
      $("bodyTemplate").value,
      data
    );


  updateOverlayStyle();


  requestAnimationFrame(
    fitPreviewName
  );


  updateParticipantUI();
}


// ======================================================
// AJUSTAR NOMBRE
// ======================================================

function fitPreviewName() {

  if (
    !pdfMeta ||
    nameOverlay.hidden
  ) return;


  const scale =
    pdfMeta.viewportScale;


  const preferredPdfSize =
    Number(
      $("nameSize").value
    );


  const minPdfSize = 15;


  let currentPdfSize =
    preferredPdfSize;


  nameOverlay.style.fontSize =
    `${currentPdfSize * scale}px`;


  nameOverlay.style.whiteSpace =
    "nowrap";


  // Reducir únicamente si el nombre no cabe.
  while (

    nameOverlay.scrollWidth >
      nameOverlay.clientWidth + 1

    &&

    currentPdfSize >
      minPdfSize

  ) {

    currentPdfSize -= 0.5;


    nameOverlay.style.fontSize =
      `${currentPdfSize * scale}px`;

  }


  nameOverlay.dataset.effectivePdfSize =
    String(currentPdfSize);
}


// ======================================================
// ESTILOS DEL PREVIEW
// ======================================================

function updateOverlayStyle() {

  if (!pdfMeta) return;


  const scale =
    pdfMeta.viewportScale;


  bodyOverlay.style.fontSize =
    `${Number(
      $("bodySize").value
    ) * scale}px`;


  // NOMBRE
  nameOverlay.style.fontFamily =
    '"Red Hat Display", sans-serif';

  nameOverlay.style.fontWeight =
    "800";


  // TEXTO DE ABAJO
  bodyOverlay.style.fontFamily =
    '"Red Hat Display", sans-serif';

  bodyOverlay.style.fontWeight =
    "400";


  nameOverlay.style.color =
    $("nameColor").value;


  bodyOverlay.style.color =
    $("bodyColor").value;


  nameOverlay.style.width =
    `${Number(
      $("nameWidth").value
    )}%`;


  bodyOverlay.style.width =
    `${Number(
      $("bodyWidth").value
    )}%`;


  requestAnimationFrame(
    fitPreviewName
  );
}


// ======================================================
// POSICIONES
// ======================================================

function recommendedPositions() {

  if (!pdfMeta) return;


  nameOverlay.style.left =
    "24%";

  nameOverlay.style.top =
    "29.5%";

  nameOverlay.style.width =
    `${Number(
      $("nameWidth").value
    )}%`;


  bodyOverlay.style.left =
    "24%";

  bodyOverlay.style.top =
    "42%";

  bodyOverlay.style.width =
    `${Number(
      $("bodyWidth").value
    )}%`;


  saveConfig();
}


// ======================================================
// GUARDAR CONFIG
// ======================================================

function saveConfig() {

  if (!pdfMeta) return;


  const stageRect =
    stage.getBoundingClientRect();


  const nRect =
    nameOverlay.getBoundingClientRect();


  const bRect =
    bodyOverlay.getBoundingClientRect();


  const config = {

    talleres:
      $("talleres").value,

    evento:
      $("evento").value,

    fecha:
      $("fecha").value,

    ciudad:
      $("ciudad").value,

    bodyTemplate:
      $("bodyTemplate").value,

    nameSize:
      $("nameSize").value,

    bodySize:
      $("bodySize").value,

    nameColor:
      $("nameColor").value,

    bodyColor:
      $("bodyColor").value,

    nameWidth:
      $("nameWidth").value,

    bodyWidth:
      $("bodyWidth").value,


    positions: {

      name: {

        left:
          (nRect.left -
            stageRect.left)
          /
          stageRect.width,

        top:
          (nRect.top -
            stageRect.top)
          /
          stageRect.height
      },


      body: {

        left:
          (bRect.left -
            stageRect.left)
          /
          stageRect.width,

        top:
          (bRect.top -
            stageRect.top)
          /
          stageRect.height

      }

    }

  };


  localStorage.setItem(
    CONFIG_KEY,
    JSON.stringify(config)
  );
}


// ======================================================
// RESTAURAR CONFIG
// ======================================================

function restoreConfigValues() {

  try {

    const raw =
      localStorage.getItem(
        CONFIG_KEY
      );


    if (!raw) return null;


    const c =
      JSON.parse(raw);


    [
      "talleres",
      "evento",
      "fecha",
      "ciudad",
      "bodyTemplate",
      "nameSize",
      "bodySize",
      "nameColor",
      "bodyColor",
      "nameWidth",
      "bodyWidth"
    ]

      .forEach(k => {

        if (
          c[k] !== undefined &&
          $(k)
        ) {

          $(k).value =
            c[k];

        }

      });


    return c;


  } catch {

    return null;

  }

}


// ======================================================
// RESTAURAR POSICIONES
// ======================================================

function restoreSavedPositions(config) {

  if (
    !config?.positions ||
    !pdfMeta
  ) {

    recommendedPositions();

    return;
  }


  const p =
    config.positions;


  nameOverlay.style.left =
    `${p.name.left * 100}%`;


  nameOverlay.style.top =
    `${p.name.top * 100}%`;


  bodyOverlay.style.left =
    `${p.body.left * 100}%`;


  bodyOverlay.style.top =
    `${p.body.top * 100}%`;

}


// ======================================================
// DRAG
// ======================================================

function makeDraggable(el) {

  let startX = 0;
  let startY = 0;
  let startLeft = 0;
  let startTop = 0;


  el.addEventListener(
    "pointerdown",
    e => {

      el.setPointerCapture(
        e.pointerId
      );


      const r =
        el.getBoundingClientRect();


      const p =
        stage.getBoundingClientRect();


      startX =
        e.clientX;


      startY =
        e.clientY;


      startLeft =
        r.left - p.left;


      startTop =
        r.top - p.top;

    }
  );


  el.addEventListener(
    "pointermove",
    e => {

      if (
        !el.hasPointerCapture(
          e.pointerId
        )
      ) return;


      const p =
        stage.getBoundingClientRect();


      const left =
        Math.max(

          0,

          Math.min(

            startLeft +
              (
                e.clientX -
                startX
              ),

            p.width -
              el.offsetWidth

          )

        );


      const top =
        Math.max(

          0,

          Math.min(

            startTop +
              (
                e.clientY -
                startY
              ),

            p.height -
              el.offsetHeight

          )

        );


      el.style.left =
        `${left}px`;


      el.style.top =
        `${top}px`;

    }
  );


  el.addEventListener(
    "pointerup",
    e => {

      try {

        el.releasePointerCapture(
          e.pointerId
        );

      } catch {}


      saveConfig();

    }
  );

}


makeDraggable(nameOverlay);
makeDraggable(bodyOverlay);


// ======================================================
// CARGAR PDF
// ======================================================

async function loadPdf(
  bytes,
  label = "PDF"
) {

  templateBytes =
    new Uint8Array(bytes);


  const loadingTask =
    pdfjsLib.getDocument({

      data:
        templateBytes.slice()

    });


  const pdf =
    await loadingTask.promise;


  const page =
    await pdf.getPage(1);


  const raw =
    page.getViewport({
      scale: 1
    });


  const available =
    Math.min(

      980,

      Math.max(

        500,

        window.innerWidth > 1050

          ? window.innerWidth - 530

          : window.innerWidth - 70

      )

    );


  const displayScale =
    Math.max(

      .45,

      Math.min(

        1.45,

        available / raw.width

      )

    );


  const viewport =
    page.getViewport({

      scale:
        displayScale

    });


  canvas.width =
    Math.ceil(
      viewport.width
    );


  canvas.height =
    Math.ceil(
      viewport.height
    );


  canvas.style.width =
    `${viewport.width}px`;


  canvas.style.height =
    `${viewport.height}px`;


  stage.style.width =
    `${viewport.width}px`;


  stage.style.height =
    `${viewport.height}px`;


  await page.render({

    canvasContext:
      ctx,

    viewport

  }).promise;


  pdfMeta = {

    pdfWidth:
      raw.width,

    pdfHeight:
      raw.height,

    viewportScale:
      displayScale

  };


  nameOverlay.hidden =
    false;


  bodyOverlay.hidden =
    false;


  const config =
    restoreConfigValues();


  updateOverlayStyle();


  restoreSavedPositions(
    config
  );


  updatePreviewText();


  $("templateName").textContent =
    label;


  toast("PDF listo");
}


// ======================================================
// CAMBIAR PDF
// ======================================================

$("pdfInput").addEventListener(
  "change",
  async e => {

    const file =
      e.target.files[0];


    if (!file) return;


    await loadPdf(

      new Uint8Array(
        await file.arrayBuffer()
      ),

      file.name

    );

  }
);


// ======================================================
// RESTAURAR PDF ORIGINAL
// ======================================================

$("restorePdf").addEventListener(
  "click",
  async () => {

    await loadPdf(

      b64ToUint8(
        DEFAULT_PDF_BASE64
      ),

      "alumnos constancia.pdf"

    );

  }
);


// ======================================================
// TABS
// ======================================================

$("tabPaste").addEventListener(
  "click",
  () => {

    $("tabPaste")
      .classList
      .add("active");


    $("tabExcel")
      .classList
      .remove("active");


    $("pastePanel").hidden =
      false;


    $("excelPanel").hidden =
      true;


    parsePastedNames();

  }
);


$("tabExcel").addEventListener(
  "click",
  () => {

    $("tabExcel")
      .classList
      .add("active");


    $("tabPaste")
      .classList
      .remove("active");


    $("excelPanel").hidden =
      false;


    $("pastePanel").hidden =
      true;


    participantSource =
      "excel";

  }
);


// ======================================================
// INPUT DE NOMBRES
// ======================================================

$("namesInput").addEventListener(
  "input",
  parsePastedNames
);


// ======================================================
// LIMPIAR
// ======================================================

$("clearNames").addEventListener(
  "click",
  () => {

    $("namesInput").value =
      "";


    $("excelInput").value =
      "";


    $("excelLoaded").textContent =
      "";


    setParticipants(
      [],
      participantSource
    );

  }
);


// ======================================================
// PREV / NEXT
// ======================================================

$("prevParticipant").addEventListener(
  "click",
  () => {

    if (currentIndex > 0) {
      currentIndex--;
    }


    updatePreviewText();

  }
);


$("nextParticipant").addEventListener(
  "click",
  () => {

    if (
      currentIndex <
      participants.length - 1
    ) {

      currentIndex++;

    }


    updatePreviewText();

  }
);


// ======================================================
// EXCEL
// ======================================================

$("excelInput").addEventListener(
  "change",
  async e => {

    const file =
      e.target.files[0];


    if (!file) return;


    const buffer =
      await file.arrayBuffer();


    const wb =
      XLSX.read(
        buffer,
        {
          type: "array",
          cellDates: true
        }
      );


    const ws =
      wb.Sheets[
        wb.SheetNames[0]
      ];


    const grid =
      XLSX.utils.sheet_to_json(
        ws,
        {

          header: 1,

          defval: "",

          raw: false

        }
      );


    if (!grid.length) {

      toast(
        "El archivo está vacío"
      );

      return;
    }


    const expectedNames =
      new Set([
        "nombre",
        "name",
        "alumno",
        "alumna",
        "participante",
        "nombre_completo",
        "nombre_del_alumno"
      ]);


    const header =
      grid[0].map(
        normalizeKey
      );


    let nameCol =
      header.findIndex(
        h =>
          expectedNames.has(h)
      );


    let parsed = [];


    if (nameCol >= 0) {

      const cols = {};


      header.forEach(
        (h, i) =>
          cols[h] = i
      );


      for (
        let r = 1;
        r < grid.length;
        r++
      ) {

        const row =
          grid[r];


        const nombre =
          cleanName(
            row[nameCol]
          );


        if (!nombre) continue;


        parsed.push({

          nombre,

          talleres:
            row[
              cols.talleres
            ]
            ??
            row[
              cols.taller
            ]
            ??
            "",

          evento:
            row[
              cols.evento
            ]
            ??
            "",

          fecha:
            row[
              cols.fecha
            ]
            ??
            "",

          ciudad:
            row[
              cols.ciudad
            ]
            ??
            ""

        });

      }


    } else {


      for (const row of grid) {

        const firstNonEmpty =
          row.find(
            v =>
              String(v)
                .trim() !== ""
          );


        const nombre =
          cleanName(
            firstNonEmpty
          );


        if (nombre) {

          parsed.push({
            nombre
          });

        }

      }

    }


    setParticipants(
      parsed,
      "excel"
    );


    $("excelLoaded").textContent =
      `✓ ${file.name} · ${
        participants.length.toLocaleString(
          "es-MX"
        )
      } nombres`;


    toast(
      `${participants.length.toLocaleString(
        "es-MX"
      )} participantes importados`
    );

  }
);


// ======================================================
// DESCARGAR PLANTILLA EXCEL
// ======================================================

$("downloadTemplate").addEventListener(
  "click",
  () => {

    const ws =
      XLSX.utils.aoa_to_sheet([
        [
          "nombre",
          "talleres",
          "evento",
          "fecha",
          "ciudad"
        ]
      ]);


    ws["!cols"] = [

      { wch: 34 },

      { wch: 28 },

      { wch: 26 },

      { wch: 24 },

      { wch: 20 }

    ];


    const wb =
      XLSX.utils.book_new();


    XLSX.utils.book_append_sheet(
      wb,
      ws,
      "Participantes"
    );


    XLSX.writeFile(
      wb,
      "plantilla_constancias_masivas.xlsx"
    );

  }
);


// ======================================================
// INPUTS
// ======================================================

[
  "talleres",
  "evento",
  "fecha",
  "ciudad",
  "bodyTemplate",
  "nameSize",
  "bodySize",
  "nameColor",
  "bodyColor",
  "nameWidth",
  "bodyWidth"
]

  .forEach(id => {

    $(id).addEventListener(
      "input",
      () => {

        updatePreviewText();

        saveConfig();

      }
    );

  });


// ======================================================
// RESTAURAR POSICIONES
// ======================================================

$("resetPositions").addEventListener(
  "click",
  () => {

    recommendedPositions();

    updatePreviewText();

    toast(
      "Posiciones restauradas"
    );

  }
);


// ======================================================
// COLORES
// ======================================================

function hexToRgb01(hex) {

  const n =
    parseInt(
      String(hex)
        .replace("#", ""),
      16
    );


  return {

    r:
      ((n >> 16) & 255)
      /
      255,

    g:
      ((n >> 8) & 255)
      /
      255,

    b:
      (n & 255)
      /
      255

  };

}


// ======================================================
// POSICIÓN DEL OVERLAY EN PDF
// ======================================================

function getOverlayPdfBox(el) {

  const c =
    canvas.getBoundingClientRect();


  const r =
    el.getBoundingClientRect();


  const sx =
    pdfMeta.pdfWidth /
    c.width;


  const sy =
    pdfMeta.pdfHeight /
    c.height;


  return {

    x:
      (r.left - c.left)
      *
      sx,

    top:
      (r.top - c.top)
      *
      sy,

    width:
      r.width
      *
      sx

  };

}


// ======================================================
// UNIR FRAGMENTOS DE TEXTO
// ======================================================

function mergeLineSegment(
  line,
  text,
  bold
) {

  if (!text) return;


  const last =
    line[
      line.length - 1
    ];


  if (
    last &&
    last.bold === bold
  ) {

    last.text += text;

  } else {

    line.push({

      text,

      bold

    });

  }

}


// ======================================================
// WORD WRAP CON NEGRITAS
// ======================================================

function wrapRichText(
  runs,
  regular,
  bold,
  size,
  maxWidth
) {

  const lines = [];

  let line = [];

  let lineWidth = 0;

  let pendingSpace =
    false;


  const flushLine = () => {

    lines.push(line);

    line = [];

    lineWidth = 0;

    pendingSpace = false;

  };


  for (const run of runs) {

    const font =
      run.bold
        ? bold
        : regular;


    const tokens =
      String(run.text)
        .split(
          /(\n|\s+)/
        )
        .filter(Boolean);


    for (
      const token of tokens
    ) {


      if (
        token.includes("\n")
      ) {

        const parts =
          token.split("\n");


        for (
          let i = 0;
          i < parts.length;
          i++
        ) {


          if (
            parts[i].trim()
          ) {


            const word =
              parts[i].trim();


            const spaceWidth =
              line.length

                ? regular
                    .widthOfTextAtSize(
                      " ",
                      size
                    )

                : 0;


            const wordWidth =
              font
                .widthOfTextAtSize(
                  word,
                  size
                );


            if (
              line.length &&
              lineWidth +
                spaceWidth +
                wordWidth >
                maxWidth
            ) {

              flushLine();

            }


            if (line.length) {

              mergeLineSegment(
                line,
                " ",
                false
              );


              lineWidth +=
                regular
                  .widthOfTextAtSize(
                    " ",
                    size
                  );

            }


            mergeLineSegment(
              line,
              word,
              run.bold
            );


            lineWidth +=
              wordWidth;

          }


          if (
            i <
            parts.length - 1
          ) {

            flushLine();

          }

        }


        pendingSpace =
          false;


        continue;

      }


      if (
        /^\s+$/.test(token)
      ) {

        pendingSpace =
          line.length > 0;


        continue;

      }


      const word =
        token;


      const wordWidth =
        font
          .widthOfTextAtSize(
            word,
            size
          );


      const spaceWidth =
        pendingSpace &&
        line.length

          ? regular
              .widthOfTextAtSize(
                " ",
                size
              )

          : 0;


      if (
        line.length &&
        lineWidth +
          spaceWidth +
          wordWidth >
          maxWidth
      ) {

        flushLine();

      }


      if (
        pendingSpace &&
        line.length
      ) {

        mergeLineSegment(
          line,
          " ",
          false
        );


        lineWidth +=
          regular
            .widthOfTextAtSize(
              " ",
              size
            );

      }


      mergeLineSegment(
        line,
        word,
        run.bold
      );


      lineWidth +=
        wordWidth;


      pendingSpace =
        false;

    }

  }


  if (
    line.length ||
    !lines.length
  ) {

    lines.push(line);

  }


  return lines;
}


// ======================================================
// CARGAR RED HAT DISPLAY
// ======================================================

async function loadRedHatFontBytes() {

  if (
    !redHatFontBytesPromise
  ) {

    redHatFontBytesPromise =
      Promise.all([


        fetch(
          RED_HAT_REGULAR_URL
        ).then(r => {

          if (!r.ok) {

            throw new Error(
              "No se pudo cargar Red Hat Display Regular"
            );

          }


          return r.arrayBuffer();

        }),


        fetch(
          RED_HAT_BOLD_URL
        ).then(r => {

          if (!r.ok) {

            throw new Error(
              "No se pudo cargar Red Hat Display Bold"
            );

          }


          return r.arrayBuffer();

        })


      ]);

  }


  return redHatFontBytesPromise;
}


// ======================================================
// EMBEBER RED HAT DISPLAY EN PDF
// ======================================================

async function embedCertificateFonts(doc) {

  if (
    typeof fontkit ===
    "undefined"
  ) {

    throw new Error(
      "No se cargó fontkit, necesario para usar Red Hat Display en el PDF"
    );

  }


  doc.registerFontkit(
    fontkit
  );


  const [
    regularBytes,
    boldBytes
  ] =
    await loadRedHatFontBytes();


  const regular =
    await doc.embedFont(

      regularBytes,

      {
        subset: true
      }

    );


  const bold =
    await doc.embedFont(

      boldBytes,

      {
        subset: true
      }

    );


  return {
    regular,
    bold
  };
}


// ======================================================
// AJUSTAR TAMAÑO DE NOMBRE
// ======================================================

function fitFontSize(
  font,
  text,
  maxWidth,
  preferred,
  min = 15
) {

  let size =
    preferred;


  while (

    size > min

    &&

    font.widthOfTextAtSize(
      text,
      size
    ) >
      maxWidth

  ) {

    size -= .5;

  }


  return size;
}


// ======================================================
// NOMBRE DE ARCHIVO SEGURO
// ======================================================

function safeFileName(s) {

  return String(
    s ||
    "constancia"
  )

    .normalize("NFD")

    .replace(
      /[\u0300-\u036f]/g,
      ""
    )

    .replace(
      /[\\/:*?"<>|]/g,
      ""
    )

    .replace(
      /\s+/g,
      " "
    )

    .trim();
}


// ======================================================
// DIBUJAR TEXTO EN PDF
// ======================================================

function drawCertificateText(
  page,
  regular,
  bold,
  data
) {

  const nameBox =
    getOverlayPdfBox(
      nameOverlay
    );


  const bodyBox =
    getOverlayPdfBox(
      bodyOverlay
    );


  const nc =
    hexToRgb01(
      $("nameColor").value
    );


  const bc =
    hexToRgb01(
      $("bodyColor").value
    );


  const preferredNameSize =
    Number(
      $("nameSize").value
    );


  const bodySize =
    Number(
      $("bodySize").value
    );


  // ====================================================
  // NOMBRE
  // RED HAT DISPLAY BOLD
  // MAYÚSCULAS
  // ====================================================

  const nameSize =
    fitFontSize(

      bold,

      data.nombre,

      nameBox.width,

      preferredNameSize,

      13

    );


  const nameWidth =
    bold
      .widthOfTextAtSize(
        data.nombre,
        nameSize
      );


  page.drawText(
    data.nombre,
    {

      x:
        nameBox.x +
        Math.max(

          0,

          (
            nameBox.width -
            nameWidth
          ) / 2

        ),

      y:
        pdfMeta.pdfHeight -
        nameBox.top -
        nameSize,

      size:
        nameSize,

      font:
        bold,

      color:
        rgb(
          nc.r,
          nc.g,
          nc.b
        )

    }
  );


  // ====================================================
  // TEXTO INFERIOR
  // RED HAT DISPLAY REGULAR
  // EVENTO EN BOLD
  // ====================================================

  const bodyRuns =
    buildBodyRuns(

      $("bodyTemplate").value,

      data

    );


  const lines =
    wrapRichText(

      bodyRuns,

      regular,

      bold,

      bodySize,

      bodyBox.width

    );


  const lineHeight =
    bodySize * 1.35;


  let y =
    pdfMeta.pdfHeight -
    bodyBox.top -
    bodySize;


  for (
    const line of lines
  ) {

    if (y < 25) break;


    let x =
      bodyBox.x;


    for (
      const segment of line
    ) {

      const font =
        segment.bold
          ? bold
          : regular;


      page.drawText(

        segment.text,

        {

          x,

          y,

          size:
            bodySize,

          font,

          color:
            rgb(
              bc.r,
              bc.g,
              bc.b
            )

        }

      );


      x +=
        font
          .widthOfTextAtSize(
            segment.text,
            bodySize
          );

    }


    y -=
      lineHeight;

  }

}


// ======================================================
// DESCARGAR
// ======================================================

function downloadBlob(
  blob,
  filename
) {

  const url =
    URL.createObjectURL(
      blob
    );


  const a =
    document.createElement(
      "a"
    );


  a.href =
    url;


  a.download =
    filename;


  document.body.appendChild(
    a
  );


  a.click();


  a.remove();


  setTimeout(
    () =>
      URL.revokeObjectURL(
        url
      ),
    1500
  );

}


// ======================================================
// BUSY
// ======================================================

function setBusy(value) {

  busy =
    value;


  updateParticipantUI();


  $("pdfInput").disabled =
    value;


  $("excelInput").disabled =
    value;

}


// ======================================================
// PROGRESO
// ======================================================

function showProgress(
  message,
  percent
) {

  $("progress")
    .classList
    .add("show");


  $("progressMsg").textContent =
    message;


  $("progressBar").style.width =
    `${
      Math.max(
        0,
        Math.min(
          100,
          percent
        )
      )
    }%`;

}


function hideProgressSoon() {

  setTimeout(
    () =>
      $("progress")
        .classList
        .remove("show"),
    1800
  );

}


// ======================================================
// PDF MASIVO
// ======================================================

async function generateCombined() {

  if (
    !participants.length ||
    !templateBytes
  ) return;


  setBusy(true);


  try {

    showProgress(
      "Preparando PDF masivo...",
      2
    );


    const source =
      await PDFDocument.load(
        templateBytes.slice()
      );


    const out =
      await PDFDocument.create();


    // RED HAT DISPLAY
    const {
      regular,
      bold
    } =
      await embedCertificateFonts(
        out
      );


    for (
      let i = 0;
      i < participants.length;
      i++
    ) {

      const [page] =
        await out.copyPages(
          source,
          [0]
        );


      out.addPage(
        page
      );


      drawCertificateText(

        page,

        regular,

        bold,

        rowData(
          participants[i]
        )

      );


      if (
        i % 10 === 0 ||
        i ===
          participants.length - 1
      ) {

        showProgress(

          `Generando ${
            i + 1
          } de ${
            participants.length
          } páginas...`,

          (
            (i + 1)
            /
            participants.length
          ) * 92

        );


        await new Promise(
          r =>
            setTimeout(
              r,
              0
            )
        );

      }

    }


    showProgress(
      "Empaquetando PDF...",
      96
    );


    const bytes =
      await out.save();


    downloadBlob(

      new Blob(
        [bytes],
        {
          type:
            "application/pdf"
        }
      ),

      `constancias_${
        participants.length
      }_participantes.pdf`

    );


    showProgress(
      "¡PDF listo!",
      100
    );


    toast(
      "PDF masivo generado"
    );


  } catch (err) {

    alert(
      "No se pudo generar el PDF: " +
      err.message
    );


  } finally {

    setBusy(false);

    hideProgressSoon();

  }

}


// ======================================================
// PDF INDIVIDUAL
// ======================================================

async function buildSinglePdf(
  data
) {

  const doc =
    await PDFDocument.load(
      templateBytes.slice()
    );


  const page =
    doc.getPages()[0];


  // RED HAT DISPLAY
  const {
    regular,
    bold
  } =
    await embedCertificateFonts(
      doc
    );


  drawCertificateText(

    page,

    regular,

    bold,

    data

  );


  return await doc.save();
}


// ======================================================
// ZIP
// ======================================================

async function generateZip() {

  if (
    !participants.length ||
    !templateBytes
  ) return;


  setBusy(true);


  try {

    const zip =
      new JSZip();


    for (
      let i = 0;
      i < participants.length;
      i++
    ) {

      const data =
        rowData(
          participants[i]
        );


      const bytes =
        await buildSinglePdf(
          data
        );


      zip.file(

        `${String(
          i + 1
        ).padStart(
          4,
          "0"
        )} - ${
          safeFileName(
            data.nombre
          )
        }.pdf`,

        bytes

      );


      showProgress(

        `Creando ${
          i + 1
        } de ${
          participants.length
        } constancias...`,

        (
          (i + 1)
          /
          participants.length
        ) * 86

      );


      if (
        i % 5 === 0
      ) {

        await new Promise(
          r =>
            setTimeout(
              r,
              0
            )
        );

      }

    }


    showProgress(
      "Comprimiendo ZIP...",
      92
    );


    const blob =
      await zip.generateAsync(

        {

          type:
            "blob",

          compression:
            "DEFLATE",

          compressionOptions: {
            level: 5
          }

        },

        meta =>
          showProgress(

            "Comprimiendo ZIP...",

            92 +
            meta.percent *
            .08

          )

      );


    downloadBlob(

      blob,

      `constancias_${
        participants.length
      }_participantes.zip`

    );


    showProgress(
      "¡ZIP listo!",
      100
    );


    toast(
      "ZIP generado"
    );


  } catch (err) {

    alert(
      "No se pudo generar el ZIP: " +
      err.message
    );


  } finally {

    setBusy(false);

    hideProgressSoon();

  }

}


// ======================================================
// BOTONES
// ======================================================

$("generateCombined")
  .addEventListener(
    "click",
    generateCombined
  );


$("generateZip")
  .addEventListener(
    "click",
    generateZip
  );


// ======================================================
// INICIO
// ======================================================

window.addEventListener(
  "load",
  async () => {

    restoreConfigValues();


    await loadPdf(

      b64ToUint8(
        DEFAULT_PDF_BASE64
      ),

      "alumnos constancia.pdf"

    );


    updateParticipantUI();

  }
);