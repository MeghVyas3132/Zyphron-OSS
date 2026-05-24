// ===========================================
// KAFKA CLIENT — with soft-gate (non-fatal if down)
// ===========================================

import { Kafka, Producer, Consumer, logLevel } from 'kafkajs';
import { config } from '@/config/index.js';
import { createLogger } from '@/lib/logger.js';

const logger = createLogger('kafka');

export const TOPICS = {
  DEPLOYMENTS: 'zyphron.deployments',
  BUILD_LOGS: 'zyphron.build-logs',
  METRICS: 'zyphron.metrics',
  NOTIFICATIONS: 'zyphron.notifications',
  AUDIT: 'zyphron.audit',
} as const;

let kafka: Kafka | null = null;
let producerInstance: Producer | null = null;
let kafkaAvailable = false;

function getKafkaClient(): Kafka {
  if (!kafka) {
    kafka = new Kafka({
      clientId: config.kafka.clientId,
      brokers: config.kafka.brokers,
      logLevel: config.env === 'development' ? logLevel.NOTHING : logLevel.ERROR,
      retry: { initialRetryTime: 300, retries: 3 },
    });
  }
  return kafka;
}

// ===========================================
// PRODUCER — soft-gate, returns null if unavailable
// ===========================================

export async function connectKafka(): Promise<boolean> {
  if (!config.kafka.enabled) {
    logger.info('Kafka disabled via config — skipping');
    return false;
  }

  try {
    const client = getKafkaClient();
    producerInstance = client.producer({
      allowAutoTopicCreation: true,
      transactionTimeout: 30000,
    });
    await producerInstance.connect();
    kafkaAvailable = true;
    logger.info('Kafka producer connected');
    return true;
  } catch (error) {
    logger.warn({ error }, 'Kafka unavailable — running without event streaming (deployments still work via direct BullMQ)');
    producerInstance = null;
    kafkaAvailable = false;
    return false;
  }
}

export async function getProducer(): Promise<Producer | null> {
  if (!kafkaAvailable || !producerInstance) return null;
  return producerInstance;
}

export const producer = {
  async send(payload: { topic: string; messages: Array<{ key?: string; value: string }> }) {
    if (!kafkaAvailable) return;
    const prod = await getProducer();
    if (!prod) return;
    return prod.send(payload);
  },
};

export async function sendMessage(
  topic: string,
  messages: { key?: string; value: unknown; headers?: Record<string, string> }[]
): Promise<void> {
  if (!kafkaAvailable) return;
  const prod = await getProducer();
  if (!prod) return;

  await prod.send({
    topic,
    messages: messages.map((msg) => ({
      key: msg.key,
      value: JSON.stringify(msg.value),
      headers: msg.headers,
    })),
  });
}

export async function sendDeploymentEvent(
  deploymentId: string,
  eventType: string,
  data: unknown
): Promise<void> {
  await sendMessage(TOPICS.DEPLOYMENTS, [{
    key: deploymentId,
    value: { eventType, deploymentId, timestamp: new Date().toISOString(), data },
  }]);
}

export async function sendBuildLog(
  deploymentId: string,
  line: string,
  stream: 'stdout' | 'stderr' = 'stdout'
): Promise<void> {
  await sendMessage(TOPICS.BUILD_LOGS, [{
    key: deploymentId,
    value: { deploymentId, line, stream, timestamp: new Date().toISOString() },
  }]);
}

// ===========================================
// CONSUMER
// ===========================================

export async function createConsumer(
  groupId: string,
  topics: string[],
  handler: (topic: string, message: unknown) => Promise<void>
): Promise<Consumer | null> {
  if (!kafkaAvailable) {
    logger.warn({ groupId }, 'Kafka unavailable — consumer not started');
    return null;
  }

  const client = getKafkaClient();
  const consumer = client.consumer({ groupId });

  await consumer.connect();
  logger.info({ groupId }, 'Kafka consumer connected');

  for (const topic of topics) {
    await consumer.subscribe({ topic, fromBeginning: false });
  }

  await consumer.run({
    eachMessage: async ({ topic, partition, message }) => {
      try {
        const value = message.value ? JSON.parse(message.value.toString()) : null;
        await handler(topic, value);
      } catch (error) {
        logger.error({ error, topic, partition }, 'Error processing Kafka message');
      }
    },
  });

  return consumer;
}

export async function disconnectKafka(): Promise<void> {
  if (producerInstance) {
    try {
      await producerInstance.disconnect();
    } catch { /* ignore */ }
    producerInstance = null;
    kafkaAvailable = false;
    logger.info('Kafka producer disconnected');
  }
}

export async function checkKafkaHealth(): Promise<boolean> {
  if (!kafkaAvailable) return false;
  try {
    const client = getKafkaClient();
    const admin = client.admin();
    await admin.connect();
    await admin.listTopics();
    await admin.disconnect();
    return true;
  } catch {
    return false;
  }
}

export function isKafkaAvailable(): boolean {
  return kafkaAvailable;
}
