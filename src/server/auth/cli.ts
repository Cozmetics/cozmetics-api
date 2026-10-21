import crypto from 'node:crypto';
import readline from 'node:readline';
import { loadConfig } from '../config.js';
import { initDatabase } from '../db/schema.js';
import { Repository } from '../db/repository.js';
import { hashPassword } from './auth.js';

async function prompt(question: string, hidden = false): Promise<string> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

async function main() {
  const args = process.argv.slice(2);
  let username = '';
  let password = '';

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--username' && args[i + 1]) {
      username = args[i + 1];
      i++;
    } else if (args[i] === '--password' && args[i + 1]) {
      password = args[i + 1];
      i++;
    }
  }

  if (!username) {
    username = await prompt('Enter admin username: ');
  }
  if (!password) {
    password = await prompt('Enter admin password: ');
  }

  if (!username || !password) {
    console.error('Error: Username and password cannot be empty.');
    process.exit(1);
  }

  if (password.length < 8) {
    console.error('Error: Password must be at least 8 characters long.');
    process.exit(1);
  }

  const config = loadConfig();
  const db = initDatabase(config.dbPath);
  const repo = new Repository(db);

  const existing = repo.getAdminByUsername(username);
  const { hash, salt } = hashPassword(password);

  if (existing) {
    console.log(`Admin '${username}' already exists. Updating password...`);
    db.prepare('UPDATE admins SET password_hash = ?, salt = ? WHERE username = ?').run(hash, salt, username);
    console.log(`Password updated successfully for admin '${username}'.`);
  } else {
    const id = crypto.randomUUID();
    repo.createAdmin(id, username, hash, salt);
    console.log(`Admin '${username}' created successfully.`);
  }

  process.exit(0);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});

