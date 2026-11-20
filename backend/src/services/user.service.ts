import { db as prisma } from "../db";
import { getBetsByAddressPaginated, type PaginatedBets } from "./bet.service";

export interface UserProfile {
  address: string;
  displayName?: string | null;
  avatarUrl?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface UpdateUserDTO {
  displayName?: string | null;
  avatarUrl?: string | null;
}

/**
 * Fetches a user profile by wallet address.
 *
 * Profile fields live on the User row (B-121, #1557). An address with a User
 * row always has a profile, even with no bets. An address without a row falls
 * back to a bet-derived profile (no display fields); an address with neither
 * returns null.
 */
export async function getUserByAddress(
  address: string
): Promise<UserProfile | null> {
  const user = await prisma.user.findUnique({ where: { address } });

  if (user) {
    return {
      address: user.address,
      displayName: user.displayName,
      avatarUrl: user.avatarUrl,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };
  }

  const firstBet = await prisma.bet.findFirst({
    where: { bettor: address },
    orderBy: { placedAt: "asc" },
  });

  if (!firstBet) return null;

  return {
    address,
    createdAt: firstBet.placedAt,
    updatedAt: new Date(),
  };
}

/**
 * Creates or updates a user's profile fields. Upserts the User row; profile
 * data is no longer written to AdminLog.
 */
export async function updateUser(
  address: string,
  data: UpdateUserDTO
): Promise<UserProfile> {
  const patch: UpdateUserDTO = {};
  if (data.displayName !== undefined) patch.displayName = data.displayName;
  if (data.avatarUrl !== undefined) patch.avatarUrl = data.avatarUrl;

  const user = await prisma.user.upsert({
    where: { address },
    create: { address, ...patch },
    update: patch,
  });

  return {
    address: user.address,
    displayName: user.displayName,
    avatarUrl: user.avatarUrl,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
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
