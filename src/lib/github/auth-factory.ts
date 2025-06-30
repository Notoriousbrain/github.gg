import { Octokit } from '@octokit/rest';
import { auth } from '@/lib/auth';
import { db } from '@/db';
import { account } from '@/db/schema';
import { and, eq } from 'drizzle-orm';
import { getInstallationToken } from './app';
import type { BetterAuthSession } from './types';
import { SessionData } from '@/lib/types/errors';

// Factory functions for different authentication methods
export class GitHubAuthFactory {
  // Create service with public API key (for unauthenticated users)
  static createPublic(): Octokit {
    console.log('🔑 Using public GitHub API key');
    return new Octokit({ auth: process.env.GITHUB_PUBLIC_API_KEY! });
  }

  // Create service with GitHub App installation (for authenticated users with installations)
  static async createWithApp(session: BetterAuthSession): Promise<Octokit | null> {
    if (!session?.user?.id) {
      return null;
    }

    try {
      const userAccount = await db.query.account.findFirst({
        where: and(
          eq(account.userId, session.user.id),
          eq(account.providerId, 'github')
        ),
      });

      if (userAccount?.installationId) {
        console.log(`✅ Using GitHub App installation ${userAccount.installationId} for authenticated user`);
        const installationToken = await getInstallationToken(userAccount.installationId);
        return new Octokit({ auth: installationToken });
      }
    } catch (error) {
      console.warn('Failed to create GitHub App service:', error);
    }

    return null;
  }

  // Create service with OAuth token (for authenticated users without installations)
  static async createWithOAuth(session: BetterAuthSession): Promise<Octokit | null> {
    if (!session?.user?.id) {
      return null;
    }

    try {
      const { accessToken } = await auth.api.getAccessToken({
        body: {
          providerId: 'github',
          userId: session.user.id,
        },
        headers: {},
      });
      
      if (accessToken) {
        console.log('🔐 Using OAuth token for authenticated user');
        return new Octokit({ auth: accessToken });
      }
    } catch (error) {
      console.warn('Failed to get OAuth token:', error);
    }

    return null;
  }

  // Create service with unified authentication (requires GitHub App installation)
  static async createAuthenticated(session: SessionData): Promise<Octokit> {
    if (!session.accessToken) {
      throw new Error('No access token available');
    }

    return new Octokit({
      auth: session.accessToken,
    });
  }
} 