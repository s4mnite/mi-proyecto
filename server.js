// ─────────────────────────────────────────────────────────────────────────────
//  INVENTARIO PRO — Servidor Backend + Frontend Unificado
//  Mandarin · 2026
//
//  Instalación (solo la primera vez):
//    npm install express cors nodemailer multer
//
//  Para iniciar TODO el sistema (backend + frontend):
//    npm start        ← recomendado
//    node server.js   ← alternativa directa
//
//  El sistema corre en: http://localhost:3001
//  Los usuarios se guardan en: users.json (mismo directorio)
//  Las imágenes se guardan en: uploads/ (mismo directorio)
//
//  ─── MERCADO PAGO OAuth ──────────────────────────────────────────────────────
//  Para activar "Iniciar sesión con MercadoPago", configura estas 3 variables:
//
//    MP_CLIENT_ID     → Ve a https://www.mercadopago.cl/developers/panel
//                       Crea una aplicación → copia el "Client ID"
//
//    MP_CLIENT_SECRET → En la misma pantalla, copia el "Client Secret"
//
//    MP_REDIRECT_URI  → La URL de callback que registraste en MercadoPago.
//                       Ejemplo local:  http://localhost:3001/api/auth/mp/callback
//                       Ejemplo prod:   https://tudominio.com/api/auth/mp/callback
//                       IMPORTANTE: esta URL debe estar exactamente igual en tu
//                       panel de MercadoPago en "URLs de redirección".
//
//  Puedes poner estos valores directamente aquí abajo o en un archivo .env
//  con las variables MP_CLIENT_ID, MP_CLIENT_SECRET, MP_REDIRECT_URI.
// ─────────────────────────────────────────────────────────────────────────────

const express    = require("express");
const cors       = require("cors");
const nodemailer = require("nodemailer");
const fs         = require("fs");
const path       = require("path");
const multer     = require("multer");

// ── Cargar .env si existe ─────────────────────────────────────────────────────
try { require("dotenv").config(); } catch (e) { /* dotenv opcional */ }

const app  = express();
const PORT = process.env.PORT || 3001;
const USERS_FILE   = path.join(__dirname, "users.json");
const UPLOADS_DIR  = path.join(__dirname, "uploads");
const BUILD_DIR    = path.join(__dirname, "build");

// ─────────────────────────────────────────────────────────────────────────────
//  CONFIGURACIÓN MERCADO PAGO
//  ↓↓↓ COLOCA TUS CREDENCIALES AQUÍ ↓↓↓
// ─────────────────────────────────────────────────────────────────────────────
const MP_CLIENT_ID     = process.env.MP_CLIENT_ID     || "TU_CLIENT_ID_AQUI";
const MP_CLIENT_SECRET = process.env.MP_CLIENT_SECRET || "TU_CLIENT_SECRET_AQUI";
const MP_REDIRECT_URI  = process.env.MP_REDIRECT_URI  || "http://localhost:3001/api/auth/mp/callback";
// ─────────────────────────────────────────────────────────────────────────────

// ── Crear directorio de uploads si no existe ──────────────────────────────────
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
  console.log("✓ Directorio uploads/ creado.");
}

// ── Multer — configuración de subida de imágenes ──────────────────────────────
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOADS_DIR),
  filename: (req, file, cb) => {
    const ext  = path.extname(file.originalname).toLowerCase();
    const name = `prod_${Date.now()}_${Math.random().toString(36).slice(2, 7)}${ext}`;
    cb(null, name);
  },
});

const fileFilter = (req, file, cb) => {
  const allowed = [".jpg", ".jpeg", ".png", ".gif", ".webp", ".svg"];
  const ext = path.extname(file.originalname).toLowerCase();
  if (allowed.includes(ext)) {
    cb(null, true);
  } else {
    cb(new Error("Formato de imagen no permitido. Use JPG, PNG, GIF, WEBP o SVG."), false);
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB máximo
});

// ── Middleware ─────────────────────────────────────────────────────────────────
app.use(cors({ origin: "*" }));
app.use(express.json());

// ── Servir imágenes subidas ────────────────────────────────────────────────────
app.use("/uploads", express.static(UPLOADS_DIR));

