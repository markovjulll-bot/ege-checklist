// Подключается через `node --import ./vps/register.mjs`:
// подменяет пакет @netlify/blobs файловым хранилищем и добавляет то, чего нет в старом Node.
import { register } from "node:module";
import { webcrypto } from "node:crypto";
if (!globalThis.crypto) globalThis.crypto = webcrypto;
globalThis.Netlify = { env: { get: (k) => process.env[k] } };
register(new URL("./hooks.mjs", import.meta.url));
