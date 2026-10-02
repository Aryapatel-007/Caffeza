/**
 * Preloaded with `node --import`, before any server module reads the
 * environment: the seed scripts that move the clock run as NODE_ENV=test,
 * which works the same in Windows cmd, PowerShell and Git Bash, unlike a
 * `NODE_ENV=test node ...` prefix. dotenv never overwrites a set variable.
 */
process.env.NODE_ENV = 'test';