// ── Nodemailer (Gmail Mandarin) ────────────────────────────────────────────────
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: "mandarin.soporte@gmail.com",
    pass: "lmss sgmi dtuk jdwy",
  },
});

// ── Usuarios (archivo JSON local) ─────────────────────────────────────────────
function leerUsuarios() {
  if (!fs.existsSync(USERS_FILE)) {
    const defaultUsers = [
      {
        nombre: "Administrador",
        usuario: "admin",
        correo: "mandarin.soporte@gmail.com",
        clave: "admin1234",
        rol: "gerente",
        createdAt: new Date().toLocaleDateString("es-CL"),
        createdAtISO: new Date().toISOString(),
        lastAccess: "—",
        blocked: false,
        subscription: "enterprise",
        emailVerified: true,
      },
    ];
    fs.writeFileSync(USERS_FILE, JSON.stringify(defaultUsers, null, 2), "utf8");
    console.log("✓ Archivo users.json creado con usuario administrador.");
    return defaultUsers;
  }
  try {
    return JSON.parse(fs.readFileSync(USERS_FILE, "utf8"));
  } catch (e) {
    console.error("Error leyendo users.json:", e.message);
    return [];
  }
}

function guardarUsuarios(users) {
  fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2), "utf8");
}

// ── Códigos de verificación (memoria — expiran en 10 minutos) ──────────────────
const codigosVerif = new Map();

// ── Códigos de RECUPERACIÓN de contraseña (separados de los de registro) ───────
const codigosRecuperacion = new Map();

function generarCodigo() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

async function enviarCodigo(correoDestino, codigo, nombreUsuario) {
  await transporter.sendMail({
    from: '"Mandarin" <mandarin.soporte@gmail.com>',
    to: correoDestino,
    subject: "Código de verificación — Inventario Pro",
    html: `
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:auto;padding:30px;color:#222;">
      <h2 style="margin-bottom:20px;">Código de verificación del correo electrónico</h2>
      <p style="font-size:15px;line-height:1.7;">
        Hola <strong>${nombreUsuario}</strong>, introduce este código en la pantalla de verificación:
      </p>
      <div style="font-size:42px;font-weight:bold;letter-spacing:8px;margin:30px 0;color:#ff8c42;">
        ${codigo}
      </div>
      <p style="font-size:15px;line-height:1.7;">Este código caduca en <strong>10 minutos</strong>.</p>
      <p style="font-size:15px;line-height:1.7;margin-top:20px;">
        Si no intentaste registrarte en Inventario Pro, ignora este correo.
      </p>
      <hr style="margin:30px 0;border:none;border-top:1px solid #ddd;">
      <p style="font-size:12px;color:#777;">Este correo fue enviado por Mandarin · Inventario Pro</p>
      <p style="font-size:12px;color:#777;">© 2026 Mandarin · Todos los derechos reservados.</p>
    </div>
    `,
  });
}

// ── Middleware: solo gerentes ──────────────────────────────────────────────────
function soloGerente(req, res, next) {
  const adminUser  = req.headers["x-admin-user"];
  const adminClave = req.headers["x-admin-clave"];
  if (!adminUser || !adminClave) {
    return res.status(403).json({ error: "Credenciales de administrador requeridas." });
  }
  const users = leerUsuarios();
  const user  = users.find(u => u.usuario === adminUser && u.clave === adminClave && u.rol === "gerente");
  if (!user) {
    return res.status(403).json({ error: "Acceso denegado. Solo gerentes." });
  }
  req.adminUser = user;
  next();
}

// ─────────────────────────────────────────────────────────────────────────────
//  RUTAS DE AUTENTICACIÓN (existentes — NO modificadas)
// ─────────────────────────────────────────────────────────────────────────────

app.get("/api/ping", (req, res) => {
  res.json({ ok: true, version: "2.4.0", ts: new Date().toISOString() });
});

