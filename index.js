const express = require('express');
const session = require('express-session');
const bodyParser = require('body-parser');
const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');

const app = express();
app.set('view engine', 'ejs');
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static('public'));
app.use(session({ secret: 'nomina_node_key', resave: false, saveUninitialized: true }));

// -------------------------
// Datos en memoria
// -------------------------
const empleados = [];
const usuarios = {
  admin: { password: "1234", rol: "administrador" },
  empleado: { password: "abcd", rol: "empleado" }
};

// -------------------------
// Función para cálculo ISR / IMSS / Neto
// -------------------------
function calcularNomina(salarioBase) {
  // IMSS como número por defecto (no monetario)
  // Ejemplo: “IMSS-1234567”
  const imss = "IMSS-" + Math.floor(1000000 + Math.random() * 9000000);

  // Cálculo ISR y salario neto
  const isr = salarioBase * 0.16;
  const neto = salarioBase - isr;

  return { isr, imss, neto };
}

// -------------------------
// Login
// -------------------------
app.get('/', (req, res) => {
  res.render('login', { error: null });
});

app.post('/login', (req, res) => {
  const { usuario, password } = req.body;
  if (usuarios[usuario] && usuarios[usuario].password === password) {
    req.session.usuario = usuario;
    req.session.rol = usuarios[usuario].rol;
    return req.session.rol === 'administrador'
      ? res.redirect('/admin')
      : res.redirect('/empleado');
  }
  res.render('login', { error: "Usuario o contraseña incorrectos" });
});

// -------------------------
// Menús
// -------------------------
app.get('/admin', (req, res) => {
  if (req.session.rol !== 'administrador') return res.redirect('/');
  res.render('admin');
});

app.get('/empleado', (req, res) => {
  if (req.session.rol !== 'empleado') return res.redirect('/');
  res.render('empleado');
});

// -------------------------
// Registrar empleado
// -------------------------
app.get('/registro', (req, res) => {
  if (req.session.rol !== 'administrador') return res.redirect('/');
  res.render('registro');
});

app.post('/registro', (req, res) => {
  const { nombre, puesto, salario, departamento } = req.body;
  empleados.push({
    nombre,
    puesto,
    salarioBase: parseFloat(salario),
    departamento
  });
  res.redirect('/reporte');
});

// -------------------------
// Reporte general
// -------------------------
app.get('/reporte', (req, res) => {
  if (!req.session.usuario) return res.redirect('/');
  const reporte = empleados.map(e => {
    const { isr, imss, neto } = calcularNomina(e.salarioBase);
    return { ...e, isr: isr.toFixed(2), imss, neto: neto.toFixed(2) };
  });
  res.render('reporte', { empleados: reporte, rol: req.session.rol });
});

// -------------------------
// Generar PDF
// -------------------------
app.get('/recibo/:nombre', (req, res) => {
  const nombreEmpleado = decodeURIComponent(req.params.nombre).trim().toLowerCase();
  const emp = empleados.find(e => e.nombre.trim().toLowerCase() === nombreEmpleado);
  if (!emp) return res.status(404).send("Empleado no encontrado");

  const { isr, imss, neto } = calcularNomina(emp.salarioBase);
  const doc = new PDFDocument();
  const filePath = path.join(__dirname, 'recibos', `${emp.nombre.replace(/\s+/g, '_')}.pdf`);
  const stream = fs.createWriteStream(filePath);
  doc.pipe(stream);

  doc.fontSize(18).text("Recibo de Nómina", { align: "center" });
  doc.moveDown();
  doc.fontSize(14).text(`Empleado: ${emp.nombre}`);
  doc.text(`Puesto: ${emp.puesto}`);
  doc.text(`Departamento: ${emp.departamento}`);
  doc.text(`Salario Base: $${emp.salarioBase}`);
  doc.text(`ISR: $${isr.toFixed(2)}`);
  doc.text(`IMSS: ${imss}`);
  doc.text(`Salario Neto: $${neto.toFixed(2)}`);
  doc.end();

  stream.on('finish', () => res.download(filePath));
});

// -------------------------
// Buscar empleado
// -------------------------
app.get('/buscar', (req, res) => {
  if (req.session.rol !== 'administrador') return res.redirect('/');
  const query = req.query.nombre ? req.query.nombre.toLowerCase().trim() : '';
  const resultados = empleados.filter(e => e.nombre.toLowerCase().includes(query));
  res.render('buscar', { resultados, query });
});

// -------------------------
// Editar empleado
// -------------------------
app.get('/editar/:nombre', (req, res) => {
  if (req.session.rol !== 'administrador') return res.redirect('/');
  const nombre = decodeURIComponent(req.params.nombre);
  const empleado = empleados.find(e => e.nombre === nombre);
  if (!empleado) return res.send("Empleado no encontrado");
  res.render('editar', { empleado });
});

app.post('/editar/:nombre', (req, res) => {
  const nombre = decodeURIComponent(req.params.nombre);
  const index = empleados.findIndex(e => e.nombre === nombre);
  if (index === -1) return res.send("Empleado no encontrado");

  empleados[index] = {
    nombre: req.body.nombre,
    puesto: req.body.puesto,
    salarioBase: parseFloat(req.body.salario),
    departamento: req.body.departamento
  };
  res.redirect('/reporte');
});

// -------------------------
// Eliminar empleado
// -------------------------
app.get('/eliminar/:nombre', (req, res) => {
  if (req.session.rol !== 'administrador') return res.redirect('/');
  const nombre = decodeURIComponent(req.params.nombre);
  const index = empleados.findIndex(e => e.nombre === nombre);
  if (index === -1) return res.send("Empleado no encontrado");
  empleados.splice(index, 1);
  res.redirect('/reporte');
});

// -------------------------
// Logout
// -------------------------
app.get('/logout', (req, res) => {
  req.session.destroy();
  res.redirect('/');
});

// -------------------------
// Servidor
// -------------------------
if (!fs.existsSync('recibos')) fs.mkdirSync('recibos');
app.listen(4000, () => console.log("Servidor corriendo en http://localhost:4000"));
