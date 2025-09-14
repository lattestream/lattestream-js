// Webhook handling example
import express from 'express';
import LatteStreamServer from '@lattestream/server';

const app = express();
app.use(express.raw({ type: 'application/json' }));

const lattestream = new LatteStreamServer('your-app-key', 'your-master-key');

// Webhook endpoint
app.post('/webhooks', (req, res) => {
  const signature = req.headers['x-lattestream-signature'];
  const payload = req.body.toString();
  
  // Verify the webhook signature
  if (!lattestream.verifyWebhookSignature(payload, signature)) {
    return res.status(401).send('Invalid signature');
  }
  
  const webhookData = JSON.parse(payload);
  
  // Process webhook events
  webhookData.events.forEach(event => {
    switch (event.name) {
      case 'channel_occupied':
        console.log(`Channel ${event.channel} is now occupied`);
        break;
        
      case 'channel_vacated':
        console.log(`Channel ${event.channel} is now empty`);
        break;
        
      case 'member_added':
        console.log(`User ${event.user_id} joined ${event.channel}`);
        break;
        
      case 'member_removed':
        console.log(`User ${event.user_id} left ${event.channel}`);
        break;
        
      case 'client_event':
        console.log(`Client event ${event.event} on ${event.channel}:`, event.data);
        break;
        
      default:
        console.log('Unknown webhook event:', event);
    }
  });
  
  res.status(200).send('OK');
});

app.listen(3001, () => {
  console.log('Webhook server running on port 3001');
});