app.post("/api/auth/send-code", async (req, res) => {
  const { correo, nombre } = req.body;
  if (!correo || !nombre) {
    return res.status(400).json({ error: "Correo y nombre son requeridos." });
  }

  const users = leerUsuarios();
  if (users.find(u => u.correo === correo)) {
    return res.status(400).json({ error: "Ese correo ya está registrado." });
  }

  const codigo = generarCodigo();
  const expira = Date.now() + 10 * 60 * 1000;
  codigosVerif.set(correo, { codigo, expira, nombre });

  try {
    await enviarCodigo(correo, codigo, nombre);
    console.log(`[${new Date().toLocaleString("es-CL")}] Código enviado a: ${correo}`);
    res.json({ ok: true, mensaje: `Código enviado a ${correo}` });
  } catch (err) {
    console.error("Error enviando correo:", err.message);
    codigosVerif.delete(correo);
    res.status(500).json({ error: "No se pudo enviar el correo. Verifica la dirección e intenta nuevamente." });
  }
});

app.post("/api/auth/verify-code", (req, res) => {
  const { correo, codigo } = req.body;
  const data = codigosVerif.get(correo);

  if (!data) {
    return res.status(400).json({ error: "No hay código pendiente para ese correo." });
  }
  if (Date.now() > data.expira) {
    codigosVerif.delete(correo);
    return res.status(400).json({ error: "El código expiró. Solicita uno nuevo." });
  }
  if (data.codigo !== String(codigo).trim()) {
    return res.status(400).json({ error: "Código incorrecto." });
  }

  res.json({ ok: true, mensaje: "Código verificado correctamente." });
});

app.post("/api/auth/register", (req, res) => {
  const { nombre, usuario, correo, clave, codigo } = req.body;

  if (!nombre || !usuario || !correo || !clave) {
    return res.status(400).json({ error: "Completa todos los campos." });
  }
  if (clave.length < 4) {
    return res.status(400).json({ error: "La contraseña debe tener al menos 4 caracteres." });
  }

  const verif = codigosVerif.get(correo);
  if (!verif || String(codigo).trim() !== verif.codigo || Date.now() > verif.expira) {
    return res.status(400).json({ error: "Código inválido o expirado. Inicia el registro nuevamente." });
  }

  const users = leerUsuarios();
  if (users.find(u => u.usuario === usuario)) {
    return res.status(400).json({ error: "Ese nombre de usuario ya existe." });
  }
  if (users.find(u => u.correo === correo)) {
    return res.status(400).json({ error: "Ese correo ya está registrado." });
  }

  const ahora = new Date();
  const newUser = {
    nombre, usuario, correo, clave,
    rol: "empleado",
    createdAt: ahora.toLocaleDateString("es-CL"),
    createdAtISO: ahora.toISOString(),
    lastAccess: "—",
    blocked: false,
    subscription: "free",
    emailVerified: true,
  };

  users.push(newUser);
  guardarUsuarios(users);
  codigosVerif.delete(correo);

  console.log(`[${ahora.toLocaleString("es-CL")}] Nuevo usuario registrado: ${usuario} (${correo})`);
  res.json({ ok: true, mensaje: "Cuenta creada exitosamente." });
});

app.post("/api/auth/login", (req, res) => {
  const { usuario, clave } = req.body;
  const users = leerUsuarios();
  const user  = users.find(u => u.usuario === usuario && u.clave === clave);

  if (!user) {
    return res.status(401).json({ error: "Usuario o contraseña incorrectos." });
  }
  if (user.blocked) {
    return res.status(403).json({ error: "Tu cuenta ha sido bloqueada. Contacta al administrador." });
  }

  const ahora     = new Date();
  const lastAccess = ahora.toLocaleString("es-CL");
  const updated   = users.map(u =>
    u.usuario === usuario ? { ...u, lastAccess } : u
  );
  guardarUsuarios(updated);

  const { clave: _, ...userSinClave } = user;
  console.log(`[${lastAccess}] Login: ${usuario} (${user.rol})`);
  res.json({ ok: true, user: { ...userSinClave, lastAccess } });
});

// ─────────────────────────────────────────────────────────────────────────────
//  FUNCIÓN 1: RECUPERACIÓN DE CONTRASEÑA
//  Rutas nuevas — no afectan las rutas existentes
// ─────────────────────────────────────────────────────────────────────────────

