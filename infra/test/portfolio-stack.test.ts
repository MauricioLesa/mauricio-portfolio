import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { App } from 'aws-cdk-lib';
import { Match, Template } from 'aws-cdk-lib/assertions';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PortfolioStack } from '../lib/portfolio-stack';

type Resource = { Type: string; Properties?: Record<string, unknown> };
type Statement = { Action?: unknown; Resource?: unknown; NotAction?: unknown };

let workDir: string;
let template: Template;
let buildDirs: { lambdaCodePath: string; nextStaticDir: string; publicDir: string };

beforeAll(() => {
  // Stand-ins for the build output, so the tests don't need `next build` or `package:lambda`.
  workDir = mkdtempSync(join(tmpdir(), 'portfolio-stack-'));
  const lambdaDir = join(workDir, 'lambda');
  const nextStatic = join(workDir, 'static');
  const publicDir = join(workDir, 'public');
  for (const dir of [lambdaDir, nextStatic, publicDir]) mkdirSync(dir);
  writeFileSync(join(lambdaDir, 'run.sh'), '#!/bin/bash\nexec node server.js\n');
  writeFileSync(join(nextStatic, 'app.js'), '');
  writeFileSync(join(publicDir, 'favicon.svg'), '');

  buildDirs = { lambdaCodePath: lambdaDir, nextStaticDir: nextStatic, publicDir };
  template = synth();
});

function synth(extra: { reservedConcurrency?: number } = {}): Template {
  const stack = new PortfolioStack(new App(), 'TestStack', {
    env: { region: 'us-east-2' },
    budgetAlertEmail: 'alerts@example.com',
    ...buildDirs,
    ...extra,
  });
  return Template.fromStack(stack);
}

afterAll(() => rmSync(workDir, { recursive: true, force: true }));

function resourcesOf(type: string): Resource[] {
  return Object.values(template.findResources(type)) as Resource[];
}

function policyStatements(): Statement[] {
  const fromPolicies = resourcesOf('AWS::IAM::Policy').flatMap(
    (p) => ((p.Properties?.PolicyDocument as { Statement: Statement[] }).Statement),
  );
  const fromRoles = resourcesOf('AWS::IAM::Role').flatMap((r) =>
    ((r.Properties?.Policies as { PolicyDocument: { Statement: Statement[] } }[] | undefined) ?? []).flatMap(
      (p) => p.PolicyDocument.Statement,
    ),
  );
  return [...fromPolicies, ...fromRoles];
}

const asArray = (v: unknown): unknown[] => (v === undefined ? [] : Array.isArray(v) ? v : [v]);

function serverFunction(): Resource {
  const fn = resourcesOf('AWS::Lambda::Function').find((f) => f.Properties?.Handler === 'run.sh');
  if (!fn) throw new Error('server function not found');
  return fn;
}

