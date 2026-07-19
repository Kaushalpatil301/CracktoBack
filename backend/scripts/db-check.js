// Quick DB connectivity smoke-test — not production code.
// Run: node scripts/db-check.js  (Prisma reads .env automatically)
const { PrismaClient } = require('@prisma/client');

const p = new PrismaClient();

async function main() {
  const rows = await p.$queryRawUnsafe(
    "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name"
  );
  const names = rows.map((r) => r.table_name).join(', ');
  console.log('✅ Connected. Tables:', names);
  await p.$disconnect();
}

main().catch((err) => {
  console.error('❌ Connection failed:', err.message);
  process.exit(1);
});
