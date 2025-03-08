#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
} from '@modelcontextprotocol/sdk/types.js';
import axios from 'axios';
import { IgApiClient } from 'instagram-private-api';
import * as dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Instagram API credentials
const INSTAGRAM_USERNAME = process.env.INSTAGRAM_USERNAME;
const INSTAGRAM_PASSWORD = process.env.INSTAGRAM_PASSWORD;

// Validate required environment variables
if (!INSTAGRAM_USERNAME || !INSTAGRAM_PASSWORD) {
  console.error('[Error] Missing required environment variables: INSTAGRAM_USERNAME and INSTAGRAM_PASSWORD');
  process.exit(1);
}

// Type definitions for our tools
interface AnalyzeCommentsArgs {
  postUrl: string;
  maxComments?: number;
}

interface CompareAccountsArgs {
  accounts: string[];
  metrics?: string[];
}

interface ExtractDemographicsArgs {
  accountOrPostUrl: string;
  sampleSize?: number;
}

interface IdentifyLeadsArgs {
  accountOrPostUrl: string;
  criteria?: {
    minComments?: number;
    minFollowers?: number;
    keywords?: string[];
  };
}

interface GenerateReportArgs {
  account: string;
  startDate?: string;
  endDate?: string;
}

// Utility function to validate post URL
const isValidPostUrl = (url: string): boolean => {
  return /^https:\/\/(www\.)?instagram\.com\/p\/[A-Za-z0-9_-]+\/?/.test(url);
};

// Utility function to extract post ID from URL
const extractPostIdFromUrl = (url: string): string => {
  const match = url.match(/\/p\/([A-Za-z0-9_-]+)/);
  return match ? match[1] : '';
};

// Utility function to validate Instagram username
const isValidUsername = (username: string): boolean => {
  return /^[A-Za-z0-9._]+$/.test(username);
};

class InstagramEngagementServer {
  private server: Server;
  private ig: IgApiClient;
  private isLoggedIn: boolean = false;

  constructor() {
    console.error('[Setup] Initializing Instagram Engagement MCP server...');
    
    this.server = new Server(
      {
        name: 'instagram-engagement-server',
        version: '0.1.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.ig = new IgApiClient();
    
    this.setupToolHandlers();
    
    // Error handling
    this.server.onerror = (error) => console.error('[MCP Error]', error);
    process.on('SIGINT', async () => {
      await this.server.close();
      process.exit(0);
    });
  }

  private async loginToInstagram(): Promise<boolean> {
    if (this.isLoggedIn) return true;
    
    try {
      console.error('[Auth] Attempting to log in to Instagram...');
      this.ig.state.generateDevice(INSTAGRAM_USERNAME!);
      await this.ig.account.login(INSTAGRAM_USERNAME!, INSTAGRAM_PASSWORD!);
      this.isLoggedIn = true;
      console.error('[Auth] Successfully logged in to Instagram');
      return true;
    } catch (error) {
      console.error('[Auth Error] Failed to log in to Instagram:', error);
      return false;
    }
  }

  private setupToolHandlers() {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: [
        {
          name: 'analyze_post_comments',
          description: 'Analyze comments on an Instagram post to identify sentiment, themes, and potential leads',
          inputSchema: {
            type: 'object',
            properties: {
              postUrl: {
                type: 'string',
                description: 'URL of the Instagram post to analyze',
              },
              maxComments: {
                type: 'number',
                description: 'Maximum number of comments to analyze (default: 100)',
              },
            },
            required: ['postUrl'],
          },
        },
        {
          name: 'compare_accounts',
          description: 'Compare engagement metrics across different Instagram accounts',
          inputSchema: {
            type: 'object',
            properties: {
              accounts: {
                type: 'array',
                items: {
                  type: 'string',
                },
                description: 'List of Instagram account handles to compare',
              },
              metrics: {
                type: 'array',
                items: {
                  type: 'string',
                  enum: ['followers', 'engagement', 'posts', 'comments', 'likes'],
                },
                description: 'Metrics to compare (default: all)',
              },
            },
            required: ['accounts'],
          },
        },
        {
          name: 'extract_demographics',
          description: 'Extract demographic insights from users engaged with a post or account',
          inputSchema: {
            type: 'object',
            properties: {
              accountOrPostUrl: {
                type: 'string',
                description: 'Instagram account handle or post URL to analyze',
              },
              sampleSize: {
                type: 'number',
                description: 'Number of users to sample for demographic analysis (default: 50)',
              },
            },
            required: ['accountOrPostUrl'],
          },
        },
        {
          name: 'identify_leads',
          description: 'Identify potential leads based on engagement patterns',
          inputSchema: {
            type: 'object',
            properties: {
              accountOrPostUrl: {
                type: 'string',
                description: 'Instagram account handle or post URL to analyze',
              },
              criteria: {
                type: 'object',
                properties: {
                  minComments: {
                    type: 'number',
                    description: 'Minimum number of comments from a user',
                  },
                  minFollowers: {
                    type: 'number',
                    description: 'Minimum number of followers a user should have',
                  },
                  keywords: {
                    type: 'array',
                    items: {
                      type: 'string',
                    },
                    description: 'Keywords to look for in user comments or bio',
                  },
                },
                description: 'Criteria for identifying leads',
              },
            },
            required: ['accountOrPostUrl'],
          },
        },
        {
          name: 'generate_engagement_report',
          description: 'Generate a comprehensive engagement report for an Instagram account',
          inputSchema: {
            type: 'object',
            properties: {
              account: {
                type: 'string',
                description: 'Instagram account handle',
              },
              startDate: {
                type: 'string',
                description: 'Start date for the report (YYYY-MM-DD)',
              },
              endDate: {
                type: 'string',
                description: 'End date for the report (YYYY-MM-DD)',
              },
            },
            required: ['account'],
          },
        },
      ],
    }));

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      console.error(`[Tool] Request to execute tool: ${request.params.name}`);
      
