import bcrypt from "bcryptjs";
import type { PrismaClient } from "./generated/prisma/client.js";

// Demo accounts for local development ONLY. Never use these credentials anywhere real.
export const DEMO_PASSWORD = "password123";
export const ALICE_EMAIL = "alice@example.com";
export const BOB_EMAIL = "bob@example.com";

const SITES = [
  ["MDN Web Docs", "https://developer.mozilla.org"],
  ["Hacker News", "https://news.ycombinator.com"],
  ["Serious Eats", "https://www.seriouseats.com"],
  ["The Pragmatic Engineer", "https://newsletter.pragmaticengineer.com"],
  ["Wikipedia", "https://en.wikipedia.org"],
  ["Smashing Magazine", "https://www.smashingmagazine.com"],
  ["BBC News", "https://www.bbc.com/news"],
  ["Project Gutenberg", "https://www.gutenberg.org"],
  ["Lonely Planet", "https://www.lonelyplanet.com"],
  ["CSS-Tricks", "https://css-tricks.com"],
];

// Re-runnable: removes the two demo users (cascades delete their bookmarks and
// categories), then recreates everything. Other users are left alone.
export async function seed(prisma: PrismaClient) {
  await prisma.user.deleteMany({ where: { email: { in: [ALICE_EMAIL, BOB_EMAIL] } } });

  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10);
  const alice = await prisma.user.create({ data: { email: ALICE_EMAIL, passwordHash } });
  const bob = await prisma.user.create({ data: { email: BOB_EMAIL, passwordHash } });

  const aliceCategories = [];
  for (const name of ["Dev", "News", "Recipes", "Reading"]) {
    aliceCategories.push(await prisma.category.create({ data: { name, userId: alice.id } }));
  }

  // 50 bookmarks, newest first by index. Every 5th has no category and every
  // 7th has two, so filtering and sorting have something to chew on.
  const now = Date.now();
  for (let i = 1; i <= 50; i++) {
    const [title, url] = SITES[i % SITES.length];
    const picked = [];
    if (i % 5 !== 0) picked.push(aliceCategories[i % aliceCategories.length]);
    if (i % 7 === 0) picked.push(aliceCategories[(i + 1) % aliceCategories.length]);

    await prisma.bookmark.create({
      data: {
        title: `${title} #${i}`,
        url: `${url}/page-${i}`,
        description: i % 3 === 0 ? `Notes about bookmark ${i}` : null,
        createdAt: new Date(now - i * 60 * 60 * 1000),
        userId: alice.id,
        categories: { connect: [...new Set(picked.map((c) => c.id))].map((id) => ({ id })) },
      },
    });
  }

  // Bob shares a category name with Alice ("Recipes") to exercise the per-user unique rule.
  const bobRecipes = await prisma.category.create({ data: { name: "Recipes", userId: bob.id } });
  const bobTravel = await prisma.category.create({ data: { name: "Travel", userId: bob.id } });
  for (let i = 1; i <= 5; i++) {
    const [title, url] = SITES[(i + 2) % SITES.length];
    await prisma.bookmark.create({
      data: {
        title: `${title} (Bob #${i})`,
        url: `${url}/bob-${i}`,
        userId: bob.id,
        categories: { connect: [{ id: i % 2 === 0 ? bobRecipes.id : bobTravel.id }] },
      },
    });
  }
}
