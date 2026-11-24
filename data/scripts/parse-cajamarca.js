// Convierte el padrón de mesas de ONPE (MAESTRO_MESAS) de Cajamarca al formato
// de data/seed/cajamarca, más las 2 listas de la segunda vuelta regional.
// Uso: node parse-cajamarca.js "C:/ruta/MAESTRO_MESAS.V.xlsx"
const ExcelJS = require('exceljs');
const fs = require('fs');
const path = require('path');

const ENTRADA = process.argv[2];
if (!ENTRADA) throw new Error('Indica la ruta del Excel del padrón');
const OUT = path.join(__dirname, '..', 'seed', 'cajamarca');

const texto = (v) => {
  if (v === null || v === undefined) return '';
  if (typeof v === 'object' && 'result' in v) v = v.result;
  if (typeof v === 'object' && 'richText' in v) v = v.richText.map((t) => t.text).join('');
  return String(v).trim();
};

(async () => {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(ENTRADA);
  const ws = wb.worksheets[0];

  const mesas = [];
  const distritos = new Map();
  ws.eachRow((row, n) => {
    if (n === 1) return;
    const v = row.values.slice(1).map(texto);
    const [, ubigeo, departamento, provincia, distrito, , codigoLV, nombreLV, direccionLV, , , , mesa, aula, piso, pabellon, electores, discapacidad] = v;
    if (!mesa) return;
    if (departamento !== 'CAJAMARCA') throw new Error(`Fila ${n}: departamento inesperado "${departamento}"`);
    // En el ubigeo, el distrito "01" de cada provincia es su capital.
    distritos.set(`${provincia}:${distrito}`, { provincia, distrito, capitalDeProvincia: ubigeo.endsWith('01') });
    mesas.push({
      provincia,
      distrito,
      codigoLV,
      nombreLV,
      direccionLV,
      mesa: mesa.padStart(6, '0'),
      aula,
      piso,
      pabellon,
      electores: parseInt(electores, 10) || 0,
      electoresDiscapacidad: parseInt(discapacidad, 10) || 0,
    });
  });

  const codigos = new Set(mesas.map((m) => m.mesa));
  if (codigos.size !== mesas.length) throw new Error(`Hay ${mesas.length - codigos.size} códigos de mesa duplicados`);
  const localDistrito = new Map();
  for (const m of mesas) {
    const prev = localDistrito.get(m.codigoLV);
    if (prev && prev !== `${m.provincia}:${m.distrito}`) throw new Error(`Local ${m.codigoLV} aparece en dos distritos`);
    localDistrito.set(m.codigoLV, `${m.provincia}:${m.distrito}`);
  }

  const organizaciones = [
    { nombre: 'PARTIDO DEMOCRATICO SOMOS PERU', simboloUrl: '/simbolos/somos-peru.svg' },
    { nombre: 'ALIANZA PARA EL PROGRESO', simboloUrl: '/simbolos/alianza-para-el-progreso.png' },
  ];
  // Segunda vuelta regional de Cajamarca (6 dic 2026): Somos Perú (Edison Carrasco)
  // vs Alianza para el Progreso (Moises Gonzalez). Orden provisional según el
  // resultado de primera vuelta; ajustar si la cédula de ONPE los ordena distinto.
  const listas = organizaciones.map((o, i) => ({
    cargo: 'GOBERNADOR_REGIONAL',
    nivel: 'REGION',
    organizacion: o.nombre,
    orden: i + 1,
    simboloUrl: o.simboloUrl,
    expediente: '',
    jee: 'CAJAMARCA',
  }));

  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(path.join(OUT, 'distritos.json'), JSON.stringify([...distritos.values()], null, 2));
  fs.writeFileSync(path.join(OUT, 'mesas.json'), JSON.stringify(mesas, null, 2));
  fs.writeFileSync(path.join(OUT, 'organizaciones.json'), JSON.stringify(organizaciones, null, 2));
  fs.writeFileSync(path.join(OUT, 'listas-candidatura.json'), JSON.stringify(listas, null, 2));

  const provincias = new Set([...distritos.values()].map((d) => d.provincia));
  const electores = mesas.reduce((a, m) => a + m.electores, 0);
  console.log(`${provincias.size} provincias, ${distritos.size} distritos, ${localDistrito.size} locales, ${mesas.length} mesas, ${electores} electores`);
  console.log('capitales:', [...distritos.values()].filter((d) => d.capitalDeProvincia).map((d) => d.distrito).join(', '));
})();
