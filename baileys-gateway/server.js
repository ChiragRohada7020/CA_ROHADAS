hunkData);
        }
        const ensured = chunksBeingEnsured.get(chunkPath) ?? Promise.resolve().then(()=>ensureChunk(chunkPath)).finally(()=>chunksBeingEnsured.delete(chunkPath));
        chunksBeingEnsured.set(chunkPath, ensured);
        return ensured.then(()=>loadChunkAsync.call(this, chunkData));
    }
    nodeDevContextPrototype.l = loadChunkAsyncOnDemand;
}
/**
 * Instantiates a module in development mode using shared HMR logic.
 */ function instantiateModule(id, sourceType, sourceData) {
    // Node.js: creates base module object (hot API added by shared code)
    const createModuleObjectFn = (moduleId)=>{
        return createModuleWithDirection(moduleId);
    };
    // Node.js: creates Context (no refresh parameter)
    const createContext = (module1, exports, _refresh)=>{
        return new Context(module1, exports);
    };
    // Node.js: no hooks wrapper, just execute directly
    const runWithHooks = (_module, exec)=>{
        exec(undefined); // no refresh context
    };
    // Use shared instantiation logic (includes hot API setup)
    const newModule = instantiateModuleShared(id, sourceType, sourceData, moduleFactories, devModuleCache, runtimeModules, createModuleObjectFn, createContext, runWithHooks);
    newModule.loaded = true;
    return newModule;
}
/**
 * Instantiates a runtime module in development mode.
 */ function instantiateRuntimeModule(chunkPath, moduleId) {
    return instantiateModule(moduleId, SourceType.Runtime, chunkPath);
}
/**
 * Retrieves a module from the cache, or instantiate it as a runtime module if it is not cached.
 */ // @ts-ignore TypeScript doesn't separate this module space from the browser runtime
function getOrInstantiateRuntimeModule(chunkPath, moduleId) {
    const module1 = devModuleCache.get(moduleId);
    if (module1) {
        if (module1.error) {
            throw module1.error;
        }
        return module1;
    }
    return instantiateRuntimeModule(chunkPath, moduleId);
}
/**
 * Retrieves a module from the cache, or instantiate it if it is not cached.
 * Also tracks parent-child relationships for HMR dependency tracking.
 */ // @ts-ignore
function getOrInstantiateModuleFromParent(id, sourceModule) {
    // Track parent-child relationship
    const module1 = devModuleCache.get(id);
    trackModuleImport(sourceModule, id, module1);
    if (module1) {
        if (module1.error) {
            throw module1.error;
        }
        return module1;
    }
    const newModule = instantiateModule(id, SourceType.Parent, sourceModule.id);
    // Track again after instantiation to ensure the relationship is recorded
    trackModuleImport(sourceModule, id, newModule);
    return newModule;
}
module.exports = (sourcePath)=>({
        m: (id)=>getOrInstantiateRuntimeModule(sourcePath, id),
        c: (chunkData)=>loadRuntimeChunk(sourcePath, chunkData)
    });
/// <reference path="../../shared/runtime/dev-protocol.d.ts" />
/// <reference path="../../shared/runtime/hmr-runtime.ts" />
/* eslint-disable @typescript-eslint/no-unused-vars */ /**
 * Appends the module code with //# sourceURL and //# sourceMappingURL so
 * that Node.js can resolve stack frames from `eval`ed server HMR modules back to
 * their original source files. Mirrors the browser's _eval in dev-backend-dom.ts.
 */ function inlineSourcemaps(entry) {
    const [chunkPath, moduleId] = entry.url.split('?', 2);
    const absolutePath = path.resolve(RUNTIME_ROOT, chunkPath);
    const fileHref = url.pathToFileURL(absolutePath).href;
    const sourceURL = moduleId ? `${fileHref}?${moduleId}` : fileHref;
    let code = entry.code + '\n\n//# sourceURL=' + sourceURL;
    if (entry.map) {
        code += '\n//# sourceMappingURL=data:application/json;charset=utf-8;base64,' + Buffer.from(entry.map).toString('base64');
    }
    return code;
}
let serverHmrUpdateHandler = null;
function initializeServerHmr(moduleFactories, devModuleCache) {
    if (serverHmrUpdateHandler != null) {
        throw new Error('[Server HMR] Server HMR client is already initialized');
    }
    // Register the update handler for the server ru;
});

// ── Endpoints ──────────────────────────────────────────────

app.get("/qr", (req, res) => {
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
  if (!sock) {
    return res.status(503).json({ error: "Socket not initialized" });
  }

  const phoneNumber = req.body.phone_number;
  if (!phoneNumber) {
    return res.status(400).json({ error: "phone_number is required" });
  }

  // Baileys v7 should have requestPairingCode on the socket instance
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

app.get("/status", (req, res) => {
  res.json({
    configured: true,
    provider: "baileys",
    connected: connectionStatus.connected,
    status: connectionStatus.status,
    connection_info: { ...connectionStatus },
  });
});

app.listen(PORT, () => {
  console.log(`Baileys gateway running on http://127.0.0.1:${PORT}`);
});
