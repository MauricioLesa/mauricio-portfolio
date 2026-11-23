import * as path from 'node:path';
import {
  Annotations,
  CfnOutput,
  Duration,
  RemovalPolicy,
  Stack,
  StackProps,
  aws_cloudfront as cloudfront,
  aws_cloudfront_origins as origins,
  aws_dynamodb as dynamodb,
  aws_iam as iam,
  aws_lambda as lambda,
  aws_logs as logs,
  aws_s3 as s3,
  aws_s3_assets as s3assets,
  aws_s3_deployment as s3deploy,
  custom_resources as cr,
} from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { MonthlyBudget } from './budget';

const REPO_ROOT = path.resolve(__dirname, '..', '..');

/**
 * AWS Lambda Web Adapter layer, arm64, published by AWS in account 753240598075.
 * Pinned to layer version 30, the version listed in the aws-lambda-web-adapter README (release 1.1.0)
 * on 2026-11-14. Bump it on purpose, never with `latest`.
 */
const WEB_ADAPTER_LAYER_ARN = 'arn:aws:lambda:us-east-2:753240598075:layer:LambdaAdapterLayerArm64:30';

/** Option A (2026-11-23): the Anthropic API key, a SecureString created by hand with the AWS CLI. */
const ANTHROPIC_KEY_PARAM = '/portfolio/anthropic-api-key';

/** Defaults from .env.example (FR-020, FR-021, FR-032). */
const APP_LIMITS = {
  RATE_LIMIT_CHAT_PER_HOUR: '20',
  RATE_LIMIT_CV_PER_HOUR: '10',
} as const;

/**
 * Assistant settings, set at deploy time from environment variables (infra/bin/portfolio.ts) so
 * the provider, model and spending caps are not written in this public repo. The only secret, the
 * API key, is never in the template: the function reads it from SSM at runtime.
 */
export interface AssistantSettings {
  readonly provider: string;
  readonly modelId: string;
  readonly effort: string;
  readonly spendCapDailyUsd: string;
  readonly spendCapMonthlyUsd: string;
}

export interface PortfolioStackProps extends StackProps {
  readonly assistant: AssistantSettings;
  /** Recipient of the $5 and $8 budget alerts (FR-033). */
  readonly budgetAlertEmail: string;
  /**
   * Canonical site URL, set as NEXT_PUBLIC_SITE_URL on the function. It can't be read from the
   * distribution here (the distribution depends on the function URL, so that would be a cycle),
   * so it comes from CDK context `siteUrl` (or `https://<DOMAIN_NAME>`). Omitted when unknown.
   */
  readonly siteUrl?: string;
  /**
   * Reserved concurrency for the server function: the cost brake from research.md R5 (default 10).
   * 0 reserves nothing. Needed while the account's Lambda concurrency quota is 10, because AWS keeps
   * at least 10 unreserved; at that quota the whole account is capped at 10 anyway.
   */
  readonly reservedConcurrency?: number;
  /** Lambda code: a zip written by `npm run package:lambda`. Overridable for tests. */
  readonly lambdaCodePath?: string;
  /** Next.js build output `.next/static`. Overridable for tests. */
  readonly nextStaticDir?: string;
  /** The app's `public/` directory. Overridable for tests. */
  readonly publicDir?: string;
}

export class PortfolioStack extends Stack {
  readonly table: dynamodb.Table;
  readonly staticBucket: s3.Bucket;
  readonly serverFunction: lambda.Function;
  readonly functionUrl: lambda.FunctionUrl;
  readonly distribution: cloudfront.Distribution;

