import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding database...');

  // Create an Organizer User
  const passwordHash = await bcrypt.hash('password123', 10);
  
  const organizer = await prisma.user.upsert({
    where: { email: 'organizer@example.com' },
    update: {},
    create: {
      email: 'organizer@example.com',
      name: 'EventBook Mock Organizer',
      passwordHash,
      role: 'ORGANIZER',
    },
  });

  console.log('Organizer created:', organizer.email);

  // Generate some future dates
  const now = new Date();
  const nextWeek = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  const nextMonth = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
  const twoMonths = new Date(now.getTime() + 60 * 24 * 60 * 60 * 1000);

  // Mock Events
  const events = [
    {
      title: 'Global Tech Summit 2026',
      description: 'The premier technology conference featuring keynotes from industry leaders.',
      venue: 'Moscone Center, San Francisco',
      startTime: nextMonth,
      totalSeats: 500,
      availableSeats: 500,
      price: 19900, // $199.00
      organizerId: organizer.id,
    },
    {
      title: 'Neobrutalism UI Workshop',
      description: 'A hands-on workshop learning the boldest design trend of the year.',
      venue: 'Design Hub, New York',
      startTime: nextWeek,
      totalSeats: 50,
      availableSeats: 2, // Almost sold out
      price: 4900, // $49.00
      organizerId: organizer.id,
    },
    {
      title: 'Summer Indie Music Fest',
      description: 'Three days of non-stop indie music in the beautiful outdoors.',
      venue: 'Golden Gate Park, San Francisco',
      startTime: twoMonths,
      totalSeats: 5000,
      availableSeats: 5000,
      price: 8500, // $85.00
      organizerId: organizer.id,
    },
    {
      title: 'Free Community Yoga',
      description: 'Relax and unwind with a free community yoga session.',
      venue: 'Central Park, New York',
      startTime: nextWeek,
      totalSeats: 100,
      availableSeats: 100,
      price: 0, // Free event
      organizerId: organizer.id,
    },
    {
      title: 'AI Engineering Conference',
      description: 'Deep dive into building agentic systems and LLM integrations.',
      venue: 'ExCeL London, UK',
      startTime: nextMonth,
      totalSeats: 200,
      availableSeats: 200,
      price: 29900, // $299.00
      organizerId: organizer.id,
    }
  ];

  for (const eventData of events) {
    const event = await prisma.event.create({
      data: eventData,
    });
    console.log(`Created Event: ${event.title}`);
  }

  console.log('Seeding finished successfully.');
}

main()
  .catch((e) => {
    console.error('Seeding failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
