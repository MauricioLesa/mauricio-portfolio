#!/usr/bin/env node
import { App } from 'aws-cdk-lib';
import { PortfolioStack } from '../lib/portfolio-stack';

const app = new App();

/** CDK context (`-c key=value`) wins over the environment variable of the same meaning. */
function setting(contextKey: string, envKey: string): string | undefined {
  const fromContext: unknown = app.node.tryGetContext(contextKey);
  const value = typeof fromContext === 'string' ? fromContext : process.env[envKey];
  return value?.trim() ? value.trim() : undefined;
}

const domainName = setting('domainName', 'DOMAIN_NAME');
const budgetAlertEmail = setting('budgetAlertEmail', 'BUDGET_ALERT_EMAIL');
const siteUrl = setting('siteUrl', 'NEXT_PUBLIC_SITE_URL') ?? (domainName ? `https://${domainName}` : undefined);

// CDK context: a number from cdk.json, or a string from `-c reservedConcurrency=…`. Unset → stack default (10).
const reservedConcurrencySetting: unknown = app.node.tryGetContext('reservedConcurrency');
const reservedConcurrency =
  reservedConcurrencySetting === undefined ? undefined : Number(reservedConcurrencySetting);

if (!budgetAlertEmail) {
  throw new Error(
    'BUDGET_ALERT_EMAIL is required (FR-033). Pass `-c budgetAlertEmail=you@example.com` or set the BUDGET_ALERT_EMAIL env var.',
  );
}

// Analysis I3 (owner decision, 2026-11-14): `crossRegionReferences` needs an explicit account, so it
// is turned on only when the optional us-east-1 CertificateStack exists (DOMAIN_NAME set, wired by T033).
// Without a domain the stack stays account-agnostic and `cdk synth` needs no AWS credentials.
new PortfolioStack(app, 'PortfolioStack', {
  env: domainName
    ? { region: 'us-east-2', account: process.env.CDK_DEFAULT_ACCOUNT }
    : { region: 'us-east-2' },
  crossRegionReferences: Boolean(domainName),
  budgetAlertEmail,
  siteUrl,
  reservedConcurrency,
  description: 'Mauricio portfolio: Next.js on Lambda (Web Adapter) behind CloudFront, S3, DynamoDB, budget',
});