// POST /api/auth/forgot-password
// Recibe: { correo }
// Busca el usuario, genera un código y lo envía por email usando el transporter existente.
app.post("/api/auth/forgot-password", async (req, res) => {
  const { correo } = req.body;

  if (!correo) {
    return res.status(400).json({ error: "El correo es requerido." });
  }

  const users = leerUsuarios();
  const user  = users.find(u => u.correo === correo);

  // Por seguridad, siempre respondemos "ok" aunque no exista el correo.
  // Así no revelamos qué correos están registrados.
  if (!user) {
    console.log(`[${new Date().toLocaleString("es-CL")}] Recuperación solicitada para correo no registrado: ${correo}`);
    return res.json({ ok: true, mensaje: "Si ese correo está registrado, recibirás un código." });
  }

  const codigo = generarCodigo();
  const expira = Date.now() + 10 * 60 * 1000; // 10 minutos
  codigosRecuperacion.set(correo, { codigo, expira, intentos: 0 });

  try {
    await transporter.sendMail({
      from: '"Mandarin" <mandarin.soporte@gmail.com>',
      to: correo,
      subject: "Recupera tu contraseña — Inventario Pro",
      html: `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:auto;padding:30px;color:#222;">
        <h2 style="margin-bottom:20px;">Recuperación de contraseña</h2>
        <p style="font-size:15px;line-height:1.7;">
          Hola <strong>${user.nombre}</strong>, recibimos una solicitud para restablecer la contraseña de tu cuenta.
        </p>
        <p style="font-size:15px;line-height:1.7;">Ingresa este código en la pantalla de recuperación:</p>
        <div style="font-size:42px;font-weight:bold;letter-spacing:8px;margin:30px 0;color:#3b5bdb;">
          ${codigo}
        </div>
        <p style="font-size:15px;line-height:1.7;">Este código caduca en <strong>10 minutos</strong>.</p>
        <p style="font-size:15px;line-height:1.7;color:#e03131;margin-top:16px;">
          Si no solicitaste este cambio, ignora este correo. Tu contraseña no será modificada.
        </p>
        <hr style="margin:30px 0;border:none;border-top:1px solid #ddd;">
        <p style="font-size:12px;color:#777;">Mandarin · Inventario Pro</p>
        <p style="font-size:12px;color:#777;">© 2026 Mandarin · Todos los derechos reservados.</p>
      </div>
      `,
    });

    console.log(`[${new Date().toLocaleString("es-CL")}] Código de recuperación enviado a: ${correo}`);
    res.json({ ok: true, mensaje: "Si ese correo está registrado, recibirás un código." });
  } catch (err) {
    console.error("Error enviando correo de recuperación:", err.message);
    codigosRecuperacion.delete(correo);
    res.status(500).json({ error: "No se pudo enviar el correo. Intenta nuevamente." });
  }
});

// POST /api/auth/verify-recovery-code
// Recibe: { correo, codigo }
// Valida el código sin aún cambiar la contraseña.
app.post("/api/auth/verify-recovery-code", (req, res) => {
  const { correo, codigo } = req.body;

  if (!correo || !codigo) {
    return res.status(400).json({ error: "Correo y código son requeridos." });
  }

  const data = codigosRecuperacion.get(correo);

  if (!data) {
    return res.status(400).json({ error: "No hay código de recuperación pendiente para ese correo." });
  }
  if (Date.now() > data.expira) {
    codigosRecuperacion.delete(correo);
    return res.status(400).json({ error: "El código expiró. Solicita uno nuevo." });
  }
  if (data.intentos >= 5) {
    codigosRecuperacion.delete(correo);
    return res.status(400).json({ error: "Demasiados intentos. Solicita un nuevo código." });
  }
  if (data.codigo !== String(codigo).trim()) {
    data.intentos += 1;
    codigosRecuperacion.set(correo, data);
    return res.status(400).json({
      error: `Código incorrecto. ${5 - data.intentos} intentos restantes.`,
    });
  }

  // Código correcto: marcamos como verificado para el siguiente paso
  data.verificado = true;
  codigosRecuperacion.set(correo, data);

  res.json({ ok: true, mensaje: "Código verificado. Ahora puedes cambiar tu contraseña." });
});

