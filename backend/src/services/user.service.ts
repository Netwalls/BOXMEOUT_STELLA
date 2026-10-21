import { db as prisma } from "../db";

export interface UserProfile {
  address: string;
  displayName?: string;
  avatarUrl?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface UpdateUserDTO {
  displayName?: string;
  avatarUrl?: string;
}

/**
 * Fetches a user profile by wallet address.
 * Returns null if the user has no profile record yet.
 */
export async function getUserByAddress(
  address: string
): Promise<UserProfile | null> {
  // For now, aggregate user data from bets and return a basic profile.
  // A full User table would be added later in the schema.
  const betCount = await prisma.bet.count({
    where: { bettor: address },
  });

  if (betCount === 0) return null;

  const firstBet = await prisma.bet.findFirst({
    where: { bettor: address },
    orderBy: { placedAt: "asc" },
  });

  return {
    address,
    createdAt: firstBet?.placedAt ?? new Date(),
    updatedAt: new Date(),
  };
}

/**
 * Updates a user's profile metadata.
 * Currently stores profile data via an AdminLog pattern; a full User
 * table with displayName/avatarUrl fields should be added to the Prisma
 * schema for production use.
 */
export async function updateUser(
  address: string,
  data: UpdateUserDTO
): Promise<UserProfile> {
  const existing = await getUserByAddress(address);

  await prisma.adminLog.create({
    data: {
      action: "UPDATE_USER",
      actor: address,
      target: address,
      metadata: data as Record<string, unknown>,
    },
  });

  return {
    address,
    displayName: data.displayName,
    avatarUrl: data.avatarUrl,
    createdAt: existing?.createdAt ?? new Date(),
    updatedAt: new Date(),
  };
}

/**
 * Cursor-paginated bets placed by a wallet, ordered by (placedAt, id) descending.
 */
export async function getUserBets(
  address: string,
  options?: { cursor?: string | null; limit?: number | string | null }
): Promise<PaginatedBets> {
  return getBetsByAddressPaginated(address, options);
}
