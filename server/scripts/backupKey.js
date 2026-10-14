/**
 * Prints a new backup encryption key, once. P54.
 *
 *   npm run backup:key
 *
 * 32 random bytes in base64, for BACKUP_ENCRYPTION_KEY. Run it in your own
 * terminal, then save the key in Render's environment AND in a password
 * manager: if it is lost, every backup made with it is unreadable. Nothing is
 * stored or sent anywhere; the key exists only on this screen.
 */
import { randomBytes } from 'node:crypto';

const key = randomBytes(32).toString('base64');
process.stdout.write(`\n${key}\n\nSave this in Render (BACKUP_ENCRYPTION_KEY) and in a password manager. It is not shown again.\n\n`);