// POST /api/auth/reset-password
// Recibe: { correo, nuevaClave }
// Solo funciona si el código fue verificado previamente.
app.post("/api/auth/reset-password", (req, res) => {
  const { correo, nuevaClave } = req.body;

  if (!correo || !nuevaClave) {
    return res.status(400).json({ error: "Correo y nueva contraseña son requeridos." });
  }
  if (nuevaClave.length < 4) {
    return res.status(400).json({ error: "La contraseña debe tener al menos 4 caracteres." });
  }

  const data = codigosRecuperacion.get(correo);

  if (!data || !data.verificado) {
    return res.status(400).json({ error: "Debes verificar el código primero." });
  }
  if (Date.now() > data.expira) {
    codigosRecuperacion.delete(correo);
    return res.status(400).json({ error: "La sesión de recuperación expiró. Inicia el proceso nuevamente." });
  }

  const users = leerUsuarios();
  const idx   = users.findIndex(u => u.correo === correo);

  if (idx === -1) {
    return res.status(404).json({ error: "Usuario no encontrado." });
  }

  users[idx].clave = nuevaClave;
  guardarUsuarios(users);
  codigosRecuperacion.delete(correo);

  console.log(`[${new Date().toLocaleString("es-CL")}] Contraseña restablecida para: ${users[idx].usuario} (${correo})`);
  res.json({ ok: true, mensaje: "Contraseña actualizada exitosamente." });
});

// ─────────────────────────────────────────────────────────────────────────────
//  FUNCIÓN 2: LOGIN CON MERCADO PAGO (OAuth 2.0)
//
//  Flujo completo:
//  1. Frontend llama GET /api/auth/mp/url  → obtiene la URL de autorización
//  2. Usuario es redirigido a MercadoPago y aprueba
//  3. MP redirige a /api/auth/mp/callback?code=XXXX
//  4. Backend intercambia el code por un access_token
//  5. Backend obtiene los datos del usuario desde la API de MP
//  6. Si ya existe en users.json → login automático
//  7. Si no existe → crea cuenta nueva automáticamente
//  8. Backend redirige al frontend con los datos del usuario en query params
//
//  DÓNDE COLOCAR LAS CREDENCIALES:
//  ─ Opción A (recomendada): archivo .env en la raíz del proyecto
//      MP_CLIENT_ID=123456789
//      MP_CLIENT_SECRET=tu_client_secret_aqui
//      MP_REDIRECT_URI=http://localhost:3001/api/auth/mp/callback
//  ─ Opción B: directamente en las constantes al inicio de este archivo
//      const MP_CLIENT_ID     = "123456789";
//      const MP_CLIENT_SECRET = "tu_client_secret_aqui";
//      const MP_REDIRECT_URI  = "http://localhost:3001/api/auth/mp/callback";
// ─────────────────────────────────────────────────────────────────────────────

// GET /api/auth/mp/url
// El frontend llama esto para obtener la URL de autorización de MercadoPago.
// Responde con: { url: "https://auth.mercadopago.cl/authorization?..." }
app.get("/api/auth/mp/url", (req, res) => {
  if (MP_CLIENT_ID === "TU_CLIENT_ID_AQUI") {
    return res.status(503).json({
      error: "MercadoPago no está configurado. Agrega MP_CLIENT_ID, MP_CLIENT_SECRET y MP_REDIRECT_URI.",
    });
  }

  const state = Math.random().toString(36).slice(2); // Estado para prevenir CSRF
  const url   = `https://auth.mercadopago.cl/authorization?client_id=${MP_CLIENT_ID}&response_type=code&platform_id=mp&redirect_uri=${encodeURIComponent(MP_REDIRECT_URI)}&state=${state}`;

  res.json({ ok: true, url, state });
});

