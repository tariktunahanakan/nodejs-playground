const { Kafka, Partitioners } = require('kafkajs'); 
const { v4: uuidv4 } = require('uuid'); 
const express = require('express'); 
const promClient = require('prom-client'); 

const KAFKA_BROKER = process.env.KAFKA_BROKER || 'kafka-broker-headless.kafka.svc.cluster.local:9092';
const KAFKA_TOPIC = process.env.KAFKA_TOPIC || 'events';
const PRODUCER_CLIENT_ID = process.env.PRODUCER_CLIENT_ID || 'producer-service';
const METRICS_PORT = process.env.METRICS_PORT || 9102; 

const messageCounter = new promClient.Counter({
  name: 'producer_messages_total',
  help: 'Number of messages published by the producer',
});

const failedMessageCounter = new promClient.Counter({
  name: 'producer_failed_messages_total',
  help: 'Number of messages failed to publish by the producer',
});

const collectDefaultMetrics = promClient.collectDefaultMetrics;
collectDefaultMetrics({ timeout: 5000 });

(async () => {
  try {
    const kafka = new Kafka({
      clientId: PRODUCER_CLIENT_ID,
      brokers: [KAFKA_BROKER],
      ssl: false,          
      connectionTimeout: 10000, 
      requestTimeout: 30000,    
      retry: {
        retries: 10,           
        initialRetryTime: 300, 
      },
    });

    const producer = kafka.producer({
      createPartitioner: Partitioners.LegacyPartitioner,
    });
    await producer.connect();

    console.log(JSON.stringify({
      level: 'info',
      message: 'Producer connected to Kafka (PLAINTEXT)',
      broker: KAFKA_BROKER,
      topic: KAFKA_TOPIC,
    }));

    setInterval(async () => {
      const eventPayload = {
        eventId: uuidv4(),
        eventType: 'user_signup', 
        timestamp: new Date().toISOString(),
        payload: {
          randomValue: Math.floor(Math.random() * 10000),
        },
      };

      const messages = [
        {
          value: JSON.stringify(eventPayload),
        },
      ];

      try {
        await producer.send({
          topic: KAFKA_TOPIC,
          messages,
        });

        messageCounter.inc();

        console.log(JSON.stringify({
          level: 'info',
          message: 'Event published',
          data: eventPayload,
        }));
      } catch (sendError) {
        failedMessageCounter.inc();

        console.error(JSON.stringify({
          level: 'error',
          message: 'Failed to publish event',
          error: sendError.message,
        }));
      }
    }, 3000);

    const app = express();
    const { register } = promClient;

    app.get('/metrics', async (req, res) => {
      try {
        res.set('Content-Type', register.contentType);
        res.end(await register.metrics());
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    });

    app.get('/health', (req, res) => {
      res.json({ status: 'ok' });
    });

    app.listen(METRICS_PORT, () => {
      console.log(JSON.stringify({
        level: 'info',
        message: `Metrics server running on port ${METRICS_PORT}`,
      }));
    });

  } catch (error) {
    console.error(JSON.stringify({
      level: 'error',
      message: error.message,
      stack: error.stack,
    }));
    process.exit(1); 
  }
})();
