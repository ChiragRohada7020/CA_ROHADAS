import express from "express";
import qrcode from "qrcode";
import multer from "multer";
import cors from "cors";
import path from "path";
import fs from "fs";
import pino from "pino";

const PORT = parseInt(process.env.PORT || "3001", 10);
const AUTH_DIR = path.join(process.cwd(), "auth_info");

fs.mkdirSync(AUTH_DIR, { recursive: true });

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } });

let sock = null;
let currentQrCode = null;
let currentPairingCode = null;
let connectionStatus = {
  connected: false,
  status: "initializing",
  last_disconnect: null,
  reconnect_count: 0,
};

let baileys = null;
let baileysReady = false;
let baileysError = null;

async function loadBaileys() {
  if (baileysReady || baileysError) return;
  try {
    baileys = await import("baileys");
    baileysReady = true;
  } catch (err) {
    baileysError = err;
    console.error("Failed to load baileys:", err.message);
  }
}

function normalizePhone(phone) {
  const digits = phone.replace(/\D/g, "");
  if (!digits.startsWith("91") && digits.length === 10) {
    return "91" + digits;
  }
  return digits;
}

function jidFor(phone) {
  return `${normalizePhone(phone)}@s.whatsapp.net`;
}

function updateConnection(partial) {
  connectionStatus = { ...connectionStatus, ...partial };
}

async function initializeSocket() {
  if (sock) return sock;
  await loadBaileys();
  if (!baileysReady) {
    throw new Error(baileysError ? baileysError.message : "baileys not available");
  }

  const { makeWASocket, useMultiFileAuthState, Browsers } = baileys;
  const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);

  sock = makeWASocket({
    auth: state,
    printQRInTerminal: false,
    logger: pino({ level: "silent" }),
    browser: Browsers.macOS("Desktop"),
  });

  sock.ev.on("creds.save", saveCreds);

  sock.ev.on("connection.update", (update) => {
    const { connection, lastDisconnect, qr } = update;
    if (qr) {
      qrcode
        .toDataURL(qr)
        .then((url) => {
          currentQrCode = url;
          updateConnection({ status: "qr_ready", connected: false });
        })
        .catch((err) => {
          console.error("QR generation error:", err.message);
        });
    }
    if (connection === "close") {
      const reason = lastDisconnect ? lastDisconnect.error : new Error("connection closed");
      updateConnection({
        connected: false,
        status: "disconnected",
        last_disconnect: new Date().toISOString(),
      });
      if (!reason || reason.message?.includes("connection closed")) {
        return;
      }
      setTimeout(() => {
        updateConnection({ reconnect_count: connectionStatus.reconnect_count + 1 });
        initializeSocket();
      }, 3000);
    }
    if (connection === "open") {
      currentQrCode = null;
      currentPairingCode = null;
      updateConnection({ connected: true, status: "connected", last_disconnect: null });
    }
  });

  sock.ev.on("messages.upsert", () => {
    // Message receipts handled elsewhere if needed
  });

  return sock;
}

function ensureSocket() {
  if (!sock) {
    throw new Error("Socket not initialized");
  }
  return sock;
}

// ── Endpoints ──────────────────────────────────────────────

app.get("/qr", async (_req, res) => {
  try {
    await initializeSocket();
  } catch (err) {
    return res.status(503).json({
      qr_code: null,
      pairing_code: null,
      instructions: "WhatsApp gateway failed to initialize: " + err.message,
      provider: "baileys",
      connected: false,
      connection_info: { ...connectionStatus },
    });
  }

  if (connectionStatus.connected) {
    return res.json({
      qr_code: null,
      pairing_code: null,
      instructions: "WhatsApp is already connected.",
      provider: "baileys",
      connected: true,
      connection_info: { ...connectionStatus },
    });
  }

  if (!currentQrCode) {
    return res.json({
      qr_code: null,
      pairing_code: null,
      instructions: "Waiting for QR code. The gateway is connecting to WhatsApp servers. Please try again in a few seconds.",
      provider: "baileys",
      connected: false,
      connection_info: { ...connectionStatus },
    });
  }

  res.json({
    qr_code: currentQrCode,
    pairing_code: currentPairingCode,
    instructions: "Scan this QR with your phone's WhatsApp app.",
    provider: "baileys",
    connected: false,
    connection_info: { ...connectionStatus },
  });
});

app.post("/pair", async (req, res) => {
  try {
    ensureSocket();
  } catch (err) {
    return res.status(503).json({ error: "Socket not initialized" });
  }

  const phoneNumber = req.body.phone_number;
  if (!phoneNumber) {
    return res.status(400).json({ error: "phone_number is required" });
  }

  if (typeof sock.requestPairingCode !== "function") {
    return res.status(501).json({
      error: "Pairing code not supported in this Baileys version. Use QR code pairing instead.",
      provider: "baileys",
    });
  }

  try {
    const code = await sock.requestPairingCode(phoneNumber);
    currentPairingCode = code;
    res.json({ pairing_code: code, instructions: `Enter ${code} on your phone when prompted.` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/status", (_req, res) => {
  res.json({
    configured: true,
    provider: "baileys",
    connected: connectionStatus.connected,
    status: connectionStatus.status,
    connection_info: { ...connectionStatus },
  });
});

app.post("/send-message", async (req, res) => {
  try {
    ensureSocket();
  } catch (err) {
    return res.status(503).json({ error: "Socket not initialized" });
  }

  const { phone_number, message } = req.body;
  if (!phone_number) {
    return res.status(400).json({ error: "phone_number is required" });
  }
  if (!message) {
    return res.status(400).json({ error: "message is required" });
  }

  try {
    await sock.sendMessage(jidFor(phone_number), { text: message });
    res.json({ success: true, recipient: phone_number, provider: "baileys" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/send-media", upload.single("file"), async (req, res) => {
  try {
    ensureSocket();
  } catch (err) {
    return res.status(503).json({ error: "Socket not initialized" });
  }

  const { phone_number, caption } = req.body;
  if (!phone_number) {
    return res.status(400).json({ error: "phone_number is required" });
  }
  if (!req.file) {
    return res.status(400).json({ error: "file is required" });
  }

  try {
    await sock.sendMessage(jidFor(phone_number), {
      document: req.file.buffer,
      mimetype: req.file.mimetype || "application/pdf",
      fileName: req.file.originalname || "document.pdf",
      caption: caption || undefined,
    });
    res.json({ success: true, recipient: phone_number, provider: "baileys" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, async () => {
  console.log(`Baileys gateway running on http://127.0.0.1:${PORT}`);
  await initializeSocket();
});

export default app;