// GET /api/auth/mp/callback
// MercadoPago redirige aquí después de que el usuario autoriza.
// Recibe: ?code=XXXX&state=YYYY
// Intercambia el code por access_token, obtiene datos del usuario y hace login/registro.
app.get("/api/auth/mp/callback", async (req, res) => {
  const { code, error: mpError } = req.query;

  if (mpError) {
    // El usuario canceló o hubo un error en MP
    return res.redirect(`/?mp_error=${encodeURIComponent("Autenticación cancelada.")}`);
  }

  if (!code) {
    return res.redirect("/?mp_error=No+se+recibió+código+de+autorización");
  }

  try {
    // Paso 1: Intercambiar el code por access_token
    const tokenRes = await fetch("https://api.mercadopago.com/oauth/token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        client_id:     MP_CLIENT_ID,
        client_secret: MP_CLIENT_SECRET,
        grant_type:    "authorization_code",
        code,
        redirect_uri:  MP_REDIRECT_URI,
      }),
    });

    const tokenData = await tokenRes.json();

    if (!tokenRes.ok || !tokenData.access_token) {
      console.error("Error obteniendo token MP:", tokenData);
      return res.redirect("/?mp_error=Error+obteniendo+token+de+MercadoPago");
    }

    const { access_token, user_id } = tokenData;

    // Paso 2: Obtener datos del usuario desde la API de MP
    const userRes = await fetch(`https://api.mercadopago.com/users/${user_id}`, {
      headers: { Authorization: `Bearer ${access_token}` },
    });

    const mpUser = await userRes.json();

    if (!userRes.ok || !mpUser.id) {
      console.error("Error obteniendo datos de usuario MP:", mpUser);
      return res.redirect("/?mp_error=Error+obteniendo+datos+del+usuario");
    }

    const mpEmail    = mpUser.email      || "";
    const mpNombre   = mpUser.first_name ? `${mpUser.first_name} ${mpUser.last_name || ""}`.trim() : (mpEmail.split("@")[0]);
    const mpUsuario  = `mp_${mpUser.id}`; // Usuario único basado en ID de MP
    const mpId       = String(mpUser.id);

    const users = leerUsuarios();

    // Paso 3: Buscar si el usuario ya existe (por mp_id o por correo)
    let existingUser = users.find(u => u.mp_id === mpId);
    if (!existingUser && mpEmail) {
      existingUser = users.find(u => u.correo === mpEmail);
    }

    let finalUser;

    if (existingUser) {
      // Usuario ya existe → login automático, actualizar token de MP
      const idx = users.findIndex(u => u.usuario === existingUser.usuario);
      users[idx].mp_id           = mpId;
      users[idx].mp_access_token = access_token;
      users[idx].lastAccess      = new Date().toLocaleString("es-CL");
      guardarUsuarios(users);
      finalUser = users[idx];
      console.log(`[${new Date().toLocaleString("es-CL")}] Login MP: ${finalUser.usuario} (${mpEmail})`);
    } else {
      // Usuario no existe → crear cuenta automáticamente
      const ahora = new Date();
      finalUser = {
        nombre:           mpNombre,
        usuario:          mpUsuario,
        correo:           mpEmail,
        clave:            Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2), // Clave aleatoria (no se usa para login con MP)
        rol:              "empleado",
        createdAt:        ahora.toLocaleDateString("es-CL"),
        createdAtISO:     ahora.toISOString(),
        lastAccess:       ahora.toLocaleString("es-CL"),
        blocked:          false,
        subscription:     "free",
        emailVerified:    true,
        mp_id:            mpId,
        mp_access_token:  access_token,
        auth_provider:    "mercadopago",
      };
      users.push(finalUser);
      guardarUsuarios(users);
      console.log(`[${ahora.toLocaleString("es-CL")}] Nuevo usuario via MP: ${mpUsuario} (${mpEmail})`);
    }

    // Paso 4: Redirigir al frontend con los datos del usuario (sin clave)
    const { clave: _, mp_access_token: __, ...userSinDatosSensibles } = finalUser;
    const userParam = encodeURIComponent(JSON.stringify(userSinDatosSensibles));
    res.redirect(`/?mp_login=1&user=${userParam}`);

  } catch (err) {
    console.error("Error en callback MP:", err.message);
    res.redirect("/?mp_error=Error+interno+de+autenticación");
  }
});

// ─────────────────────────────────────────────────────────────────────────────
//  RUTAS DE ADMINISTRACIÓN DE USUARIOS (existentes — NO modificadas)
// ─────────────────────────────────────────────────────────────────────────────

app.get("/api/users", soloGerente, (req, res) => {
  const users     = leerUsuarios();
  const sinClaves = users.map(({ clave, mp_access_token, ...rest }) => rest);
  res.json(sinClaves);
});

