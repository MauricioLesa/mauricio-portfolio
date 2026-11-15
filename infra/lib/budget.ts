import { aws_budgets as budgets } from 'aws-cdk-lib';
import { Construct } from 'constructs';

export interface MonthlyBudgetProps {
  /** Recipient of the alerts. Comes from CDK context or env, never hard-coded (FR-033). */
  readonly alertEmail: string;
  /** Monthly budget limit in USD. */
  readonly limitUsd?: number;
  /** ACTUAL-spend thresholds in USD that send an email. */
  readonly alertAtUsd?: readonly number[];
}

/** One AWS Budgets cost budget ($10/month) with email alerts on actual spend at $5 and $8 (FR-033). */
export class MonthlyBudget extends Construct {
  constructor(scope: Construct, id: string, props: MonthlyBudgetProps) {
    super(scope, id);
    const limitUsd = props.limitUsd ?? 10;
    const alertAtUsd = props.alertAtUsd ?? [5, 8];

    new budgets.CfnBudget(this, 'Budget', {
      budget: {
        budgetName: 'portfolio-monthly',
        budgetType: 'COST',
        timeUnit: 'MONTHLY',
        budgetLimit: { amount: limitUsd, unit: 'USD' },
      },
      notificationsWithSubscribers: alertAtUsd.map((threshold) => ({
        notification: {
          notificationType: 'ACTUAL',
          comparisonOperator: 'GREATER_THAN',
          threshold,
          thresholdType: 'ABSOLUTE_VALUE',
        },
        subscribers: [{ subscriptionType: 'EMAIL', address: props.alertEmail }],
      })),
    });
  }
}
