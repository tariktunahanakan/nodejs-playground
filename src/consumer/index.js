const { Kafka } = require('kafkajs');
const { MongoClient } = require('mongodb');
const express = require('express');
const promClient = require('prom-client');

const KAFKA_BROKER = process.env.KAFKA_BROKER || 'localhost:9092';
const KAFKA_TOPIC = process.env.KAFKA_TOPIC || 'events';
const CONSUMER_GROUP_ID = process.env.CONSUMER_GROUP_ID || 'consumer-group';
const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017';
const MONGO_DB_NAME = process.env.MONGO_DB_NAME || 'eventsDB';
const MONGO_COLLECTION = process.env.MONGO_COLLECTION || 'events';

const DLQ_TOPIC = process.env.KAFKA_DLQ_TOPIC || 'events-dlq'; 
const MAX_RETRIES = parseInt(process.env.MAX_RETRIES || '3', 10); 

let mongoClient;
let consumer;
let dlqProducer;
let collection;

(async () => {
  try {
    mongoClient = new MongoClient(MONGO_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    await mongoClient.connect();
    console.log(JSON.stringify({
      level: 'info',
      message: 'Connected to MongoDB',
      mongoURI: MONGO_URI
    }));

    const db = mongoClient.db(MONGO_DB_NAME);
    collection = db.collection(MONGO_COLLECTION);

    const kafka = new Kafka({
      clientId: 'consumer-service',
      brokers: [KAFKA_BROKER],
      ssl: false, 
    });

    consumer = kafka.consumer({ groupId: CONSUMER_GROUP_ID });
    await consumer.connect();
    console.log(JSON.stringify({
      level: 'info',
      message: 'Consumer connected to Kafka (PLAINTEXT)',
      broker: KAFKA_BROKER,
      topic: KAFKA_TOPIC,
      groupId: CONSUMER_GROUP_ID
    }));

    dlqProducer = kafka.producer();
    await dlqProducer.connect();
    console.log(JSON.stringify({
      level: 'info',
      message: 'DLQ producer connected to Kafka',
      dlqTopic: DLQ_TOPIC
    }));

    await consumer.subscribe({ topic: KAFKA_TOPIC, fromBeginning: true });

    async function insertWithRetry(eventJson, attempt = 1) {
      try {
        const result = await collection.insertOne(eventJson);
        console.log(JSON.stringify({
          level: 'info',
          message: 'Event consumed and inserted to MongoDB',
          data: eventJson,
          insertedId: result.insertedId
        }));
      } catch (error) {
        if (attempt < MAX_RETRIES) {
          console.error(JSON.stringify({
            level: 'error',
            message: `Insert failed (attempt ${attempt}/${MAX_RETRIES}). Retrying...`,
            error: error.message
          }));
          await insertWithRetry(eventJson, attempt + 1);
        } else {
          console.error(JSON.stringify({
            level: 'error',
            message: 'Max retries reached. Sending to DLQ...',
            error: error.message
          }));
          await sendToDLQ(eventJson, error.message);
        }
      }
    }

    async function sendToDLQ(eventJson, reason) {
      try {
        await dlqProducer.send({
          topic: DLQ_TOPIC,
          messages: [
            {
              value: JSON.stringify({
                originalEvent: eventJson,
                failedReason: reason,
                failedAt: new Date().toISOString()
              })
            }
          ],
        });
        console.log(JSON.stringify({
          level: 'info',
          message: 'Event sent to DLQ',
          dlqTopic: DLQ_TOPIC,
          data: eventJson
        }));
      } catch (dlqError) {
        console.error(JSON.stringify({
          level: 'error',
          message: 'Failed to send event to DLQ',
          dlqError: dlqError.message,
          originalEvent: eventJson
        }));
      }
    }

    await consumer.run({
      eachMessage: async ({ topic, partition, message }) => {
        try {
          const eventStr = message.value.toString();
          const eventJson = JSON.parse(eventStr);

          await insertWithRetry(eventJson);

        } catch (error) {
          console.error(JSON.stringify({
            level: 'error',
            message: 'Failed to process event - not retriable',
            error: error.message
          }));
        }
      },
    });

    const app = express();
    const { register, collectDefaultMetrics } = promClient;
    collectDefaultMetrics({ timeout: 5000 });

    app.get('/metrics', async (req, res) => {
      try {
        res.set('Content-Type', register.contentType);
        res.end(await register.metrics());
      } catch (ex) {
        res.status(500).json({ error: ex.message });
      }
    });

    app.get('/health', (req, res) => {
      res.json({ status: 'ok' });
    });

    const METRICS_PORT = process.env.METRICS_PORT || 9101;
    app.listen(METRICS_PORT, () => {
      console.log(JSON.stringify({
        level: 'info',
        message: `Metrics server running on port ${METRICS_PORT}`
      }));
    });

    process.on('SIGINT', async () => {
      try {
        console.log(JSON.stringify({ level: 'info', message: 'Shutting down consumer...' }));
        if (consumer) await consumer.disconnect();
        if (dlqProducer) await dlqProducer.disconnect();
        if (mongoClient) await mongoClient.close();
        process.exit(0);
      } catch (shutdownError) {
        console.error(JSON.stringify({
          level: 'error',
          message: 'Error during shutdown',
          error: shutdownError.message,
          stack: shutdownError.stack
        }));
        process.exit(1);
      }
    });

  } catch (error) {
    console.error(JSON.stringify({
      level: 'error',
      message: error.message,
      stack: error.stack
    }));
    process.exit(1);
  }
})();