app.post("/api/users", soloGerente, (req, res) => {
  const { nombre, usuario, correo, clave, rol } = req.body;
  if (!nombre || !usuario || !clave) {
    return res.status(400).json({ error: "Nombre, usuario y contraseña son obligatorios." });
  }
  const users = leerUsuarios();
  if (users.find(u => u.usuario === usuario)) {
    return res.status(400).json({ error: "Ese usuario ya existe." });
  }

  const ahora = new Date();
  const newUser = {
    nombre, usuario,
    correo: correo || "",
    clave,
    rol: rol || "empleado",
    createdAt: ahora.toLocaleDateString("es-CL"),
    createdAtISO: ahora.toISOString(),
    lastAccess: "—",
    blocked: false,
    subscription: "free",
    emailVerified: true,
  };
  users.push(newUser);
  guardarUsuarios(users);

  const { clave: _, ...sinClave } = newUser;
  console.log(`[${ahora.toLocaleString("es-CL")}] Admin creó usuario: ${usuario}`);
  res.json({ ok: true, user: sinClave });
});

app.put("/api/users/:username", soloGerente, (req, res) => {
  const users = leerUsuarios();
  const idx   = users.findIndex(u => u.usuario === req.params.username);
  if (idx === -1) {
    return res.status(404).json({ error: "Usuario no encontrado." });
  }

  const { nombre, rol, correo, subscription, nuevaClave } = req.body;
  users[idx] = {
    ...users[idx],
    ...(nombre       !== undefined && { nombre }),
    ...(rol          !== undefined && { rol }),
    ...(correo       !== undefined && { correo }),
    ...(subscription !== undefined && { subscription }),
    ...(nuevaClave   && nuevaClave.trim() && { clave: nuevaClave }),
  };
  guardarUsuarios(users);

  const { clave: _, ...sinClave } = users[idx];
  res.json({ ok: true, user: sinClave });
});

app.patch("/api/users/:username/block", soloGerente, (req, res) => {
  const { blocked } = req.body;
  const users = leerUsuarios();
  const idx   = users.findIndex(u => u.usuario === req.params.username);
  if (idx === -1) {
    return res.status(404).json({ error: "Usuario no encontrado." });
  }
  users[idx].blocked = Boolean(blocked);
  guardarUsuarios(users);

  const accion = blocked ? "bloqueado" : "desbloqueado";
  console.log(`[${new Date().toLocaleString("es-CL")}] Usuario ${req.params.username} ${accion} por ${req.adminUser.usuario}`);
  res.json({ ok: true, blocked: users[idx].blocked });
});

app.delete("/api/users/:username", soloGerente, (req, res) => {
  const { username } = req.params;
  if (username === req.adminUser.usuario) {
    return res.status(400).json({ error: "No puedes eliminar tu propia cuenta." });
  }
  let users = leerUsuarios();
  const existia = users.some(u => u.usuario === username);
  if (!existia) return res.status(404).json({ error: "Usuario no encontrado." });

  users = users.filter(u => u.usuario !== username);
  guardarUsuarios(users);

  console.log(`[${new Date().toLocaleString("es-CL")}] Usuario ${username} eliminado por ${req.adminUser.usuario}`);
  res.json({ ok: true });
});

// ─────────────────────────────────────────────────────────────────────────────
//  RUTA DE SUBIDA DE IMÁGENES DE PRODUCTOS (existente — NO modificada)
// ─────────────────────────────────────────────────────────────────────────────

app.post("/api/upload/product-image", upload.single("imagen"), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: "No se recibió ninguna imagen." });
  }

  const imageUrl = `/uploads/${req.file.filename}`;
  console.log(`[${new Date().toLocaleString("es-CL")}] Imagen subida: ${req.file.filename} (${Math.round(req.file.size / 1024)}KB)`);

  res.json({
    ok: true,
    url: imageUrl,
    filename: req.file.filename,
    size: req.file.size,
    mimetype: req.file.mimetype,
  });
});

