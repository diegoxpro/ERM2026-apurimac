// Lee los dos Excel fuente (padrón de mesas y cédulas de sufragio de Apurímac 2026)
// y genera JSON normalizado en data/seed/ para alimentar el seed de la base de datos.
const path = require('path');
const fs = require('fs');
const ExcelJS = require('exceljs');

const RAW_DIR = path.join(__dirname, '..', 'raw');
const SEED_DIR = path.join(__dirname, '..', 'seed');

const CARGO_MAP = {
  'GOBERNADOR Y VICEGOBERNADOR REGIONAL': 'GOBERNADOR_REGIONAL',
};

// El padrón de mesas (ONPE) y la cédula de sufragio (JNE) grafican algunos
// nombres de distrito de forma distinta para la misma entidad. Se normaliza
// el nombre del padrón al usado en la cédula (el que ve el elector).
const ALIAS_DISTRITO = {
  'GRAU|HUAYLLATI': 'HUAILLATI',
  'GRAU|GAMARRA': 'MARISCAL GAMARRA',
};

function normalizarDistrito(provincia, distrito) {
  return ALIAS_DISTRITO[`${provincia}|${distrito}`] ?? distrito;
}

function inferCargo(columnaTexto, provincia) {
  const t = columnaTexto.trim().toUpperCase();
  if (t === 'GOBERNADOR Y VICEGOBERNADOR REGIONAL') return 'GOBERNADOR_REGIONAL';
  if (t.startsWith('CONSEJERO REGIONAL')) return 'CONSEJERO_REGIONAL';
  if (t.startsWith('PROVINCIA DE')) return 'ALCALDE_PROVINCIAL';
  if (t.startsWith('DISTRITO DE')) return 'ALCALDE_DISTRITAL';
  throw new Error(`No se pudo inferir el cargo desde la columna: "${columnaTexto}"`);
}

function cellStr(cell) {
  if (cell === null || cell === undefined) return null;
  if (typeof cell === 'object' && cell.text) return String(cell.text).trim();
  if (typeof cell === 'object' && cell.result !== undefined) return String(cell.result).trim();
  return String(cell).trim();
}

async function parseMesas() {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(path.join(RAW_DIR, 'electores_2026_apurimac.xlsx'));
  const ws = wb.worksheets[0];
  const header = ws.getRow(1).values; // 1-indexed, [0] empty
  const mesas = [];
  ws.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    const v = row.values; // 1-indexed
    const provincia = cellStr(v[4]);
    mesas.push({
      odpe: cellStr(v[1]),
      ubigeo: cellStr(v[2]),
      departamento: cellStr(v[3]),
      provincia,
      distrito: normalizarDistrito(provincia, cellStr(v[5])),
      localidadesConMsi: cellStr(v[6]),
      codigoLV: cellStr(v[7]),
      nombreLV: cellStr(v[8]),
      direccionLV: cellStr(v[9]),
      ordenCA: cellStr(v[10]),
      numeroCA: cellStr(v[11]),
      ordenMesa: cellStr(v[12]),
      mesa: cellStr(v[13]),
      aula: cellStr(v[14]),
      piso: cellStr(v[15]),
      pabellon: cellStr(v[16]),
      electores: parseInt(cellStr(v[17]), 10) || 0,
      electoresDiscapacidad: parseInt(cellStr(v[18]), 10) || 0,
    });
  });
  return mesas;
}

async function parseCedulas() {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(path.join(RAW_DIR, 'cedulas_sufragio_apurimac_2026.xlsx'));

  const wsCedulas = wb.getWorksheet('Cedulas');
  const rows = [];
  wsCedulas.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    const v = row.values;
    rows.push({
      departamento: cellStr(v[1]),
      provincia: cellStr(v[2]),
      distrito: cellStr(v[3]),
      capitalDeProvincia: cellStr(v[4]) === 'SÍ',
      nColumna: parseInt(cellStr(v[5]), 10),
      columna: cellStr(v[6]),
      orden: parseInt(cellStr(v[7]), 10),
      partido: cellStr(v[8]),
      simboloUrl: cellStr(v[9]),
      expediente: cellStr(v[10]),
      jee: cellStr(v[11]),
    });
  });

  // Normalizar en "listas de candidatura" únicas por alcance (evita duplicar
  // la misma lista regional/provincial una vez por cada distrito repetido).
  const listasMap = new Map();
  const distritosSet = new Map(); // key distrito -> {provincia, distrito, capitalDeProvincia}

  for (const r of rows) {
    const cargo = inferCargo(r.columna, r.provincia);
    let scopeKey;
    let scope;
    if (cargo === 'GOBERNADOR_REGIONAL') {
      scopeKey = 'REGION';
      scope = { nivel: 'REGION' };
    } else if (cargo === 'CONSEJERO_REGIONAL' || cargo === 'ALCALDE_PROVINCIAL') {
      scopeKey = `PROVINCIA:${r.provincia}`;
      scope = { nivel: 'PROVINCIA', provincia: r.provincia };
    } else {
      scopeKey = `DISTRITO:${r.provincia}:${r.distrito}`;
      scope = { nivel: 'DISTRITO', provincia: r.provincia, distrito: r.distrito };
    }

    const listaKey = `${cargo}|${scopeKey}|${r.partido}|${r.expediente}`;
    if (!listasMap.has(listaKey)) {
      listasMap.set(listaKey, {
        cargo,
        ...scope,
        organizacion: r.partido,
        orden: r.orden,
        simboloUrl: r.simboloUrl,
        expediente: r.expediente,
        jee: r.jee,
      });
    }

    const distKey = `${r.provincia}:${r.distrito}`;
    if (!distritosSet.has(distKey)) {
      distritosSet.set(distKey, {
        provincia: r.provincia,
        distrito: r.distrito,
        capitalDeProvincia: r.capitalDeProvincia,
      });
    }
  }

  const wsPartidos = wb.getWorksheet('Partidos');
  const organizaciones = [];
  wsPartidos.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    const v = row.values;
    organizaciones.push({
      nombre: cellStr(v[1]),
      simboloUrl: cellStr(v[2]),
      listasRegionales: parseInt(cellStr(v[3]), 10) || 0,
      listasProvinciales: parseInt(cellStr(v[4]), 10) || 0,
      listasDistritales: parseInt(cellStr(v[5]), 10) || 0,
    });
  });

  return {
    listas: [...listasMap.values()],
    distritos: [...distritosSet.values()],
    organizaciones,
  };
}

async function main() {
  fs.mkdirSync(SEED_DIR, { recursive: true });

  const mesas = await parseMesas();
  const { listas, distritos, organizaciones } = await parseCedulas();

  fs.writeFileSync(path.join(SEED_DIR, 'mesas.json'), JSON.stringify(mesas, null, 2));
  fs.writeFileSync(path.join(SEED_DIR, 'listas-candidatura.json'), JSON.stringify(listas, null, 2));
  fs.writeFileSync(path.join(SEED_DIR, 'distritos.json'), JSON.stringify(distritos, null, 2));
  fs.writeFileSync(path.join(SEED_DIR, 'organizaciones.json'), JSON.stringify(organizaciones, null, 2));

  console.log('--- Resumen de importación ---');
  console.log('Mesas de sufragio:', mesas.length);
  console.log('Distritos:', distritos.length);
  console.log('Organizaciones políticas:', organizaciones.length);
  console.log('Listas de candidatura (normalizadas):', listas.length);
  const porCargo = {};
  for (const l of listas) porCargo[l.cargo] = (porCargo[l.cargo] || 0) + 1;
  console.log('Por cargo:', porCargo);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
