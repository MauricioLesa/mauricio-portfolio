import 'server-only';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';

// Atomic counters for the spend cap (T071) and the rate limit (T060). One UpdateItem with ADD per
// increment, so two Lambda instances can't lose an update. Each item expires through its TTL.

export interface Counters {
  get(pk: string, sk: string): Promise<number>;
  /** Adds `amount` and returns the new total. */
  add(pk: string, sk: string, amount: number, ttlSeconds: number): Promise<number>;
}

export function dynamoCounters(tableName: string, client = DynamoDBDocumentClient.from(new DynamoDBClient({}))): Counters {
  return {
    async get(pk, sk) {
      const out = await client.send(new GetCommand({ TableName: tableName, Key: { PK: pk, SK: sk } }));
      return Number(out.Item?.value ?? 0);
    },
    async add(pk, sk, amount, ttlSeconds) {
      const out = await client.send(
        new UpdateCommand({
          TableName: tableName,
          Key: { PK: pk, SK: sk },
          UpdateExpression: 'ADD #v :a SET #ttl = if_not_exists(#ttl, :ttl)',
          ExpressionAttributeNames: { '#v': 'value', '#ttl': 'ttl' },
          ExpressionAttributeValues: { ':a': amount, ':ttl': Math.floor(Date.now() / 1000) + ttlSeconds },
          ReturnValues: 'UPDATED_NEW',
        }),
      );
      return Number(out.Attributes?.value ?? amount);
    },
  };
}

export function memoryCounters(): Counters {
  const values = new Map<string, number>();
  return {
    async get(pk, sk) {
      return values.get(`${pk}|${sk}`) ?? 0;
    },
    async add(pk, sk, amount) {
      const total = (values.get(`${pk}|${sk}`) ?? 0) + amount;
      values.set(`${pk}|${sk}`, total);
      return total;
    },
  };
}