app.delete("/api/upload/product-image/:filename", (req, res) => {
  const filename = req.params.filename;
  const safeName = path.basename(filename);
  const filePath = path.join(UPLOADS_DIR, safeName);

  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: "Imagen no encontrada." });
  }

  try {
    fs.unlinkSync(filePath);
    console.log(`[${new Date().toLocaleString("es-CL")}] Imagen eliminada: ${safeName}`);
    res.json({ ok: true, deleted: safeName });
  } catch (e) {
    console.error("Error eliminando imagen:", e.message);
    res.status(500).json({ error: "No se pudo eliminar la imagen." });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
//  SERVIR FRONTEND ESTÁTICO (React build) — sin cambios
// ─────────────────────────────────────────────────────────────────────────────

if (fs.existsSync(BUILD_DIR)) {
  app.use(express.static(BUILD_DIR));

  app.get(/^(?!\/api|\/uploads).*/, (req, res) => {
    res.sendFile(path.join(BUILD_DIR, "index.html"));
  });

  console.log(`✓ Frontend servido desde: ${BUILD_DIR}`);
} else {
  app.get("/", (req, res) => {
    res.send(`
      <!DOCTYPE html>
      <html lang="es">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Inventario Pro — Servidor</title>
        <style>
          body { font-family: 'Segoe UI', sans-serif; background: #0f1629; color: #e5e7eb; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; }
          .box { background: #1a2035; border: 1px solid #2d3458; border-radius: 16px; padding: 40px; max-width: 540px; text-align: center; }
          h1 { color: #748ffc; margin-bottom: 12px; }
          code { background: #0f1629; padding: 4px 10px; border-radius: 6px; font-family: monospace; color: #10b981; }
          .step { background: #0f1629; border-radius: 10px; padding: 14px; margin: 8px 0; text-align: left; }
          .ok { color: #10b981; font-size: 22px; margin-bottom: 12px; }
        </style>
      </head>
      <body>
        <div class="box">
          <div class="ok">✓ Backend activo en puerto ${PORT}</div>
          <h1>Inventario Pro</h1>
          <p>El backend está funcionando. Para servir el frontend:</p>
          <div class="step">1. Compila el frontend:<br><code>npm run build</code></div>
          <div class="step">2. Reinicia el servidor:<br><code>node server.js</code></div>
          <p style="margin-top:20px; color:#6b7280; font-size:13px;">
            API disponible en <code>http://localhost:${PORT}/api/</code>
          </p>
        </div>
      </body>
      </html>
    `);
  });
}

// ── Manejo de errores de multer ───────────────────────────────────────────────
app.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === "LIMIT_FILE_SIZE") {
      return res.status(400).json({ error: "La imagen es demasiado grande. Máximo 5MB." });
    }
    return res.status(400).json({ error: `Error al subir archivo: ${err.message}` });
  }
  if (err && err.message && err.message.includes("Formato")) {
    return res.status(400).json({ error: err.message });
  }
  next(err);
});

// ─────────────────────────────────────────────────────────────────────────────
//  INICIAR SERVIDOR
// ─────────────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  const mpConfigurado = MP_CLIENT_ID !== "TU_CLIENT_ID_AQUI";

  console.log("");
  console.log("  ╔══════════════════════════════════════════════════╗");
  console.log("  ║      Inventario Pro — Sistema Unificado          ║");
  console.log(`  ║      http://localhost:${PORT}                       ║`);
  console.log("  ╚══════════════════════════════════════════════════╝");
  console.log("");
  console.log(`  Backend API      : http://localhost:${PORT}/api/`);
  console.log(`  Imágenes subidas : http://localhost:${PORT}/uploads/`);
  console.log(`  Frontend         : ${fs.existsSync(BUILD_DIR) ? "✓ Servido desde /build" : "⚠ No compilado aún (ejecuta: npm run build)"}`);
  console.log(`  Usuarios         : ${USERS_FILE}`);
  console.log(`  Directorio imgs  : ${UPLOADS_DIR}`);
  console.log(`  Correo           : mandarin.soporte@gmail.com`);
  console.log(`  MercadoPago      : ${mpConfigurado ? "✓ Configurado" : "⚠ Sin configurar (agrega MP_CLIENT_ID, etc.)"}`);
  console.log("");
  console.log("  Nuevas rutas disponibles:");
  console.log(`  POST /api/auth/forgot-password       ← Recuperación: solicitar código`);
  console.log(`  POST /api/auth/verify-recovery-code  ← Recuperación: verificar código`);
  console.log(`  POST /api/auth/reset-password        ← Recuperación: cambiar contraseña`);
  console.log(`  GET  /api/auth/mp/url                ← MercadoPago: obtener URL OAuth`);
  console.log(`  GET  /api/auth/mp/callback           ← MercadoPago: callback OAuth`);
  console.log("");

  leerUsuarios();
});