describe('PortfolioStack', () => {
  it('has no IAM statement with Action "*" or Resource "*"', () => {
    const statements = policyStatements();
    expect(statements.length).toBeGreaterThan(0);
    for (const s of statements) {
      expect(asArray(s.Action)).not.toContain('*');
      expect(asArray(s.Resource)).not.toContain('*');
      expect(s.NotAction).toBeUndefined();
    }
  });

  it('grants the server function only the five DynamoDB item actions on the table', () => {
    const dynamoStatements = policyStatements().filter((s) =>
      asArray(s.Action).some((a) => typeof a === 'string' && a.startsWith('dynamodb:')),
    );
    expect(dynamoStatements).toHaveLength(1);
    expect(asArray(dynamoStatements[0]!.Action).sort()).toEqual(
      ['dynamodb:DeleteItem', 'dynamodb:GetItem', 'dynamodb:PutItem', 'dynamodb:Query', 'dynamodb:UpdateItem'],
    );
    expect(asArray(dynamoStatements[0]!.Resource)).toHaveLength(1);
  });

  it('blocks public access on the static bucket and enforces SSL', () => {
    template.hasResourceProperties('AWS::S3::Bucket', {
      PublicAccessBlockConfiguration: {
        BlockPublicAcls: true,
        BlockPublicPolicy: true,
        IgnorePublicAcls: true,
        RestrictPublicBuckets: true,
      },
      BucketEncryption: {
        ServerSideEncryptionConfiguration: [{ ServerSideEncryptionByDefault: { SSEAlgorithm: 'AES256' } }],
      },
    });
    template.hasResourceProperties('AWS::S3::BucketPolicy', {
      PolicyDocument: {
        Statement: Match.arrayWith([
          Match.objectLike({ Effect: 'Deny', Condition: { Bool: { 'aws:SecureTransport': 'false' } } }),
        ]),
      },
    });
  });

  it('uses an AWS_IAM, RESPONSE_STREAM function URL', () => {
    template.hasResourceProperties('AWS::Lambda::Url', { AuthType: 'AWS_IAM', InvokeMode: 'RESPONSE_STREAM' });
  });

  it('configures the function for the Lambda Web Adapter', () => {
    const props = serverFunction().Properties!;
    expect(props.Runtime).toBe('nodejs22.x');
    expect(props.Architectures).toEqual(['arm64']);
    expect(props.MemorySize).toBe(1024);
    expect(props.Timeout).toBe(30);
    expect(props.Layers).toEqual([expect.stringMatching(/:753240598075:layer:LambdaAdapterLayerArm64:\d+$/)]);
    expect((props.Environment as { Variables: Record<string, unknown> }).Variables).toMatchObject({
      AWS_LAMBDA_EXEC_WRAPPER: '/opt/bootstrap',
      AWS_LWA_INVOKE_MODE: 'response_stream',
      AWS_LWA_PORT: '3000',
      AWS_MODE: 'real',
    });
  });

  it('reserves a concurrency of 10 by default', () => {
    expect(serverFunction().Properties!.ReservedConcurrentExecutions).toBe(10);
  });

  it('reserves nothing when reservedConcurrency is 0 (account quota of 10)', () => {
    const fns = Object.values(synth({ reservedConcurrency: 0 }).findResources('AWS::Lambda::Function')) as Resource[];
    const fn = fns.find((f) => f.Properties?.Handler === 'run.sh');
    expect(fn?.Properties).toBeDefined();
    expect(fn!.Properties).not.toHaveProperty('ReservedConcurrentExecutions');
  });

  it('rejects a negative or fractional reservedConcurrency', () => {
    expect(() => synth({ reservedConcurrency: -1 })).toThrow(/reservedConcurrency/);
    expect(() => synth({ reservedConcurrency: 2.5 })).toThrow(/reservedConcurrency/);
  });

  it('keeps function logs for 30 days', () => {
    template.hasResourceProperties('AWS::Logs::LogGroup', { RetentionInDays: 30 });
  });

  it('creates an on-demand table with TTL "ttl"', () => {
    template.hasResourceProperties('AWS::DynamoDB::Table', {
      TableName: 'Portfolio',
      BillingMode: 'PAY_PER_REQUEST',
      TimeToLiveSpecification: { AttributeName: 'ttl', Enabled: true },
      KeySchema: [
        { AttributeName: 'PK', KeyType: 'HASH' },
        { AttributeName: 'SK', KeyType: 'RANGE' },
      ],
    });
    template.hasResource('AWS::DynamoDB::Table', { DeletionPolicy: 'Retain' });
  });

  it('uses OAC for both CloudFront origins', () => {
    const oacTypes = resourcesOf('AWS::CloudFront::OriginAccessControl').map(
      (r) => (r.Properties!.OriginAccessControlConfig as { OriginAccessControlOriginType: string })
        .OriginAccessControlOriginType,
    );
    expect(oacTypes.sort()).toEqual(['lambda', 's3']);

    const [distribution] = resourcesOf('AWS::CloudFront::Distribution');
    const originList = (distribution!.Properties!.DistributionConfig as { Origins: Record<string, unknown>[] }).Origins;
    expect(originList).toHaveLength(2);
    for (const origin of originList) expect(origin.OriginAccessControlId).toBeDefined();
  });

  it('routes /_next/static/* to S3 and /api/* to Lambda without caching', () => {
    template.hasResourceProperties('AWS::CloudFront::Distribution', {
      DistributionConfig: Match.objectLike({
        CacheBehaviors: Match.arrayWith([
          Match.objectLike({ PathPattern: '/_next/static/*' }),
          Match.objectLike({
            PathPattern: '/api/*',
            // Managed CachingDisabled policy.
            CachePolicyId: '4135ea2d-6df8-44a3-9df3-4b5a84be39ad',
            AllowedMethods: Match.arrayWith(['POST']),
          }),
        ]),
      }),
    });
  });

  it('keys page caching on _rsc only and forwards the viewer address, never Host', () => {
    template.hasResourceProperties('AWS::CloudFront::CachePolicy', {
      CachePolicyConfig: Match.objectLike({
        DefaultTTL: 0,
        ParametersInCacheKeyAndForwardedToOrigin: Match.objectLike({
          QueryStringsConfig: { QueryStringBehavior: 'whitelist', QueryStrings: ['_rsc'] },
          HeadersConfig: { HeaderBehavior: 'whitelist', Headers: ['rsc', 'next-router-prefetch'] },
        }),
      }),
    });
    const policies = resourcesOf('AWS::CloudFront::OriginRequestPolicy');
    expect(policies).toHaveLength(2);
    for (const p of policies) {
      const headers = (
        p.Properties!.OriginRequestPolicyConfig as { HeadersConfig: { Headers: string[] } }
      ).HeadersConfig.Headers;
      expect(headers).toContain('CloudFront-Viewer-Address');
      expect(headers.map((h) => h.toLowerCase())).not.toContain('host');
    }
  });

  it('has a $10 monthly budget with ACTUAL alerts at $5 and $8', () => {
    template.hasResourceProperties('AWS::Budgets::Budget', {
      Budget: Match.objectLike({ BudgetType: 'COST', TimeUnit: 'MONTHLY', BudgetLimit: { Amount: 10, Unit: 'USD' } }),
      NotificationsWithSubscribers: [5, 8].map((threshold) => ({
        Notification: {
          NotificationType: 'ACTUAL',
          ComparisonOperator: 'GREATER_THAN',
          Threshold: threshold,
          ThresholdType: 'ABSOLUTE_VALUE',
        },
        Subscribers: [{ SubscriptionType: 'EMAIL', Address: 'alerts@example.com' }],
      })),
    });
  });

  it('has no Secrets Manager secret, VPC or NAT gateway', () => {
    template.resourceCountIs('AWS::SecretsManager::Secret', 0);
    template.resourceCountIs('AWS::EC2::VPC', 0);
    template.resourceCountIs('AWS::EC2::NatGateway', 0);
  });
});