  constructor(scope: Construct, id: string, props: PortfolioStackProps) {
    super(scope, id, props);

    // --- T031: DynamoDB table (data-model.md) --------------------------------------------------
    this.table = new dynamodb.Table(this, 'Table', {
      tableName: 'Portfolio',
      partitionKey: { name: 'PK', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'SK', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      timeToLiveAttribute: 'ttl',
      pointInTimeRecoverySpecification: { pointInTimeRecoveryEnabled: false },
      removalPolicy: RemovalPolicy.RETAIN,
    });

    // --- T113: static assets bucket ------------------------------------------------------------
    this.staticBucket = new s3.Bucket(this, 'StaticBucket', {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      objectOwnership: s3.ObjectOwnership.BUCKET_OWNER_ENFORCED,
      // RETAIN avoids the auto-delete custom resource (an extra Lambda with broad S3 rights).
      removalPolicy: RemovalPolicy.RETAIN,
    });

    // --- T114: Lambda function + URL -----------------------------------------------------------
    // Analysis G3 (owner decision, 2026-11-14): 30-day retention, matching the spec's 30-day log promise.
    const logGroup = new logs.LogGroup(this, 'ServerLogs', {
      retention: logs.RetentionDays.ONE_MONTH,
      removalPolicy: RemovalPolicy.DESTROY,
    });

    const environment: Record<string, string> = {
      // Lambda Web Adapter: required with the layer and zip packaging, or the function won't start.
      AWS_LAMBDA_EXEC_WRAPPER: '/opt/bootstrap',
      AWS_LWA_INVOKE_MODE: 'response_stream',
      AWS_LWA_PORT: '3000',
      // T116: app configuration.
      AWS_MODE: 'real',
      DYNAMO_TABLE_NAME: this.table.tableName,
      // The provider is a config choice (option A, 2026-11-23); values come from deploy-time env.
      CHAT_PROVIDER: props.assistant.provider,
      CHAT_MODEL_ID: props.assistant.modelId,
      CHAT_EFFORT: props.assistant.effort,
      SPEND_CAP_DAILY_USD: props.assistant.spendCapDailyUsd,
      SPEND_CAP_MONTHLY_USD: props.assistant.spendCapMonthlyUsd,
      ANTHROPIC_KEY_PARAM,
      ...APP_LIMITS,
    };
    if (props.siteUrl) environment.NEXT_PUBLIC_SITE_URL = props.siteUrl;

    const reservedConcurrency = props.reservedConcurrency ?? 10;
    if (!Number.isInteger(reservedConcurrency) || reservedConcurrency < 0) {
      throw new Error(`reservedConcurrency must be a whole number >= 0 (got ${reservedConcurrency})`);
    }

    const lambdaAsset = new s3assets.Asset(this, 'ServerCode', {
      path: props.lambdaCodePath ?? path.join(REPO_ROOT, 'infra', '.build', 'lambda.zip'),
    });
    const nextStaticAsset = new s3assets.Asset(this, 'NextStatic', {
      path: props.nextStaticDir ?? path.join(REPO_ROOT, '.next', 'static'),
    });

    this.serverFunction = new lambda.Function(this, 'ServerFunction', {
      runtime: lambda.Runtime.NODEJS_22_X,
      architecture: lambda.Architecture.ARM_64,
      memorySize: 1024,
      timeout: Duration.seconds(30),
      reservedConcurrentExecutions: reservedConcurrency > 0 ? reservedConcurrency : undefined,
      handler: 'run.sh',
      code: lambda.Code.fromBucket(lambdaAsset.bucket, lambdaAsset.s3ObjectKey),
      layers: [lambda.LayerVersion.fromLayerVersionArn(this, 'WebAdapterLayer', WEB_ADAPTER_LAYER_ARN)],
      environment,
      logGroup,
    });

    // The asset's S3 key is its content hash, so new code always gets a new key and CloudFormation
    // updates the function; objectVersion isn't needed.
    Annotations.of(this).acknowledgeWarning(
      '@aws-cdk/aws-lambda:codeFromBucketObjectVersionNotSpecified',
      'Asset keys are content-hashed',
    );

    this.functionUrl = this.serverFunction.addFunctionUrl({
      authType: lambda.FunctionUrlAuthType.AWS_IAM,
      invokeMode: lambda.InvokeMode.RESPONSE_STREAM,
    });

    // T116: least-privilege table access (no Scan, no BatchWrite, no table admin).
    this.serverFunction.addToRolePolicy(
      new iam.PolicyStatement({
        actions: [
          'dynamodb:GetItem',
          'dynamodb:PutItem',
          'dynamodb:UpdateItem',
          'dynamodb:Query',
          'dynamodb:DeleteItem',
        ],
        resources: [this.table.tableArn],
      }),
    );

    // Option A: read the one API key parameter, nothing else. SecureStrings made with the CLI's
    // default key use the AWS-managed aws/ssm key, which allows decryption through SSM for any
    // principal in the account that can call GetParameter, so no kms:Decrypt statement is needed.
    this.serverFunction.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ['ssm:GetParameter'],
        resources: [
          Stack.of(this).formatArn({ service: 'ssm', resource: 'parameter', resourceName: ANTHROPIC_KEY_PARAM.slice(1) }),
        ],
      }),
    );

    // --- T115: CloudFront on the default *.cloudfront.net domain -------------------------------
    const lambdaOrigin = origins.FunctionUrlOrigin.withOriginAccessControl(this.functionUrl);
    const staticOrigin = origins.S3BucketOrigin.withOriginAccessControl(this.staticBucket);

    // Pages: follow the origin's Cache-Control (default TTL 0). Arbitrary query strings are kept out
    // of the cache key (no page reads them, so `/cv?x=…` shares `/cv`'s entry), except Next's `_rsc`
    // discriminator, and the `rsc` / `next-router-prefetch` headers. Next 16's CDN guide
    // (node_modules/next/dist/docs/01-app/02-guides/cdn-caching.md) says both must reach the cache key,
    // or a cached HTML response can be served to an RSC request and break client navigation.
    const pagesCachePolicy = new cloudfront.CachePolicy(this, 'PagesCachePolicy', {
      comment: 'Pages: honour origin Cache-Control; key on path, _rsc, rsc, next-router-prefetch',
      defaultTtl: Duration.seconds(0),
      minTtl: Duration.seconds(0),
      maxTtl: Duration.days(365),
      queryStringBehavior: cloudfront.CacheQueryStringBehavior.allowList('_rsc'),
      headerBehavior: cloudfront.CacheHeaderBehavior.allowList('rsc', 'next-router-prefetch'),
      cookieBehavior: cloudfront.CacheCookieBehavior.none(),
      enableAcceptEncodingGzip: true,
      enableAcceptEncodingBrotli: true,
    });

    // Never forward Host: OAC signs for the function URL's own host.
    const pagesOriginRequestPolicy = new cloudfront.OriginRequestPolicy(this, 'PagesOriginRequestPolicy', {
      comment: 'Pages: viewer address and Next router headers (not part of the cache key)',
      headerBehavior: cloudfront.OriginRequestHeaderBehavior.allowList(
        'CloudFront-Viewer-Address',
        'next-router-state-tree',
        'next-router-segment-prefetch',
        'next-url',
      ),
      queryStringBehavior: cloudfront.OriginRequestQueryStringBehavior.none(),
      cookieBehavior: cloudfront.OriginRequestCookieBehavior.none(),
    });

    const apiOriginRequestPolicy = new cloudfront.OriginRequestPolicy(this, 'ApiOriginRequestPolicy', {
      comment: 'API: viewer address and all query strings, no cookies',
      headerBehavior: cloudfront.OriginRequestHeaderBehavior.allowList('CloudFront-Viewer-Address'),
      queryStringBehavior: cloudfront.OriginRequestQueryStringBehavior.all(),
      cookieBehavior: cloudfront.OriginRequestCookieBehavior.none(),
    });

    this.distribution = new cloudfront.Distribution(this, 'Distribution', {
      comment: 'Mauricio portfolio',
      priceClass: cloudfront.PriceClass.PRICE_CLASS_100,
      httpVersion: cloudfront.HttpVersion.HTTP2_AND_3,
      defaultBehavior: {
        origin: lambdaOrigin,
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        allowedMethods: cloudfront.AllowedMethods.ALLOW_GET_HEAD,
        cachePolicy: pagesCachePolicy,
        originRequestPolicy: pagesOriginRequestPolicy,
        compress: true,
      },
      additionalBehaviors: {
        '/_next/static/*': {
          origin: staticOrigin,
          viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
          allowedMethods: cloudfront.AllowedMethods.ALLOW_GET_HEAD,
          cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
          compress: true,
        },
        '/api/*': {
          origin: lambdaOrigin,
          viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
          allowedMethods: cloudfront.AllowedMethods.ALLOW_ALL,
          cachePolicy: cloudfront.CachePolicy.CACHING_DISABLED,
          originRequestPolicy: apiOriginRequestPolicy,
          compress: true,
        },
      },
    });

    // --- T116: upload static assets ------------------------------------------------------------
    // Two deployments write different prefixes of the same bucket, so neither may prune the other's files.
    const nextStaticDeployment = new s3deploy.BucketDeployment(this, 'DeployNextStatic', {
      sources: [s3deploy.Source.bucket(nextStaticAsset.bucket, nextStaticAsset.s3ObjectKey)],
      destinationBucket: this.staticBucket,
      destinationKeyPrefix: '_next/static/',
      cacheControl: [s3deploy.CacheControl.fromString('public, max-age=31536000, immutable')],
      prune: false,
    });

    const publicDeployment = new s3deploy.BucketDeployment(this, 'DeployPublic', {
      sources: [s3deploy.Source.asset(props.publicDir ?? path.join(REPO_ROOT, 'public'))],
      destinationBucket: this.staticBucket,
      cacheControl: [s3deploy.CacheControl.fromString('public, max-age=3600')],
      prune: false,
    });

    // Invalidate '/*' once per new build, after the function code and the hashed assets are in place.
    // Not BucketDeployment's `distribution` option: that grants cloudfront:CreateInvalidation on
    // Resource "*". This call is scoped to this distribution only.
    const buildHash = `${lambdaAsset.assetHash.slice(0, 16)}-${nextStaticAsset.assetHash.slice(0, 16)}`;
    const invalidate: cr.AwsSdkCall = {
      service: 'CloudFront',
      action: 'createInvalidation',
      parameters: {
        DistributionId: this.distribution.distributionId,
        InvalidationBatch: { CallerReference: buildHash, Paths: { Quantity: 1, Items: ['/*'] } },
      },
      physicalResourceId: cr.PhysicalResourceId.of(buildHash),
    };
    const invalidation = new cr.AwsCustomResource(this, 'InvalidateDistribution', {
      onCreate: invalidate,
      onUpdate: invalidate,
      installLatestAwsSdk: false,
      policy: cr.AwsCustomResourcePolicy.fromStatements([
        new iam.PolicyStatement({
          actions: ['cloudfront:CreateInvalidation'],
          resources: [this.distribution.distributionArn],
        }),
      ]),
    });
    invalidation.node.addDependency(nextStaticDeployment, publicDeployment, this.serverFunction);

    new CfnOutput(this, 'SiteUrl', {
      description: 'CloudFront default URL. Pass it back as -c siteUrl=... to set NEXT_PUBLIC_SITE_URL.',
      value: `https://${this.distribution.distributionDomainName}`,
    });
    new CfnOutput(this, 'ServerFunctionName', { value: this.serverFunction.functionName });

    // --- T032: budget alerts -------------------------------------------------------------------
    new MonthlyBudget(this, 'MonthlyBudget', { alertEmail: props.budgetAlertEmail });
  }
}
