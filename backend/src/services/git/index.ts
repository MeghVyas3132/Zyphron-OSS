// ===========================================
// GIT SERVICE
// Handles repository cloning, branch management, and commit information
// ===========================================

import { simpleGit, type CloneOptions } from 'simple-git';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { URL } from 'node:url';
import { createLogger } from '../../lib/logger.js';

const logger = createLogger('git-service');

// ===========================================
// TYPES
// ===========================================

export interface GitProvider {
  type: 'github' | 'gitlab' | 'bitbucket' | 'custom';
  baseUrl: string;
}

export interface CloneResult {
  success: boolean;
  path: string;
  commitHash: string;
  branch: string;
  commitMessage: string;
  author: string;
  timestamp: Date;
  error?: string;
}

export interface CommitInfo {
  hash: string;
  message: string;
  author: string;
  email: string;
  timestamp: Date;
}

export interface BranchInfo {
  name: string;
  commit: string;
  isRemote: boolean;
}

// ===========================================
// GIT SERVICE CLASS
// ===========================================

export class GitService {
  private workDir: string;
  
  constructor(workDir: string = '/tmp/zyphron/repos') {
    this.workDir = workDir;
  }

  // ===========================================
  // CLONE REPOSITORY
  // ===========================================

  async cloneRepository(
    repoUrl: string,
    deploymentId: string,
    branch: string = 'main',
    token?: string
  ): Promise<CloneResult> {
    const targetPath = path.join(this.workDir, deploymentId);
    
    logger.info({ repoUrl, deploymentId, branch, targetPath }, 'Cloning repository');

    try {
      // Ensure work directory exists
      await fs.mkdir(this.workDir, { recursive: true });
      
      // Clean up if directory already exists
      try {
        await fs.rm(targetPath, { recursive: true, force: true });
      } catch {
        // Directory doesn't exist, that's fine
      }

      // Build authenticated URL if token provided
      const authenticatedUrl = token 
        ? this.addTokenToUrl(repoUrl, token)
        : repoUrl;

      // Clone options
      const cloneOptions: CloneOptions = {
        '--depth': 1,           // Shallow clone for faster builds
        '--single-branch': null,
        '--branch': branch,
      };

      // Perform clone
      const git = simpleGit();
      await git.clone(authenticatedUrl, targetPath, cloneOptions);

      // Get commit info
      const repoGit = simpleGit(targetPath);
      const log = await repoGit.log({ maxCount: 1 });
      const latestCommit = log.latest;

      if (!latestCommit) {
        throw new Error('Failed to get commit information after clone');
      }

      logger.info({
        deploymentId,
        commitHash: latestCommit.hash.substring(0, 7),
        branch,
      }, 'Repository cloned successfully');

      return {
        success: true,
        path: targetPath,
        commitHash: latestCommit.hash,
        branch,
        commitMessage: latestCommit.message,
        author: latestCommit.author_name,
        timestamp: new Date(latestCommit.date),
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error({ deploymentId, error: errorMessage }, 'Failed to clone repository');

      return {
        success: false,
        path: targetPath,
        commitHash: '',
        branch,
        commitMessage: '',
        author: '',
        timestamp: new Date(),
        error: errorMessage,
      };
    }
  }

  // ===========================================
  // GET COMMIT INFO
  // ===========================================

  async getCommitInfo(repoPath: string, commitHash?: string): Promise<CommitInfo | null> {
    try {
      const git = simpleGit(repoPath);
      const log = await git.log({
        maxCount: 1,
        ...(commitHash && { from: commitHash, to: commitHash }),
      });

      const commit = log.latest;
      if (!commit) return null;

      return {
        hash: commit.hash,
        message: commit.message,
        author: commit.author_name,
        email: commit.author_email,
        timestamp: new Date(commit.date),
      };
    } catch (error) {
      logger.error({ repoPath, error }, 'Failed to get commit info');
      return null;
    }
  }

  // ===========================================
  // LIST BRANCHES
  // ===========================================

  async listBranches(repoPath: string): Promise<BranchInfo[]> {
    try {
      const git = simpleGit(repoPath);
      const branchSummary = await git.branch(['-a']);

      return branchSummary.all.map((name: string) => ({
        name: name.replace('remotes/origin/', ''),
        commit: branchSummary.branches[name]?.commit || '',
        isRemote: name.startsWith('remotes/'),
      }));
    } catch (error) {
      logger.error({ repoPath, error }, 'Failed to list branches');
      return [];
    }
  }

  // ===========================================
  // CHECKOUT BRANCH/COMMIT
  // ===========================================

  async checkout(repoPath: string, ref: string): Promise<boolean> {
    try {
      const git = simpleGit(repoPath);
      await git.checkout(ref);
      logger.info({ repoPath, ref }, 'Checked out ref');
      return true;
    } catch (error) {
      logger.error({ repoPath, ref, error }, 'Failed to checkout');
      return false;
    }
  }

  // ===========================================
  // GET FILE CONTENT
  // ===========================================

  async getFileContent(repoPath: string, filePath: string): Promise<string | null> {
    try {
      const fullPath = path.join(repoPath, filePath);
      const content = await fs.readFile(fullPath, 'utf-8');
      return content;
    } catch {
      return null;
    }
  }

  // ===========================================
  // CHECK IF FILE EXISTS
  // ===========================================

  async fileExists(repoPath: string, filePath: string): Promise<boolean> {
    try {
      const fullPath = path.join(repoPath, filePath);
      await fs.access(fullPath);
      return true;
    } catch {
      return false;
    }
  }

  // ===========================================
  // CLEANUP REPOSITORY
  // ===========================================

  async cleanup(deploymentId: string): Promise<void> {
    const targetPath = path.join(this.workDir, deploymentId);
    try {
      await fs.rm(targetPath, { recursive: true, force: true });
      logger.info({ deploymentId }, 'Cleaned up repository');
    } catch (error) {
      logger.warn({ deploymentId, error }, 'Failed to cleanup repository');
    }
  }

  // ===========================================
  // PARSE REPO URL
  // ===========================================

  parseRepoUrl(url: string): {
    provider: GitProvider;
    owner: string;
    repo: string;
    isValid: boolean;
  } {
    // GitHub patterns
    const githubHttps = /^https:\/\/github\.com\/([^\/]+)\/([^\/\.]+)(\.git)?$/;
    const githubSsh = /^git@github\.com:([^\/]+)\/([^\/\.]+)(\.git)?$/;

    // GitLab patterns
    const gitlabHttps = /^https:\/\/gitlab\.com\/([^\/]+)\/([^\/\.]+)(\.git)?$/;
    const gitlabSsh = /^git@gitlab\.com:([^\/]+)\/([^\/\.]+)(\.git)?$/;

    // Bitbucket patterns
    const bitbucketHttps = /^https:\/\/bitbucket\.org\/([^\/]+)\/([^\/\.]+)(\.git)?$/;
    const bitbucketSsh = /^git@bitbucket\.org:([^\/]+)\/([^\/\.]+)(\.git)?$/;

    // Try GitHub
    let match = url.match(githubHttps) || url.match(githubSsh);
    if (match) {
      return {
        provider: { type: 'github', baseUrl: 'https://github.com' },
        owner: match[1],
        repo: match[2],
        isValid: true,
      };
    }

    // Try GitLab
    match = url.match(gitlabHttps) || url.match(gitlabSsh);
    if (match) {
      return {
        provider: { type: 'gitlab', baseUrl: 'https://gitlab.com' },
        owner: match[1],
        repo: match[2],
        isValid: true,
      };
    }

    // Try Bitbucket
    match = url.match(bitbucketHttps) || url.match(bitbucketSsh);
    if (match) {
      return {
        provider: { type: 'bitbucket', baseUrl: 'https://bitbucket.org' },
        owner: match[1],
        repo: match[2],
        isValid: true,
      };
    }

    // Unknown/custom
    return {
      provider: { type: 'custom', baseUrl: '' },
      owner: '',
      repo: '',
      isValid: false,
    };
  }

  // ===========================================
  // PRIVATE HELPERS
  // ===========================================

  private addTokenToUrl(url: string, token: string): string {
    try {
      const urlObj = new URL(url);
      
      // For GitHub
      if (urlObj.hostname === 'github.com') {
        return `https://${token}@github.com${urlObj.pathname}`;
      }
      
      // For GitLab
      if (urlObj.hostname === 'gitlab.com') {
        return `https://oauth2:${token}@gitlab.com${urlObj.pathname}`;
      }
      
      // For Bitbucket
      if (urlObj.hostname === 'bitbucket.org') {
        return `https://x-token-auth:${token}@bitbucket.org${urlObj.pathname}`;
      }

      // Default: add as username
      urlObj.username = token;
      return urlObj.toString();
    } catch {
      // If URL parsing fails, return original
      return url;
    }
  }

  // ===========================================
  // GET DIFF BETWEEN COMMITS
  // ===========================================

  async getDiff(repoPath: string, fromCommit: string, toCommit: string): Promise<string> {
    try {
      const git = simpleGit(repoPath);
      return await git.diff([fromCommit, toCommit]);
    } catch (error) {
      logger.error({ repoPath, fromCommit, toCommit, error }, 'Failed to get diff');
      return '';
    }
  }

  // ===========================================
  // LIST FILES
  // ===========================================

  async listFiles(repoPath: string): Promise<string[]> {
    try {
      const git = simpleGit(repoPath);
      const result = await git.raw(['ls-files']);
      return result.trim().split('\n').filter(Boolean);
    } catch (error) {
      logger.error({ repoPath, error }, 'Failed to list files');
      return [];
    }
  }
}

// ===========================================
// SINGLETON INSTANCE
// ===========================================

let gitServiceInstance: GitService | null = null;

export function getGitService(workDir?: string): GitService {
  if (!gitServiceInstance) {
    gitServiceInstance = new GitService(workDir);
  }
  return gitServiceInstance;
}

export default GitService;
