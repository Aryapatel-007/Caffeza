/**
 * Sends a sample order to a restaurant's sandbox platform. P25 Part H10.
 *
 *   npm run sandbox:order -- --restaurant <id> --file setup/sandbox-orders/simple-prepaid.json
 *   ... --server http://localhost:5000
 *
 * For practice and development only: refuses production, and works only with
 * a SANDBOX_PLATFORM connection. The server stores just the hash of a webhook
 * address, so this makes the sandbox a fresh address each run (harmless for a
 * practice platform), signs the file's body with the sandbox's own secret, and
 * posts it to the running server, exactly as a platform would.
 */
import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import mongoose from 'mongoose';

import { connectDatabase, disconnectDatabase } from '../config/database.js';
import { config } from '../config/env.js';
import { IntegrationConnection } from '../models/IntegrationConnection.js';
import { signSandboxBody } from '../services/integrations/channels/sandbox.js';
import { hashKey, secretsOf } from '../services/integrations/connectionService.js';

export function parseArgs(argv) {
  const args = { restaurant: null, file: null, server: `http://localhost:${config.PORT}` };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--restaurant') args.restaurant = argv[++i];
    else if (argv[i] === '--file') args.file = argv[++i];
    else if (argv[i] === '--server') args.server = argv[++i];
    else throw new Error(`Unknown argument ${argv[i]}.`);
  }
  return args;
}

async function main() {
  if (config.isProduction) throw new Error('The sandbox platform never runs in production.');
  const args = parseArgs(process.argv.slice(2));
  if (!args.restaurant || !mongoose.isValidObjectId(args.restaurant) || !args.file) {
    throw new Error('Give --restaurant <id> and --file <order.json>.');
  }
  const base = process.env.INIT_CWD ?? process.cwd();
  const body = readFileSync(path.resolve(base, args.file), 'utf8');
  JSON.parse(body);

  await connectDatabase();
  const connection = await IntegrationConnection.findOne({ restaurantId: args.restaurant, provider: 'SANDBOX_PLATFORM' }).select('+credentials');
  if (!connection) throw new Error('That restaurant has no sandbox platform connection. Set one up in Integrations first.');

  const key = randomBytes(24).toString('base64url');
  connection.webhookKeyHash = hashKey(key);
  await connection.save();
  const signature = signSandboxBody(Buffer.from(body), secretsOf(connection).webhookSecret);

  const response = await fetch(`${args.server}/api/v1/hooks/SANDBOX_PLATFORM/${key}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-sandbox-signature': signature },
    body,
  });
  console.log(`Sent to the sandbox: ${response.status} ${await response.text()}`);
  console.log('The sandbox has a new webhook address; the old one no longer works.');
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main()
    .catch((error) => {
      console.error(error.message);
      process.exitCode = 1;
    })
    .finally(() => disconnectDatabase());
}
