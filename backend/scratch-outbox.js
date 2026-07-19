const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkOutbox() {
  const events = await prisma.outboxEvent.findMany();
  console.log('Outbox Events:', events);
  
  const bookings = await prisma.booking.findMany();
  console.log('Bookings:', bookings);
  
  process.exit(0);
}

checkOutbox();
