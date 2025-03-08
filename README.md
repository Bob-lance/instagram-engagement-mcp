# Instagram Engagement MCP

[![npm version](https://img.shields.io/npm/v/instagram-engagement-mcp.svg)](https://www.npmjs.com/package/instagram-engagement-mcp)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

An MCP server that provides tools for analyzing Instagram engagement metrics, extracting demographic insights, and identifying potential leads from Instagram posts and accounts.

## Features

- **Analyze Post Comments**: Extract sentiment, themes, and potential leads from comments on Instagram posts
- **Compare Accounts**: Compare engagement metrics across different Instagram accounts
- **Extract Demographics**: Get demographic insights from users engaged with a post or account
- **Identify Leads**: Find potential leads based on engagement patterns and criteria
- **Generate Engagement Reports**: Create comprehensive reports with actionable insights

## Installation

### Option 1: Install from npm

```bash
npm install -g instagram-engagement-mcp
```

### Option 2: Clone from GitHub

```bash
git clone https://github.com/Bob-lance/instagram-engagement-mcp.git
cd instagram-engagement-mcp
npm install
```

## Setup

1. Copy the `.env.example` file to `.env` and add your Instagram credentials:
   ```bash
   cp .env.example .env
   ```
2. Edit the `.env` file with your Instagram username and password

## Building from Source

If you cloned the repository, build the project:

```bash
npm run build
```

## Configuration

Add the server to your MCP settings file:

```json
{
  "mcpServers": {
    "instagram-engagement": {
      "command": "npx",
      "args": ["instagram-engagement-mcp"],
      "env": {
        "INSTAGRAM_USERNAME": "your_instagram_username",
        "INSTAGRAM_PASSWORD": "your_instagram_password"
      },
      "disabled": false,
      "autoApprove": []
    }
  }
}
```

If you cloned the repository instead of installing from npm, use:

```json
{
  "mcpServers": {
    "instagram-engagement": {
      "command": "node",
      "args": ["/path/to/instagram-engagement-mcp/build/index.js"],
      "env": {
        "INSTAGRAM_USERNAME": "your_instagram_username",
        "INSTAGRAM_PASSWORD": "your_instagram_password"
      },
      "disabled": false,
      "autoApprove": []
    }
  }
}
```

## Available Tools

### analyze_post_comments

Analyze comments on an Instagram post to identify sentiment, themes, and potential leads.

**Parameters:**
- `postUrl` (required): URL of the Instagram post to analyze
- `maxComments` (optional): Maximum number of comments to analyze (default: 100)

### compare_accounts

Compare engagement metrics across different Instagram accounts.

**Parameters:**
- `accounts` (required): List of Instagram account handles to compare
- `metrics` (optional): Metrics to compare (default: all)

### extract_demographics

Extract demographic insights from users engaged with a post or account.

**Parameters:**
- `accountOrPostUrl` (required): Instagram account handle or post URL to analyze
- `sampleSize` (optional): Number of users to sample for demographic analysis (default: 50)

### identify_leads

Identify potential leads based on engagement patterns.

**Parameters:**
- `accountOrPostUrl` (required): Instagram account handle or post URL to analyze
- `criteria` (optional): Criteria for identifying leads

### generate_engagement_report

Generate a comprehensive engagement report for an Instagram account.

**Parameters:**
- `account` (required): Instagram account handle
- `startDate` (optional): Start date for the report (YYYY-MM-DD)
- `endDate` (optional): End date for the report (YYYY-MM-DD)

## Notes

- This server uses the Instagram Private API, which is not officially supported by Instagram
- Use responsibly and in accordance with Instagram's terms of service
- Be aware of rate limits to avoid being blocked by Instagram