      // Ensure we're logged in to Instagram
      const loggedIn = await this.loginToInstagram();
      if (!loggedIn) {
        throw new McpError(
          ErrorCode.InternalError,
          'Failed to authenticate with Instagram API'
        );
      }

      const args = request.params.arguments || {};
      
      switch (request.params.name) {
        case 'analyze_post_comments':
          return this.handleAnalyzePostComments(args as unknown as AnalyzeCommentsArgs);
        case 'compare_accounts':
          return this.handleCompareAccounts(args as unknown as CompareAccountsArgs);
        case 'extract_demographics':
          return this.handleExtractDemographics(args as unknown as ExtractDemographicsArgs);
        case 'identify_leads':
          return this.handleIdentifyLeads(args as unknown as IdentifyLeadsArgs);
        case 'generate_engagement_report':
          return this.handleGenerateReport(args as unknown as GenerateReportArgs);
        default:
          throw new McpError(
            ErrorCode.MethodNotFound,
            `Unknown tool: ${request.params.name}`
          );
      }
    });
  }

  private async handleAnalyzePostComments(args: AnalyzeCommentsArgs) {
    console.error('[Tool] Analyzing post comments:', args);
    
    if (!isValidPostUrl(args.postUrl)) {
      return {
        content: [
          {
            type: 'text',
            text: 'Invalid Instagram post URL. Please provide a valid URL in the format: https://www.instagram.com/p/CODE/',
          },
        ],
        isError: true,
      };
    }

    const maxComments = args.maxComments || 100;
    const postId = extractPostIdFromUrl(args.postUrl);

    try {
      // In a real implementation, we would use the Instagram API to fetch comments
      // For this example, we'll simulate the response
      
      // Simulated analysis results
      const analysisResults = {
        postUrl: args.postUrl,
        totalComments: 245,
        analyzedComments: Math.min(245, maxComments),
        sentiment: {
          positive: 65,
          neutral: 25,
          negative: 10,
        },
        commonThemes: [
          { theme: 'Product quality', mentions: 42 },
          { theme: 'Customer service', mentions: 28 },
          { theme: 'Price', mentions: 15 },
        ],
        topKeywords: [
          { word: 'love', count: 37 },
          { word: 'great', count: 25 },
          { word: 'awesome', count: 18 },
        ],
        potentialLeads: [
          { username: 'user123', engagementScore: 8.5, comments: 3 },
          { username: 'influencer456', engagementScore: 7.9, comments: 2 },
        ],
      };

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(analysisResults, null, 2),
          },
        ],
      };
    } catch (error) {
      console.error('[Error] Failed to analyze post comments:', error);
      return {
        content: [
          {
            type: 'text',
            text: `Error analyzing post comments: ${error instanceof Error ? error.message : String(error)}`,
          },
        ],
        isError: true,
      };
    }
  }

  private async handleCompareAccounts(args: CompareAccountsArgs) {
    console.error('[Tool] Comparing accounts:', args);
    
    // Validate account handles
    const invalidAccounts = args.accounts.filter(account => !isValidUsername(account));
    if (invalidAccounts.length > 0) {
      return {
        content: [
          {
            type: 'text',
            text: `Invalid Instagram account handles: ${invalidAccounts.join(', ')}`,
          },
        ],
        isError: true,
      };
    }

    try {
      // In a real implementation, we would use the Instagram API to fetch account data
      // For this example, we'll simulate the response
      
      // Simulated comparison results
      const comparisonResults = {
        accounts: args.accounts,
        metrics: {
          followers: {
            [args.accounts[0]]: 15420,
            [args.accounts[1]]: 8750,
          },
          engagement: {
            [args.accounts[0]]: 3.2,
            [args.accounts[1]]: 4.7,
          },
          posts: {
            [args.accounts[0]]: 342,
            [args.accounts[1]]: 187,
          },
          comments: {
            [args.accounts[0]]: 28,
            [args.accounts[1]]: 35,
          },
          likes: {
            [args.accounts[0]]: 420,
            [args.accounts[1]]: 380,
          },
        },
        insights: [
          `${args.accounts[1]} has a higher engagement rate despite fewer followers`,
          `${args.accounts[0]} posts more frequently but receives fewer comments per post`,
        ],
      };

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(comparisonResults, null, 2),
          },
        ],
      };
    } catch (error) {
      console.error('[Error] Failed to compare accounts:', error);
      return {
        content: [
          {
            type: 'text',
            text: `Error comparing accounts: ${error instanceof Error ? error.message : String(error)}`,
          },
        ],
        isError: true,
      };
    }
  }

  private async handleExtractDemographics(args: ExtractDemographicsArgs) {
    console.error('[Tool] Extracting demographics:', args);
    
    const sampleSize = args.sampleSize || 50;
    
    try {
      // In a real implementation, we would use the Instagram API to fetch user data
      // For this example, we'll simulate the response
      
      // Simulated demographics results
      const demographicsResults = {
        source: args.accountOrPostUrl,
        sampleSize: sampleSize,
        demographics: {
          age: {
            '18-24': 35,
            '25-34': 42,
            '35-44': 15,
            '45+': 8,
          },
          gender: {
            'female': 62,
            'male': 36,
            'other': 2,
          },
          location: {
            'United States': 45,
            'United Kingdom': 12,
            'Canada': 8,
            'Australia': 7,
            'Other': 28,
          },
          interests: [
            { category: 'Fashion', percentage: 48 },
            { category: 'Technology', percentage: 35 },
            { category: 'Travel', percentage: 32 },
            { category: 'Fitness', percentage: 28 },
          ],
        },
        insights: [
          'Predominantly female audience in the 25-34 age range',
          'Strong interest in fashion and technology',
          'Significant engagement from North America',
        ],
      };

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(demographicsResults, null, 2),
          },
        ],
      };
    } catch (error) {
      console.error('[Error] Failed to extract demographics:', error);
      return {
        content: [
          {
            type: 'text',
            text: `Error extracting demographics: ${error instanceof Error ? error.message : String(error)}`,
          },
        ],
        isError: true,
      };
    }
  }

  private async handleIdentifyLeads(args: IdentifyLeadsArgs) {
    console.error('[Tool] Identifying leads:', args);
    
    try {
      // In a real implementation, we would use the Instagram API to fetch user data
      // For this example, we'll simulate the response
      
      // Default criteria if not provided
      const criteria = args.criteria || {
        minComments: 2,
        minFollowers: 1000,
        keywords: ['interested', 'buy', 'price'],
      };
      
      // Simulated leads results
      const leadsResults = {
        source: args.accountOrPostUrl,
        criteria: criteria,
        leads: [
          {
            username: 'potential_customer1',
            fullName: 'John Smith',
            followers: 2340,
            comments: 3,
            relevantKeywords: ['interested', 'price'],
            engagementScore: 8.7,
            contactInfo: 'Email in bio: john@example.com',
          },
          {
            username: 'business_account2',
            fullName: 'Sarah Johnson',
            followers: 5620,
            comments: 2,
            relevantKeywords: ['buy'],
            engagementScore: 7.5,
            contactInfo: 'Website in bio: www.example.com',
          },
        ],
        insights: [
          '2 high-quality leads identified based on criteria',
          'Both leads have shown direct purchase intent',
          'Combined reach of identified leads: 7,960 followers',
        ],
      };

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(leadsResults, null, 2),
          },
        ],
      };
    } catch (error) {
      console.error('[Error] Failed to identify leads:', error);
      return {
        content: [
          {
            type: 'text',
            text: `Error identifying leads: ${error instanceof Error ? error.message : String(error)}`,
          },
        ],
        isError: true,
      };
    }
  }

  private async handleGenerateReport(args: GenerateReportArgs) {
    console.error('[Tool] Generating engagement report:', args);
    
    if (!isValidUsername(args.account)) {
      return {
        content: [
          {
            type: 'text',
            text: `Invalid Instagram account handle: ${args.account}`,
          },
        ],
        isError: true,
      };
    }

    // Parse dates or use defaults
    const endDate = args.endDate ? new Date(args.endDate) : new Date();
    const startDate = args.startDate 
      ? new Date(args.startDate) 
      : new Date(endDate.getTime() - 30 * 24 * 60 * 60 * 1000); // 30 days before end date
    
    try {
      // In a real implementation, we would use the Instagram API to fetch account data
      // For this example, we'll simulate the response
      
      // Simulated report results
      const reportResults = {
        account: args.account,
        period: {
          start: startDate.toISOString().split('T')[0],
          end: endDate.toISOString().split('T')[0],
        },
        summary: {
          totalPosts: 12,
          totalLikes: 8750,
          totalComments: 420,
          totalShares: 135,
          totalSaves: 89,
          followerGrowth: 320,
          engagementRate: 3.8,
        },
        postPerformance: [
          {
            date: '2025-02-15',
            type: 'image',
            likes: 950,
            comments: 48,
            shares: 15,
            saves: 12,
            engagementRate: 4.2,
          },
          {
            date: '2025-02-22',
            type: 'video',
            likes: 1250,
            comments: 72,
            shares: 28,
            saves: 19,
            engagementRate: 5.7,
          },
        ],
        topPerformingContent: [
          {
            postUrl: 'https://www.instagram.com/p/example1/',
            type: 'video',
            engagementRate: 5.7,
            insights: 'Product demonstration with call to action',
          },
          {
            postUrl: 'https://www.instagram.com/p/example2/',
            type: 'carousel',
            engagementRate: 4.9,
            insights: 'User testimonials with product benefits',
          },
        ],
        audienceGrowth: {
          newFollowers: 320,
          unfollows: 45,
          netGrowth: 275,
          growthRate: 2.8,
        },
        recommendations: [
          'Video content consistently outperforms images',
          'Posts with product demonstrations generate the most engagement',
          'Optimal posting time appears to be between 6-8pm on weekdays',
          'User-generated content receives more comments than branded content',
        ],
      };

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(reportResults, null, 2),
          },
        ],
      };
    } catch (error) {
      console.error('[Error] Failed to generate engagement report:', error);
      return {
        content: [
          {
            type: 'text',
            text: `Error generating engagement report: ${error instanceof Error ? error.message : String(error)}`,
          },
        ],
        isError: true,
      };
    }
  }

  async run() {
    console.error('[Setup] Starting Instagram Engagement MCP server...');
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error('[Setup] Instagram Engagement MCP server running on stdio');
  }
}

const server = new InstagramEngagementServer();
server.run().catch(console.error);
