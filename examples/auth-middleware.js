// Express.js authentication middleware example with LatteStream engine integration
import express from 'express';
import { createChannelAuthMiddleware, LatteStreamServer } from '@lattestream/server';

const app = express();
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Initialize LatteStream server for token generation
const lattestream = new LatteStreamServer(
  'lsk_your_encrypted_secret_here', // Encrypted secret contains tenant_id and key_id
  {
    wsEndpoint: 'localhost:8080', // Your LatteStream engine endpoint
    enableLogging: true
  }
);

// Create the authentication middleware
const authMiddleware = createChannelAuthMiddleware(
  'lsk_your_encrypted_secret_here', // Same encrypted secret
  // Optional: custom function to get user data from request
  (req) => {
    // Extract user info from session, JWT, etc.
    const user = req.user; // Assuming you have user info in req.user
    
    return {
      user_id: user.id,
      user_info: {
        name: user.name,
        email: user.email,
        avatar: user.avatar
      }
    };
  }
);

// Client token generation endpoint (new with LatteStream engine)
app.post('/api/client-token', async (req, res) => {
  try {
    const { userId } = req.body;
    const user = req.user; // Assuming you have authentication middleware
    
    if (!user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    
    // Generate client token (secret is already in the LatteStreamServer instance)
    const clientToken = await lattestream.authorizeChannel(
      userId || user.id,
      channel_name,
      {
        user_id: userId || user.id,
        user_info: {
          name: user.name,
          avatar: user.avatar
        }
      }
    );
    
    res.json(clientToken);
  } catch (error) {
    console.error('Token generation failed:', error.message);
    res.status(500).json({ error: 'Token generation failed' });
  }
});

// Set up the auth endpoint (for private/presence channels)
app.post('/auth', authMiddleware);

// Alternative: Manual authorization
app.post('/auth/manual', (req, res) => {
  const { socket_id, channel_name, channel_data } = req.body;
  const user = req.user; // Your authentication logic
  
  if (!user) {
    return res.status(403).json({ error: 'Unauthorized' });
  }
  
  // Check if user has permission to access this channel
  if (channel_name.startsWith('private-user-') && !channel_name.includes(user.id)) {
    return res.status(403).json({ error: 'Access denied to this channel' });
  }
  
  const authorizer = new ServerAuthorizer('lsk_your_encrypted_secret_here');
  
  try {
    let result;
    
    if (channel_name.startsWith('presence-')) {
      result = authorizer.authorizePresenceChannel(socket_id, channel_name, {
        user_id: user.id,
        user_info: {
          name: user.name,
          avatar: user.avatar
        }
      });
    } else {
      result = authorizer.authorizeChannel(socket_id, channel_name);
    }
    
    res.json(result);
  } catch (error) {
    res.status(403).json({ error: error.message });
  }
});

app.listen(3000, () => {
  console.log('Auth server running on port 3000');
});