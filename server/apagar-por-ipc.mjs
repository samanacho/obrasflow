// Se precarga (--import) en el conector de WhatsApp cuando lo lanza scripts/local.mjs.
// En Windows no existe un SIGTERM real (matar un proceso es cortarlo de golpe), así
// que el orquestador pide el apagado por el canal IPC y acá se traduce a SIGTERM:
// corre el apagado prolijo del propio conector (marca la sesión como detenida,
// cierra WhatsApp y la base). Los archivos de sesión de .baileys-auth/ no se tocan.
// Si el orquestador muere de golpe, el canal se corta y el conector se apaga solo
// (así no queda un conector huérfano ocupando el puerto 3099).

function apagar() {
  if (process.listenerCount("SIGTERM") > 0) process.emit("SIGTERM", "SIGTERM");
  else process.exit(0);
  setTimeout(() => process.exit(0), 5000).unref();
}

if (process.send) {
  process.on("message", (m) => m?.tipo === "apagar" && apagar());
  process.on("disconnect", apagar);
  process.channel?.unref();
}
