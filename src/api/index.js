const express = require('express');
const { MongoClient } = require('mongodb');
const promClient = require('prom-client');

const app = express();

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017';
const MONGO_DB_NAME = process.env.MONGO_DB_NAME || 'eventsDB';
const MONGO_COLLECTION = process.env.MONGO_COLLECTION || 'events';
const PORT = process.env.PORT || 3000;

let collection;

const requestCounter = new promClient.Counter({
  name: 'api_requests_total',
  help: 'Total number of API requests',
  labelNames: ['method', 'route', 'status'], 
});

const requestDuration = new promClient.Histogram({
  name: 'api_request_duration_seconds',
  help: 'Histogram of request durations in seconds',
  labelNames: ['method', 'route', 'status'], 
  buckets: [0.1, 0.5, 1, 2, 5], 
});

const collectDefaultMetrics = promClient.collectDefaultMetrics;
collectDefaultMetrics({ timeout: 5000 }); 

async function connectDB() {
  const client = new MongoClient(MONGO_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  });
  await client.connect();
  const db = client.db(MONGO_DB_NAME);
  collection = db.collection(MONGO_COLLECTION);

  console.log(JSON.stringify({
    level: 'info',
    message: 'API connected to MongoDB',
    mongoURI: MONGO_URI,
    dbName: MONGO_DB_NAME,
    collection: MONGO_COLLECTION,
  }));
}

app.use((req, res, next) => {
  const end = requestDuration.startTimer(); 
  res.on('finish', () => {
    requestCounter.inc({
      method: req.method,
      route: req.path,
      status: res.statusCode,
    });
    end({ method: req.method, route: req.path, status: res.statusCode }); 
  });
  next();
});


app.get('/events', async (req, res) => {
  try {
    const { eventType, startTime, endTime, page, limit } = req.query;
    const query = {};

    if (eventType) {
      query.eventType = eventType;
    }

    if (startTime || endTime) {
      query.timestamp = {};
      if (startTime) {
        query.timestamp.$gte = startTime;
      }
      if (endTime) {
        query.timestamp.$lte = endTime;
      }
    }

    const pageNumber = parseInt(page, 10) || 1;
    const pageSize = parseInt(limit, 10) || 10;
    const skip = (pageNumber - 1) * pageSize;

    const events = await collection
      .find(query)
      .skip(skip)
      .limit(pageSize)
      .sort({ _id: -1 }) 
      .toArray();

    res.json(events);
  } catch (error) {
    console.error(JSON.stringify({
      level: 'error',
      message: error.message,
      stack: error.stack,
    }));
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

app.get('/metrics', async (req, res) => {
  try {
    res.set('Content-Type', promClient.register.contentType);
    res.end(await promClient.register.metrics());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.listen(PORT, async () => {
  await connectDB();
  console.log(JSON.stringify({
    level: 'info',
    message: `API server running on port ${PORT}`,
  }));
});
