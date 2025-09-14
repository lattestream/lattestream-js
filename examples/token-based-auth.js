// Token-based authentication example
import LatteStreamServer from '@lattestream/server';
import LatteStream from '@lattestream/client';
import express from 'express';

const app = express();
app.use(express.json());

// Initialize the server client with encrypted secret only
const lattestream = new LatteStreamServer(
  'lsk_your_encrypted_secret_here', // Encrypted secret (contains tenant_id and key_id)
  {
    cluster: 'us-east-1',
    useTLS: true,
    enableLogging: true,
    // Configure to connect to your LatteStream engine
    wsEndpoint: 'localhost:8080' // or your engine endpoint
  }
);

// Endpoint to generate client tokens
app.post('/api/client-token', async (req, res) => {
  try {
    const { userId } = req.body;
    
    // Validate user session here (your authentication logic)
    if (!isValidUser(userId)) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    
    // Generate client token (secret is already in the LatteStreamServer instance)
    const clientToken = await lattestream.generateClientToken(
      userId,
      ['read', 'write'], // Optional: specify permissions
      3600 // Optional: 1 hour expiration (default is 30 minutes)
    );
    
    res.json(clientToken);
  } catch (error) {
    console.error('Token generation failed:', error.message);
    res.status(500).json({ error: 'Token generation failed' });
  }
});

// Channel authentication endpoint (existing flow - works with both approaches)
app.post('/api/auth', async (req, res) => {
  try {
    const { socket_id, channel_name } = req.body;
    
    // Validate user session from Authorization header
    const authHeader = req.headers.authorization;
    const user = await validateSession(authHeader);
    
    if (!user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    
    // Check channel permissions
    if (!canAccessChannel(user, channel_name)) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    
    // Use existing server authorization (this generates lspc_ tokens internally)
    const authorizer = new ServerAuthorizer('lsk_your_encrypted_secret_here');
    
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
    console.error('Channel auth failed:', error.message);
    res.status(500).json({ error: 'Authentication failed' });
  }
});

app.listen(3000, () => {
  console.log('Auth server running on port 3000');
});

// Example client usage with token-based authentication
async function connectWithToken() {
  try {
    // Get client token from your server
    const response = await fetch('/api/client-token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: 'user-123' })
    });
    
    const tokenData = await response.json();
    
    // Initialize LatteStream client with the lspc_ token (supports all channel types)
    const client = new LatteStream(tokenData.accessToken, {
      wsHost: 'localhost',
      wsPort: 8080,
      forceTLS: false,
      authEndpoint: '/api/auth', // For private/presence channels
      enableLogging: true
    });
    
    // Alternative: Use lspk_ public key (public channels only)
    /*
    const publicClient = new LatteStream('lspk_your_public_key_here', {
      wsHost: 'localhost',
      wsPort: 8080,
      forceTLS: false,
      enableLogging: true
      // Note: No authEndpoint needed for public-only client
    });
    */
    
    // Connect to LatteStream
    client.connect();
    
    // Listen for connection events
    client.bind('connection_state_change', (event) => {
      console.log('Connection state:', event.previous, '->', event.current);
    });
    
    // Subscribe to channels
    const publicChannel = client.subscribe('notifications');
    publicChannel.bind('alert', (data) => {
      console.log('Alert:', data);
    });
    
    // Subscribe to private channel (requires channel auth)
    const privateChannel = client.subscribe('private-user-123');
    privateChannel.bind('message', (data) => {
      console.log('Private message:', data);
    });
    
    return client;
  } catch (error) {
    console.error('Failed to connect with token:', error);
  }
}

// Helper functions (implement according to your needs)
function isValidUser(userId) {
  // Your user validation logic
  return userId && userId.length > 0;
}

async function validateSession(authHeader) {
  // Your session validation logic
  // Return user object or null
  return { id: 'user-123', name: 'John Doe', avatar: 'avatar.jpg' };
}

function canAccessChannel(user, channelName) {
  // Your channel permission logic
  if (channelName.startsWith('private-user-')) {
    return channelName.includes(user.id);
  }
  return true;
}

// Export for use
export { connectWithToken };